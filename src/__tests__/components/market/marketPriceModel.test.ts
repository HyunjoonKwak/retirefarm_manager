import { describe, it, expect } from "vitest";
import {
  computeWeeklyPriceData,
  filterAndSortDailyResults,
  summarizeDailyResults,
  facetsStateFromResponse,
  buildFacetsUrl,
  buildHistoryUrl,
  buildDailyDetailUrl,
  buildAnalysisUrl,
  type DailyDetailResult,
  type PriceHistory,
} from "@/components/market/marketPriceTypes";

const history: PriceHistory[] = [
  { date: "2026-09-02", avgPrice: 100, maxPrice: 120, minPrice: 90, tradeCount: 3 },
  { date: "2026-09-04", avgPrice: 110, maxPrice: 130, minPrice: 95, tradeCount: 5 },
  { date: "2026-08-28", avgPrice: 90, maxPrice: 100, minPrice: 80, tradeCount: 2 },
];

const daily: DailyDetailResult[] = [
  { id: "1", productName: "딸기", variety: "설향", origin: "충남 논산시", price: 30000, unit: "2kg", quantity: 10, corporation: "A", grade: "특" },
  { id: "2", productName: "딸기", variety: "죽향", origin: "경남 진주시", price: 50000, unit: "2kg", quantity: 2, corporation: "B", grade: "특" },
  { id: "3", productName: "딸기", variety: "설향", origin: "충남 논산시", price: 20000, unit: "500g", quantity: 4, corporation: "C", grade: "상" },
];

describe("computeWeeklyPriceData", () => {
  it("최신 거래일이 속한 주(월~일)에 자료를 배치하고 weekOffset으로 이전 주를 본다", () => {
    const week = computeWeeklyPriceData(history, [], 0);
    expect(week.weekStart).toEqual(new Date(2026, 7, 31)); // 2026-09-04(금)의 월요일
    expect(week.data.map((d) => d?.date ?? null)).toEqual([null, null, "2026-09-02", null, "2026-09-04", null, null]);

    const prev = computeWeeklyPriceData(history, ["2026-08-30"], 1);
    expect(prev.weekStart).toEqual(new Date(2026, 7, 24));
    expect(prev.data[4]?.date).toBe("2026-08-28");
    expect(prev.noAuctionSet.has("2026-08-30")).toBe(true);
  });

  it("자료가 없으면 빈 주를 돌려준다", () => {
    expect(computeWeeklyPriceData([], [], 0).data).toEqual([]);
  });
});

describe("filterAndSortDailyResults / summarizeDailyResults", () => {
  it("산지는 contains 규칙, 단위·품종은 일치 규칙으로 거르고 원본을 바꾸지 않는다", () => {
    const original = [...daily];
    const result = filterAndSortDailyResults(daily, {
      selectedVarieties: ["설향"],
      selectedOrigin: "논산",
      selectedUnit: "2kg",
      selectedGrade: null,
      sortField: null,
      sortDirection: "desc",
    });
    expect(result.map((r) => r.id)).toEqual(["1"]);
    expect(daily).toEqual(original);
  });

  it("등급은 일치 규칙으로 거르고 미선택이면 모두 남긴다", () => {
    const onlyTop = filterAndSortDailyResults(daily, {
      selectedVarieties: [], selectedOrigin: null, selectedUnit: null, selectedGrade: "상",
      sortField: null, sortDirection: "desc",
    });
    expect(onlyTop.map((r) => r.id)).toEqual(["3"]);
    const allGrades = filterAndSortDailyResults(daily, {
      selectedVarieties: [], selectedOrigin: null, selectedUnit: null, selectedGrade: null,
      sortField: null, sortDirection: "desc",
    });
    expect(allGrades).toHaveLength(3);
  });

  it("정렬 필드와 방향을 적용한다", () => {
    const byPriceAsc = filterAndSortDailyResults(daily, {
      selectedVarieties: [],
      selectedOrigin: null,
      selectedUnit: null,
      selectedGrade: null,
      sortField: "price",
      sortDirection: "asc",
    });
    expect(byPriceAsc.map((r) => r.price)).toEqual([20000, 30000, 50000]);
  });

  it("통계는 수량 가중 평균이며 결과가 없으면 null", () => {
    const stats = summarizeDailyResults(daily);
    expect(stats).toMatchObject({ tradeCount: 3, totalQuantity: 16, maxPrice: 50000, minPrice: 20000 });
    expect(stats?.avgPrice).toBe(Math.round((300000 + 100000 + 80000) / 16));
    expect(summarizeDailyResults([])).toBeNull();
  });

  it("서버 카드와 같은 유효 표본을 쓴다 — 가격·수량이 0 이하인 행은 제외하고 건수로 알린다", () => {
    const withInvalid = [
      ...daily,
      { id: "4", productName: "딸기", variety: "설향", origin: "충남 논산시", price: 0, unit: "2kg", quantity: 5, corporation: "D", grade: "특" },
      { id: "5", productName: "딸기", variety: "설향", origin: "충남 논산시", price: 30000, unit: "2kg", quantity: 0, corporation: "E", grade: "특" },
    ];
    const stats = summarizeDailyResults(withInvalid);
    // 유효 표본만 평균에 들어가고, 제외한 행 수를 따로 알려 화면에서 숨기지 않는다.
    expect(stats).toMatchObject({ tradeCount: 3, totalQuantity: 16, excludedCount: 2 });
    expect(stats?.avgPrice).toBe(summarizeDailyResults(daily)?.avgPrice);
    expect(summarizeDailyResults([{ ...daily[0], price: -1 }])).toBeNull();
  });
});

