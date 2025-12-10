import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import prisma from "@/lib/prisma";
import { authOptions } from "@/lib/auth/options";
import { calculateRetirementSimulation } from "@/lib/validations/retirement";
import { externalPortfolioClient } from "@/lib/api/external-portfolio";

// GET: 은퇴 시뮬레이션 결과
export async function GET() {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.id) {
      return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
    }

    const goal = await prisma.retirementGoal.findUnique({
      where: { userId: session.user.id },
    });

    if (!goal) {
      return NextResponse.json(
        { error: "은퇴 목표가 설정되지 않았습니다." },
        { status: 404 }
      );
    }

    // 외부 포트폴리오에서 현재 자산 가치 가져오기
    const userId = session.user.id;
    let currentAssets = 0;
    let externalAssetsAvailable = false;
    let externalAssetsSummary = null;

    try {
      const summary = await externalPortfolioClient.getSummary(userId);
      currentAssets = Number(summary.totalValue) - Number(summary.totalLoanAmount);
      externalAssetsAvailable = true;
      externalAssetsSummary = {
        totalAssets: summary.totalAssets,
        totalValue: summary.totalValue,
        totalLoanAmount: summary.totalLoanAmount,
        netValue: currentAssets.toString(),
      };
    } catch {
      // 외부 API 연결 실패 시 무시
      console.log("External portfolio API not available");
    }

    // 시뮬레이션 계산
    const simulation = calculateRetirementSimulation(
      {
        targetDate: goal.targetDate,
        targetAmount: Number(goal.targetAmount),
        monthlyLivingExpense: Number(goal.monthlyLivingExpense),
        lifeExpectancy: goal.lifeExpectancy,
        inflationRate: Number(goal.inflationRate),
      },
      45, // 기본 현재 나이 (TODO: 사용자 설정에서 가져오기)
      currentAssets
    );

    // 매도 예정 자산 정보 가져오기
    let expectedProceeds = null;
    if (externalAssetsAvailable) {
      try {
        expectedProceeds = await externalPortfolioClient.getExpectedProceeds(userId);
      } catch {
        console.log("Failed to get expected proceeds");
      }
    }

    return NextResponse.json({
      simulation: {
        ...simulation,
        targetDate: simulation.targetDate.toISOString(),
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
