// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PrismaClient } from "@prisma/client";
import { mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFileSync } from "node:child_process";

const m = vi.hoisted(() => ({ db: null as unknown as PrismaClient, user: vi.fn() }));
vi.mock("@/lib/prisma", () => ({ default: new Proxy({}, { get: (_, key) => {
  const value = Reflect.get(m.db, key); return typeof value === "function" ? value.bind(m.db) : value;
} }) }));
vi.mock("@/lib/auth/guards", () => ({ getSessionUser: m.user }));
import { discoveryOverview, mutateDiscovery } from "@/lib/briefing/discovery";
import { DISCOVERY_POLICY_VERSION } from "@/lib/briefing/discovery-ranking";
import type { DiscoveryEvidenceInput } from "@/lib/briefing/discovery-contracts";
import { BriefingError } from "@/lib/briefing/queue";
import { GET, POST } from "@/app/api/briefings/discovery/route";

let dir: string;
const now = new Date("2026-09-14T03:00:00.000Z");
const DAY = 86_400_000;
const ago = (ms: number, from = now) => new Date(from.getTime() - ms);
const product = (store: string, id = 1) => `https://smartstore.naver.com/${store}/products/${id}`;
type Evidence = Partial<DiscoveryEvidenceInput>;
const evidence = (over: Evidence = {}): DiscoveryEvidenceInput => ({ productUrl: product("farm-a"), storeName: "farm-a 농장", title: "대추방울토마토 2kg",
  query: "대추방울토마토 2kg", observedAt: ago(DAY).toISOString(), position: 3, adStatus: "ORGANIC", relevance: "MATCH", purchaseLabel: "", reviewCount: null,
  reviewBasis: "UNKNOWN", ...over });
const importAs = (userId: string, items: DiscoveryEvidenceInput[], at = now) =>
  mutateDiscovery(userId, { action: "import", evidence: items }, at) as Promise<{ ok: true; id: string; evidenceCount: number; duplicate?: boolean }>;
const decide = (userId: string, candidateId: string, status: "WATCH" | "EXCLUDED", reason = "사유", at = now) =>
  mutateDiscovery(userId, { action: "decision", candidateId, status, reason }, at);
const candidateOf = (userId: string, url: string) => m.db.competitorDiscoveryCandidate.findUniqueOrThrow({ where: { userId_productUrl: { userId, productUrl: url } } });
const counts = async () => ({ runs: await m.db.competitorDiscoveryRun.count(), candidates: await m.db.competitorDiscoveryCandidate.count(),
  evidence: await m.db.competitorDiscoveryEvidence.count(), decisions: await m.db.competitorDiscoveryDecision.count(),
  panel: await m.db.competitorPanelEntry.count(), prices: await m.db.competitorPriceObservation.count() });
const rejects = (promise: Promise<unknown>, status: number, pattern?: RegExp) =>
  promise.then(() => { throw new Error("expected rejection"); }, (error: unknown) => {
    expect(error).toBeInstanceOf(BriefingError); expect((error as BriefingError).status).toBe(status);
    if (pattern) expect((error as BriefingError).message).toMatch(pattern);
  });
const post = (body: unknown) => POST(new Request("http://localhost/api/briefings/discovery", { method: "POST", body: typeof body === "string" ? body : JSON.stringify(body) }));

beforeEach(async () => {
  vi.clearAllMocks();
  dir = mkdtempSync(join(tmpdir(), "discovery-")); const file = join(dir, "db.sqlite");
  execFileSync("sqlite3", [file], { input: readdirSync("prisma/migrations").filter(s => /^\d/.test(s)).sort()
    .map(s => readFileSync(`prisma/migrations/${s}/migration.sql`, "utf8")).join("\n") });
  m.db = new PrismaClient({ datasources: { db: { url: `file:${file}` } } });
  await m.db.user.createMany({ data: [{ id: "owner", email: "owner@test.invalid" }, { id: "other", email: "other@test.invalid" }] });
  m.user.mockResolvedValue({ id: "owner" });
});
afterEach(async () => { await m.db.$disconnect(); rmSync(dir, { recursive: true, force: true }); });

