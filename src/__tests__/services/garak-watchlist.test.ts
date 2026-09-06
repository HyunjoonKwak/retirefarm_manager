import { describe, it, expect, vi, beforeEach } from "vitest";

const { prismaMock } = vi.hoisted(() => ({
  prismaMock: {
    auctionResult: { findFirst: vi.fn(), findMany: vi.fn() },
  },
}));
vi.mock("@/lib/prisma", () => ({ default: prismaMock }));
vi.mock("@/lib/logger", () => ({ logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));

import { getWatchlistPriceInfo, pickRepresentativeGroup } from "@/lib/services/garak-market";

const LATEST = new Date(2026, 8, 5);
const PREV = new Date(2026, 8, 4);

const latestRows = [
  { price: 30000, quantity: 10, unit: "2kg", variety: "설향", grade: "특" },
  { price: 28000, quantity: 5, unit: "2kg", variety: "설향", grade: "특" },
  { price: 50000, quantity: 20, unit: "2kg", variety: "죽향", grade: "특" },
  { price: 9000, quantity: 3, unit: "500g", variety: "죽향", grade: "상" },
];

beforeEach(() => {
  vi.clearAllMocks();
});

describe("pickRepresentativeGroup", () => {
  it("품종·등급·단위가 같은 그룹 중 총 물량이 가장 많은 그룹을 고른다", () => {
    const group = pickRepresentativeGroup(latestRows);
    expect(group).toMatchObject({ variety: "죽향", grade: "특", unit: "2kg", totalQuantity: 20 });
    expect(group.rows).toHaveLength(1);
  });
});

describe("getWatchlistPriceInfo", () => {
  it("대표 그룹의 가중평균을 쓰고 등락은 같은 품종·등급·단위의 직전 거래일과 비교한다", async () => {
    prismaMock.auctionResult.findFirst
      .mockResolvedValueOnce({ auctionDate: LATEST }) // latest date
      .mockResolvedValueOnce({ auctionDate: PREV }); // prev date for the same group
    prismaMock.auctionResult.findMany
      .mockResolvedValueOnce(latestRows)
      .mockResolvedValueOnce([{ price: 40000, quantity: 10 }]);

    const info = await getWatchlistPriceInfo("딸기");

    expect(info).toMatchObject({
      latestPrice: 50000,
      latestDate: LATEST,
      unit: "2kg",
      latestVariety: "죽향",
      latestGrade: "특",
    });
    expect(info.priceChange).toBeCloseTo(25, 5);

    const prevWhere = prismaMock.auctionResult.findFirst.mock.calls[1][0].where;
    expect(prevWhere).toMatchObject({ productName: "딸기", variety: "죽향", grade: "특", unit: "2kg" });
    const prevRowsWhere = prismaMock.auctionResult.findMany.mock.calls[1][0].where;
    expect(prevRowsWhere).toMatchObject({ variety: "죽향", grade: "특", unit: "2kg" });
  });

  it("같은 그룹의 이전 거래가 없으면 priceChange는 null이다 (혼합 평균으로 대체하지 않음)", async () => {
    prismaMock.auctionResult.findFirst
      .mockResolvedValueOnce({ auctionDate: LATEST })
      .mockResolvedValueOnce(null);
    prismaMock.auctionResult.findMany.mockResolvedValueOnce(latestRows);

    const info = await getWatchlistPriceInfo("딸기");
    expect(info.latestPrice).toBe(50000);
    expect(info.priceChange).toBeNull();
    expect(prismaMock.auctionResult.findMany).toHaveBeenCalledTimes(1);
  });

  it("거래가 없으면 모두 null", async () => {
    prismaMock.auctionResult.findFirst.mockResolvedValueOnce(null);
    const info = await getWatchlistPriceInfo("딸기");
    expect(info).toEqual({
      latestPrice: null,
      latestDate: null,
      unit: null,
      latestVariety: null,
      latestGrade: null,
      priceChange: null,
    });
  });
});
