import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import prisma from "@/lib/prisma";
import { authOptions } from "@/lib/auth/options";
import { calculateFundingRequirement } from "@/lib/calculators/funding-requirement";
import { decimalToString, sumDecimals, ZERO } from "@/lib/utils/money";
import { addMonths, getMonthRangeOf, isInMonth } from "@/lib/utils/month-range";

const FUNDING_TYPES = [
  "REAL_ESTATE_SALE",
  "SAVINGS",
  "LOAN",
  "GOVERNMENT_SUBSIDY",
  "RETIREMENT_PAY",
  "SEVERANCE_PAY",
  "OTHER",
] as const;

const FUNDING_STATUSES = ["PLANNED", "IN_PROGRESS", "COMPLETED"] as const;

const MONTHLY_FLOW_MONTHS = 12;

// GET: 자금 조달 요약
// 필요 자금은 /plan과 같은 단일 계산기(설립비 순액 + 생활비 버퍼)를 쓴다 (리뷰 A1).
// 금액은 Decimal로 집계해 소수 데이터가 있어도 500이 나지 않는다 (리뷰 A5).
export async function GET() {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.id) {
      return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
    }

    const userId = session.user.id;

    const [fundingSources, setupItems, goal] = await Promise.all([
      prisma.fundingSource.findMany({ where: { userId } }),
      prisma.setupCostItem.findMany({ where: { userId } }),
      prisma.retirementGoal.findUnique({ where: { userId } }),
    ]);

    // 유형별 / 상태별 합계 (알 수 없는 값은 OTHER / PLANNED로 묶어 TypeError를 막는다)
    const byType = FUNDING_TYPES.map((type) => {
      const ofType = fundingSources.filter(
        (source) =>
          source.type === type ||
          (type === "OTHER" && !(FUNDING_TYPES as readonly string[]).includes(source.type))
      );
      return {
        type,
        total: decimalToString(sumDecimals(ofType.map((s) => s.amount))),
        count: ofType.length,
        completed: decimalToString(
          sumDecimals(ofType.filter((s) => s.status === "COMPLETED").map((s) => s.amount))
        ),
      };
    });

    const byStatus = FUNDING_STATUSES.map((status) => {
      const ofStatus = fundingSources.filter(
        (source) =>
          source.status === status ||
          (status === "PLANNED" && !(FUNDING_STATUSES as readonly string[]).includes(source.status))
      );
      return {
        status,
        total: decimalToString(sumDecimals(ofStatus.map((s) => s.amount))),
        count: ofStatus.length,
      };
    });

    const requirement = calculateFundingRequirement({
      setupCosts: setupItems,
      fundingSources,
      monthlyLivingExpense: goal?.monthlyLivingExpense,
      bufferMonths: goal?.bufferMonths,
    });

    // 월별 자금 유입 (향후 12개월) — [1일, 다음 달 1일) 반개구간 (리뷰 A3)
    const startRange = getMonthRangeOf(new Date());
    const monthlyFlow = Array.from({ length: MONTHLY_FLOW_MONTHS }, (_, i) => {
      const range = addMonths(startRange, i);
      const inMonth = fundingSources.filter((source) => isInMonth(source.expectedDate, range));
      return {
        month: range.key,
        amount: decimalToString(sumDecimals(inMonth.map((s) => s.amount))),
      };
    });

    return NextResponse.json({
      summary: {
        totalAmount: decimalToString(requirement.totalFundingPlanned),
        completedAmount: decimalToString(requirement.totalFundingSecured),
        totalSources: fundingSources.length,
        requiredAmount: decimalToString(requirement.totalRequiredFunds),
        fundingGap: decimalToString(requirement.fundingGap),
        fundingRatio: requirement.fundingRatio,
      },
      // 필요 자금 구성 — 화면 라벨용 (설립비 순액 + 생활비 버퍼)
      requiredBreakdown: {
        totalSetupCost: decimalToString(requirement.totalSetupCost),
        totalSubsidy: decimalToString(requirement.totalSubsidy),
        netSetupCost: decimalToString(requirement.netSetupCost),
        initialLivingBuffer: decimalToString(requirement.initialLivingBuffer),
        bufferMonths: requirement.bufferMonths,
        monthlyLivingExpense: decimalToString(requirement.monthlyLivingExpense),
        hasLivingBuffer: requirement.initialLivingBuffer.gt(ZERO),
        hasGoal: goal !== null,
      },
      byType,
      byStatus,
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