describe("user isolation", () => {
  it("keeps candidates, evidence, runs and decisions per user and answers 404 for another user's candidate", async () => {
    await importAs("owner", [evidence()]);
    await importAs("other", [evidence({ storeName: "다른 사람이 본 이름" })]);
    const mine = await candidateOf("owner", product("farm-a")); const theirs = await candidateOf("other", product("farm-a"));
    expect(mine.id).not.toBe(theirs.id);
    const ownerView = await discoveryOverview("owner", now); const otherView = await discoveryOverview("other", now);
    expect(ownerView.candidates.map(c => c.id)).toEqual([mine.id]);
    expect(otherView.candidates.map(c => c.id)).toEqual([theirs.id]);
    expect(ownerView.candidates[0].evidence).toHaveLength(1);
    expect(ownerView.latestRun?.id).not.toBe(otherView.latestRun?.id);
    await rejects(decide("other", mine.id, "EXCLUDED"), 404);
    await rejects(decide("owner", "missing", "WATCH"), 404);
    expect((await candidateOf("owner", product("farm-a"))).status).toBe("WATCH");
    expect((await counts()).decisions).toBe(0);
    await decide("other", theirs.id, "EXCLUDED", "남의 결정");
    expect((await candidateOf("owner", product("farm-a"))).status).toBe("WATCH");
    expect((await discoveryOverview("owner", now)).candidates[0].recommended).toBe(true);
  });
  it("does not show one user's evidence in another user's overview even for the same product URL", async () => {
    await importAs("owner", [evidence(), evidence({ query: "대추방울토마토 3kg" })]);
    await importAs("other", [evidence({ adStatus: "AD" })]);
    expect((await discoveryOverview("other", now)).candidates[0]).toMatchObject({ queryCount: 0, recommended: false });
    expect((await discoveryOverview("owner", now)).candidates[0]).toMatchObject({ queryCount: 2, recommended: true });
  });
});

describe("import idempotence and deduplication", () => {
  it("treats a retry with different URL spelling, key order and timezone as the same run", async () => {
    const first = await importAs("owner", [evidence({ productUrl: "https://SMARTSTORE.naver.com/Farm-A/products/1/?NaPm=x#top", observedAt: ago(DAY).toISOString() })]);
    const retry = await importAs("owner", [{ reviewBasis: "UNKNOWN", reviewCount: null, purchaseLabel: "", relevance: "MATCH", adStatus: "ORGANIC", position: 3,
      observedAt: new Date(ago(DAY).getTime()).toISOString().replace("Z", "+00:00"), query: "대추방울토마토 2kg", title: "대추방울토마토 2kg", storeName: "farm-a 농장", productUrl: product("farm-a") }]);
    expect(first.evidenceCount).toBe(1);
    expect(retry).toMatchObject({ id: first.id, duplicate: true, evidenceCount: 1 });
    expect(await counts()).toMatchObject({ runs: 1, candidates: 1, evidence: 1 });
    expect((await candidateOf("owner", product("farm-a"))).productUrl).toBe(product("farm-a"));
  });
  it("stores only the new evidence when batches overlap and counts the second run accordingly", async () => {
    const a = evidence(); const b = evidence({ query: "대추방울토마토 3kg" }); const c = evidence({ query: "방울토마토 2kg", position: 12 });
    const run1 = await importAs("owner", [a, b]); const run2 = await importAs("owner", [b, c], new Date(now.getTime() + 1000));
    expect(run1.evidenceCount).toBe(2); expect(run2.evidenceCount).toBe(1);
    expect(run2.id).not.toBe(run1.id);
    expect(await counts()).toMatchObject({ runs: 2, candidates: 1, evidence: 3 });
    expect((await discoveryOverview("owner", now)).candidates[0]).toMatchObject({ queryCount: 3, bestPosition: 3 });
    expect((await discoveryOverview("owner", now)).latestRun).toMatchObject({ id: run2.id, evidenceCount: 1 });
  });
  it("collapses whitespace and case in the query so the same search is one evidence key", async () => {
    await importAs("owner", [evidence({ query: "  대추방울토마토   2KG " })]);
    const stored = await m.db.competitorDiscoveryEvidence.findFirstOrThrow();
    expect(stored.query).toBe("대추방울토마토 2kg");
    const retry = await importAs("owner", [evidence({ query: "대추방울토마토 2kg" })]);
    expect(await counts()).toMatchObject({ evidence: 1 });
    expect(retry.evidenceCount).toBe(retry.duplicate ? 1 : 0);
  });
  it("does not resurrect an organic hit once the same query later shows an ad", async () => {
    await importAs("owner", [evidence({ observedAt: ago(3 * DAY).toISOString(), position: 1 })]);
    await importAs("owner", [evidence({ observedAt: ago(DAY).toISOString(), adStatus: "AD", position: 1 })]);
    expect((await discoveryOverview("owner", now)).candidates[0]).toMatchObject({ queryCount: 0, recommended: false, eligible: false });
  });
});

