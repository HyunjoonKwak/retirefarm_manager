import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth/options";
import prisma from "@/lib/prisma";
import { smartFarmPlanSchema, calculateSmartFarmPlanSummary } from "@/lib/validations/plan";
import { externalPortfolioClient } from "@/lib/api/external-portfolio";
import { getSnapshotSummary, type SnapshotSummary } from "@/lib/services/external-snapshot";

// GET: 스마트팜 준비 계획 조회
export async function GET() {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.id) {
      return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
    }

    const userId = session.user.id;

    // 1. 퇴직 목표 조회
    const goal = await prisma.retirementGoal.findUnique({
      where: { userId },
    });

    if (!goal) {
      return NextResponse.json({ error: "목표가 설정되지 않았습니다." }, { status: 404 });
    }

    // 2. 설립 비용 조회
    const setupCosts = await prisma.setupCostItem.findMany({
      where: { userId },
      include: {
        subcategory: {
          include: {
            category: true,
          },
        },
      },
    });

    // 3. 자금 조달 조회
    const fundingSources = await prisma.fundingSource.findMany({
      where: { userId },
    });

    // 4. 자본 준비 스냅샷 합산 (Asset Hub §2·§6) — 실패해도 진행 (last-known-good)
    let snapshotSummary: SnapshotSummary | null = null;
    try {
      snapshotSummary = await getSnapshotSummary();
    } catch (e) {
      console.error("Snapshot summary fetch failed:", e);
    }

    // 5. 외부 포트폴리오 조회 (try-catch로 실패해도 진행)
    // email 기반 조회 - userId가 변경되어도 연동 유지
    const userEmail = session.user.email;
    let externalAssets = null;
    let expectedProceeds = null;
    try {
      if (!userEmail) {
        throw new Error("User email not found in session");
      }
      const [assets, proceeds] = await Promise.all([
        externalPortfolioClient.getOwnedAssets(userEmail),
        externalPortfolioClient.getExpectedProceeds(userEmail),
      ]);

      if (assets.length > 0) {
        const totalValue = assets.reduce((sum, a) => sum + BigInt(a.currentPrice || "0"), BigInt(0));
        const totalLoan = assets.reduce((sum, a) => sum + BigInt(a.loanAmount || "0"), BigInt(0));
        const totalDeposit = assets.reduce((sum, a) => sum + BigInt(a.deposit || "0"), BigInt(0));
        const netValue = totalValue - totalLoan - totalDeposit;

        externalAssets = {
          totalAssets: assets.length,
          totalValue: totalValue.toString(),
          totalLoanAmount: totalLoan.toString(),
          netValue: netValue.toString(),
        };
      }

      if (proceeds.assets.length > 0) {
        expectedProceeds = proceeds;
      }
    } catch (e) {
      console.error("External portfolio fetch failed:", e);
    }

    // 6. 요약 계산
    const summary = calculateSmartFarmPlanSummary({
      goal: {
        targetDate: goal.targetDate,
        estimatedRetirementPay: goal.estimatedRetirementPay ? Number(goal.estimatedRetirementPay) : undefined,
        estimatedSeverancePay: goal.estimatedSeverancePay ? Number(goal.estimatedSeverancePay) : undefined,
        monthlyLivingExpense: goal.monthlyLivingExpense ? Number(goal.monthlyLivingExpense) : undefined,
        bufferMonths: goal.bufferMonths || undefined,
      },
      setupCosts: setupCosts.map((item) => ({
        estimatedCost: Number(item.estimatedCost),
        subsidyAmount: item.subsidyAmount ? Number(item.subsidyAmount) : undefined,
      })),
      fundingSources: fundingSources.map((source) => ({
        amount: Number(source.amount),
        status: source.status,
      })),
    });

    return NextResponse.json({
      goal: {
        id: goal.id,
        targetDate: goal.targetDate.toISOString(),
        estimatedRetirementPay: goal.estimatedRetirementPay?.toString() || null,
        estimatedSeverancePay: goal.estimatedSeverancePay?.toString() || null,
        monthlyLivingExpense: goal.monthlyLivingExpense?.toString() || null,
        bufferMonths: goal.bufferMonths,
      },
      summary: {
        ...summary,
        targetDate: summary.targetDate.toISOString(),
      },
      setupCosts: {
        total: setupCosts.length,
        totalAmount: summary.totalSetupCost,
        totalSubsidy: summary.totalSubsidyAmount,
        items: setupCosts.map((item) => ({
          id: item.id,
          category: item.subcategory?.category?.name || "기타",
          subcategory: item.subcategory?.name || "",
          name: item.name,
          estimatedCost: item.estimatedCost.toString(),
          subsidyAmount: item.subsidyAmount?.toString() || null,
          notes: item.notes,
        })),
      },
      fundingSources: {
        total: fundingSources.length,
        totalAmount: summary.totalFundingPlanned,
        items: fundingSources.map((source) => ({
          id: source.id,
          type: source.type,
          name: source.name,
          amount: source.amount.toString(),
          expectedDate: source.expectedDate.toISOString(),
          status: source.status,
        })),
      },
      externalAssets,
      expectedProceeds,
      // §6 자본 준비: 스냅샷 합산값을 목표 자본(순설립비+생활비버퍼) 대비 게이지로
      capitalReadiness: snapshotSummary
        ? {
            totalKrw: snapshotSummary.totalKrw,
            sources: snapshotSummary.sources,
            configuredSourceCount: snapshotSummary.configuredSourceCount,
            errors: snapshotSummary.errors,
            targetCapital: summary.totalRequiredFunds,
            targetDate: summary.targetDate.toISOString(),
          }
        : null,
    });
  } catch (error) {
    console.error("Get smart farm plan error:", error);
    return NextResponse.json({ error: "서버 오류가 발생했습니다." }, { status: 500 });
  }
}

// POST: 스마트팜 준비 계획 생성/수정
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.id) {
      return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
    }

    const userId = session.user.id;
    const body = await request.json();

    const validationResult = smartFarmPlanSchema.safeParse(body);
    if (!validationResult.success) {
      return NextResponse.json(
        { error: "입력값이 올바르지 않습니다.", details: validationResult.error.issues },
        { status: 400 }
      );
    }

    const data = validationResult.data;

    // 초기 생활비 버퍼 계산
    const initialLivingBuffer = (data.monthlyLivingExpense || 0) * data.bufferMonths;

    // upsert (있으면 수정, 없으면 생성)
    const goal = await prisma.retirementGoal.upsert({
      where: { userId },
      update: {
        targetDate: new Date(data.targetDate),
        estimatedRetirementPay: data.estimatedRetirementPay || null,
        estimatedSeverancePay: data.estimatedSeverancePay || null,
        monthlyLivingExpense: data.monthlyLivingExpense || null,
        bufferMonths: data.bufferMonths,
        initialLivingBuffer: initialLivingBuffer || null,
      },
      create: {
        userId,
        targetDate: new Date(data.targetDate),
        estimatedRetirementPay: data.estimatedRetirementPay || null,
        estimatedSeverancePay: data.estimatedSeverancePay || null,
        monthlyLivingExpense: data.monthlyLivingExpense || null,
        bufferMonths: data.bufferMonths,
        initialLivingBuffer: initialLivingBuffer || null,
      },
    });

    return NextResponse.json({
      success: true,
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
    console.error("Save smart farm plan error:", error);
    return NextResponse.json({ error: "서버 오류가 발생했습니다." }, { status: 500 });
  }
}
