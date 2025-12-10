import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import prisma from "@/lib/prisma";
import { authOptions } from "@/lib/auth/options";

// GET: 월간 보고서
export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.id) {
      return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
    }

    const userId = session.user.id;
    const { searchParams } = new URL(request.url);
    const year = parseInt(searchParams.get("year") || new Date().getFullYear().toString());
    const month = parseInt(searchParams.get("month") || (new Date().getMonth() + 1).toString());

    const startDate = new Date(year, month - 1, 1);
    const endDate = new Date(year, month, 0, 23, 59, 59);

    // 이전 달
    const prevStartDate = new Date(year, month - 2, 1);
    const prevEndDate = new Date(year, month - 1, 0, 23, 59, 59);

    // 데이터 조회
    const [
      transactions,
      prevTransactions,
      farmingLogs,
      crops,
      inventoryChanges,
    ] = await Promise.all([
      // 이번 달 거래
      prisma.financialTransaction.findMany({
        where: {
          userId,
          date: { gte: startDate, lte: endDate },
        },
        include: { crop: true },
      }),
      // 전월 거래 (비교용)
      prisma.financialTransaction.findMany({
        where: {
          userId,
          date: { gte: prevStartDate, lte: prevEndDate },
        },
      }),
      // 영농일지
      prisma.farmingLog.findMany({
        where: {
          userId,
          date: { gte: startDate, lte: endDate },
        },
        include: {
          activities: true,
        },
      }),
      // 작물 상태
      prisma.crop.findMany({
        where: {
          userId,
          OR: [
            { status: "GROWING" },
            {
              status: "COMPLETED",
              updatedAt: { gte: startDate, lte: endDate },
            },
            {
              status: "HARVESTING",
              updatedAt: { gte: startDate, lte: endDate },
            },
          ],
        },
      }),
      // 재고 변동
      prisma.inventoryTransaction.findMany({
        where: {
          date: { gte: startDate, lte: endDate },
          item: { userId },
        },
        include: { item: true },
      }),
    ]);

    // 재무 요약 계산
    let income = BigInt(0);
    let expense = BigInt(0);
    const incomeByCategory: Record<string, bigint> = {};
    const expenseByCategory: Record<string, bigint> = {};
    const incomeByCrop: Record<string, bigint> = {};

    for (const tx of transactions) {
      const amount = BigInt(tx.amount.toString());
      if (tx.type === "INCOME") {
        income += amount;
        incomeByCategory[tx.category] = (incomeByCategory[tx.category] || BigInt(0)) + amount;
        if (tx.crop) {
          incomeByCrop[tx.crop.name] = (incomeByCrop[tx.crop.name] || BigInt(0)) + amount;
        }
      } else {
        expense += amount;
        expenseByCategory[tx.category] = (expenseByCategory[tx.category] || BigInt(0)) + amount;
      }
    }

    // 전월 합계
    let prevIncome = BigInt(0);
    let prevExpense = BigInt(0);
    for (const tx of prevTransactions) {
      const amount = BigInt(tx.amount.toString());
      if (tx.type === "INCOME") {
        prevIncome += amount;
      } else {
        prevExpense += amount;
      }
    }

    // 변동률 계산
    const incomeChange = prevIncome > 0
      ? Number(((income - prevIncome) * BigInt(100)) / prevIncome)
      : 0;
    const expenseChange = prevExpense > 0
      ? Number(((expense - prevExpense) * BigInt(100)) / prevExpense)
      : 0;

    // 영농 활동 요약
    const activitySummary: Record<string, number> = {};
    let totalWorkHours = 0;

    for (const log of farmingLogs) {
      for (const activity of log.activities) {
        activitySummary[activity.type] = (activitySummary[activity.type] || 0) + 1;
        if (activity.duration) {
          totalWorkHours += activity.duration / 60; // 분 -> 시간
        }
      }
    }

    // 작물별 상태
    const cropSummary = {
      growing: crops.filter((c) => c.status === "GROWING").length,
      harvesting: crops.filter((c) => c.status === "HARVESTING").length,
      completed: crops.filter((c) => c.status === "COMPLETED").length,
      failed: crops.filter((c) => c.status === "FAILED").length,
    };

    // 재고 변동 요약
    let inventoryIn = 0;
    let inventoryOut = 0;
    for (const change of inventoryChanges) {
      const qty = Number(change.quantity);
      if (change.type === "IN") {
        inventoryIn += qty;
      } else {
        inventoryOut += qty;
      }
    }

    // 일별 수입/지출
    const dailyData: Record<string, { income: bigint; expense: bigint }> = {};
    for (let d = 1; d <= endDate.getDate(); d++) {
      dailyData[d] = { income: BigInt(0), expense: BigInt(0) };
    }
    for (const tx of transactions) {
      const day = new Date(tx.date).getDate();
      const amount = BigInt(tx.amount.toString());
      if (tx.type === "INCOME") {
        dailyData[day].income += amount;
      } else {
        dailyData[day].expense += amount;
      }
    }

    return NextResponse.json({
      period: {
        year,
        month,
        startDate: startDate.toISOString(),
        endDate: endDate.toISOString(),
      },
      finance: {
        income: income.toString(),
        expense: expense.toString(),
        profit: (income - expense).toString(),
        incomeChange,
        expenseChange,
        profitMargin: income > 0 ? Number(((income - expense) * BigInt(100)) / income) : 0,
        transactionCount: transactions.length,
        incomeByCategory: Object.entries(incomeByCategory).map(([category, amount]) => ({
          category,
          amount: amount.toString(),
        })),
        expenseByCategory: Object.entries(expenseByCategory).map(([category, amount]) => ({
          category,
          amount: amount.toString(),
        })),
        incomeByCrop: Object.entries(incomeByCrop).map(([crop, amount]) => ({
          crop,
          amount: amount.toString(),
        })),
      },
      farming: {
        logCount: farmingLogs.length,
        activityCount: Object.values(activitySummary).reduce((a, b) => a + b, 0),
        activitySummary,
        totalWorkHours: Math.round(totalWorkHours * 10) / 10,
      },
      crops: cropSummary,
      inventory: {
        inCount: inventoryIn,
        outCount: inventoryOut,
        transactionCount: inventoryChanges.length,
      },
      daily: Object.entries(dailyData).map(([day, data]) => ({
        day: parseInt(day),
        income: data.income.toString(),
        expense: data.expense.toString(),
      })),
    });
  } catch (error) {
    console.error("Monthly report error:", error);
    return NextResponse.json(
      { error: "월간 보고서 생성 중 오류가 발생했습니다." },
      { status: 500 }
    );
  }
}