describe("search-context metadata", () => {
  const source = (query = "대추방울토마토 2kg", extra = "") => `https://search.shopping.naver.com/search/all?query=${encodeURIComponent(query)}${extra}`;
  const captured = (over: Evidence = {}) => evidence({ sourceUrl: source(), searchSort: "rel", searchEnvironment: "PC", collectionMethod: "EXTENSION", ...over });
  it("records the run source for extension, manual and mixed batches", async () => {
    const extension = await importAs("owner", [captured()]);
    const manual = await importAs("owner", [evidence({ productUrl: product("farm-b") })]);
    const mixed = await importAs("owner", [captured({ productUrl: product("farm-c") }), evidence({ productUrl: product("farm-d") })]);
    for (const [id, sourceType] of [[extension.id, "EXTENSION_PUBLIC_SEARCH"], [manual.id, "MANUAL_PUBLIC_SEARCH"], [mixed.id, "MIXED_PUBLIC_SEARCH"]])
      expect(await m.db.competitorDiscoveryRun.findUniqueOrThrow({ where: { id } })).toMatchObject({ source: sourceType });
  });
  /** Exact legacy payload spelling: the hash of manual evidence must not move when metadata support is added. */
  const legacyPayload = (e: DiscoveryEvidenceInput) => JSON.stringify({ productUrl: e.productUrl, storeName: e.storeName, title: e.title, query: e.query,
    observedAt: e.observedAt, position: e.position, adStatus: e.adStatus, relevance: e.relevance, purchaseLabel: e.purchaseLabel, reviewCount: e.reviewCount, reviewBasis: e.reviewBasis });

  it("keeps legacy manual payloads byte-identical and idempotent while omitting every metadata key", async () => {
    const legacy = evidence();
    const first = await importAs("owner", [legacy]);
    const stored = await m.db.competitorDiscoveryEvidence.findFirstOrThrow();
    expect(stored.payload).toBe(legacyPayload(legacy));
    expect(JSON.parse(stored.payload)).not.toHaveProperty("sourceUrl");
    expect(JSON.parse(stored.payload)).not.toHaveProperty("collectionMethod");
    // A pre-existing row written before metadata support is matched by a retry of the same manual evidence.
    const retry = await importAs("owner", [legacy], new Date(now.getTime() + 1000));
    expect(retry).toMatchObject({ id: first.id, duplicate: true });
    expect(await counts()).toMatchObject({ runs: 1, evidence: 1 });
    const viewed = (await discoveryOverview("owner", now)).candidates[0].evidence[0];
    expect(viewed).not.toHaveProperty("sourceUrl");
    expect(viewed).toMatchObject({ query: "대추방울토마토 2kg", position: 3 });
  });
  it("persists supplied metadata in a stable order, canonicalises the search URL and preserves it on the overview", async () => {
    await importAs("owner", [captured({ sourceUrl: `${source("대추방울토마토  2KG", "&NaPm=ct%3Dx&pagingIndex=2&sort=rel")}#top` })]);
    const stored = await m.db.competitorDiscoveryEvidence.findFirstOrThrow();
    expect(Object.keys(JSON.parse(stored.payload))).toEqual(["productUrl", "storeName", "title", "query", "observedAt", "position", "adStatus", "relevance",
      "purchaseLabel", "reviewCount", "reviewBasis", "sourceUrl", "searchSort", "searchEnvironment", "collectionMethod"]);
    const canonical = `${source()}&sort=rel&pagingIndex=2`.replace("%20", "+");
    expect(JSON.parse(stored.payload)).toMatchObject({ sourceUrl: canonical, searchSort: "rel", searchEnvironment: "PC", collectionMethod: "EXTENSION" });
    const view = await discoveryOverview("owner", now);
    expect(view.candidates[0].evidence[0]).toMatchObject({ sourceUrl: canonical, searchSort: "rel", searchEnvironment: "PC", collectionMethod: "EXTENSION" });
    expect(view.candidates[0]).toMatchObject({ queryCount: 1, recommended: true });
    // Partial manual metadata is stored only for the keys that were supplied.
    await importAs("owner", [evidence({ query: "방울토마토 2kg", searchEnvironment: "MOBILE" })]);
    const partial = await m.db.competitorDiscoveryEvidence.findFirstOrThrow({ where: { query: "방울토마토 2kg" } });
    expect(Object.keys(JSON.parse(partial.payload)).slice(11)).toEqual(["searchEnvironment"]);
  });
  it("treats a retry with tracking parameters and different key order as the same run", async () => {
    const first = await importAs("owner", [captured()]);
    const retry = await importAs("owner", [{ collectionMethod: "EXTENSION", searchEnvironment: " PC ", searchSort: "rel", sourceUrl: source("대추방울토마토 2kg", "&frm=NVSHATC"),
      ...evidence() }], new Date(now.getTime() + 1000));
    expect(retry).toMatchObject({ id: first.id, duplicate: true, evidenceCount: 1 });
    expect(await counts()).toMatchObject({ runs: 1, evidence: 1 });
  });
  it("never counts the same normalised query twice because of differing environments, and keeps only the latest observation", async () => {
    await importAs("owner", [captured({ observedAt: ago(2 * DAY).toISOString(), position: 7 })]);
    await importAs("owner", [captured({ observedAt: ago(DAY).toISOString(), position: 4, searchEnvironment: "MOBILE" })]);
    await importAs("owner", [evidence({ observedAt: ago(3 * DAY).toISOString(), position: 2 })]);
    const [ranked] = (await discoveryOverview("owner", now)).candidates;
    expect(ranked).toMatchObject({ queryCount: 1, bestPosition: 4, recommended: true });
    expect(ranked.evidence).toHaveLength(3);
    expect(await counts()).toMatchObject({ runs: 3, candidates: 1, evidence: 3 });
  });
  it("answers 409 instead of merging when the same product, query and time carry different metadata or a legacy row already exists", async () => {
    await importAs("owner", [captured({ position: 3 })]);
    await rejects(importAs("owner", [captured({ position: 3, searchEnvironment: "MOBILE" })], new Date(now.getTime() + 1000)), 409, /같은 상품·검색어·시각/);
    await rejects(importAs("owner", [captured({ position: 3, searchSort: "date" })], new Date(now.getTime() + 2000)), 409);
    await rejects(importAs("owner", [evidence({ position: 3 })], new Date(now.getTime() + 3000)), 409);
    await rejects(importAs("owner", [captured({ position: 3 }), captured({ position: 3, collectionMethod: "MANUAL" })], new Date(now.getTime() + 4000)), 409);
    expect(await counts()).toMatchObject({ runs: 1, candidates: 1, evidence: 1 });
    const stored = await m.db.competitorDiscoveryEvidence.findFirstOrThrow();
    expect(JSON.parse(stored.payload)).toMatchObject({ searchEnvironment: "PC", collectionMethod: "EXTENSION" });
  });
  it("rejects a mismatched search query, a foreign search host and incomplete extension metadata at the service boundary without writing", async () => {
    await rejects(importAs("owner", [captured({ sourceUrl: source("방울토마토 2kg") })]), 400);
    await rejects(importAs("owner", [captured({ sourceUrl: "https://msearch.shopping.naver.com/search/all?query=%EB%8C%80%EC%B6%94%EB%B0%A9%EC%9A%B8%ED%86%A0%EB%A7%88%ED%86%A0%202kg" })]), 400);
    await rejects(importAs("owner", [captured({ sourceUrl: source("대추방울토마토 2kg", "&pagingIndex=0") })]), 400);
    await rejects(importAs("owner", [evidence({ collectionMethod: "EXTENSION" })]), 400);
    const { searchSort, ...noSort } = captured(); void searchSort;
    await rejects(importAs("owner", [noSort as DiscoveryEvidenceInput]), 400);
    expect((await post({ action: "import", evidence: [captured({ observedAt: new Date(Date.now() - DAY).toISOString(), sourceUrl: source("다른 검색어") })] })).status).toBe(400);
    expect(await counts()).toMatchObject({ runs: 0, candidates: 0, evidence: 0 });
  });
  it("does not let metadata change lastSeenAt, title or storeName rules for older observations", async () => {
    await importAs("owner", [evidence({ observedAt: ago(DAY).toISOString(), title: "새 제목", storeName: "새 이름" })]);
    await importAs("owner", [captured({ observedAt: ago(5 * DAY).toISOString(), title: "옛 제목", storeName: "옛 이름", query: "대추방울토마토 3kg", sourceUrl: source("대추방울토마토 3kg") })]);
    expect(await candidateOf("owner", product("farm-a"))).toMatchObject({ title: "새 제목", storeName: "새 이름", lastSeenAt: ago(DAY) });
    await importAs("owner", [captured({ observedAt: ago(DAY / 2).toISOString(), title: "확장 제목", storeName: "확장 이름" })]);
    expect(await candidateOf("owner", product("farm-a"))).toMatchObject({ title: "확장 제목", storeName: "확장 이름", lastSeenAt: ago(DAY / 2) });
    expect((await discoveryOverview("owner", now)).candidates[0]).toMatchObject({ queryCount: 2, bestPosition: 3 });
  });
});

