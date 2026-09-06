import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import prisma from "@/lib/prisma";
import { authOptions } from "@/lib/auth/options";
import { setupCostLineTotal } from "@/lib/calculators/funding-requirement";
import { decimalToString, toDecimal, ZERO, type Decimal } from "@/lib/utils/money";

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

    // 합계 계산 — Decimal 집계, 항목 합계는 funding-requirement와 같은 정의(estimatedCost × quantity)
    let totalEstimatedCost = ZERO;
    let totalActualCost = ZERO;
    let totalSubsidy = ZERO;

    const byCategory: Record<string, { estimated: Decimal; actual: Decimal; subsidy: Decimal }> = {};
    const byPriority: Record<string, { estimated: Decimal; count: number }> = {
      ESSENTIAL: { estimated: ZERO, count: 0 },
      IMPORTANT: { estimated: ZERO, count: 0 },
      OPTIONAL: { estimated: ZERO, count: 0 },
    };
    const byStatus: Record<string, number> = {
      PLANNED: 0,
      QUOTED: 0,
      ORDERED: 0,
      DELIVERED: 0,
      INSTALLED: 0,
    };

    for (const item of items) {
      const itemTotal = setupCostLineTotal(item);
      const itemActual = item.actualCost
        ? toDecimal(item.actualCost).mul(item.quantity)
        : ZERO;
      const itemSubsidy = toDecimal(item.subsidyAmount);

      totalEstimatedCost = totalEstimatedCost.plus(itemTotal);
      totalActualCost = totalActualCost.plus(itemActual);
      totalSubsidy = totalSubsidy.plus(itemSubsidy);

      // 카테고리별
      const categoryName = item.subcategory.category.name;
      if (!byCategory[categoryName]) {
        byCategory[categoryName] = { estimated: ZERO, actual: ZERO, subsidy: ZERO };
      }
      byCategory[categoryName].estimated = byCategory[categoryName].estimated.plus(itemTotal);
      byCategory[categoryName].actual = byCategory[categoryName].actual.plus(itemActual);
      byCategory[categoryName].subsidy = byCategory[categoryName].subsidy.plus(itemSubsidy);

      // 우선순위별 (알 수 없는 값은 ESSENTIAL로)
      const priorityBucket = byPriority[item.priority] ?? byPriority.ESSENTIAL;
      priorityBucket.estimated = priorityBucket.estimated.plus(itemTotal);
      priorityBucket.count += 1;

      // 상태별 (알 수 없는 값은 PLANNED로)
      byStatus[item.status in byStatus ? item.status : "PLANNED"] += 1;
    }

    // 순수 자기자본 필요액
    const selfFundingRequired = totalEstimatedCost.minus(totalSubsidy);

    // 진행률 계산 (INSTALLED 상태 항목 비율)
    const totalItems = items.length;
    const completedItems = byStatus.INSTALLED;
    const progressRate = totalItems > 0 ? Math.round((completedItems / totalItems) * 100) : 0;

    return NextResponse.json({
      summary: {
        totalItems,
        totalEstimatedCost: decimalToString(totalEstimatedCost),
        totalActualCost: decimalToString(totalActualCost),
        totalSubsidy: decimalToString(totalSubsidy),
        selfFundingRequired: decimalToString(selfFundingRequired),
        progressRate,
      },
      byCategory: Object.entries(byCategory).map(([name, values]) => ({
        name,
        estimated: decimalToString(values.estimated),
        actual: decimalToString(values.actual),
        subsidy: decimalToString(values.subsidy),
      })),
      byPriority: Object.entries(byPriority).map(([priority, values]) => ({
        priority,
        estimated: decimalToString(values.estimated),
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
