import { describe, expect, it } from "vitest";
import {
  discoveryEvidenceSchema, discoveryRequestSchema, parseDiscoveryProductUrl,
  type DiscoveryCandidate, type DiscoveryEvidence,
} from "@/lib/briefing/discovery-contracts";
import {
  DISCOVERY_POLICY_VERSION, DISCOVERY_RECOMMEND_LIMIT, latestPerQuery, normalizeQuery, rankDiscoveryCandidates, reviewDeltaFor,
} from "@/lib/briefing/discovery-ranking";

const NOW = new Date("2026-09-14T09:00:00+09:00");
const daysAgo = (days: number) => new Date(NOW.getTime() - days * 86_400_000).toISOString();
const baseEvidence = {
  productUrl: "https://smartstore.naver.com/farm-a/products/1", storeName: "농장A", title: "대추방울토마토 2kg", query: "대추방울토마토 2kg",
  observedAt: daysAgo(1), position: 3, adStatus: "ORGANIC", relevance: "MATCH", purchaseLabel: "", reviewCount: null, reviewBasis: "UNKNOWN",
} satisfies Omit<DiscoveryEvidence, "id">;
let seq = 0;
const evidence = (over: Partial<DiscoveryEvidence> = {}): DiscoveryEvidence => ({ ...baseEvidence, id: `ev-${++seq}`, ...over });
const candidate = (over: Partial<DiscoveryCandidate> = {}): DiscoveryCandidate => ({
  id: "c1", productUrl: baseEvidence.productUrl, storeKey: "farm-a", storeName: "농장A", title: baseEvidence.title, status: "NEW",
  decisionReason: null, lastSeenAt: daysAgo(1), evidence: [evidence()], ...over,
});
const rank = (...candidates: DiscoveryCandidate[]) => rankDiscoveryCandidates(candidates, NOW);

describe("discovery product URL contract", () => {
  it("normalises exact https smartstore and brand product URLs", () => {
    expect(parseDiscoveryProductUrl("https://smartstore.naver.com/Farm-A/products/1234/?x=1#top"))
      .toEqual({ storeKey: "farm-a", productUrl: "https://smartstore.naver.com/farm-a/products/1234" });
    expect(parseDiscoveryProductUrl("https://brand.naver.com/jbn/products/5618807799")).toEqual({ storeKey: "brand:jbn", productUrl: "https://brand.naver.com/jbn/products/5618807799" });
    expect(discoveryEvidenceSchema.parse({ ...baseEvidence, productUrl: " https://smartstore.naver.com/farm-a/products/1?nv=1 " }).productUrl).toBe(baseEvidence.productUrl);
  });
  it.each([
    "javascript:alert(1)", "http://smartstore.naver.com/farm/products/1", "https://smartstore.naver.com:8443/farm/products/1",
    "https://user:pw@smartstore.naver.com/farm/products/1", "https://smartstore.naver.com.evil.test/farm/products/1", "https://shopping.naver.com/farm/products/1",
    "https://smartstore.naver.com/farm", "https://smartstore.naver.com/farm/products/abc", "https://smartstore.naver.com/main/products/1",
    "https://brand.naver.com/products/products/1", "", "not a url",
  ])("rejects %s", (url) => {
    expect(parseDiscoveryProductUrl(url)).toBeNull();
    expect(discoveryEvidenceSchema.safeParse({ ...baseEvidence, productUrl: url }).success).toBe(false);
  });
});