describe("conflicts and rollback", () => {
  it("rolls back the whole batch when two observations share product, query and time with different content", async () => {
    await rejects(importAs("owner", [evidence({ position: 3 }), evidence({ position: 5 }), evidence({ productUrl: product("farm-b") })]), 409, /같은 상품·검색어·시각/);
    expect(await counts()).toMatchObject({ runs: 0, candidates: 0, evidence: 0 });
  });
  it("rolls back a later batch that contradicts stored evidence, including its otherwise valid rows", async () => {
    const first = await importAs("owner", [evidence({ position: 3 })]);
    await rejects(importAs("owner", [evidence({ productUrl: product("farm-c") }), evidence({ position: 4 })]), 409);
    expect(await counts()).toMatchObject({ runs: 1, candidates: 1, evidence: 1 });
    expect((await discoveryOverview("owner", now)).latestRun?.id).toBe(first.id);
    await expect(candidateOf("owner", product("farm-c"))).rejects.toThrow();
  });
  it("treats different URL spellings of the same product at the same query and time as one product", async () => {
    await rejects(importAs("owner", [evidence({ position: 3 }), evidence({ productUrl: "https://smartstore.naver.com/FARM-A/products/1?x=1", position: 9 })]), 409);
    expect(await counts()).toMatchObject({ candidates: 0, evidence: 0 });
  });
});