describe("facets 요청/응답", () => {
  it("URL에는 품종을 넣지 않고 산지·단위·기간만 넣는다", () => {
    expect(buildFacetsUrl("딸기", "논산", "2kg", "특", "30")).toBe(
      "/api/market/garak?action=facets&productName=%EB%94%B8%EA%B8%B0&days=30&origin=%EB%85%BC%EC%82%B0&unit=2kg&grade=%ED%8A%B9"
    );
    const noneSelected = buildFacetsUrl("딸기", null, null, null, "90");
    expect(noneSelected).not.toContain("origin");
    // 선택하지 않은 조건은 빈 문자열로도 보내지 않는다.
    expect(noneSelected).not.toContain("grade");
    expect(noneSelected).not.toContain("unit");
  });

  it("실패·형식 오류는 error 상태로 남기고 빈 목록으로 덮지 않는다", () => {
    const failed = facetsStateFromResponse("k", false, 500, { error: "서버 오류" });
    expect(failed).toMatchObject({ status: "error", error: "서버 오류", facets: [] });
    const malformed = facetsStateFromResponse("k", true, 200, {} as never);
    expect(malformed.status).toBe("error");
    expect(malformed.error).toBe("HTTP 200");
    const ok = facetsStateFromResponse("k", true, 200, {
      facets: [],
      scope: { productName: "딸기", origin: null, unit: null, days: 30 },
      asOf: "2026-09-06T00:00:00.000Z",
      collectionState: "stored_records_only",
    });
    expect(ok.status).toBe("ready");
    expect(ok.queryKey).toBe("k");
  });
});

describe("요청 URL 계약 — 선택한 조건만 보낸다", () => {
  it("history는 품종·산지·단위·등급을 모두 반영한다", () => {
    const url = buildHistoryUrl("딸기", "30", { varieties: ["설향", "죽향"], origin: "논산", unit: "2kg", grade: "특" });
    const params = new URLSearchParams(url.split("?")[1]);
    expect(params.get("action")).toBe("history");
    expect(params.get("varieties")).toBe("설향,죽향");
    expect(params.get("grade")).toBe("특");
    expect(params.get("unit")).toBe("2kg");
  });

  it("dailyDetail도 같은 조건을 보내 서버와 화면 집계가 어긋나지 않는다", () => {
    const params = new URLSearchParams(
      buildDailyDetailUrl("2026-09-04", "딸기", { varieties: [], origin: null, unit: null, grade: "상" }).split("?")[1]
    );
    expect(params.get("action")).toBe("dailyDetail");
    expect(params.get("date")).toBe("2026-09-04");
    expect(params.get("grade")).toBe("상");
    expect(params.has("varieties")).toBe(false);
    expect(params.has("origin")).toBe(false);
  });

  it("analysis는 선택 품종이 있으면 함께 보내고 없으면 전체 비교로 둔다", () => {
    const selected = new URLSearchParams(
      buildAnalysisUrl("딸기", "90", { varieties: ["설향"], origin: null, unit: null, grade: null }).split("?")[1]
    );
    expect(selected.get("varieties")).toBe("설향");
    expect(selected.has("grade")).toBe(false);
    const none = new URLSearchParams(
      buildAnalysisUrl("딸기", "90", { varieties: [], origin: null, unit: null, grade: null }).split("?")[1]
    );
    expect(none.has("varieties")).toBe(false);
    expect([...none.keys()].sort()).toEqual(["days", "productName"]);
  });
});
