import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import prisma from "@/lib/prisma";
import { authOptions } from "@/lib/auth/options";
import { decimalToString, percentOf, toDecimal, ZERO, type Decimal } from "@/lib/utils/money";
import { addMonths, getMonthRange } from "@/lib/utils/month-range";

type IncomeExpense = { income: Decimal; expense: Decimal };

// GET: 월간 보고서
// - 월 구간은 [1일, 다음 달 1일) 반개구간 (리뷰 A3)
// - 금액은 Decimal 집계 (리뷰 A5)
// - 종료 작물은 completedAt 기준으로 집계하고, 레거시 행(completedAt null)은 updatedAt으로 폴백해
//   estimatedCompletionCount로 알린다 (리뷰 A4)
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

    const range = getMonthRange(year, month - 1);
    const prevRange = addMonths(range, -1);
    const inRange = { gte: range.start, lt: range.end };
    const inPrevRange = { gte: prevRange.start, lt: prevRange.end };
    const daysInMonth = new Date(year, month, 0).getDate();

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
        where: { userId, date: inRange },
        include: { crop: true },
      }),
      // 전월 거래 (비교용)
      prisma.financialTransaction.findMany({
        where: { userId, date: inPrevRange },
      }),
      // 영농일지
      prisma.farmingLog.findMany({
        where: { userId, date: inRange },
        include: { activities: true },
      }),
      // 작물 상태 — 종료 작물은 completedAt, 없으면 updatedAt(추정)
      prisma.crop.findMany({
        where: {
          userId,
          OR: [
            { status: "GROWING" },
            { status: "HARVESTING", updatedAt: inRange },
            { status: { in: ["COMPLETED", "FAILED"] }, completedAt: inRange },
            { status: { in: ["COMPLETED", "FAILED"] }, completedAt: null, updatedAt: inRange },
          ],
        },
      }),
      // 재고 변동
      prisma.inventoryTransaction.findMany({
        where: { date: inRange, item: { userId } },
        include: { item: true },
      }),
    ]);

    // 재무 요약 계산
    let income = ZERO;
    let expense = ZERO;
    const incomeByCategory: Record<string, Decimal> = {};
    const expenseByCategory: Record<string, Decimal> = {};
    const incomeByCrop: Record<string, Decimal> = {};

    for (const tx of transactions) {
      const amount = toDecimal(tx.amount);
      if (tx.type === "INCOME") {
        income = income.plus(amount);
        incomeByCategory[tx.category] = (incomeByCategory[tx.category] ?? ZERO).plus(amount);
        if (tx.crop) {
          incomeByCrop[tx.crop.name] = (incomeByCrop[tx.crop.name] ?? ZERO).plus(amount);
        }
      } else {
        expense = expense.plus(amount);
        expenseByCategory[tx.category] = (expenseByCategory[tx.category] ?? ZERO).plus(amount);
      }
    }

    // 전월 합계
    let prevIncome = ZERO;
    let prevExpense = ZERO;
    for (const tx of prevTransactions) {
      const amount = toDecimal(tx.amount);
      if (tx.type === "INCOME") {
        prevIncome = prevIncome.plus(amount);
      } else {
        prevExpense = prevExpense.plus(amount);
      }
    }

    // 변동률 계산
    const incomeChange = percentOf(income.minus(prevIncome), prevIncome);
    const expenseChange = percentOf(expense.minus(prevExpense), prevExpense);

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
    const terminalCrops = crops.filter((c) => c.status === "COMPLETED" || c.status === "FAILED");
    const cropSummary = {
      growing: crops.filter((c) => c.status === "GROWING").length,
      harvesting: crops.filter((c) => c.status === "HARVESTING").length,
      completed: crops.filter((c) => c.status === "COMPLETED").length,
      failed: crops.filter((c) => c.status === "FAILED").length,
      // completedAt이 없어 updatedAt으로 추정한 종료 작물 수
      estimatedCompletionCount: terminalCrops.filter((c) => c.completedAt === null || c.completedAtEstimated).length,
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
    const dailyData: Record<string, IncomeExpense> = {};
    for (let d = 1; d <= daysInMonth; d++) {
      dailyData[d] = { income: ZERO, expense: ZERO };
    }
    for (const tx of transactions) {
      const day = new Date(tx.date).getDate();
      const amount = toDecimal(tx.amount);
      if (tx.type === "INCOME") {
        dailyData[day].income = dailyData[day].income.plus(amount);
      } else {
        dailyData[day].expense = dailyData[day].expense.plus(amount);
      }
    }

    const toEntries = (record: Record<string, Decimal>, key: "category" | "crop") =>
      Object.entries(record).map(([name, amount]) => ({
        [key]: name,
        amount: decimalToString(amount),
      }));

    return NextResponse.json({
      period: {
        year,
        month,
        startDate: range.start.toISOString(),
        endDate: new Date(year, month, 0, 23, 59, 59).toISOString(),
      },
      finance: {
        income: decimalToString(income),
        expense: decimalToString(expense),
        profit: decimalToString(income.minus(expense)),
        incomeChange,
        expenseChange,
        profitMargin: percentOf(income.minus(expense), income),
        transactionCount: transactions.length,
        incomeByCategory: toEntries(incomeByCategory, "category"),
        expenseByCategory: toEntries(expenseByCategory, "category"),
        incomeByCrop: toEntries(incomeByCrop, "crop"),
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
        income: decimalToString(data.income),
        expense: decimalToString(data.expense),
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
