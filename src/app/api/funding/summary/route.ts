import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import prisma from "@/lib/prisma";
import { authOptions } from "@/lib/auth/options";

// GET: 자금 조달 요약
export async function GET() {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.id) {
      return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
    }

    const fundingSources = await prisma.fundingSource.findMany({
      where: { userId: session.user.id },
    });

    // 유형별 합계
    const byType: Record<string, { total: bigint; count: number; completed: bigint }> = {
      REAL_ESTATE_SALE: { total: BigInt(0), count: 0, completed: BigInt(0) },
      SAVINGS: { total: BigInt(0), count: 0, completed: BigInt(0) },
      LOAN: { total: BigInt(0), count: 0, completed: BigInt(0) },
      GOVERNMENT_SUBSIDY: { total: BigInt(0), count: 0, completed: BigInt(0) },
      OTHER: { total: BigInt(0), count: 0, completed: BigInt(0) },
    };

    // 상태별 합계
    const byStatus: Record<string, { total: bigint; count: number }> = {
      PLANNED: { total: BigInt(0), count: 0 },
      IN_PROGRESS: { total: BigInt(0), count: 0 },
      COMPLETED: { total: BigInt(0), count: 0 },
    };

    let totalAmount = BigInt(0);
    let completedAmount = BigInt(0);

    for (const source of fundingSources) {
      const amount = BigInt(source.amount.toString());
      totalAmount += amount;

      // 유형별
      byType[source.type].total += amount;
      byType[source.type].count += 1;

      // 상태별
      byStatus[source.status].total += amount;
      byStatus[source.status].count += 1;

      if (source.status === "COMPLETED") {
        completedAmount += amount;
        byType[source.type].completed += amount;
      }
    }

    // 설립 비용 총액 조회
    const setupItems = await prisma.setupCostItem.findMany({
      where: { userId: session.user.id },
    });

    let totalSetupCost = BigInt(0);
    let totalSubsidy = BigInt(0);

    for (const item of setupItems) {
      totalSetupCost += BigInt(item.estimatedCost.toString()) * BigInt(item.quantity);
      if (item.subsidyAmount) {
        totalSubsidy += BigInt(item.subsidyAmount.toString());
      }
    }

    // 자금 갭 계산
    const requiredAmount = totalSetupCost - totalSubsidy;
    const fundingGap = requiredAmount - totalAmount;
    const fundingRatio = requiredAmount > 0
      ? Math.round(Number((totalAmount * BigInt(10000)) / requiredAmount)) / 100
      : 0;

    // 월별 현금흐름 (향후 12개월)
    const monthlyFlow: { month: string; amount: string }[] = [];
    const now = new Date();

    for (let i = 0; i < 12; i++) {
      const targetMonth = new Date(now.getFullYear(), now.getMonth() + i, 1);
      const monthEnd = new Date(now.getFullYear(), now.getMonth() + i + 1, 0);

      let monthAmount = BigInt(0);
      for (const source of fundingSources) {
        const expectedDate = new Date(source.expectedDate);
        if (expectedDate >= targetMonth && expectedDate <= monthEnd) {
          monthAmount += BigInt(source.amount.toString());
        }
      }

      monthlyFlow.push({
        month: `${targetMonth.getFullYear()}-${String(targetMonth.getMonth() + 1).padStart(2, "0")}`,
        amount: monthAmount.toString(),
      });
    }

    return NextResponse.json({
      summary: {
        totalAmount: totalAmount.toString(),
        completedAmount: completedAmount.toString(),
        totalSources: fundingSources.length,
        requiredAmount: requiredAmount.toString(),
        fundingGap: fundingGap.toString(),
        fundingRatio,
      },
      byType: Object.entries(byType).map(([type, values]) => ({
        type,
        total: values.total.toString(),
        count: values.count,
        completed: values.completed.toString(),
      })),
      byStatus: Object.entries(byStatus).map(([status, values]) => ({
        status,
        total: values.total.toString(),
        count: values.count,
      })),
      monthlyFlow,
    });
  } catch (error) {
    console.error("Get funding summary error:", error);
    return NextResponse.json(
      { error: "요약 조회 중 오류가 발생했습니다." },
      { status: 500 }
    );
  }
}