describe("discovery request contract", () => {
  it("applies defaults, trims and rejects unknown keys or missing fields", () => {
    const { purchaseLabel, reviewBasis, ...partial } = baseEvidence;
    void purchaseLabel; void reviewBasis;
    const parsed = discoveryEvidenceSchema.parse({ ...partial, storeName: "  농장A " });
    expect(parsed).toMatchObject({ purchaseLabel: "", reviewBasis: "UNKNOWN", storeName: "농장A" });
    expect(discoveryEvidenceSchema.safeParse({ ...baseEvidence, extra: 1 }).success).toBe(false);
    const { position, ...noPosition } = baseEvidence; void position;
    expect(discoveryEvidenceSchema.safeParse(noPosition).success).toBe(false);
    const { reviewCount, ...noReview } = baseEvidence; void reviewCount;
    expect(discoveryEvidenceSchema.safeParse(noReview).success).toBe(false);
  });
  it.each([
    { position: 0 }, { position: 201 }, { position: 1.5 }, { observedAt: "2026-09-14T09:00:00" }, { observedAt: "2026-09-14" },
    { adStatus: "SPONSORED" }, { relevance: "MAYBE" }, { reviewBasis: "MONTHLY" }, { reviewCount: -1 }, { reviewCount: 100_000_001 },
    { storeName: "" }, { title: "x".repeat(301) }, { query: " " }, { purchaseLabel: "x".repeat(101) },
  ])("rejects %j", (over) => {
    expect(discoveryEvidenceSchema.safeParse({ ...baseEvidence, ...over }).success).toBe(false);
  });
  it("validates import and decision actions strictly", () => {
    expect(discoveryRequestSchema.safeParse({ action: "import", evidence: [] }).success).toBe(false);
    expect(discoveryRequestSchema.safeParse({ action: "import", evidence: Array.from({ length: 61 }, () => baseEvidence) }).success).toBe(false);
    expect(discoveryRequestSchema.parse({ action: "import", evidence: [baseEvidence] })).toMatchObject({ action: "import" });
    expect(discoveryRequestSchema.parse({ action: "decision", candidateId: "c1", status: "EXCLUDED", reason: " 가공품 " }))
      .toEqual({ action: "decision", candidateId: "c1", status: "EXCLUDED", reason: "가공품" });
    expect(discoveryRequestSchema.safeParse({ action: "decision", candidateId: "c1", status: "NEW", reason: "x" }).success).toBe(false);
    expect(discoveryRequestSchema.safeParse({ action: "decision", candidateId: "c1", status: "WATCH", reason: "" }).success).toBe(false);
    expect(discoveryRequestSchema.safeParse({ action: "decision", candidateId: "c1", status: "WATCH", reason: "ok", extra: true }).success).toBe(false);
    expect(discoveryRequestSchema.safeParse({ action: "search", query: "토마토" }).success).toBe(false);
  });
});

describe("latest evidence per query", () => {
  it("normalises whitespace and case and keeps only the newest observation per query", () => {
    expect(normalizeQuery("  대추방울토마토   2KG ")).toBe("대추방울토마토 2kg");
    const old = evidence({ query: "대추방울토마토 2kg", observedAt: daysAgo(3), adStatus: "ORGANIC" });
    const newer = evidence({ query: " 대추방울토마토  2KG", observedAt: daysAgo(1), adStatus: "AD" });
    const latest = latestPerQuery([old, newer]);
    expect(latest).toHaveLength(1);
    expect(latest[0].id).toBe(newer.id);
  });
  it("does not resurrect an old organic hit once the query now shows an ad or mismatch", () => {
    const ad = candidate({ evidence: [evidence({ observedAt: daysAgo(3) }), evidence({ observedAt: daysAgo(1), adStatus: "AD" })] });
    const [rankedAd] = rank(ad);
    expect(rankedAd.eligible).toBe(false);
    expect(rankedAd.queryCount).toBe(0);
    expect(rankedAd.reasons).toContain("비광고·조건 일치·위치 확인 검색어가 없음");
    expect(rankedAd.reasons.some(reason => reason.includes("광고 노출"))).toBe(true);
    const mismatch = candidate({ evidence: [evidence({ observedAt: daysAgo(3) }), evidence({ observedAt: daysAgo(1), relevance: "MISMATCH" })] });
    expect(rank(mismatch)[0].reasons).toContain("최신 관측에서 비교 조건 불일치");
  });
  it("does not let repeated appearances of one query inflate the count", () => {
    const repeated = candidate({ evidence: [evidence({ position: 5 }), evidence({ position: 4, observedAt: daysAgo(2) }), evidence({ position: 2, observedAt: daysAgo(3) })] });
    const [ranked] = rank(repeated);
    expect(ranked.queryCount).toBe(1);
    expect(ranked.bestPosition).toBe(5);
    const two = candidate({ evidence: [evidence({ position: 5 }), evidence({ query: "대추방울토마토 3kg", position: 9 })] });
    expect(rank(two)[0]).toMatchObject({ queryCount: 2, bestPosition: 5, recommended: true });
  });
});