describe("seller exclusion and restoration", () => {
  it("persists exclusion for the same product on re-import and for a new product of the same seller", async () => {
    await importAs("owner", [evidence()]);
    const first = await candidateOf("owner", product("farm-a"));
    await decide("owner", first.id, "EXCLUDED", "도매 유통사");
    await importAs("owner", [evidence({ observedAt: ago(DAY / 2).toISOString(), position: 1 })]);
    expect(await candidateOf("owner", product("farm-a"))).toMatchObject({ status: "EXCLUDED", decisionReason: "도매 유통사" });
    await importAs("owner", [evidence({ productUrl: product("farm-a", 2), title: "대추방울토마토 3kg", observedAt: ago(DAY / 3).toISOString() })]);
    expect(await candidateOf("owner", product("farm-a", 2))).toMatchObject({ status: "EXCLUDED", decisionReason: "도매 유통사", storeKey: "farm-a" });
    const overview = await discoveryOverview("owner", now);
    expect(overview.recommendedCount).toBe(0);
    expect(overview.candidates.every(c => !c.recommended && c.reasons[0] === "사용자 제외: 도매 유통사")).toBe(true);
    expect(overview.candidates).toHaveLength(2);
    // A brand store with the same slug is a different seller key and stays unaffected.
    await importAs("owner", [evidence({ productUrl: "https://brand.naver.com/farm-a/products/7" })]);
    expect((await candidateOf("owner", "https://brand.naver.com/farm-a/products/7")).status).toBe("WATCH");
  });
  it("restores every product of the seller with WATCH and stops inheriting the exclusion afterwards", async () => {
    await importAs("owner", [evidence(), evidence({ productUrl: product("farm-a", 2) })]);
    const first = await candidateOf("owner", product("farm-a"));
    await decide("owner", first.id, "EXCLUDED", "제외");
    expect((await candidateOf("owner", product("farm-a", 2))).status).toBe("EXCLUDED");
    await decide("owner", first.id, "WATCH", "오해였음");
    expect(await candidateOf("owner", product("farm-a", 2))).toMatchObject({ status: "WATCH", decisionReason: "오해였음" });
    await importAs("owner", [evidence({ productUrl: product("farm-a", 3) })]);
    expect((await candidateOf("owner", product("farm-a", 3))).status).toBe("WATCH");
    expect(await m.db.competitorDiscoveryDecision.count({ where: { candidateId: first.id } })).toBe(2);
    expect((await discoveryOverview("owner", now)).recommendedCount).toBe(1);
  });
});

