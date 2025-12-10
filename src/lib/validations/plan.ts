import { z } from "zod";

export const smartFarmPlanSchema = z.object({
  targetDate: z.string().refine((date) => {
    const parsed = new Date(date);
    return parsed > new Date();
  }, "퇴직 목표일은 오늘 이후여야 합니다."),
  estimatedRetirementPay: z.number().min(0).optional(), // DC 퇴직금 예상액
  estimatedSeverancePay: z.number().min(0).optional(), // 퇴직수당 예상액
  monthlyLivingExpense: z.number().min(0).optional(), // 월 생활비 (버퍼 계산용)
  bufferMonths: z.number().min(1).max(24).default(6), // 초기 버퍼 개월 수
});

// 폼 입력용 타입 (default 적용 전)
export type SmartFarmPlanFormInput = z.input<typeof smartFarmPlanSchema>;
// API 출력용 타입 (default 적용 후)
export type SmartFarmPlanInput = z.output<typeof smartFarmPlanSchema>;

export interface SmartFarmPlanSummary {
  // 퇴직 정보
  targetDate: Date;
  daysRemaining: number;
  monthsRemaining: number;
  yearsRemaining: number;

  // 퇴직금 관련
  estimatedRetirementPay: number;
  estimatedSeverancePay: number;
  totalRetirementFunds: number;

  // 설립 비용
  totalSetupCost: number;
  totalSubsidyAmount: number;
  netSetupCost: number; // 보조금 차감 후

  // 자금 조달
  totalFundingPlanned: number;
  totalFundingSecured: number;
  fundingGap: number;
  fundingProgress: number; // %

  // 초기 버퍼
  bufferMonths: number;
  monthlyLivingExpense: number;
  initialLivingBuffer: number;

  // 종합
  totalRequiredFunds: number; // 설립비용 + 초기버퍼
  readinessScore: number; // 준비도 점수 (0-100)
}

/**
 * 스마트팜 준비 계획 요약 계산
 */
export function calculateSmartFarmPlanSummary(input: {
  goal: {
    targetDate: Date;
    estimatedRetirementPay?: number;
    estimatedSeverancePay?: number;
    monthlyLivingExpense?: number;
    bufferMonths?: number;
  };
  setupCosts: Array<{
    estimatedCost: number;
    subsidyAmount?: number;
  }>;
  fundingSources: Array<{
    amount: number;
    status: string;
  }>;
}): SmartFarmPlanSummary {
  const { goal, setupCosts, fundingSources } = input;

  const now = new Date();
  const targetDate = new Date(goal.targetDate);

  // 남은 기간 계산
  const msRemaining = targetDate.getTime() - now.getTime();
  const daysRemaining = Math.max(0, Math.floor(msRemaining / (1000 * 60 * 60 * 24)));
  const monthsRemaining = Math.max(0, Math.floor(daysRemaining / 30));
  const yearsRemaining = Math.max(0, Math.floor(daysRemaining / 365));

  // 퇴직금 계산
  const estimatedRetirementPay = goal.estimatedRetirementPay || 0;
  const estimatedSeverancePay = goal.estimatedSeverancePay || 0;
  const totalRetirementFunds = estimatedRetirementPay + estimatedSeverancePay;

  // 설립 비용 계산
  const totalSetupCost = setupCosts.reduce((sum, item) => sum + item.estimatedCost, 0);
  const totalSubsidyAmount = setupCosts.reduce((sum, item) => sum + (item.subsidyAmount || 0), 0);
  const netSetupCost = totalSetupCost - totalSubsidyAmount;

  // 자금 조달 계산
  const totalFundingPlanned = fundingSources.reduce((sum, source) => sum + source.amount, 0);
  const totalFundingSecured = fundingSources
    .filter((source) => source.status === "COMPLETED")
    .reduce((sum, source) => sum + source.amount, 0);

  // 초기 버퍼 계산
  const bufferMonths = goal.bufferMonths || 6;
  const monthlyLivingExpense = goal.monthlyLivingExpense || 0;
  const initialLivingBuffer = monthlyLivingExpense * bufferMonths;

  // 총 필요 자금
  const totalRequiredFunds = netSetupCost + initialLivingBuffer;
  const fundingGap = Math.max(0, totalRequiredFunds - totalFundingPlanned);
  const fundingProgress =
    totalRequiredFunds > 0
      ? Math.min(100, Math.round((totalFundingPlanned / totalRequiredFunds) * 100))
      : 0;

  // 준비도 점수 계산 (여러 요소 종합)
  let readinessScore = 0;

  // 1. 자금 조달 진행률 (40점)
  readinessScore += Math.round(fundingProgress * 0.4);

  // 2. 퇴직금 입력 여부 (15점)
  if (totalRetirementFunds > 0) readinessScore += 15;

  // 3. 설립 비용 계획 여부 (15점)
  if (totalSetupCost > 0) readinessScore += 15;

  // 4. 생활비 버퍼 계획 여부 (15점)
  if (initialLivingBuffer > 0) readinessScore += 15;

  // 5. 자금 조달 계획 입력 여부 (15점)
  if (fundingSources.length > 0) readinessScore += 15;

  return {
    targetDate,
    daysRemaining,
    monthsRemaining,
    yearsRemaining,
    estimatedRetirementPay,
    estimatedSeverancePay,
    totalRetirementFunds,
    totalSetupCost,
    totalSubsidyAmount,
    netSetupCost,
    totalFundingPlanned,
    totalFundingSecured,
    fundingGap,
    fundingProgress,
    bufferMonths,
    monthlyLivingExpense,
    initialLivingBuffer,
    totalRequiredFunds,
    readinessScore,
  };
}
