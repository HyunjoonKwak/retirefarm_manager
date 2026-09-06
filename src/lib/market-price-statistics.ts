import { packageKg } from "@/lib/market-analysis";

/** Same positive-price, positive-volume population for history, details and cards. */
export function summarizeMarketPrices(rows: { price: number; quantity: number; unit: string }[]) {
  const valid = rows.filter(row => Number.isFinite(row.price) && row.price > 0 && Number.isFinite(row.quantity) && row.quantity > 0);
  if (!valid.length) return null;
  let totalQuantity = 0, totalTradeAmount = 0, minPrice = Infinity, maxPrice = -Infinity;
  let totalKg = 0, kgAmount = 0, kgTradeCount = 0;
  for (const row of valid) {
    totalQuantity += row.quantity; totalTradeAmount += row.price * row.quantity;
    minPrice = Math.min(minPrice, row.price); maxPrice = Math.max(maxPrice, row.price);
    const kg = packageKg(row.unit);
    if (kg !== null) { totalKg += kg * row.quantity; kgAmount += row.price * row.quantity; kgTradeCount++; }
  }
  return {
    avgPrice: Math.round(totalTradeAmount / totalQuantity), minPrice, maxPrice,
    tradeCount: valid.length, totalQuantity, totalTradeAmount,
    pricePerKg: totalKg > 0 ? Math.round(kgAmount / totalKg) : null,
    kgTradeCount, excludedCount: rows.length - valid.length,
  };
}