describe("eligibility", () => {
  it("requires evidence, freshness within 7 days, and rejects future timestamps", () => {
    expect(rank(candidate({ evidence: [] }))[0]).toMatchObject({ eligible: false, reasons: ["검색 근거 없음"] });
    const stale = rank(candidate({ evidence: [evidence({ observedAt: daysAgo(8) })] }))[0];
    expect(stale.eligible).toBe(false);
    expect(stale.reasons[0]).toMatch(/8일 전이라 7일 기준을 넘음/);
    expect(rank(candidate({ evidence: [evidence({ observedAt: daysAgo(7) })] }))[0].eligible).toBe(true);
    const future = rank(candidate({ evidence: [evidence(), evidence({ observedAt: daysAgo(-1), query: "다른 검색어" })] }))[0];
    expect(future).toMatchObject({ eligible: false, queryCount: 0, reasons: ["현재보다 늦은 관측 시각이 있어 검토 필요"] });
    expect(rank(candidate({ evidence: [evidence({ observedAt: "nope" })] }))[0].reasons).toEqual(["관측 시각을 해석할 수 없어 검토 필요"]);
  });
  it("requires each organic query to be fresh on its own so unrelated recent observations never revive an old hit", () => {
    const revived = rank(candidate({ evidence: [evidence({ observedAt: daysAgo(8) }), evidence({ query: "토마토 선물세트", observedAt: daysAgo(1), relevance: "UNKNOWN" })] }))[0];
    expect(revived).toMatchObject({ eligible: false, recommended: false, queryCount: 0, bestPosition: null });
    expect(revived.reasons).toContain("비광고·조건 일치·위치 확인 검색어가 없음");
    expect(revived.reasons.some(reason => reason.includes("8일 전 관측이라 7일 기준을 넘음"))).toBe(true);
    const mixed = rank(candidate({ evidence: [evidence({ observedAt: daysAgo(8), position: 1 }), evidence({ query: "대추방울토마토 3kg", observedAt: daysAgo(2), position: 9 })] }))[0];
    expect(mixed).toMatchObject({ eligible: true, queryCount: 1, bestPosition: 9 });
  });
  it("excludes processed and stevia products by title heuristics", () => {
    for (const title of ["스테비아 대추방울토마토 2kg", "토망고 1kg", "대추방울토마토 말랭이", "Stevia tomato", "토마토 주스 1L"]) {
      const ranked = rank(candidate({ title, evidence: [evidence({ title })] }))[0];
      expect(ranked.eligible).toBe(false);
      expect(ranked.reasons.some(reason => reason.startsWith("가공·스테비아 상품으로 판단"))).toBe(true);
    }
    expect(rank(candidate({ title: "산지직송 대추방울토마토 2kg 중과" }))[0].eligible).toBe(true);
  });
  it("keeps user-excluded candidates in output without recommending them", () => {
    const ranked = rank(candidate({ status: "EXCLUDED", decisionReason: "도매상" }))[0];
    expect(ranked).toMatchObject({ eligible: false, recommended: false, reasons: ["사용자 제외: 도매상"] });
    expect(rank(candidate({ status: "WATCH" }))[0].recommended).toBe(true);
  });
  it("needs relevance MATCH, organic status and a positive position", () => {
    expect(rank(candidate({ evidence: [evidence({ relevance: "UNKNOWN" })] }))[0].reasons.some(reason => reason.includes("조건 미확인"))).toBe(true);
    expect(rank(candidate({ evidence: [evidence({ adStatus: "UNKNOWN" })] }))[0].reasons.some(reason => reason.includes("광고 여부 미확인"))).toBe(true);
    expect(rank(candidate({ evidence: [evidence({ position: null })] }))[0]).toMatchObject({ eligible: false, bestPosition: null });
  });
});

