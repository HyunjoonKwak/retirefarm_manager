import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import prisma from "@/lib/prisma";
import { authOptions } from "@/lib/auth/options";
import { externalPortfolioClient } from "@/lib/api/external-portfolio";
import { decimalToString, toDecimal, ZERO } from "@/lib/utils/money";

// GET: 대시보드 통합 데이터
export async function GET() {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.id) {
      return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
    }

    const userId = session.user.id;
    const now = new Date();
    const thisMonthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const thisMonthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0);

    // 사용자 이메일 가져오기
    const userEmail = session.user.email;

    // 병렬로 모든 데이터 조회
    const [
      retirementGoal,
      externalAssetSummary,
      recentLogs,
      monthlyFinance,
      watchlist,
      crops,
      inventoryAlerts,
    ] = await Promise.all([
      // 은퇴 목표
      prisma.retirementGoal.findUnique({
        where: { userId },
      }),
      // 외부 포트폴리오 자산 현황 (assets.specialrisk.me)
      userEmail
        ? externalPortfolioClient.getSummary(userEmail).catch(() => null)
        : Promise.resolve(null),
      // 최근 영농일지 (7일)
      prisma.farmingLog.findMany({
        where: {
          userId,
          date: {
            gte: new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000),
          },
        },
        include: {
          activities: {
            take: 3,
          },
        },
        orderBy: { date: "desc" },
        take: 5,
      }),
      // 이번 달 재무 현황
      prisma.financialTransaction.findMany({
        where: {
          userId,
          date: {
            gte: thisMonthStart,
            lte: thisMonthEnd,
          },
        },
      }),
      // 관심 품목
      prisma.priceWatchlist.findMany({
        where: { userId },
        take: 5,
      }),
      // 재배 중인 작물
      prisma.crop.findMany({
        where: {
          userId,
          status: "GROWING",
        },
        orderBy: { expectedHarvestDate: "asc" },
        take: 5,
      }),
      // 재고 부족 알림
      prisma.inventoryItem.findMany({
        where: {
          userId,
        },
      }),
    ]);

    // 스마트팜 준비 계획
    let retirementData = null;
    if (retirementGoal) {
      const targetDate = new Date(retirementGoal.targetDate);

      // 정확한 연/월/일 차이 계산
      let years = targetDate.getFullYear() - now.getFullYear();
      let months = targetDate.getMonth() - now.getMonth();
      let days = targetDate.getDate() - now.getDate();

      // 일수가 음수면 이전 달에서 빌려옴
      if (days < 0) {
        months--;
        // 목표월의 이전 달 일수를 더함 (예: 7월 목표면 6월의 일수인 30일)
        const prevMonthDays = new Date(targetDate.getFullYear(), targetDate.getMonth(), 0).getDate();
        days += prevMonthDays;
      }

      // 월수가 음수면 이전 년에서 빌려옴
      if (months < 0) {
        years--;
        months += 12;
      }

      // 목표일이 이미 지났으면 모두 0
      const isPast = targetDate.getTime() < now.getTime();
      if (isPast) {
        years = 0;
        months = 0;
        days = 0;
      }

      // 총 남은 일수 (D-Day 표시용)
      const totalDaysRemaining = Math.max(
        0,
        Math.ceil((targetDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
      );

      // 퇴직금 합계
      const totalRetirementFunds =
        Number(retirementGoal.estimatedRetirementPay || 0) +
        Number(retirementGoal.estimatedSeverancePay || 0);

      retirementData = {
        targetDate: retirementGoal.targetDate.toISOString(),
        estimatedRetirementPay: retirementGoal.estimatedRetirementPay?.toString() || null,
        totalRetirementFunds: totalRetirementFunds.toString(),
        daysRemaining: days,           // 정확한 일수 (0-30)
        monthsRemaining: months,       // 정확한 월수 (0-11)
        yearsRemaining: years,         // 정확한 연수
        totalDaysRemaining,            // 총 남은 일수 (D-Day용)
      };
    }

    // 자산 현황 계산 (외부 API에서 가져온 데이터 사용)
    let assetData;
    if (externalAssetSummary) {
      const totalValue = BigInt(externalAssetSummary.totalValue || "0");
      const totalLoan = BigInt(externalAssetSummary.totalLoanAmount || "0");
      assetData = {
        totalValue: externalAssetSummary.totalValue,
        totalMortgage: externalAssetSummary.totalLoanAmount,
        netValue: (totalValue - totalLoan).toString(),
        holdingCount: externalAssetSummary.totalAssets,
        soldCount: 0, // 외부 API의 getSummary는 보유 자산만 조회하므로 별도 처리 필요시 추가
        totalCount: externalAssetSummary.totalAssets,
      };
    } else {
      assetData = {
        totalValue: "0",
        totalMortgage: "0",
        netValue: "0",
        holdingCount: 0,
        soldCount: 0,
        totalCount: 0,
      };
    }

    // 재무 현황 계산
    let monthlyIncome = ZERO;
    let monthlyExpense = ZERO;

    for (const tx of monthlyFinance) {
      const amount = toDecimal(tx.amount);
      if (tx.type === "INCOME") {
        monthlyIncome = monthlyIncome.plus(amount);
      } else {
        monthlyExpense = monthlyExpense.plus(amount);
      }
    }

    const financeData = {
      monthlyIncome: decimalToString(monthlyIncome),
      monthlyExpense: decimalToString(monthlyExpense),
      monthlyProfit: decimalToString(monthlyIncome.minus(monthlyExpense)),
      transactionCount: monthlyFinance.length,
    };

    // 최근 영농일지 포맷
    const logsData = recentLogs.map((log) => ({
      id: log.id,
      date: log.date.toISOString(),
      weather: log.weather,
      activityCount: log.activities.length,
      activities: log.activities.map((a) => ({
        type: a.type,
        description: a.description,
      })),
    }));

    // 재배 중인 작물
    const cropsData = crops.map((crop) => {
      const harvestDate = new Date(crop.expectedHarvestDate);
      const daysToHarvest = Math.ceil((harvestDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
      return {
        id: crop.id,
        name: crop.name,
        variety: crop.variety,
        growthStage: crop.growthStage,
        daysToHarvest: Math.max(0, daysToHarvest),
        expectedHarvestDate: crop.expectedHarvestDate.toISOString(),
      };
    });

    // 재고 부족 알림
    const lowStockItems = inventoryAlerts
      .filter((item) => {
        const current = Number(item.currentQuantity);
        const minimum = Number(item.minimumQuantity);
        return current <= minimum;
      })
      .map((item) => ({
        id: item.id,
        name: item.name,
        category: item.category,
        currentQuantity: item.currentQuantity.toString(),
        minimumQuantity: item.minimumQuantity.toString(),
        unit: item.unit,
      }));

    return NextResponse.json({
      retirement: retirementData,
      assets: assetData,
      finance: financeData,
      recentLogs: logsData,
      watchlist: watchlist.map((w) => ({
        id: w.id,
        itemCode: w.itemCode,
        itemName: w.itemName,
      })),
      crops: cropsData,
      lowStockAlerts: lowStockItems,
      generatedAt: now.toISOString(),
    });
  } catch (error) {
    console.error("Dashboard API error:", error);
    return NextResponse.json(
      { error: "대시보드 데이터 조회 중 오류가 발생했습니다." },
      { status: 500 }
    );
  }
}