describe("candidate snapshot ordering", () => {
  it("keeps fixed sellers visible without consuming new candidate recommendation slots", async () => {
    await importAs("owner", [evidence(), evidence({ productUrl: product("farm-b"), storeName: "새 후보" })]);
    await m.db.competitorPanelEntry.create({ data: { userId: "owner", storeKey: "farm-a", activeStoreKey: "farm-a", storeName: "고정농장",
      productUrl: product("farm-a"), productName: "토마토", varietyGroup: "JUJUBE", qualityGroup: "REGULAR", optionLabel: "중과 2kg", packageKg: 2 } });
    const view = await discoveryOverview("owner", now);
    expect(view.recommendedCount).toBe(1);
    expect(view.candidates.find(c => c.storeKey === "farm-a")).toMatchObject({ recommended: false });
    expect(view.candidates.find(c => c.storeKey === "farm-b")).toMatchObject({ recommended: true });
    expect(view.candidates).toHaveLength(2);
    // Another user's fixed panel does not suppress our discovery shortlist.
    expect((await discoveryOverview("other", now)).recommendedCount).toBe(0);
    await importAs("other", [evidence()]);
    expect((await discoveryOverview("other", now)).recommendedCount).toBe(1);
  });

  it("uses descending run id as a deterministic tie-break for equal creation timestamps", async () => {
    await m.db.competitorDiscoveryRun.createMany({ data: ["run-a", "run-b"].map(id => ({ id, userId: "owner", contentHash: id,
      evidenceCount: 0, policyVersion: DISCOVERY_POLICY_VERSION, createdAt: now })) });
    expect((await discoveryOverview("owner", now)).latestRun?.id).toBe("run-b");
  });

  it("keeps the newest title and lastSeenAt when older observations arrive later or out of order in one batch", async () => {
    const newer = evidence({ observedAt: ago(DAY).toISOString(), title: "새 제목", storeName: "새 이름" });
    const older = evidence({ observedAt: ago(5 * DAY).toISOString(), title: "옛 제목", storeName: "옛 이름", query: "대추방울토마토 3kg" });
    await importAs("owner", [newer]);
    await importAs("owner", [older]);
    expect(await candidateOf("owner", product("farm-a"))).toMatchObject({ title: "새 제목", storeName: "새 이름", lastSeenAt: ago(DAY) });
    await importAs("owner", [evidence({ productUrl: product("farm-b"), observedAt: ago(DAY).toISOString(), title: "B 새", query: "zz 마지막" }),
      evidence({ productUrl: product("farm-b"), observedAt: ago(4 * DAY).toISOString(), title: "B 옛", query: "aa 처음" })]);
    expect(await candidateOf("owner", product("farm-b"))).toMatchObject({ title: "B 새", lastSeenAt: ago(DAY) });
    expect((await discoveryOverview("owner", now)).candidates.find(c => c.productUrl === product("farm-b"))?.evidence).toHaveLength(2);
  });
});

