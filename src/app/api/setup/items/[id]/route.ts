import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { z } from "zod";
import prisma from "@/lib/prisma";
import { authOptions } from "@/lib/auth/options";

const updateItemSchema = z.object({
  name: z.string().min(1).optional(),
  description: z.string().optional(),
  estimatedCost: z.number().min(0).optional(),
  actualCost: z.number().min(0).optional(),
  quantity: z.number().min(1).optional(),
  unit: z.string().optional(),
  isGovernmentSubsidy: z.boolean().optional(),
  subsidyAmount: z.number().optional(),
  subsidyRate: z.number().min(0).max(100).optional(),
  priority: z.enum(["ESSENTIAL", "IMPORTANT", "OPTIONAL"]).optional(),
  status: z.enum(["PLANNED", "QUOTED", "ORDERED", "DELIVERED", "INSTALLED"]).optional(),
  notes: z.string().optional(),
});

// GET: 개별 항목 조회
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

    const item = await prisma.setupCostItem.findFirst({
      where: {
        id,
        userId: session.user.id,
      },
      include: {
        subcategory: {
          include: {
            category: true,
          },
        },
      },
    });

    if (!item) {
      return NextResponse.json({ error: "항목을 찾을 수 없습니다." }, { status: 404 });
    }

    return NextResponse.json({
      item: {
        ...item,
        estimatedCost: item.estimatedCost.toString(),
        actualCost: item.actualCost?.toString() || null,
        subsidyAmount: item.subsidyAmount?.toString() || null,
        subsidyRate: item.subsidyRate ? Number(item.subsidyRate) : null,
      },
    });
  } catch (error) {
    console.error("Get item error:", error);
    return NextResponse.json(
      { error: "항목 조회 중 오류가 발생했습니다." },
      { status: 500 }
    );
  }
}

// PATCH: 항목 수정
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
    const validatedData = updateItemSchema.parse(body);

    // 항목 존재 및 소유권 확인
    const existingItem = await prisma.setupCostItem.findFirst({
      where: {
        id,
        userId: session.user.id,
      },
    });

    if (!existingItem) {
      return NextResponse.json({ error: "항목을 찾을 수 없습니다." }, { status: 404 });
    }

    const item = await prisma.setupCostItem.update({
      where: { id },
      data: validatedData,
      include: {
        subcategory: {
          include: {
            category: true,
          },
        },
      },
    });

    return NextResponse.json({
      message: "항목이 수정되었습니다.",
      item: {
        ...item,
        estimatedCost: item.estimatedCost.toString(),
        actualCost: item.actualCost?.toString() || null,
        subsidyAmount: item.subsidyAmount?.toString() || null,
        subsidyRate: item.subsidyRate ? Number(item.subsidyRate) : null,
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

    console.error("Update item error:", error);
    return NextResponse.json(
      { error: "항목 수정 중 오류가 발생했습니다." },
      { status: 500 }
    );
  }
}

// DELETE: 항목 삭제
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

    // 항목 존재 및 소유권 확인
    const existingItem = await prisma.setupCostItem.findFirst({
      where: {
        id,
        userId: session.user.id,
      },
    });

    if (!existingItem) {
      return NextResponse.json({ error: "항목을 찾을 수 없습니다." }, { status: 404 });
    }

    await prisma.setupCostItem.delete({
      where: { id },
    });

    return NextResponse.json({ message: "항목이 삭제되었습니다." });
  } catch (error) {
    console.error("Delete item error:", error);
    return NextResponse.json(
      { error: "항목 삭제 중 오류가 발생했습니다." },
      { status: 500 }
    );
  }
}
