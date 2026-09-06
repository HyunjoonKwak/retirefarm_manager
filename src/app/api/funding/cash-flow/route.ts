import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { z } from "zod";
import prisma from "@/lib/prisma";
import { authOptions } from "@/lib/auth/options";
import {
  generateCashFlowProjection,
  type ProjectionInput,
} from "@/lib/calculators/cash-flow-projection";
import { scheduleSetupCosts } from "@/lib/calculators/setup-cost-schedule";
import { krwAmountSchema } from "@/lib/validations/money";
import { decimalToString, sumDecimals, toDecimal } from "@/lib/utils/money";
import { getMonthRangeOf } from "@/lib/utils/month-range";

const cashFlowSchema = z.object({
  monthlyOperatingCosts: krwAmountSchema().optional(),
  monthlyFarmIncome: krwAmountSchema().optional(),
  farmStartDate: z.string().refine(value => !Number.isNaN(Date.parse(value)), "유효한 영농 시작일이 필요합니다.").optional(),
  monthlyLivingExpense: krwAmountSchema().optional(),
  initialCash: krwAmountSchema().optional(),
  projectionMonths: z.number().int().min(1).max(60).optional(),
});

// POST: 현금흐름 예측 생성
//
// 설립비는 plannedDate/paidAt 기준으로 배치한다 (리뷰 A2):
//   미지출 항목은 예정일 달에, 예정일이 지났거나 없으면 예측 첫 달(영농 시작 달 우선)에 계상.
//   어떤 가정을 썼는지 assumptions로 돌려줘 화면에 표시한다.
// 예정일이 예측 시작 이전인 자금원은 initialCash에 사용자가 이미 반영했을 수 있으므로
// 자동 합산하지 않고 assumptions.pastFunding으로만 알린다.
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.id) {
      return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
    }

    const body = await request.json();
    const validatedData = cashFlowSchema.parse(body);

    const [fundingSources, setupItems] = await Promise.all([
      prisma.fundingSource.findMany({ where: { userId: session.user.id } }),
      prisma.setupCostItem.findMany({ where: { userId: session.user.id } }),
    ]);

    const now = new Date();
    const startRange = getMonthRangeOf(now);
    const farmStartDate = validatedData.farmStartDate
      ? new Date(validatedData.farmStartDate)
      : undefined;

    const schedule = scheduleSetupCosts(setupItems, {
      projectionStart: startRange.start,
      farmStartDate,
      projectionMonths: validatedData.projectionMonths ?? 24,
    });

    const pastFundingSources = fundingSources.filter(
      (source) => source.expectedDate.getTime() < startRange.start.getTime()
    );

    const projectionInput: ProjectionInput = {
      fundingSources: fundingSources.map((source) => ({
        type: source.type,
        description: source.name,
        amount: toDecimal(source.amount).toNumber(),
        expectedDate: source.expectedDate,
      })),
      setupCosts: schedule.costs,
      monthlyOperatingCosts: validatedData.monthlyOperatingCosts,
      monthlyFarmIncome: validatedData.monthlyFarmIncome,
      farmStartDate,
      monthlyLivingExpense: validatedData.monthlyLivingExpense,
      initialCash: validatedData.initialCash,
      projectionMonths: validatedData.projectionMonths || 24,
      startDate: startRange.start,
    };

    const result = generateCashFlowProjection(projectionInput);

    return NextResponse.json({
      result,
      assumptions: {
        projectionStartMonth: startRange.key,
        setupCosts: schedule.assumptions,
        pastFunding: {
          count: pastFundingSources.length,
          amount: decimalToString(sumDecimals(pastFundingSources.map((s) => s.amount))),
        },
      },
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      const firstIssue = error.issues[0];
      return NextResponse.json(
        { error: firstIssue?.message || "입력값이 올바르지 않습니다." },
        { status: 400 }
      );
    }

    console.error("Cash flow projection error:", error);
    return NextResponse.json(
      { error: "현금흐름 예측 중 오류가 발생했습니다." },
      { status: 500 }
    );
  }
}
