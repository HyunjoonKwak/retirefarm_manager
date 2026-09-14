import { marketDateKey } from "./market-date";

export interface AnalysisTrade {
  id: string; variety: string; grade: string; unit: string; price: number;
  quantity: number; auctionDate: Date | string; origin: string; corporation: string; corporationCode?: string;
}
export interface VarietyPriceSummary {
  origin: string; corporation: string; corporationCode: string; observedDays: number;
  review: { status: "READY" | "LOW_SAMPLE" | "ZERO_IQR"; lower: number | null; upper: number | null; count: number; quantitySharePct: number | null; samples: AnalysisTrade[] };
  variety: string; grade: string; unit: string; tradeCount: number; quantity: number;
  kgPerPackage: number | null; median: number | null; p25: number | null; p75: number | null;
  mean: number | null; min: number; max: number; samples: AnalysisTrade[];
}

export function packageKg(unit: string): number | null {
  const match = unit.trim().match(/^((?:\d+(?:\.\d+)?|\.\d+))\s*(kg|g|킬로그램|그램)$/i);
  if (!match) return null;
  const weight = Number(match[1]) / (/^(g|그램)$/i.test(match[2]) ? 1000 : 1);
  return weight > 0 ? weight : null;
}

/** First price whose cumulative volume reaches the requested fraction. No interpolation. */
export function weightedQuantile(rows: { price: number; quantity: number }[], fraction: number): number | null {
  const valid = rows.filter(r => Number.isFinite(r.price) && r.price > 0 && Number.isFinite(r.quantity) && r.quantity > 0);
  const sorted = [...valid].sort((a, b) => a.price - b.price);
  const target = sorted.reduce((sum, r) => sum + r.quantity, 0) * fraction;
  let cumulative = 0;
  for (const row of sorted) {
    cumulative += row.quantity;
    if (cumulative >= target) return row.price;
  }
  return null;
}

export function summarizeVarietyTrades(trades: AnalysisTrade[]) {
  const groups = new Map<string, AnalysisTrade[]>();
  let excludedCount = 0;
  for (const trade of trades) {
    if (!Number.isFinite(trade.price) || trade.price <= 0 || !Number.isFinite(trade.quantity) || trade.quantity <= 0) {
      excludedCount++; continue;
    }
    // Keep raw labels: unverified aliases and grades must not silently merge.
    const key = JSON.stringify([trade.variety, trade.grade, trade.unit, trade.origin, trade.corporationCode ?? "", trade.corporation]);
    // Only the private accumulator changes; input records/arrays remain untouched.
    const group = groups.get(key);
    if (group) group.push(trade);
    else groups.set(key, [trade]);
  }
  const summaries: VarietyPriceSummary[] = [...groups.values()].map(rows => {
    const { variety, grade, unit, origin, corporation, corporationCode = "" } = rows[0];
    const quantity = rows.reduce((sum, r) => sum + r.quantity, 0);
    const enough = rows.length >= 5;
    const observedDays = new Set(rows.flatMap(row => {
      const date = new Date(row.auctionDate);
      return Number.isFinite(date.getTime()) ? [marketDateKey(date)] : [];
    })).size;
    const p25 = enough ? weightedQuantile(rows, .25)! : null;
    const p75 = enough ? weightedQuantile(rows, .75)! : null;
    const status = rows.length < 20 || observedDays < 2 ? "LOW_SAMPLE" as const
      : p75! <= p25! ? "ZERO_IQR" as const : "READY" as const;
    // Review flags only: never remove these rows from the statistics or source.
    const lower = status === "READY" ? Math.max(0, p25! - 1.5 * (p75! - p25!)) : null;
    const upper = status === "READY" ? p75! + 1.5 * (p75! - p25!) : null;
    const flagged = status === "READY" ? rows.filter(row => row.price < lower! || row.price > upper!) : [];
    return {
      origin, corporation, corporationCode, observedDays,
      review: { status, lower, upper, count: flagged.length,
        quantitySharePct: status === "READY" ? flagged.reduce((sum, row) => sum + row.quantity, 0) / quantity * 100 : null,
        samples: flagged.slice(0, 5) },
      variety, grade, unit, tradeCount: rows.length, quantity, kgPerPackage: packageKg(unit),
      median: enough ? weightedQuantile(rows, .5) : null,
      p25, p75,
      mean: enough ? rows.reduce((sum, r) => sum + r.price * r.quantity, 0) / quantity : null,
      min: Math.min(...rows.map(r => r.price)), max: Math.max(...rows.map(r => r.price)),
      samples: rows.slice(0, 5),
    };
  });
  return { summaries: summaries.sort((a, b) => b.tradeCount - a.tradeCount || a.variety.localeCompare(b.variety, "ko")), excludedCount };
}
