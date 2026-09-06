import { describe, it, expect } from "vitest";
import { packageKg, summarizeVarietyTrades, weightedQuantile, type AnalysisTrade } from "@/lib/market-analysis";
const trade = (patch: Partial<AnalysisTrade> = {}): AnalysisTrade => ({
  id: "1", variety: "A", grade: "특", unit: "5kg", price: 10000, quantity: 1,
  auctionDate: "2026-09-06", origin: "논산", corporation: "법인", ...patch,
});
describe("variety price distributions", () => {
  it("uses volume rather than transaction count for the midpoint and preserves split-trade invariance", () => {
    const rows = [{ price: 10000, quantity: 10 }, { price: 50000, quantity: 1 }];
    expect(weightedQuantile(rows, .5)).toBe(10000);
    expect(weightedQuantile([{ price: 10000, quantity: 5 }, { price: 10000, quantity: 5 }, rows[1]], .5)).toBe(10000);
  });
  it("does not merge varieties, grades or packaging despite a common product", () => {
    const { summaries } = summarizeVarietyTrades([trade(), trade({ variety: "B" }), trade({ grade: "상" }), trade({ unit: "10kg" })]);
    expect(summaries).toHaveLength(4);
    expect(summaries.every(row => row.median === null)).toBe(true);
  });
  it("preserves extreme prices and returns actual quartiles without inventing a forecast", () => {
    const { summaries } = summarizeVarietyTrades([10000, 11000, 12000, 13000, 100000].map(price => trade({ price })));
    expect(summaries[0]).toMatchObject({ median: 12000, p25: 11000, p75: 13000, max: 100000, tradeCount: 5 });
  });
  it("keeps identical kg prices across packaging composition changes", () => {
    const { summaries } = summarizeVarietyTrades([
      ...Array.from({ length: 5 }, () => trade()),
      ...Array.from({ length: 5 }, () => trade({ unit: "10kg", price: 20000, quantity: 10 })),
    ]);
    expect(summaries.map(row => row.median! / row.kgPerPackage!)).toEqual([2000, 2000]);
  });
  it("rejects invalid prices and quantities without guessing ambiguous package weights", () => {
    const { excludedCount, summaries } = summarizeVarietyTrades([trade({ price: 0 }), trade({ quantity: -1 }), trade({ unit: "1상자" })]);
    expect(excludedCount).toBe(2);
    expect(summaries[0].kgPerPackage).toBeNull();
    expect(packageKg("500g")).toBe(.5);
    expect(packageKg("10 kg")).toBe(10);
    expect(packageKg("10kg 2상자")).toBeNull();
  });
});