describe("input limits", () => {
  it("rejects future and older-than-30-day observations before writing anything", async () => {
    await rejects(importAs("owner", [evidence(), evidence({ observedAt: new Date(now.getTime() + 60_000).toISOString(), query: "미래" })]), 400, /미래/);
    await rejects(importAs("owner", [evidence({ observedAt: ago(31 * DAY).toISOString() })]), 400, /30일/);
    expect(await counts()).toMatchObject({ runs: 0, candidates: 0, evidence: 0 });
    await importAs("owner", [evidence({ observedAt: ago(29 * DAY).toISOString() })]);
    expect(await counts()).toMatchObject({ evidence: 1 });
  });
  it("rejects malicious URLs and malformed requests at the service boundary too", async () => {
    await rejects(importAs("owner", [evidence({ productUrl: "https://shopping.naver.com/farm/products/1" })]), 400);
    await rejects(mutateDiscovery("owner", { action: "import", evidence: [] } as never, now), 400);
    await rejects(mutateDiscovery("owner", { action: "decision", candidateId: "x", status: "NEW", reason: "r" } as never, now), 400);
    expect(await counts()).toMatchObject({ runs: 0, candidates: 0 });
  });
  it("never writes fixed-panel entries or price observations", async () => {
    await importAs("owner", [evidence({ purchaseLabel: "구매 1,000+" }), evidence({ productUrl: product("farm-b"), reviewCount: 120, reviewBasis: "CUMULATIVE" })]);
    expect(await counts()).toMatchObject({ panel: 0, prices: 0, candidates: 2, evidence: 2 });
    const stored = await m.db.competitorDiscoveryEvidence.findMany();
    expect(stored.map(e => JSON.parse(e.payload).purchaseLabel).sort()).toEqual(["", "구매 1,000+"]);
  });
  it("limits daily runs per user without counting other users", async () => {
    const seed = (userId: string, count: number) => m.db.competitorDiscoveryRun.createMany({ data: Array.from({ length: count }, (_, i) => ({
      userId, contentHash: `${userId}-${i}`, evidenceCount: 0, policyVersion: DISCOVERY_POLICY_VERSION, createdAt: ago(i * 60_000) })) });
    await seed("owner", 59); await seed("other", 60);
    await importAs("owner", [evidence()]);
    await rejects(importAs("owner", [evidence({ query: "다른 검색어" })]), 429);
    await importAs("other", [evidence()]).catch(() => undefined);
    expect(await m.db.competitorDiscoveryRun.count({ where: { userId: "owner" } })).toBe(60);
  });
});

