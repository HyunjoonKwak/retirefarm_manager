import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import prisma from "@/lib/prisma";
import { authOptions } from "@/lib/auth/options";
import { decimalToString, percentOf, toDecimal, ZERO, type Decimal } from "@/lib/utils/money";

// GET: 재무 요약
export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.id) {
      return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const year = searchParams.get("year") || new Date().getFullYear().toString();

    const startDate = new Date(parseInt(year), 0, 1);
    const endDate = new Date(parseInt(year) + 1, 0, 1);

    const transactions = await prisma.financialTransaction.findMany({
      where: {
        userId: session.user.id,
        date: {
          gte: startDate,
          lt: endDate,
        },
      },
    });

    // 수입/지출 합계 — Decimal 집계 (소수 금액 데이터가 있어도 예외 없음, 리뷰 A5)
    let totalIncome = ZERO;
    let totalExpense = ZERO;

    // 월별 합계
    const monthlyData: Record<number, { income: Decimal; expense: Decimal }> = {};
    for (let i = 1; i <= 12; i++) {
      monthlyData[i] = { income: ZERO, expense: ZERO };
    }

    // 카테고리별 합계
    const byCategory: Record<string, { income: Decimal; expense: Decimal }> = {};

    for (const tx of transactions) {
      const amount = toDecimal(tx.amount);
      const month = new Date(tx.date).getMonth() + 1;

      if (tx.type === "INCOME") {
        totalIncome = totalIncome.plus(amount);
        monthlyData[month].income = monthlyData[month].income.plus(amount);
      } else {
        totalExpense = totalExpense.plus(amount);
        monthlyData[month].expense = monthlyData[month].expense.plus(amount);
      }

      // 카테고리별
      if (!byCategory[tx.category]) {
        byCategory[tx.category] = { income: ZERO, expense: ZERO };
      }
      if (tx.type === "INCOME") {
        byCategory[tx.category].income = byCategory[tx.category].income.plus(amount);
      } else {
        byCategory[tx.category].expense = byCategory[tx.category].expense.plus(amount);
      }
    }

    // 순이익
    const netProfit = totalIncome.minus(totalExpense);

    // 전월 대비 계산
    const currentMonth = new Date().getMonth() + 1;
    const lastMonth = currentMonth === 1 ? 12 : currentMonth - 1;
    const currentMonthData = monthlyData[currentMonth];
    const lastMonthData = monthlyData[lastMonth];

    const incomeChange = percentOf(
      currentMonthData.income.minus(lastMonthData.income),
      lastMonthData.income
    );
    const expenseChange = percentOf(
      currentMonthData.expense.minus(lastMonthData.expense),
      lastMonthData.expense
    );

    return NextResponse.json({
      summary: {
        totalIncome: decimalToString(totalIncome),
        totalExpense: decimalToString(totalExpense),
        netProfit: decimalToString(netProfit),
        transactionCount: transactions.length,
        incomeChange,
        expenseChange,
      },
      monthly: Object.entries(monthlyData).map(([month, data]) => ({
        month: parseInt(month),
        income: decimalToString(data.income),
        expense: decimalToString(data.expense),
        profit: decimalToString(data.income.minus(data.expense)),
      })),
      byCategory: Object.entries(byCategory).map(([category, data]) => ({
        category,
        income: decimalToString(data.income),
        expense: decimalToString(data.expense),
      })),
    });
  } catch (error) {
    console.error("Get finance summary error:", error);
    return NextResponse.json(
      { error: "재무 요약 조회 중 오류가 발생했습니다." },
      { status: 500 }
    );
  }
}
