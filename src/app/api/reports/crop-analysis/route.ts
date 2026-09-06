import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import prisma from "@/lib/prisma";
import { authOptions } from "@/lib/auth/options";
import { compareDecimal, decimalToString, percentOf, toDecimal, ZERO, type Decimal } from "@/lib/utils/money";
import { resolveCropEndDate } from "@/lib/utils/crop-completion";

const MS_PER_DAY = 1000 * 60 * 60 * 24;

// 재배 종료일은 completedAt, 없으면(레거시) updatedAt으로 추정 (리뷰 A4)
function cultivationDaysOf(crop: { status: string; completedAt: Date | null; completedAtEstimated?: boolean; updatedAt: Date; plantingDate: Date }) {
  const { endDate, estimated } = resolveCropEndDate(crop);
  return {
    cultivationDays: Math.ceil((endDate.getTime() - crop.plantingDate.getTime()) / MS_PER_DAY),
    completedAt: crop.completedAt ? crop.completedAt.toISOString() : null,
    completedAtEstimated: estimated,
  };
}

// GET: 작물별 수익성 분석
export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.id) {
      return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
    }

    const userId = session.user.id;
    const { searchParams } = new URL(request.url);
    const cropId = searchParams.get("cropId");

    if (cropId) {
      // 특정 작물 상세 분석
      const crop = await prisma.crop.findFirst({
        where: { id: cropId, userId },
      });

      if (!crop) {
        return NextResponse.json({ error: "작물을 찾을 수 없습니다." }, { status: 404 });
      }

      // 해당 작물의 거래 내역
      const transactions = await prisma.financialTransaction.findMany({
        where: {
          userId,
          relatedCropId: cropId,
        },
        orderBy: { date: "asc" },
      });

      // 해당 작물 관련 활동
      const activities = await prisma.farmActivity.findMany({
        where: { cropId },
        include: {
          log: true,
          materialUsages: {
            include: { item: true },
          },
        },
        orderBy: { createdAt: "asc" },
      });

      // 수입/지출 계산 (Decimal 집계, 리뷰 A5)
      let income = ZERO;
      let expense = ZERO;
      const expenseBreakdown: Record<string, Decimal> = {};

      for (const tx of transactions) {
        const amount = toDecimal(tx.amount);
        if (tx.type === "INCOME") {
          income = income.plus(amount);
        } else {
          expense = expense.plus(amount);
          expenseBreakdown[tx.category] = (expenseBreakdown[tx.category] ?? ZERO).plus(amount);
        }
      }

      // 재배 기간 계산
      const { cultivationDays, completedAt, completedAtEstimated } = cultivationDaysOf(crop);

      // 활동 요약
      const activitySummary: Record<string, number> = {};
      let totalWorkMinutes = 0;

      for (const activity of activities) {
        activitySummary[activity.type] = (activitySummary[activity.type] || 0) + 1;
        if (activity.duration) {
          totalWorkMinutes += activity.duration;
        }
      }

      // 자재 사용량
      const materialUsage: Record<string, { quantity: number; unit: string }> = {};
      for (const activity of activities) {
        for (const usage of activity.materialUsages) {
          const key = usage.item.name;
          if (!materialUsage[key]) {
            materialUsage[key] = { quantity: 0, unit: usage.item.unit };
          }
          materialUsage[key].quantity += Number(usage.quantity);
        }
      }

      return NextResponse.json({
        crop: {
          id: crop.id,
          name: crop.name,
          variety: crop.variety,
          status: crop.status,
          growthStage: crop.growthStage,
          plantingDate: crop.plantingDate.toISOString(),
          expectedHarvestDate: crop.expectedHarvestDate.toISOString(),
          completedAt,
          completedAtEstimated,
        },
        finance: {
          income: decimalToString(income),
          expense: decimalToString(expense),
          profit: decimalToString(income.minus(expense)),
          profitMargin: percentOf(income.minus(expense), income),
          roi: percentOf(income.minus(expense), expense),
          expenseBreakdown: Object.entries(expenseBreakdown).map(([category, amount]) => ({
            category,
            amount: decimalToString(amount),
          })),
        },
        cultivation: {
          days: cultivationDays,
          workHours: Math.round(totalWorkMinutes / 60 * 10) / 10,
          activityCount: activities.length,
          activitySummary,
        },
        materials: Object.entries(materialUsage).map(([name, data]) => ({
          name,
          quantity: data.quantity,
          unit: data.unit,
        })),
        timeline: transactions.map((tx) => ({
          date: tx.date.toISOString(),
          type: tx.type,
          category: tx.category,
          amount: tx.amount.toString(),
          description: tx.description,
        })),
      });
    }

    // 전체 작물 수익성 비교
    const crops = await prisma.crop.findMany({
      where: { userId },
      orderBy: { plantingDate: "desc" },
    });

    const cropAnalysis = await Promise.all(
      crops.map(async (crop) => {
        const transactions = await prisma.financialTransaction.findMany({
          where: {
            userId,
            relatedCropId: crop.id,
          },
        });

        let income = ZERO;
        let expense = ZERO;

        for (const tx of transactions) {
          const amount = toDecimal(tx.amount);
          if (tx.type === "INCOME") {
            income = income.plus(amount);
          } else {
            expense = expense.plus(amount);
          }
        }

        const profit = income.minus(expense);
        const { cultivationDays, completedAt, completedAtEstimated } = cultivationDaysOf(crop);

        return {
          id: crop.id,
          name: crop.name,
          variety: crop.variety,
          status: crop.status,
          plantingDate: crop.plantingDate.toISOString(),
          completedAt,
          completedAtEstimated,
          cultivationDays,
          income: decimalToString(income),
          expense: decimalToString(expense),
          profit: decimalToString(profit),
          profitMargin: percentOf(profit, income),
          roi: percentOf(profit, expense),
          dailyProfit:
            cultivationDays > 0 ? decimalToString(profit.div(cultivationDays).toDecimalPlaces(0)) : "0",
        };
      })
    );

    // 작물별 집계
    const cropTypeStats: Record<string, {
      count: number;
      totalIncome: Decimal;
      totalExpense: Decimal;
      successCount: number;
    }> = {};

    for (const analysis of cropAnalysis) {
      const key = analysis.name;
      const current = cropTypeStats[key] ?? {
        count: 0,
        totalIncome: ZERO,
        totalExpense: ZERO,
        successCount: 0,
      };
      cropTypeStats[key] = {
        count: current.count + 1,
        totalIncome: current.totalIncome.plus(analysis.income),
        totalExpense: current.totalExpense.plus(analysis.expense),
        successCount: current.successCount + (analysis.status === "COMPLETED" ? 1 : 0),
      };
    }

    const cropTypeSummary = Object.entries(cropTypeStats)
      .map(([name, stats]) => {
        const totalProfit = stats.totalIncome.minus(stats.totalExpense);
        return {
          name,
          count: stats.count,
          totalIncome: decimalToString(stats.totalIncome),
          totalExpense: decimalToString(stats.totalExpense),
          totalProfit: decimalToString(totalProfit),
          avgProfit: stats.count > 0
            ? decimalToString(totalProfit.div(stats.count).toDecimalPlaces(0))
            : "0",
          successRate: stats.count > 0
            ? Math.round((stats.successCount / stats.count) * 100)
            : 0,
        };
      })
      .sort((a, b) => compareDecimal(b.totalProfit, a.totalProfit));

    return NextResponse.json({
      crops: cropAnalysis,
      summary: {
        totalCrops: crops.length,
        completedCrops: crops.filter((c) => c.status === "COMPLETED").length,
        failedCrops: crops.filter((c) => c.status === "FAILED").length,
        growingCrops: crops.filter((c) => c.status === "GROWING").length,
      },
      byType: cropTypeSummary,
    });
  } catch (error) {
    console.error("Crop analysis error:", error);
    return NextResponse.json(
      { error: "작물 분석 중 오류가 발생했습니다." },
      { status: 500 }
    );
  }
}
