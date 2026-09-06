import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import prisma from "@/lib/prisma";
import { authOptions } from "@/lib/auth/options";
import { externalPortfolioClient } from "@/lib/api/external-portfolio";
import {
  compareDecimal,
  decimalToString,
  percentOf,
  toDecimal,
  ZERO,
  type Decimal,
} from "@/lib/utils/money";
import { getYearRange } from "@/lib/utils/month-range";

type IncomeExpense = { income: Decimal; expense: Decimal };

// GET: 연간 보고서
// 연 구간은 [1월 1일, 다음 해 1월 1일) 반개구간, 금액은 Decimal 집계 (리뷰 A3·A5)
export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.id) {
      return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
    }

    const userId = session.user.id;
    const { searchParams } = new URL(request.url);
    const year = parseInt(searchParams.get("year") || new Date().getFullYear().toString());

    const range = getYearRange(year);
    const prevRange = getYearRange(year - 1);
    const inRange = { gte: range.start, lt: range.end };
    const inPrevRange = { gte: prevRange.start, lt: prevRange.end };

    const [transactions, prevTransactions, crops] = await Promise.all([
      prisma.financialTransaction.findMany({
        where: { userId, date: inRange },
        include: { crop: true },
      }),
      prisma.financialTransaction.findMany({
        where: { userId, date: inPrevRange },
      }),
      prisma.crop.findMany({
        where: { userId, plantingDate: inRange },
      }),
    ]);

    // 월별 데이터 집계
    const monthlyData: Record<number, IncomeExpense> = {};
    for (let m = 1; m <= 12; m++) {
      monthlyData[m] = { income: ZERO, expense: ZERO };
    }

    let totalIncome = ZERO;
    let totalExpense = ZERO;
    const incomeByCategory: Record<string, Decimal> = {};
    const expenseByCategory: Record<string, Decimal> = {};
    const incomeByCrop: Record<string, Decimal> = {};

    for (const tx of transactions) {
      const amount = toDecimal(tx.amount);
      const month = new Date(tx.date).getMonth() + 1;

      if (tx.type === "INCOME") {
        totalIncome = totalIncome.plus(amount);
        monthlyData[month].income = monthlyData[month].income.plus(amount);
        incomeByCategory[tx.category] = (incomeByCategory[tx.category] ?? ZERO).plus(amount);
        if (tx.crop) {
          incomeByCrop[tx.crop.name] = (incomeByCrop[tx.crop.name] ?? ZERO).plus(amount);
        }
      } else {
        totalExpense = totalExpense.plus(amount);
        monthlyData[month].expense = monthlyData[month].expense.plus(amount);
        expenseByCategory[tx.category] = (expenseByCategory[tx.category] ?? ZERO).plus(amount);
      }
    }

    // 전년도 합계
    let prevTotalIncome = ZERO;
    let prevTotalExpense = ZERO;
    for (const tx of prevTransactions) {
      const amount = toDecimal(tx.amount);
      if (tx.type === "INCOME") {
        prevTotalIncome = prevTotalIncome.plus(amount);
      } else {
        prevTotalExpense = prevTotalExpense.plus(amount);
      }
    }

    // YoY 변화율
    const incomeYoY = percentOf(totalIncome.minus(prevTotalIncome), prevTotalIncome);
    const expenseYoY = percentOf(totalExpense.minus(prevTotalExpense), prevTotalExpense);

    // 작물 통계
    const completedCount = crops.filter((c) => c.status === "COMPLETED").length;
    const cropStats = {
      total: crops.length,
      completed: completedCount,
      failed: crops.filter((c) => c.status === "FAILED").length,
      successRate: crops.length > 0 ? Math.round((completedCount / crops.length) * 100) : 0,
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
    const quarterlyData = [1, 2, 3, 4].map((quarter) => {
      const months = [quarter * 3 - 2, quarter * 3 - 1, quarter * 3];
      return months.reduce<{ quarter: number } & IncomeExpense>(
        (acc, m) => ({
          quarter,
          income: acc.income.plus(monthlyData[m].income),
          expense: acc.expense.plus(monthlyData[m].expense),
        }),
        { quarter, income: ZERO, expense: ZERO }
      );
    });

    // 최고/최저 매출 월
    let bestMonth = 1;
    let worstMonth = 1;
    let bestIncome = monthlyData[1].income;
    let worstIncome = monthlyData[1].income;

    for (let m = 2; m <= 12; m++) {
      if (monthlyData[m].income.gt(bestIncome)) {
        bestIncome = monthlyData[m].income;
        bestMonth = m;
      }
      if (monthlyData[m].income.lt(worstIncome)) {
        worstIncome = monthlyData[m].income;
        worstMonth = m;
      }
    }

    // 작물별 수익성 분석
    const cropProfitability = Object.entries(incomeByCrop)
      .sort(([, a], [, b]) => compareDecimal(b, a))
      .map(([crop, income]) => ({ crop, income: decimalToString(income) }));

    const toCategoryEntries = (record: Record<string, Decimal>, total: Decimal) =>
      Object.entries(record)
        .sort(([, a], [, b]) => compareDecimal(b, a))
        .map(([category, amount]) => ({
          category,
          amount: decimalToString(amount),
          percentage: percentOf(amount, total),
        }));

    return NextResponse.json({
      period: {
        year,
        startDate: range.start.toISOString(),
        endDate: new Date(year, 11, 31, 23, 59, 59).toISOString(),
      },
      finance: {
        totalIncome: decimalToString(totalIncome),
        totalExpense: decimalToString(totalExpense),
        netProfit: decimalToString(totalIncome.minus(totalExpense)),
        profitMargin: percentOf(totalIncome.minus(totalExpense), totalIncome),
        incomeYoY,
        expenseYoY,
        transactionCount: transactions.length,
        avgMonthlyIncome: decimalToString(totalIncome.div(12).toDecimalPlaces(0)),
        avgMonthlyExpense: decimalToString(totalExpense.div(12).toDecimalPlaces(0)),
        bestMonth: {
          month: bestMonth,
          income: decimalToString(bestIncome),
        },
        worstMonth: {
          month: worstMonth,
          income: decimalToString(worstIncome),
        },
      },
      categories: {
        income: toCategoryEntries(incomeByCategory, totalIncome),
        expense: toCategoryEntries(expenseByCategory, totalExpense),
      },
      monthly: Object.entries(monthlyData).map(([month, data]) => ({
        month: parseInt(month),
        income: decimalToString(data.income),
        expense: decimalToString(data.expense),
        profit: decimalToString(data.income.minus(data.expense)),
      })),
      quarterly: quarterlyData.map((q) => ({
        quarter: q.quarter,
        income: decimalToString(q.income),
        expense: decimalToString(q.expense),
        profit: decimalToString(q.income.minus(q.expense)),
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