describe("HTTP route", () => {
  const liveAt = new Date(Date.now() - DAY).toISOString();
  const live = () => evidence({ observedAt: liveAt });
  it("requires a session for both verbs", async () => {
    m.user.mockResolvedValue(null);
    expect((await GET()).status).toBe(401);
    expect((await post({ action: "import", evidence: [live()] })).status).toBe(401);
    expect(await counts()).toMatchObject({ runs: 0 });
  });
  it("returns the ranked overview with policy version for the signed-in user only", async () => {
    await importAs("owner", [live()], new Date()); await importAs("other", [live()], new Date());
    const res = await GET(); const body = await res.json();
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toBe("no-store");
    expect(body).toMatchObject({ policyVersion: DISCOVERY_POLICY_VERSION, recommendedCount: 1 });
    expect(body.candidates).toHaveLength(1);
    expect(body.candidates[0]).toMatchObject({ recommended: true, storeKey: "farm-a", evidence: [expect.objectContaining({ query: "대추방울토마토 2kg" })] });
  });
  it("answers 400 for malformed, unknown-action, oversized and empty bodies without writing", async () => {
    expect((await post("{not json")).status).toBe(400);
    expect((await post({ action: "search", query: "토마토" })).status).toBe(400);
    expect((await post({ action: "import", evidence: [{ ...live(), extra: 1 }] })).status).toBe(400);
    expect((await post({ action: "import", evidence: Array.from({ length: 61 }, live) })).status).toBe(400);
    expect((await post({ action: "import", evidence: [live()], pad: "x".repeat(300 * 1024) })).status).toBe(400);
    expect((await POST(new Request("http://localhost/api/briefings/discovery", { method: "POST" }))).status).toBe(400);
    expect(await counts()).toMatchObject({ runs: 0, candidates: 0 });
  });
  it("imports, dedups repeats, records decisions and maps service errors to their status", async () => {
    const first = await post({ action: "import", evidence: [live()] });
    expect(first.status).toBe(200);
    expect(await first.json()).toMatchObject({ ok: true, evidenceCount: 1 });
    const repeat = await post({ action: "import", evidence: [live()] });
    expect(await repeat.json()).toMatchObject({ ok: true, duplicate: true });
    expect(await counts()).toMatchObject({ runs: 1, evidence: 1 });
    const candidate = await candidateOf("owner", product("farm-a"));
    expect((await post({ action: "decision", candidateId: candidate.id, status: "EXCLUDED", reason: "도매" })).status).toBe(200);
    expect((await candidateOf("owner", product("farm-a"))).status).toBe("EXCLUDED");
    m.user.mockResolvedValue({ id: "other" });
    const foreign = await post({ action: "decision", candidateId: candidate.id, status: "WATCH", reason: "남의 것" });
    expect(foreign.status).toBe(404);
    expect((await candidateOf("owner", product("farm-a"))).status).toBe("EXCLUDED");
    const future = await post({ action: "import", evidence: [evidence({ observedAt: new Date(Date.now() + DAY).toISOString() })] });
    expect(future.status).toBe(400);
    expect(await (await GET()).json()).toMatchObject({ candidates: [], recommendedCount: 0, latestRun: null });
  });
});
