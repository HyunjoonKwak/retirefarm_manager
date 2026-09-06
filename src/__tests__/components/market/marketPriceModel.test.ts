import { describe, it, expect } from "vitest";
import {
  computeWeeklyPriceData,
  filterAndSortDailyResults,
  summarizeDailyResults,
  facetsStateFromResponse,
  buildFacetsUrl,
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
      sortField: null,
      sortDirection: "desc",
    });
    expect(result.map((r) => r.id)).toEqual(["1"]);
    expect(daily).toEqual(original);
  });

  it("정렬 필드와 방향을 적용한다", () => {
    const byPriceAsc = filterAndSortDailyResults(daily, {
      selectedVarieties: [],
      selectedOrigin: null,
      selectedUnit: null,
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
});

describe("facets 요청/응답", () => {
  it("URL에는 품종을 넣지 않고 산지·단위·기간만 넣는다", () => {
    expect(buildFacetsUrl("딸기", "논산", "2kg", "30")).toBe(
      "/api/market/garak?action=facets&productName=%EB%94%B8%EA%B8%B0&days=30&origin=%EB%85%BC%EC%82%B0&unit=2kg"
    );
    expect(buildFacetsUrl("딸기", null, null, "90")).not.toContain("origin");
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
