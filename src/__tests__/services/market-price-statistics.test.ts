import { expect, it } from "vitest";
import { summarizeMarketPrices } from "@/lib/market-price-statistics";
it("weights by volume and excludes unusable prices and quantities", () => {
  expect(summarizeMarketPrices([
    { price: 100, quantity: 1, unit: "500g" }, { price: 200, quantity: 9, unit: "0.5kg" },
    { price: 10000, quantity: 0, unit: "5kg" }, { price: -1, quantity: 10, unit: "5kg" },
  ])).toEqual({ avgPrice: 190, minPrice: 100, maxPrice: 200, tradeCount: 2, totalQuantity: 10,
    totalTradeAmount: 1900, pricePerKg: 380, kgTradeCount: 2, excludedCount: 2 });
});
it("does not infer ambiguous package weights and exposes kg coverage", () => {
  expect(summarizeMarketPrices([{ price: 100, quantity: 1, unit: "2kg×3" }, { price: 200, quantity: 1, unit: "1kg" }]))
    .toMatchObject({ avgPrice: 150, pricePerKg: 200, kgTradeCount: 1 });
  expect(summarizeMarketPrices([])).toBeNull();
});

it("accepts fractional package notation found in source records", () => {
  expect(summarizeMarketPrices([{ price: 1000, quantity: 2, unit: ".5kg" }])?.pricePerKg).toBe(2000);
});
