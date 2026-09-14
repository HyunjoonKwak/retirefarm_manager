/**
 * Local-only cost scenario for comparing my delivered price against a competitor group median.
 * Every input is an explicit user assumption; nothing here is read from or written back to the server.
 */
export interface CostAssumptions {
  packageKg: number;
  produceCostPerKg: number;
  packagingCost: number;
  shippingCost: number;
  platformFeePct: number;
  targetMarginPct: number;
}

export interface CostScenario {
  costBeforeFee: number;
  breakEvenPrice: number;
  targetPrice: number;
  targetPerKg: number;
  medianGapPct: number | null;
}

export const defaultAssumptions: CostAssumptions = {
  packageKg: 1, produceCostPerKg: 0, packagingCost: 0, shippingCost: 3500, platformFeePct: 0, targetMarginPct: 15,
};

const roundWon = (value: number) => Math.round(value);

/** Returns null when assumptions cannot produce a finite price (e.g. fee + margin reach 100%). */
export function computeScenario(input: CostAssumptions, medianDeliveredPrice: number | null): CostScenario | null {
  const values = Object.values(input);
  if (values.some(value => !Number.isFinite(value) || value < 0)) return null;
  if (input.packageKg <= 0) return null;
  const feeRatio = input.platformFeePct / 100;
  const marginRatio = input.targetMarginPct / 100;
  if (feeRatio >= 1 || feeRatio + marginRatio >= 1) return null;
  const costBeforeFee = input.produceCostPerKg * input.packageKg + input.packagingCost + input.shippingCost;
  const breakEvenPrice = roundWon(costBeforeFee / (1 - feeRatio));
  const targetPrice = roundWon(costBeforeFee / (1 - feeRatio - marginRatio));
  const targetPerKg = roundWon(targetPrice / input.packageKg);
  const medianGapPct = medianDeliveredPrice === null || medianDeliveredPrice <= 0 ? null
    : Math.round(((targetPrice - medianDeliveredPrice) / medianDeliveredPrice) * 1000) / 10;
  if (![costBeforeFee, breakEvenPrice, targetPrice, targetPerKg].every(Number.isFinite)) return null;
  return { costBeforeFee: roundWon(costBeforeFee), breakEvenPrice, targetPrice, targetPerKg, medianGapPct };
}
