import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import prisma from "@/lib/prisma";
import { authOptions } from "@/lib/auth/options";

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

    // 병렬로 모든 데이터 조회
    const [
      retirementGoal,
      assets,
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
      // 부동산 자산 현황
      prisma.realEstateAsset.findMany({
        where: { userId },
      }),
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

    // 은퇴 목표 계산
    let retirementData = null;
    if (retirementGoal) {
      const targetDate = new Date(retirementGoal.targetDate);
      const daysRemaining = Math.ceil((targetDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
      const monthsRemaining = Math.ceil(daysRemaining / 30);
      const yearsRemaining = Math.floor(daysRemaining / 365);

      retirementData = {
        targetDate: retirementGoal.targetDate.toISOString(),
        targetAmount: retirementGoal.targetAmount.toString(),
        daysRemaining: Math.max(0, daysRemaining),
        monthsRemaining: Math.max(0, monthsRemaining),
        yearsRemaining: Math.max(0, yearsRemaining),
      };
    }

    // 자산 현황 계산
    let totalAssetValue = BigInt(0);
    let totalMortgage = BigInt(0);
    let holdingCount = 0;
    let soldCount = 0;

    for (const asset of assets) {
      if (asset.status === "SOLD") {
        soldCount++;
      } else {
        holdingCount++;
        totalAssetValue += BigInt(asset.currentPrice.toString());
        totalMortgage += BigInt(asset.mortgageBalance.toString());
      }
    }

    const assetData = {
      totalValue: totalAssetValue.toString(),
      totalMortgage: totalMortgage.toString(),
      netValue: (totalAssetValue - totalMortgage).toString(),
      holdingCount,
      soldCount,
      totalCount: assets.length,
    };

    // 재무 현황 계산
    let monthlyIncome = BigInt(0);
    let monthlyExpense = BigInt(0);

    for (const tx of monthlyFinance) {
      const amount = BigInt(tx.amount.toString());
      if (tx.type === "INCOME") {
        monthlyIncome += amount;
      } else {
        monthlyExpense += amount;
      }
    }

    const financeData = {
      monthlyIncome: monthlyIncome.toString(),
      monthlyExpense: monthlyExpense.toString(),
      monthlyProfit: (monthlyIncome - monthlyExpense).toString(),
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
