import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import prisma from "@/lib/prisma";
import { authOptions } from "@/lib/auth/options";

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

      // 수입/지출 계산
      let income = BigInt(0);
      let expense = BigInt(0);
      const expenseBreakdown: Record<string, bigint> = {};

      for (const tx of transactions) {
        const amount = BigInt(tx.amount.toString());
        if (tx.type === "INCOME") {
          income += amount;
        } else {
          expense += amount;
          expenseBreakdown[tx.category] = (expenseBreakdown[tx.category] || BigInt(0)) + amount;
        }
      }

      // 재배 기간 계산
      const plantingDate = new Date(crop.plantingDate);
      const endDate = crop.status === "COMPLETED" || crop.status === "FAILED"
        ? new Date(crop.updatedAt)
        : new Date();
      const cultivationDays = Math.ceil((endDate.getTime() - plantingDate.getTime()) / (1000 * 60 * 60 * 24));

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
        },
        finance: {
          income: income.toString(),
          expense: expense.toString(),
          profit: (income - expense).toString(),
          profitMargin: income > 0 ? Number(((income - expense) * BigInt(100)) / income) : 0,
          roi: expense > 0 ? Number(((income - expense) * BigInt(100)) / expense) : 0,
          expenseBreakdown: Object.entries(expenseBreakdown).map(([category, amount]) => ({
            category,
            amount: amount.toString(),
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

        let income = BigInt(0);
        let expense = BigInt(0);

        for (const tx of transactions) {
          const amount = BigInt(tx.amount.toString());
          if (tx.type === "INCOME") {
            income += amount;
          } else {
            expense += amount;
          }
        }

        const profit = income - expense;
        const plantingDate = new Date(crop.plantingDate);
        const endDate = crop.status === "COMPLETED" || crop.status === "FAILED"
          ? new Date(crop.updatedAt)
          : new Date();
        const cultivationDays = Math.ceil((endDate.getTime() - plantingDate.getTime()) / (1000 * 60 * 60 * 24));

        return {
          id: crop.id,
          name: crop.name,
          variety: crop.variety,
          status: crop.status,
          plantingDate: crop.plantingDate.toISOString(),
          cultivationDays,
          income: income.toString(),
          expense: expense.toString(),
          profit: profit.toString(),
          profitMargin: income > 0 ? Number((profit * BigInt(100)) / income) : 0,
          roi: expense > 0 ? Number((profit * BigInt(100)) / expense) : 0,
          dailyProfit: cultivationDays > 0 ? (Number(profit) / cultivationDays).toFixed(0) : "0",
        };
      })
    );

    // 작물별 집계
    const cropTypeStats: Record<string, {
      count: number;
      totalIncome: bigint;
      totalExpense: bigint;
      successCount: number;
    }> = {};

    for (const analysis of cropAnalysis) {
      const key = analysis.name;
      if (!cropTypeStats[key]) {
        cropTypeStats[key] = {
          count: 0,
          totalIncome: BigInt(0),
          totalExpense: BigInt(0),
          successCount: 0,
        };
      }
      cropTypeStats[key].count++;
      cropTypeStats[key].totalIncome += BigInt(analysis.income);
      cropTypeStats[key].totalExpense += BigInt(analysis.expense);
      if (analysis.status === "COMPLETED") {
        cropTypeStats[key].successCount++;
      }
    }

    const cropTypeSummary = Object.entries(cropTypeStats)
      .map(([name, stats]) => ({
        name,
        count: stats.count,
        totalIncome: stats.totalIncome.toString(),
        totalExpense: stats.totalExpense.toString(),
        totalProfit: (stats.totalIncome - stats.totalExpense).toString(),
        avgProfit: stats.count > 0
          ? ((stats.totalIncome - stats.totalExpense) / BigInt(stats.count)).toString()
          : "0",
        successRate: stats.count > 0
          ? Math.round((stats.successCount / stats.count) * 100)
          : 0,
      }))
      .sort((a, b) => Number(BigInt(b.totalProfit) - BigInt(a.totalProfit)));

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
