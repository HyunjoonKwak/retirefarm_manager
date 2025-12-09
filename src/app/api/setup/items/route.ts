import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { z } from "zod";
import prisma from "@/lib/prisma";
import { authOptions } from "@/lib/auth/options";

const createItemSchema = z.object({
  subcategoryId: z.string().min(1, "서브카테고리를 선택해주세요."),
  name: z.string().min(1, "항목명을 입력해주세요."),
  description: z.string().optional(),
  estimatedCost: z.number().min(0, "예상 비용은 0 이상이어야 합니다."),
  quantity: z.number().min(1).default(1),
  unit: z.string().default("개"),
  isGovernmentSubsidy: z.boolean().default(false),
  subsidyAmount: z.number().optional(),
  subsidyRate: z.number().min(0).max(100).optional(),
  priority: z.enum(["ESSENTIAL", "IMPORTANT", "OPTIONAL"]).default("ESSENTIAL"),
  notes: z.string().optional(),
});

// GET: 사용자의 비용 항목 목록 조회
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
      orderBy: { createdAt: "asc" },
    });

    // BigInt를 문자열로 변환
    const serializedItems = items.map((item) => ({
      ...item,
      estimatedCost: item.estimatedCost.toString(),
      actualCost: item.actualCost?.toString() || null,
      subsidyAmount: item.subsidyAmount?.toString() || null,
      subsidyRate: item.subsidyRate ? Number(item.subsidyRate) : null,
    }));

    return NextResponse.json({ items: serializedItems });
  } catch (error) {
    console.error("Get items error:", error);
    return NextResponse.json(
      { error: "항목 조회 중 오류가 발생했습니다." },
      { status: 500 }
    );
  }
}

// POST: 비용 항목 등록
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.id) {
      return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
    }

    const body = await request.json();
    const validatedData = createItemSchema.parse(body);

    // 서브카테고리 존재 확인
    const subcategory = await prisma.setupCostSubcategory.findUnique({
      where: { id: validatedData.subcategoryId },
    });

    if (!subcategory) {
      return NextResponse.json(
        { error: "존재하지 않는 서브카테고리입니다." },
        { status: 400 }
      );
    }

    const item = await prisma.setupCostItem.create({
      data: {
        userId: session.user.id,
        subcategoryId: validatedData.subcategoryId,
        name: validatedData.name,
        description: validatedData.description,
        estimatedCost: validatedData.estimatedCost,
        quantity: validatedData.quantity,
        unit: validatedData.unit,
        isGovernmentSubsidy: validatedData.isGovernmentSubsidy,
        subsidyAmount: validatedData.subsidyAmount,
        subsidyRate: validatedData.subsidyRate,
        priority: validatedData.priority,
        notes: validatedData.notes,
      },
      include: {
        subcategory: {
          include: {
            category: true,
          },
        },
      },
    });

    return NextResponse.json({
      message: "비용 항목이 등록되었습니다.",
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

    console.error("Create item error:", error);
    return NextResponse.json(
      { error: "항목 등록 중 오류가 발생했습니다." },
      { status: 500 }
    );
  }
}
