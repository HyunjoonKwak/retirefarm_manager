/**
 * 필요 자금 단일 계산기 (리뷰 A1).
 *
 * /setup 자금 요약, /plan 대시보드, 현금흐름 예측이 같은 정의를 쓴다:
 *   totalSetupCost      = Σ estimatedCost × quantity
 *   netSetupCost        = totalSetupCost − Σ subsidyAmount
 *   initialLivingBuffer = monthlyLivingExpense × bufferMonths
 *   totalRequiredFunds  = netSetupCost + initialLivingBuffer   ← "필요 자금"
 *   fundingGap          = totalRequiredFunds − totalFundingPlanned (음수 = 초과)
 * 금액은 Decimal로 집계해 소수 데이터가 있어도 예외가 나지 않는다.
 */
import { Prisma } from "@prisma/client";
import { percentOf, sumDecimals, toDecimal, ZERO, type DecimalLike } from "@/lib/utils/money";

export const DEFAULT_BUFFER_MONTHS = 6;
export const FUNDING_SECURED_STATUS = "COMPLETED";

export interface SetupCostLine {
  estimatedCost: DecimalLike;
  /** 없거나 1 미만이면 1로 본다 */
  quantity?: number | null;
  subsidyAmount?: DecimalLike;
}

export interface FundingSourceLine {
  amount: DecimalLike;
  status: string;
}

export interface FundingRequirementInput {
  setupCosts: SetupCostLine[];
  fundingSources: FundingSourceLine[];
  monthlyLivingExpense?: DecimalLike;
  bufferMonths?: number | null;
}

export interface FundingRequirement {
  totalSetupCost: Prisma.Decimal;
  totalSubsidy: Prisma.Decimal;
  netSetupCost: Prisma.Decimal;
  bufferMonths: number;
  monthlyLivingExpense: Prisma.Decimal;
  initialLivingBuffer: Prisma.Decimal;
  totalRequiredFunds: Prisma.Decimal;
  totalFundingPlanned: Prisma.Decimal;
  totalFundingSecured: Prisma.Decimal;
  /** 부족(+) / 초과(−) */
  fundingGap: Prisma.Decimal;
  /** max(0, fundingGap) */
  fundingShortfall: Prisma.Decimal;
  /** 0-100 정수, 100 초과는 100 */
  fundingProgress: number;
  /** 소수 둘째 자리, 상한 없음 */
  fundingRatio: number;
}

export function normalizeQuantity(quantity: number | null | undefined): number {
  return quantity && quantity >= 1 ? Math.floor(quantity) : 1;
}

/** estimatedCost × quantity (보조금 차감 전) */
export function setupCostLineTotal(line: SetupCostLine): Prisma.Decimal {
  return toDecimal(line.estimatedCost).mul(normalizeQuantity(line.quantity));
}

/** estimatedCost × quantity − subsidyAmount, 0 미만이면 0 */
export function setupCostLineNet(line: SetupCostLine): Prisma.Decimal {
  const net = setupCostLineTotal(line).minus(toDecimal(line.subsidyAmount));
  return net.lt(0) ? ZERO : net;
}

export function calculateFundingRequirement(input: FundingRequirementInput): FundingRequirement {
  const { setupCosts, fundingSources } = input;

  const totalSetupCost = sumDecimals(setupCosts.map(setupCostLineTotal));
  const totalSubsidy = sumDecimals(setupCosts.map((line) => toDecimal(line.subsidyAmount)));
  const netSetupCost = totalSetupCost.minus(totalSubsidy);

  const bufferMonths =
    input.bufferMonths && input.bufferMonths > 0 ? input.bufferMonths : DEFAULT_BUFFER_MONTHS;
  const monthlyLivingExpense = toDecimal(input.monthlyLivingExpense);
  const initialLivingBuffer = monthlyLivingExpense.mul(bufferMonths);

  const totalRequiredFunds = netSetupCost.plus(initialLivingBuffer);

  const totalFundingPlanned = sumDecimals(fundingSources.map((source) => toDecimal(source.amount)));
  const totalFundingSecured = sumDecimals(
    fundingSources
      .filter((source) => source.status === FUNDING_SECURED_STATUS)
      .map((source) => toDecimal(source.amount))
  );

  const fundingGap = totalRequiredFunds.minus(totalFundingPlanned);
  const fundingShortfall = fundingGap.lt(0) ? ZERO : fundingGap;
  const fundingRatio = percentOf(totalFundingPlanned, totalRequiredFunds, 2);
  const fundingProgress = Math.min(100, percentOf(totalFundingPlanned, totalRequiredFunds, 0));

  return {
    totalSetupCost,
    totalSubsidy,
    netSetupCost,
    bufferMonths,
    monthlyLivingExpense,
    initialLivingBuffer,
    totalRequiredFunds,
    totalFundingPlanned,
    totalFundingSecured,
    fundingGap,
    fundingShortfall,
    fundingProgress,
    fundingRatio,
  };
}