describe("shortlist", () => {
  const store = (index: number, over: Partial<DiscoveryCandidate> = {}, ev: Partial<DiscoveryEvidence> = {}, suffix = "") => {
    const productUrl = `https://smartstore.naver.com/store-${index}/products/${suffix || index}`;
    return candidate({ id: `c-${index}-${suffix}`, storeKey: `store-${index}`, productUrl, evidence: [evidence({ productUrl, ...ev })], ...over });
  };
  it("recommends at most 10 distinct stores, one product per store", () => {
    const list = [...Array.from({ length: 12 }, (_, i) => store(i, {}, { position: i + 2 })), store(0, {}, { position: 1 }, "second")];
    const ranked = rank(...list);
    expect(ranked.filter(item => item.recommended)).toHaveLength(DISCOVERY_RECOMMEND_LIMIT);
    expect(new Set(ranked.filter(item => item.recommended).map(item => item.storeKey)).size).toBe(10);
    const duplicate = ranked.find(item => item.id === "c-0-second");
    expect(duplicate).toMatchObject({ eligible: true, recommended: true });
    expect(ranked.find(item => item.id === "c-0-")).toMatchObject({ eligible: true, recommended: false });
    expect(ranked.find(item => item.id === "c-0-")?.reasons).toContain("같은 판매처의 다른 상품이 이미 추천됨");
    expect(ranked.filter(item => item.eligible && !item.recommended && item.reasons.includes("추천 상한 10곳 초과"))).toHaveLength(2);
  });
  it("orders by organic query count, then best position, then URL and lists ineligible last", () => {
    const twoQueries = store(1, {}, { position: 20 });
    const withSecond = { ...twoQueries, evidence: [...twoQueries.evidence, evidence({ productUrl: twoQueries.productUrl, query: "대추방울토마토 3kg", position: 30 })] };
    const ranked = rank(store(3, {}, { position: 5 }), store(4, { status: "EXCLUDED" }, { position: 1 }), store(2, {}, { position: 5 }), withSecond);
    expect(ranked.map(item => item.storeKey)).toEqual(["store-1", "store-2", "store-3", "store-4"]);
    expect(ranked.map(item => item.recommended)).toEqual([true, true, true, false]);
  });
  it("is deterministic and never mutates its input", () => {
    const input = [store(2), store(1)];
    const snapshot = JSON.stringify(input);
    expect(rank(...input)).toEqual(rank(...input));
    expect(JSON.stringify(input)).toBe(snapshot);
    expect(DISCOVERY_POLICY_VERSION).toMatch(/^\d{4}-\d{2}-\d{2}\./);
  });
});

