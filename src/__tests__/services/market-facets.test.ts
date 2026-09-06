// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { groupBy } = vi.hoisted(() => ({ groupBy: vi.fn() }));
vi.mock("@/lib/prisma", () => ({ default: { auctionResult: { groupBy } } }));
import { getMarketVarietyFacets } from "@/lib/services/market-facets";

beforeEach(() => {
  vi.resetAllMocks();
  vi.useFakeTimers();
  vi.setSystemTime(new Date(2026, 8, 6, 12));
});
afterEach(() => vi.useRealTimers());

function seed() {
  groupBy.mockResolvedValueOnce(["A", "B", "C", "D"].map(variety => ({ variety })));
  groupBy.mockResolvedValueOnce([
    { variety: "A", _max: { auctionDate: new Date(2026, 8, 5) } },
    { variety: "B", _max: { auctionDate: new Date(2026, 8, 4) } },
    { variety: "C", _max: { auctionDate: new Date(2026, 6, 1) } },
  ]);
  groupBy.mockResolvedValueOnce([
    { variety: "A", unit: "5kg", _count: { _all: 3 } },
    { variety: "A", unit: "10kg", _count: { _all: 2 } },
    { variety: "B", unit: "10kg", _count: { _all: 4 } },
  ]);
}

describe("market variety availability", () => {
  it("distinguishes matching, unit mismatch, past-only and unobserved varieties", async () => {
    seed();
    const result = await getMarketVarietyFacets("토마토", 30, "충남", "5kg");
    expect(result.facets).toEqual([
      expect.objectContaining({ variety: "A", originPeriodCount: 5, matchingCount: 3, availability: "available" }),
      expect.objectContaining({ variety: "B", originPeriodCount: 4, matchingCount: 0, availability: "filtered_out" }),
      expect.objectContaining({ variety: "C", originPeriodCount: 0, matchingCount: 0, availability: "no_period_records" }),
      expect.objectContaining({ variety: "D", lastSeenAt: null, availability: "unobserved" }),
    ]);
    expect(result.collectionState).toBe("stored_records_only");
    expect(result.scope).toEqual({ productName: "토마토", origin: "충남", unit: "5kg", grade: null, days: 30 });
  });

  it("applies origin and history window without filtering away alternative varieties or units", async () => {
    seed();
    await getMarketVarietyFacets("토마토", 7, "충남 논산", "5kg");
    expect(groupBy.mock.calls[0][0].where).toEqual({ productName: "토마토", variety: { not: "" } });
    expect(groupBy.mock.calls[2][0].where).toEqual({
      productName: "토마토", variety: { not: "" }, origin: { contains: "충남 논산" },
      auctionDate: { gte: new Date("2026-08-30T00:00:00+09:00") },
    });
  });

  it("restores all observed packaging options when unit and origin are cleared", async () => {
    seed();
    const result = await getMarketVarietyFacets("토마토", 30);
    expect(result.facets[0].matchingCount).toBe(5);
    expect(result.facets[1].availability).toBe("available");
    expect(groupBy.mock.calls[1][0].where).not.toHaveProperty("origin");
  });

  it("empty stored data does not claim complete coverage or regional absence", async () => {
    groupBy.mockResolvedValue([]);
    const result = await getMarketVarietyFacets("토마토", 30, "제주");
    expect(result.facets).toEqual([]);
    expect(result.collectionState).toBe("stored_records_only");
  });

  it("propagates query failures instead of returning a successful empty list", async () => {
    groupBy.mockRejectedValue(new Error("database unavailable"));
    await expect(getMarketVarietyFacets("토마토", 30)).rejects.toThrow("database unavailable");
  });
});
