import { z } from "zod";

export const retirementGoalSchema = z.object({
  targetDate: z.string().refine((date) => {
    const parsed = new Date(date);
    return parsed > new Date();
  }, "목표 은퇴일은 오늘 이후여야 합니다."),
  targetAmount: z.number().min(1, "목표 자금을 입력해주세요."),
  monthlyLivingExpense: z.number().min(1, "월 생활비를 입력해주세요."),
  lifeExpectancy: z.number().min(60).max(120).default(85),
  inflationRate: z.number().min(0).max(20).default(2.5),
});

export type RetirementGoalInput = z.infer<typeof retirementGoalSchema>;

export interface RetirementSimulation {
  targetDate: Date;
  targetAmount: number;
  monthlyLivingExpense: number;
  lifeExpectancy: number;
  inflationRate: number;

  // 계산 결과
  daysRemaining: number;
  monthsRemaining: number;
  yearsRemaining: number;

  // 은퇴 후 필요 자금 (물가상승률 반영)
  retirementDuration: number; // 은퇴 후 기간 (년)
  totalRequiredFunds: number; // 총 필요 자금
  inflationAdjustedMonthlyExpense: number; // 물가상승 반영 월 생활비

  // 현재 자산 대비 분석
  currentAssets: number;
  gap: number;
  achievementRate: number;
  monthlyRequiredSavings: number;
}

/**
 * 은퇴 시뮬레이션 계산
 */
export function calculateRetirementSimulation(
  goal: {
    targetDate: Date;
    targetAmount: number;
    monthlyLivingExpense: number;
    lifeExpectancy: number;
    inflationRate: number;
  },
  currentAge: number = 45,
  currentAssets: number = 0
): RetirementSimulation {
  const now = new Date();
  const targetDate = new Date(goal.targetDate);

  // 남은 기간 계산
  const msRemaining = targetDate.getTime() - now.getTime();
  const daysRemaining = Math.max(0, Math.floor(msRemaining / (1000 * 60 * 60 * 24)));
  const monthsRemaining = Math.max(0, Math.floor(daysRemaining / 30));
  const yearsRemaining = Math.max(0, Math.floor(daysRemaining / 365));

  // 은퇴 시 나이 및 은퇴 후 기간
  const retirementAge = currentAge + yearsRemaining;
  const retirementDuration = Math.max(0, goal.lifeExpectancy - retirementAge);

  // 물가상승률 반영 월 생활비 (은퇴 시점)
  const inflationMultiplier = Math.pow(1 + goal.inflationRate / 100, yearsRemaining);
  const inflationAdjustedMonthlyExpense = Math.round(goal.monthlyLivingExpense * inflationMultiplier);

  // 총 필요 자금 계산 (은퇴 후 기간 동안 월 생활비의 합, 물가상승 반영)
  let totalRequiredFunds = 0;
  for (let year = 0; year < retirementDuration; year++) {
    const yearlyInflationMultiplier = Math.pow(1 + goal.inflationRate / 100, year);
    totalRequiredFunds += inflationAdjustedMonthlyExpense * 12 * yearlyInflationMultiplier;
  }
  totalRequiredFunds = Math.round(totalRequiredFunds);

  // 목표 금액과 필요 자금 중 큰 값 사용
  const effectiveTargetAmount = Math.max(goal.targetAmount, totalRequiredFunds);

  // 갭 분석
  const gap = effectiveTargetAmount - currentAssets;
  const achievementRate = currentAssets > 0
    ? Math.min(100, Math.round((currentAssets / effectiveTargetAmount) * 100))
    : 0;

  // 월별 필요 저축액
  const monthlyRequiredSavings = monthsRemaining > 0
    ? Math.round(gap / monthsRemaining)
    : 0;

  return {
    targetDate,
    targetAmount: goal.targetAmount,
    monthlyLivingExpense: goal.monthlyLivingExpense,
    lifeExpectancy: goal.lifeExpectancy,
    inflationRate: goal.inflationRate,
    daysRemaining,
    monthsRemaining,
    yearsRemaining,
    retirementDuration,
    totalRequiredFunds,
    inflationAdjustedMonthlyExpense,
    currentAssets,
    gap,
    achievementRate,
    monthlyRequiredSavings,
  };
}
