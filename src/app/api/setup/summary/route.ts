import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import prisma from "@/lib/prisma";
import { authOptions } from "@/lib/auth/options";

// GET: 설립 비용 요약
export async function GET() {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.id) {
      return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
    }

    const items = await prisma.setupCostItem.findMany({
      where: { userId: session.user.id },
      include: {
        subcategory: {
          include: {
            category: true,
          },
        },
      },
    });

    // 합계 계산
    let totalEstimatedCost = BigInt(0);
    let totalActualCost = BigInt(0);
    let totalSubsidy = BigInt(0);

    const byCategory: Record<string, { estimated: bigint; actual: bigint; subsidy: bigint }> = {};
    const byPriority: Record<string, { estimated: bigint; count: number }> = {
      ESSENTIAL: { estimated: BigInt(0), count: 0 },
      IMPORTANT: { estimated: BigInt(0), count: 0 },
      OPTIONAL: { estimated: BigInt(0), count: 0 },
    };
    const byStatus: Record<string, number> = {
      PLANNED: 0,
      QUOTED: 0,
      ORDERED: 0,
      DELIVERED: 0,
      INSTALLED: 0,
    };

    for (const item of items) {
      const itemTotal = BigInt(item.estimatedCost.toString()) * BigInt(item.quantity);
      const itemActual = item.actualCost
        ? BigInt(item.actualCost.toString()) * BigInt(item.quantity)
        : BigInt(0);
      const itemSubsidy = item.subsidyAmount
        ? BigInt(item.subsidyAmount.toString())
        : BigInt(0);

      totalEstimatedCost += itemTotal;
      totalActualCost += itemActual;
      totalSubsidy += itemSubsidy;

      // 카테고리별
      const categoryName = item.subcategory.category.name;
      if (!byCategory[categoryName]) {
        byCategory[categoryName] = { estimated: BigInt(0), actual: BigInt(0), subsidy: BigInt(0) };
      }
      byCategory[categoryName].estimated += itemTotal;
      byCategory[categoryName].actual += itemActual;
      byCategory[categoryName].subsidy += itemSubsidy;

      // 우선순위별
      byPriority[item.priority].estimated += itemTotal;
      byPriority[item.priority].count += 1;

      // 상태별
      byStatus[item.status] += 1;
    }

    // 순수 자기자본 필요액
    const selfFundingRequired = totalEstimatedCost - totalSubsidy;

    // 진행률 계산 (INSTALLED 상태 항목 비율)
    const totalItems = items.length;
    const completedItems = byStatus.INSTALLED;
    const progressRate = totalItems > 0 ? Math.round((completedItems / totalItems) * 100) : 0;

    return NextResponse.json({
      summary: {
        totalItems,
        totalEstimatedCost: totalEstimatedCost.toString(),
        totalActualCost: totalActualCost.toString(),
        totalSubsidy: totalSubsidy.toString(),
        selfFundingRequired: selfFundingRequired.toString(),
        progressRate,
      },
      byCategory: Object.entries(byCategory).map(([name, values]) => ({
        name,
        estimated: values.estimated.toString(),
        actual: values.actual.toString(),
        subsidy: values.subsidy.toString(),
      })),
      byPriority: Object.entries(byPriority).map(([priority, values]) => ({
        priority,
        estimated: values.estimated.toString(),
        count: values.count,
      })),
      byStatus,
    });
  } catch (error) {
    console.error("Get summary error:", error);
    return NextResponse.json(
      { error: "요약 조회 중 오류가 발생했습니다." },
      { status: 500 }
    );
  }
}
