import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import prisma from "@/lib/prisma";
import { authOptions } from "@/lib/auth/options";
import { calculateSmartFarmPlanSummary } from "@/lib/validations/plan";
import { externalPortfolioClient } from "@/lib/api/external-portfolio";

// GET: 스마트팜 준비 시뮬레이션 결과
// 이 API는 하위 호환을 위해 유지하며, /api/plan으로 마이그레이션을 권장합니다.
export async function GET() {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.id) {
      return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
    }

    const userId = session.user.id;

    const goal = await prisma.retirementGoal.findUnique({
      where: { userId },
    });

    if (!goal) {
      return NextResponse.json(
        { error: "목표가 설정되지 않았습니다." },
        { status: 404 }
      );
    }

    // 설립 비용 조회
    const setupCosts = await prisma.setupCostItem.findMany({
      where: { userId },
    });

    // 자금 조달 조회
    const fundingSources = await prisma.fundingSource.findMany({
      where: { userId },
    });

    // 외부 포트폴리오에서 현재 자산 가치 가져오기
    // email 기반 조회 - userId가 변경되어도 연동 유지
    const userEmail = session.user.email;
    let externalAssetsSummary = null;

    try {
      if (!userEmail) {
        throw new Error("User email not found in session");
      }
      const summary = await externalPortfolioClient.getSummary(userEmail);
      const netValue = Number(summary.totalValue) - Number(summary.totalLoanAmount);
      externalAssetsSummary = {
        totalAssets: summary.totalAssets,
        totalValue: summary.totalValue,
        totalLoanAmount: summary.totalLoanAmount,
        netValue: netValue.toString(),
      };
    } catch {
      console.log("External portfolio API not available");
    }

    // 매도 예정 자산 정보 가져오기
    let expectedProceeds = null;
    try {
      if (userEmail) {
        expectedProceeds = await externalPortfolioClient.getExpectedProceeds(userEmail);
      }
    } catch {
      console.log("Failed to get expected proceeds");
    }

    // 요약 계산
    const summary = calculateSmartFarmPlanSummary({
      goal: {
        targetDate: goal.targetDate,
        estimatedRetirementPay: goal.estimatedRetirementPay ? Number(goal.estimatedRetirementPay) : undefined,
        estimatedSeverancePay: goal.estimatedSeverancePay ? Number(goal.estimatedSeverancePay) : undefined,
        monthlyLivingExpense: goal.monthlyLivingExpense ? Number(goal.monthlyLivingExpense) : undefined,
        bufferMonths: goal.bufferMonths || undefined,
      },
      setupCosts: setupCosts.map((item) => ({
        estimatedCost: Number(item.estimatedCost),
        subsidyAmount: item.subsidyAmount ? Number(item.subsidyAmount) : undefined,
      })),
      fundingSources: fundingSources.map((source) => ({
        amount: Number(source.amount),
        status: source.status,
      })),
    });

    return NextResponse.json({
      simulation: {
        targetDate: goal.targetDate.toISOString(),
        daysRemaining: summary.daysRemaining,
        monthsRemaining: summary.monthsRemaining,
        yearsRemaining: summary.yearsRemaining,
        estimatedRetirementPay: summary.estimatedRetirementPay,
        estimatedSeverancePay: summary.estimatedSeverancePay,
        totalRetirementFunds: summary.totalRetirementFunds,
        totalSetupCost: summary.totalSetupCost,
        totalSubsidyAmount: summary.totalSubsidyAmount,
        netSetupCost: summary.netSetupCost,
        totalFundingPlanned: summary.totalFundingPlanned,
        fundingGap: summary.fundingGap,
        fundingProgress: summary.fundingProgress,
        initialLivingBuffer: summary.initialLivingBuffer,
        totalRequiredFunds: summary.totalRequiredFunds,
        readinessScore: summary.readinessScore,
      },
      externalAssets: externalAssetsSummary,
      expectedProceeds,
    });
  } catch (error) {
    console.error("Retirement simulation error:", error);
    return NextResponse.json(
      { error: "시뮬레이션 중 오류가 발생했습니다." },
      { status: 500 }
    );
  }
}
