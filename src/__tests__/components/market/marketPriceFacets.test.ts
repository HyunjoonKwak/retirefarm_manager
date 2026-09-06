import { describe, it, expect } from "vitest";
import {
  buildFacetsQueryKey,
  buildVarietyOptions,
  preserveSelectedUnit,
  originMatches,
  createLatestRequestGuard,
  EMPTY_FACETS_STATE,
  type VarietyFacet,
  type VarietyFacetsState,
} from "@/components/market/marketPriceTypes";

const facets: VarietyFacet[] = [
  { variety: "설향", originPeriodCount: 12, matchingCount: 12, lastSeenAt: "2026-09-05", availability: "available" },
  { variety: "죽향", originPeriodCount: 4, matchingCount: 0, lastSeenAt: "2026-09-01", availability: "filtered_out" },
  { variety: "금실", originPeriodCount: 0, matchingCount: 0, lastSeenAt: "2026-03-10", availability: "no_period_records" },
  { variety: "매향", originPeriodCount: 0, matchingCount: 0, lastSeenAt: null, availability: "unobserved" },
];

const ready: VarietyFacetsState = {
  status: "ready",
  queryKey: "k",
  facets,
  scope: { productName: "딸기", origin: "논산", unit: "2kg", days: 30 },
  asOf: "2026-09-06T09:30:00.000Z",
  error: null,
};

describe("buildVarietyOptions", () => {
  it("기본 보기는 거래 확인 품종 + 선택된 품종만 보이고 나머지는 숨긴 수로 센다", () => {
    const result = buildVarietyOptions({
      varieties: ["설향", "죽향", "금실", "매향", "장희"],
      facetsState: ready,
      selectedVarieties: ["죽향"],
      showAll: false,
    });
    expect(result.options.map((o) => o.variety)).toEqual(["설향", "죽향"]);
    expect(result.hiddenCount).toBe(3); // 금실, 매향, 장희(facets 없음 → unknown)
    expect(result.availableCount).toBe(1);
    expect(result.options[0]).toMatchObject({ status: "available", shortLabel: "12건", selected: false });
    expect(result.options[1]).toMatchObject({ status: "filtered_out", selected: true });
    expect(result.options[1].reason).toContain("단위");
  });

  it("선택된 품종은 거래가 없어도 항상 보이고 이유가 붙는다", () => {
    const result = buildVarietyOptions({
      varieties: [],
      facetsState: ready,
      selectedVarieties: ["금실", "매향"],
      showAll: false,
    });
    expect(result.selectedUnavailable.map((o) => o.variety)).toEqual(["금실", "매향"]);
    expect(result.options.find((o) => o.variety === "금실")?.shortLabel).toContain("기간 외");
    expect(result.options.find((o) => o.variety === "매향")?.reason).toContain("부재를 뜻하지 않음");
  });

  it("전체 보기는 모든 후보를 이유와 함께 보여준다 (탐색 선택 허용)", () => {
    const result = buildVarietyOptions({
      varieties: ["장희"],
      facetsState: ready,
      selectedVarieties: [],
      showAll: true,
    });
    expect(result.options.map((o) => o.variety)).toEqual(["설향", "죽향", "금실", "매향", "장희"]);
    expect(result.hiddenCount).toBe(0);
    expect(result.options.find((o) => o.variety === "장희")?.status).toBe("unknown");
  });

  it("facets 요청 실패면 전부 '확인 필요'로 보이고 선택 가능하다 (빈 목록으로 덮지 않음)", () => {
    const result = buildVarietyOptions({
      varieties: ["설향", "죽향"],
      facetsState: { ...EMPTY_FACETS_STATE, status: "error", error: "HTTP 500" },
      selectedVarieties: [],
      showAll: false,
    });
    expect(result.mode).toBe("error");
    expect(result.options).toHaveLength(2);
    expect(result.options.every((o) => o.status === "unknown")).toBe(true);
    expect(result.options[0].shortLabel).toBe("확인 필요");
  });

  it("첫 확인 중(이전 결과 없음)에는 선택된 품종만 보인다 — 자동 전체 확장 금지", () => {
    const result = buildVarietyOptions({
      varieties: ["설향", "죽향"],
      facetsState: { ...EMPTY_FACETS_STATE, status: "loading", queryKey: "k" },
      selectedVarieties: ["죽향"],
      showAll: false,
    });
    expect(result.options.map((o) => o.variety)).toEqual(["죽향"]);
    expect(result.options[0].shortLabel).toBe("확인 중");
    expect(result.hiddenCount).toBe(1);
  });

  it("재확인 중에는 이전 산지의 거래 확인 상태를 표시하지 않는다", () => {
    const result = buildVarietyOptions({
      varieties: [],
      facetsState: { ...ready, status: "loading" },
      selectedVarieties: [],
      showAll: false,
    });
    expect(result.options).toEqual([]);
    expect(result.availableCount).toBe(0);
  });
});

