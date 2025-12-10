import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { z } from "zod";
import prisma from "@/lib/prisma";
import { authOptions } from "@/lib/auth/options";

const updateTransactionSchema = z.object({
  date: z.string().refine((val) => !isNaN(Date.parse(val))).optional(),
  type: z.enum(["INCOME", "EXPENSE"]).optional(),
  category: z.string().min(1).optional(),
  subcategory: z.string().nullable().optional(),
  amount: z.number().min(1).optional(),
  description: z.string().min(1).optional(),
  relatedCropId: z.string().nullable().optional(),
  paymentMethod: z.string().nullable().optional(),
});

// GET: 개별 거래 조회
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

    const transaction = await prisma.financialTransaction.findFirst({
      where: {
        id,
        userId: session.user.id,
      },
      include: {
        crop: {
          select: { id: true, name: true },
        },
      },
    });

    if (!transaction) {
      return NextResponse.json({ error: "거래를 찾을 수 없습니다." }, { status: 404 });
    }

    return NextResponse.json({
      transaction: {
        ...transaction,
        amount: transaction.amount.toString(),
      },
    });
  } catch (error) {
    console.error("Get transaction error:", error);
    return NextResponse.json(
      { error: "거래 조회 중 오류가 발생했습니다." },
      { status: 500 }
    );
  }
}

// PATCH: 거래 수정
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
    const validatedData = updateTransactionSchema.parse(body);

    // 소유권 확인
    const existingTx = await prisma.financialTransaction.findFirst({
      where: {
        id,
        userId: session.user.id,
      },
    });

    if (!existingTx) {
      return NextResponse.json({ error: "거래를 찾을 수 없습니다." }, { status: 404 });
    }

    const transaction = await prisma.financialTransaction.update({
      where: { id },
      data: {
        ...validatedData,
        date: validatedData.date ? new Date(validatedData.date) : undefined,
      },
      include: {
        crop: {
          select: { id: true, name: true },
        },
      },
    });

    return NextResponse.json({
      message: "거래가 수정되었습니다.",
      transaction: {
        ...transaction,
        amount: transaction.amount.toString(),
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

    console.error("Update transaction error:", error);
    return NextResponse.json(
      { error: "거래 수정 중 오류가 발생했습니다." },
      { status: 500 }
    );
  }
}

// DELETE: 거래 삭제
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
    const existingTx = await prisma.financialTransaction.findFirst({
      where: {
        id,
        userId: session.user.id,
      },
    });

    if (!existingTx) {
      return NextResponse.json({ error: "거래를 찾을 수 없습니다." }, { status: 404 });
    }

    await prisma.financialTransaction.delete({
      where: { id },
    });

    return NextResponse.json({ message: "거래가 삭제되었습니다." });
  } catch (error) {
    console.error("Delete transaction error:", error);
    return NextResponse.json(
      { error: "거래 삭제 중 오류가 발생했습니다." },
      { status: 500 }
    );
  }
}
