import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import prisma from "@/lib/prisma";
import { authOptions } from "@/lib/auth/options";

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

    // 수입/지출 합계
    let totalIncome = BigInt(0);
    let totalExpense = BigInt(0);

    // 월별 합계
    const monthlyData: Record<number, { income: bigint; expense: bigint }> = {};
    for (let i = 1; i <= 12; i++) {
      monthlyData[i] = { income: BigInt(0), expense: BigInt(0) };
    }

    // 카테고리별 합계
    const byCategory: Record<string, { income: bigint; expense: bigint }> = {};

    for (const tx of transactions) {
      const amount = BigInt(tx.amount.toString());
      const month = new Date(tx.date).getMonth() + 1;

      if (tx.type === "INCOME") {
        totalIncome += amount;
        monthlyData[month].income += amount;
      } else {
        totalExpense += amount;
        monthlyData[month].expense += amount;
      }

      // 카테고리별
      if (!byCategory[tx.category]) {
        byCategory[tx.category] = { income: BigInt(0), expense: BigInt(0) };
      }
      if (tx.type === "INCOME") {
        byCategory[tx.category].income += amount;
      } else {
        byCategory[tx.category].expense += amount;
      }
    }

    // 순이익
    const netProfit = totalIncome - totalExpense;

    // 전월 대비 계산
    const currentMonth = new Date().getMonth() + 1;
    const lastMonth = currentMonth === 1 ? 12 : currentMonth - 1;
    const currentMonthData = monthlyData[currentMonth];
    const lastMonthData = monthlyData[lastMonth];

    const incomeChange = lastMonthData.income > 0
      ? Number(((currentMonthData.income - lastMonthData.income) * BigInt(100)) / lastMonthData.income)
      : 0;
    const expenseChange = lastMonthData.expense > 0
      ? Number(((currentMonthData.expense - lastMonthData.expense) * BigInt(100)) / lastMonthData.expense)
      : 0;

    return NextResponse.json({
      summary: {
        totalIncome: totalIncome.toString(),
        totalExpense: totalExpense.toString(),
        netProfit: netProfit.toString(),
        transactionCount: transactions.length,
        incomeChange,
        expenseChange,
      },
      monthly: Object.entries(monthlyData).map(([month, data]) => ({
        month: parseInt(month),
        income: data.income.toString(),
        expense: data.expense.toString(),
        profit: (data.income - data.expense).toString(),
      })),
      byCategory: Object.entries(byCategory).map(([category, data]) => ({
        category,
        income: data.income.toString(),
        expense: data.expense.toString(),
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
