import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import prisma from "@/lib/prisma";
import { authOptions } from "@/lib/auth/options";
import { externalPortfolioClient } from "@/lib/api/external-portfolio";

// GET: 연간 보고서
export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.id) {
      return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
    }

    const userId = session.user.id;
    const { searchParams } = new URL(request.url);
    const year = parseInt(searchParams.get("year") || new Date().getFullYear().toString());

    const startDate = new Date(year, 0, 1);
    const endDate = new Date(year, 11, 31, 23, 59, 59);

    // 전년도
    const prevStartDate = new Date(year - 1, 0, 1);
    const prevEndDate = new Date(year - 1, 11, 31, 23, 59, 59);

    const [
      transactions,
      prevTransactions,
      crops,
    ] = await Promise.all([
      prisma.financialTransaction.findMany({
        where: {
          userId,
          date: { gte: startDate, lte: endDate },
        },
        include: { crop: true },
      }),
      prisma.financialTransaction.findMany({
        where: {
          userId,
          date: { gte: prevStartDate, lte: prevEndDate },
        },
      }),
      prisma.crop.findMany({
        where: {
          userId,
          plantingDate: { gte: startDate, lte: endDate },
        },
      }),
    ]);

    // 월별 데이터 집계
    const monthlyData: Record<number, { income: bigint; expense: bigint }> = {};
    for (let m = 1; m <= 12; m++) {
      monthlyData[m] = { income: BigInt(0), expense: BigInt(0) };
    }

    let totalIncome = BigInt(0);
    let totalExpense = BigInt(0);
    const incomeByCategory: Record<string, bigint> = {};
    const expenseByCategory: Record<string, bigint> = {};
    const incomeByCrop: Record<string, bigint> = {};

    for (const tx of transactions) {
      const amount = BigInt(tx.amount.toString());
      const month = new Date(tx.date).getMonth() + 1;

      if (tx.type === "INCOME") {
        totalIncome += amount;
        monthlyData[month].income += amount;
        incomeByCategory[tx.category] = (incomeByCategory[tx.category] || BigInt(0)) + amount;
        if (tx.crop) {
          incomeByCrop[tx.crop.name] = (incomeByCrop[tx.crop.name] || BigInt(0)) + amount;
        }
      } else {
        totalExpense += amount;
        monthlyData[month].expense += amount;
        expenseByCategory[tx.category] = (expenseByCategory[tx.category] || BigInt(0)) + amount;
      }
    }

    // 전년도 합계
    let prevTotalIncome = BigInt(0);
    let prevTotalExpense = BigInt(0);
    for (const tx of prevTransactions) {
      const amount = BigInt(tx.amount.toString());
      if (tx.type === "INCOME") {
        prevTotalIncome += amount;
      } else {
        prevTotalExpense += amount;
      }
    }

    // YoY 변화율
    const incomeYoY = prevTotalIncome > 0
      ? Number(((totalIncome - prevTotalIncome) * BigInt(100)) / prevTotalIncome)
      : 0;
    const expenseYoY = prevTotalExpense > 0
      ? Number(((totalExpense - prevTotalExpense) * BigInt(100)) / prevTotalExpense)
      : 0;

    // 작물 통계
    const cropStats = {
      total: crops.length,
      completed: crops.filter((c) => c.status === "COMPLETED").length,
      failed: crops.filter((c) => c.status === "FAILED").length,
      successRate: crops.length > 0
        ? Math.round((crops.filter((c) => c.status === "COMPLETED").length / crops.length) * 100)
        : 0,
    };

    // 자산 현황 — 부동산 원장은 asset_manager 소유, 읽기 전용 소비 (Asset Hub §1.5)
    let totalAssetValue = BigInt(0);
    let totalMortgage = BigInt(0);
    let assetCount = 0;
    try {
      const email = session.user.email;
      if (email) {
        const summary = await externalPortfolioClient.getSummary(email);
        totalAssetValue = BigInt(summary.totalValue || "0");
        totalMortgage = BigInt(summary.totalLoanAmount || "0");
        assetCount = summary.totalAssets;
      }
    } catch (error) {
      console.error("External asset summary fetch failed:", error);
    }

    // 분기별 요약
    const quarterlyData = [
      { quarter: 1, income: BigInt(0), expense: BigInt(0) },
      { quarter: 2, income: BigInt(0), expense: BigInt(0) },
      { quarter: 3, income: BigInt(0), expense: BigInt(0) },
      { quarter: 4, income: BigInt(0), expense: BigInt(0) },
    ];

    for (let m = 1; m <= 12; m++) {
      const q = Math.ceil(m / 3) - 1;
      quarterlyData[q].income += monthlyData[m].income;
      quarterlyData[q].expense += monthlyData[m].expense;
    }

    // 최고/최저 매출 월
    let bestMonth = 1;
    let worstMonth = 1;
    let bestIncome = monthlyData[1].income;
    let worstIncome = monthlyData[1].income;

    for (let m = 2; m <= 12; m++) {
      if (monthlyData[m].income > bestIncome) {
        bestIncome = monthlyData[m].income;
        bestMonth = m;
      }
      if (monthlyData[m].income < worstIncome) {
        worstIncome = monthlyData[m].income;
        worstMonth = m;
      }
    }

    // 작물별 수익성 분석
    const cropProfitability = Object.entries(incomeByCrop)
      .map(([crop, income]) => ({
        crop,
        income: income.toString(),
      }))
      .sort((a, b) => Number(BigInt(b.income) - BigInt(a.income)));

    return NextResponse.json({
      period: {
        year,
        startDate: startDate.toISOString(),
        endDate: endDate.toISOString(),
      },
      finance: {
        totalIncome: totalIncome.toString(),
        totalExpense: totalExpense.toString(),
        netProfit: (totalIncome - totalExpense).toString(),
        profitMargin: totalIncome > 0
          ? Number(((totalIncome - totalExpense) * BigInt(100)) / totalIncome)
          : 0,
        incomeYoY,
        expenseYoY,
        transactionCount: transactions.length,
        avgMonthlyIncome: (totalIncome / BigInt(12)).toString(),
        avgMonthlyExpense: (totalExpense / BigInt(12)).toString(),
        bestMonth: {
          month: bestMonth,
          income: bestIncome.toString(),
        },
        worstMonth: {
          month: worstMonth,
          income: worstIncome.toString(),
        },
      },
      categories: {
        income: Object.entries(incomeByCategory)
          .map(([category, amount]) => ({
            category,
            amount: amount.toString(),
            percentage: totalIncome > 0
              ? Number((amount * BigInt(100)) / totalIncome)
              : 0,
          }))
          .sort((a, b) => Number(BigInt(b.amount) - BigInt(a.amount))),
        expense: Object.entries(expenseByCategory)
          .map(([category, amount]) => ({
            category,
            amount: amount.toString(),
            percentage: totalExpense > 0
              ? Number((amount * BigInt(100)) / totalExpense)
              : 0,
          }))
          .sort((a, b) => Number(BigInt(b.amount) - BigInt(a.amount))),
      },
      monthly: Object.entries(monthlyData).map(([month, data]) => ({
        month: parseInt(month),
        income: data.income.toString(),
        expense: data.expense.toString(),
        profit: (data.income - data.expense).toString(),
      })),
      quarterly: quarterlyData.map((q) => ({
        quarter: q.quarter,
        income: q.income.toString(),
        expense: q.expense.toString(),
        profit: (q.income - q.expense).toString(),
      })),
      crops: {
        ...cropStats,
        profitability: cropProfitability.slice(0, 10),
      },
      assets: {
        totalValue: totalAssetValue.toString(),
        totalMortgage: totalMortgage.toString(),
        netValue: (totalAssetValue - totalMortgage).toString(),
        count: assetCount,
      },
    });
  } catch (error) {
    console.error("Annual report error:", error);
    return NextResponse.json(
      { error: "연간 보고서 생성 중 오류가 발생했습니다." },
      { status: 500 }
    );
  }
}
