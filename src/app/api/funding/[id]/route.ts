import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { z } from "zod";
import prisma from "@/lib/prisma";
import { authOptions } from "@/lib/auth/options";
import { krwAmountSchema } from "@/lib/validations/money";

const updateFundingSchema = z.object({
  type: z.enum(["REAL_ESTATE_SALE", "SAVINGS", "LOAN", "GOVERNMENT_SUBSIDY", "RETIREMENT_PAY", "SEVERANCE_PAY", "OTHER"]).optional(),
  name: z.string().min(1).optional(),
  amount: krwAmountSchema().optional(),
  expectedDate: z.string().refine((val) => !isNaN(Date.parse(val))).optional(),
  // asset_manager Portfolio id — 원장은 asset_manager 소유 (Asset Hub §1.5)
  externalAssetId: z.string().nullable().optional(),
  status: z.enum(["PLANNED", "IN_PROGRESS", "COMPLETED"]).optional(),
  notes: z.string().optional(),
});

// GET: 개별 자금원 조회
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.id) {
      return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
    }

    const { id } = await params;

    const fundingSource = await prisma.fundingSource.findFirst({
      where: {
        id,
        userId: session.user.id,
      },
    });

    if (!fundingSource) {
      return NextResponse.json({ error: "자금원을 찾을 수 없습니다." }, { status: 404 });
    }

    return NextResponse.json({
      fundingSource: {
        ...fundingSource,
        amount: fundingSource.amount.toString(),
      },
    });
  } catch (error) {
    console.error("Get funding source error:", error);
    return NextResponse.json(
      { error: "자금원 조회 중 오류가 발생했습니다." },
      { status: 500 }
    );
  }
}

// PATCH: 자금원 수정
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.id) {
      return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
    }

    const { id } = await params;
    const body = await request.json();
    const validatedData = updateFundingSchema.parse(body);

    // 소유권 확인
    const existingSource = await prisma.fundingSource.findFirst({
      where: {
        id,
        userId: session.user.id,
      },
    });

    if (!existingSource) {
      return NextResponse.json({ error: "자금원을 찾을 수 없습니다." }, { status: 404 });
    }

    // 연결 물건 변경 시 중복 확인
    if (validatedData.externalAssetId && validatedData.externalAssetId !== existingSource.externalAssetId) {
      const existingLink = await prisma.fundingSource.findUnique({
        where: { externalAssetId: validatedData.externalAssetId },
      });

      if (existingLink && existingLink.id !== id) {
        return NextResponse.json(
          { error: "해당 물건은 이미 다른 자금원에 연결되어 있습니다." },
          { status: 400 }
        );
      }
    }

    const fundingSource = await prisma.fundingSource.update({
      where: { id },
      data: {
        ...validatedData,
        expectedDate: validatedData.expectedDate ? new Date(validatedData.expectedDate) : undefined,
      },
    });

    return NextResponse.json({
      message: "자금원이 수정되었습니다.",
      fundingSource: {
        ...fundingSource,
        amount: fundingSource.amount.toString(),
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

    console.error("Update funding source error:", error);
    return NextResponse.json(
      { error: "자금원 수정 중 오류가 발생했습니다." },
      { status: 500 }
    );
  }
}

// DELETE: 자금원 삭제
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.id) {
      return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
    }

    const { id } = await params;

    // 소유권 확인
    const existingSource = await prisma.fundingSource.findFirst({
      where: {
        id,
        userId: session.user.id,
      },
    });

    if (!existingSource) {
      return NextResponse.json({ error: "자금원을 찾을 수 없습니다." }, { status: 404 });
    }

    await prisma.fundingSource.delete({
      where: { id },
    });

    return NextResponse.json({ message: "자금원이 삭제되었습니다." });
  } catch (error) {
    console.error("Delete funding source error:", error);
    return NextResponse.json(
      { error: "자금원 삭제 중 오류가 발생했습니다." },
      { status: 500 }
    );
  }
}