describe("buildFacetsQueryKey / preserveSelectedUnit / originMatches", () => {
  it("품종 선택은 키에 들어가지 않고 산지·단위·등급·기간·품목만 구분한다", () => {
    const a = buildFacetsQueryKey("딸기", "논산", null, null, "30");
    expect(a).toBe(buildFacetsQueryKey("딸기", "논산", null, null, 30));
    expect(a).not.toBe(buildFacetsQueryKey("딸기", "진주", null, null, "30"));
    expect(a).not.toBe(buildFacetsQueryKey("딸기", "논산", "2kg", null, "30"));
    expect(a).not.toBe(buildFacetsQueryKey("딸기", "논산", null, "특", "30"));
  });

  it("선택한 등급이 후보 목록에 없어도 남겨 해제할 수 있게 한다", () => {
    expect(preserveSelectedUnit(["특", "상"], "특")).toEqual(["특", "상"]);
    expect(preserveSelectedUnit([], "특")).toEqual(["특"]);
  });

  it("선택한 단위가 일별 자료에 없어도 목록에 남긴다", () => {
    expect(preserveSelectedUnit(["2kg", "500g"], "2kg")).toEqual(["2kg", "500g"]);
    expect(preserveSelectedUnit([], "2kg")).toEqual(["2kg"]);
    expect(preserveSelectedUnit(["2kg"], null)).toEqual(["2kg"]);
  });

  it("산지는 서버와 같은 contains 규칙으로 맞춘다", () => {
    expect(originMatches("충남 논산시", "논산")).toBe(true);
    expect(originMatches("경남 진주시", "논산")).toBe(false);
    expect(originMatches(null, "논산")).toBe(false);
    expect(originMatches(null, null)).toBe(true);
  });
});

describe("createLatestRequestGuard", () => {
  it("A→B→A와 동일 키 재요청에서도 이전 A 응답은 적용하지 않는다", () => {
    const guard = createLatestRequestGuard();
    const oldA = guard.start("A");
    guard.start("B");
    const newA = guard.start("A");
    expect(guard.isLatest("A", oldA)).toBe(false);
    expect(guard.isLatest("A", newA)).toBe(true);
    const retry = guard.start("A");
    expect(guard.isLatest("A", newA)).toBe(false);
    expect(guard.isLatest("A", retry)).toBe(true);
  });
  it("새 요청이 시작되면 이전 요청은 abort되고 최신 키만 반영 대상이다", () => {
    const guard = createLatestRequestGuard();
    const first = guard.start("origin=논산");
    const second = guard.start("origin=진주");
    expect(first.aborted).toBe(true);
    expect(second.aborted).toBe(false);
    expect(guard.isLatest("origin=논산", first)).toBe(false);
    expect(guard.isLatest("origin=진주", second)).toBe(true);
    guard.cancel();
    expect(second.aborted).toBe(true);
    expect(guard.isLatest("origin=진주", second)).toBe(false);
  });
});