describe("review delta", () => {
  const cumulative = (days: number, reviewCount: number | null, reviewBasis: DiscoveryEvidence["reviewBasis"] = "CUMULATIVE") =>
    evidence({ observedAt: daysAgo(days), reviewCount, reviewBasis });
  it("compares the latest cumulative count with one 6–8 days earlier", () => {
    expect(reviewDeltaFor([cumulative(0, 120), cumulative(7, 100)])).toEqual({ delta: 20, reason: "최근 리뷰 증가 20건 (7일 간격)" });
    expect(reviewDeltaFor([cumulative(7, 100), cumulative(0, 100)]).delta).toBe(0);
    expect(reviewDeltaFor([cumulative(0, 120), cumulative(6, 110), cumulative(8, 100)]).delta).toBe(10);
  });
  it("reports the actual interval instead of asserting seven days", () => {
    expect(reviewDeltaFor([cumulative(0, 120), cumulative(6.5, 100)]).reason).toBe("최근 리뷰 증가 20건 (6.5일 간격)");
    expect(reviewDeltaFor([cumulative(0, 120), cumulative(8, 100)]).reason).toBe("최근 리뷰 증가 20건 (8일 간격)");
    // A rolling reading at 7 days is skipped in favour of the cumulative reading still inside the window.
    expect(reviewDeltaFor([cumulative(0, 120), cumulative(7, 50, "ROLLING"), cumulative(8, 100)])).toMatchObject({ delta: 20, reason: expect.stringContaining("8일 간격") });
  });
  it("suppresses the delta when cumulative counts at the same timestamp disagree across queries", () => {
    const other = (days: number, reviewCount: number, over: Partial<DiscoveryEvidence> = {}) => evidence({ query: "대추방울토마토 3kg", observedAt: daysAgo(days), reviewCount, reviewBasis: "CUMULATIVE", ...over });
    expect(reviewDeltaFor([cumulative(0, 120), other(0, 125), cumulative(7, 100)])).toEqual({ delta: null, reason: "같은 시각에 서로 다른 누적 리뷰 수가 있어 검토 필요" });
    expect(reviewDeltaFor([cumulative(0, 120), other(0, 120), cumulative(7, 100)]).delta).toBe(20);
    expect(reviewDeltaFor([cumulative(0, 120), cumulative(7, 100), other(7, 90)])).toEqual({ delta: null, reason: "같은 시각에 서로 다른 누적 리뷰 수가 있어 검토 필요" });
    // A conflicting prior reading is never skipped in favour of an older agreeing one.
    expect(reviewDeltaFor([cumulative(0, 120), cumulative(7, 100), other(7, 90), cumulative(8, 95)]).delta).toBeNull();
    // A same-timestamp observation without any count does not create a conflict, and a rolling one blocks.
    expect(reviewDeltaFor([cumulative(0, 120), other(0, 0, { reviewCount: null }), cumulative(7, 100)]).delta).toBe(20);
    expect(reviewDeltaFor([cumulative(0, 120), other(0, 120, { reviewBasis: "ROLLING" }), cumulative(7, 100)]).delta).toBeNull();
  });
  it("returns null with a reason outside the window, for rolling or unknown bases, or when the count fell", () => {
    expect(reviewDeltaFor([cumulative(0, 120), cumulative(5, 100)])).toMatchObject({ delta: null, reason: expect.stringContaining("6–8일 전") });
    expect(reviewDeltaFor([cumulative(0, 120), cumulative(9, 100)]).delta).toBeNull();
    expect(reviewDeltaFor([cumulative(0, 120, "ROLLING"), cumulative(7, 100)])).toMatchObject({ delta: null, reason: expect.stringContaining("누적") });
    expect(reviewDeltaFor([cumulative(0, 120), cumulative(7, 100, "ROLLING")]).delta).toBeNull();
    expect(reviewDeltaFor([cumulative(0, 120, "UNKNOWN"), cumulative(7, 100)]).delta).toBeNull();
    expect(reviewDeltaFor([cumulative(0, 90), cumulative(7, 100)])).toMatchObject({ delta: null, reason: expect.stringContaining("감소") });
    expect(reviewDeltaFor([cumulative(0, null), cumulative(7, 100)])).toEqual({ delta: null, reason: "리뷰 수 미확인" });
    expect(reviewDeltaFor([])).toEqual({ delta: null, reason: "리뷰 수 미확인" });
  });
  it("uses the latest observation across queries and surfaces the reason on the ranked candidate", () => {
    const ranked = rank(candidate({ evidence: [cumulative(0, 120), evidence({ query: "대추방울토마토 3kg", observedAt: daysAgo(7), reviewCount: 100, reviewBasis: "CUMULATIVE" })] }))[0];
    expect(ranked.reviewDelta).toBe(20);
    expect(ranked.reasons).toContain("최근 리뷰 증가 20건 (7일 간격)");
    expect(ranked.evidence[0].purchaseLabel).toBe("");
  });
});
