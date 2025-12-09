import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { z } from "zod";
import prisma from "@/lib/prisma";
import { authOptions } from "@/lib/auth/options";
import {
  generateCashFlowProjection,
  type ProjectionInput,
} from "@/lib/calculators/cash-flow-projection";

const cashFlowSchema = z.object({
  monthlyOperatingCosts: z.number().min(0).optional(),
  monthlyFarmIncome: z.number().min(0).optional(),
  farmStartDate: z.string().optional(),
  monthlyLivingExpense: z.number().min(0).optional(),
  initialCash: z.number().min(0).optional(),
  projectionMonths: z.number().min(1).max(60).optional(),
});

// POST: 현금흐름 예측 생성
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.id) {
      return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
    }

    const body = await request.json();
    const validatedData = cashFlowSchema.parse(body);

    // 자금 조달 데이터 조회
    const fundingSources = await prisma.fundingSource.findMany({
      where: { userId: session.user.id },
    });

    // 설립 비용 데이터 조회
    const setupItems = await prisma.setupCostItem.findMany({
      where: { userId: session.user.id },
    });

    // 예측 입력 데이터 구성
    const projectionInput: ProjectionInput = {
      fundingSources: fundingSources.map((source) => ({
        type: source.type,
        description: source.name,
        amount: Number(source.amount),
        expectedDate: source.expectedDate,
      })),
      setupCosts: setupItems.map((item) => ({
        description: item.name,
        amount: Number(item.estimatedCost) * item.quantity - (Number(item.subsidyAmount) || 0),
        expectedDate: item.createdAt, // 생성일 기준 (별도 예정일 없음)
      })),
      monthlyOperatingCosts: validatedData.monthlyOperatingCosts,
      monthlyFarmIncome: validatedData.monthlyFarmIncome,
      farmStartDate: validatedData.farmStartDate ? new Date(validatedData.farmStartDate) : undefined,
      monthlyLivingExpense: validatedData.monthlyLivingExpense,
      initialCash: validatedData.initialCash,
      projectionMonths: validatedData.projectionMonths || 24,
    };

    const result = generateCashFlowProjection(projectionInput);

    return NextResponse.json({ result });
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
