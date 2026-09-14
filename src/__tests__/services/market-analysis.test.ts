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

it("keeps exact origins and corporation codes separate even with identical labels", () => {
  const { summaries } = summarizeVarietyTrades([
    trade({ corporationCode: "1" }), trade({ corporationCode: "2" }),
    trade({ corporationCode: "1", origin: "논산시" }),
  ]);
  expect(summaries).toHaveLength(3);
});
it("flags outside the weighted IQR without deleting rows, and measures flagged volume", () => {
  const rows = Array.from({ length: 20 }, (_, i) => trade({ id: String(i), price: i === 19 ? 100000 : 1000 + Math.floor(i / 5) * 100,
    auctionDate: i % 2 ? "2026-09-06T00:00:00+09:00" : "2026-09-07T00:00:00+09:00" }));
  const original = JSON.stringify(rows);
  const result = summarizeVarietyTrades(rows).summaries[0];
  expect(result).toMatchObject({ tradeCount: 20, quantity: 20, observedDays: 2, p25: 1000, p75: 1200, max: 100000,
    review: { status: "READY", lower: 700, upper: 1500, count: 1, quantitySharePct: 5 } });
  expect(result.review.samples.map(row => row.id)).toEqual(["19"]);
  expect(result.mean).toBe(rows.reduce((sum, row) => sum + row.price, 0) / 20);
  expect(JSON.stringify(rows)).toBe(original);
});
it("withholds flags for single-day, small, and zero-width populations", () => {
  const rows = Array.from({ length: 20 }, (_, i) => trade({ id: String(i), price: i === 19 ? 100000 : 1000,
    auctionDate: i % 2 ? "2026-09-06T00:00:00+09:00" : "2026-09-07T00:00:00+09:00" }));
  expect(summarizeVarietyTrades(rows).summaries[0].review).toMatchObject({ status: "ZERO_IQR", lower: null, count: 0, quantitySharePct: null });
  expect(summarizeVarietyTrades(rows.slice(0, 19)).summaries[0].review.status).toBe("LOW_SAMPLE");
  expect(summarizeVarietyTrades(rows.map(row => ({ ...row, auctionDate: "2026-09-06" }))).summaries[0].review.status).toBe("LOW_SAMPLE");
});
it("counts Korean calendar days instead of UTC boundaries", () => {
  const rows = Array.from({ length: 20 }, (_, i) => trade({ price: 1000 + i * 100,
    auctionDate: i % 2 ? "2026-09-06T14:59:59Z" : "2026-09-06T15:00:00Z" }));
  expect(summarizeVarietyTrades(rows).summaries[0]).toMatchObject({ observedDays: 2, review: { status: "READY" } });
});
