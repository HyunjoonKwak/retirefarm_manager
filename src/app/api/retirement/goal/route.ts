import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { z } from "zod";
import prisma from "@/lib/prisma";
import { authOptions } from "@/lib/auth/options";
import { smartFarmPlanSchema } from "@/lib/validations/plan";

// GET: 스마트팜 준비 목표 조회
export async function GET() {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.id) {
      return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
    }

    const goal = await prisma.retirementGoal.findUnique({
      where: { userId: session.user.id },
    });

    if (!goal) {
      return NextResponse.json({ goal: null });
    }

    return NextResponse.json({
      goal: {
        id: goal.id,
        targetDate: goal.targetDate.toISOString(),
        estimatedRetirementPay: goal.estimatedRetirementPay?.toString() || null,
        estimatedSeverancePay: goal.estimatedSeverancePay?.toString() || null,
        monthlyLivingExpense: goal.monthlyLivingExpense?.toString() || null,
        bufferMonths: goal.bufferMonths,
        initialLivingBuffer: goal.initialLivingBuffer?.toString() || null,
      },
    });
  } catch (error) {
    console.error("Get retirement goal error:", error);
    return NextResponse.json(
      { error: "목표 조회 중 오류가 발생했습니다." },
      { status: 500 }
    );
  }
}

// POST: 스마트팜 준비 목표 설정 (생성 또는 수정)
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.id) {
      return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
    }

    const body = await request.json();
    const validatedData = smartFarmPlanSchema.parse(body);

    // 초기 생활비 버퍼 계산
    const initialLivingBuffer = (validatedData.monthlyLivingExpense || 0) * validatedData.bufferMonths;

    const goal = await prisma.retirementGoal.upsert({
      where: { userId: session.user.id },
      create: {
        userId: session.user.id,
        targetDate: new Date(validatedData.targetDate),
        estimatedRetirementPay: validatedData.estimatedRetirementPay || null,
        estimatedSeverancePay: validatedData.estimatedSeverancePay || null,
        monthlyLivingExpense: validatedData.monthlyLivingExpense || null,
        bufferMonths: validatedData.bufferMonths,
        initialLivingBuffer: initialLivingBuffer || null,
      },
      update: {
        targetDate: new Date(validatedData.targetDate),
        estimatedRetirementPay: validatedData.estimatedRetirementPay || null,
        estimatedSeverancePay: validatedData.estimatedSeverancePay || null,
        monthlyLivingExpense: validatedData.monthlyLivingExpense || null,
        bufferMonths: validatedData.bufferMonths,
        initialLivingBuffer: initialLivingBuffer || null,
      },
    });

    return NextResponse.json({
      message: "목표가 저장되었습니다.",
      goal: {
        id: goal.id,
        targetDate: goal.targetDate.toISOString(),
        estimatedRetirementPay: goal.estimatedRetirementPay?.toString() || null,
        estimatedSeverancePay: goal.estimatedSeverancePay?.toString() || null,
        monthlyLivingExpense: goal.monthlyLivingExpense?.toString() || null,
        bufferMonths: goal.bufferMonths,
        initialLivingBuffer: goal.initialLivingBuffer?.toString() || null,
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

    console.error("Save retirement goal error:", error);
    return NextResponse.json(
      { error: "목표 저장 중 오류가 발생했습니다." },
      { status: 500 }
    );
  }
}
