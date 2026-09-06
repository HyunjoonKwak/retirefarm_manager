import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { z } from "zod";
import prisma from "@/lib/prisma";
import { authOptions } from "@/lib/auth/options";
import { krwAmountSchema } from "@/lib/validations/money";

const createItemSchema = z.object({
  subcategoryId: z.string().min(1, "서브카테고리를 선택해주세요."),
  name: z.string().min(1, "항목명을 입력해주세요."),
  description: z.string().optional(),
  estimatedCost: krwAmountSchema({ minMessage: "예상 비용은 0 이상이어야 합니다." }),
  quantity: z.number().int().min(1).default(1),
  unit: z.string().default("개"),
  areaInPyeong: z.number().optional(),      // 면적 (평)
  pricePerPyeong: z.number().optional(),    // 평단가 (원)
  personCount: z.number().optional(),       // 인원수 (인건비용)
  pricePerPerson: z.number().optional(),    // 인당 단가 (인건비용)
  durationMonths: z.number().optional(),    // 기간 (개월, 인건비용)
  isGovernmentSubsidy: z.boolean().default(false),
  subsidyAmount: krwAmountSchema().optional(),
  subsidyRate: z.number().min(0).max(100).optional(),
  // 지출 예정일 (선택). 없으면 현금흐름 예측이 영농 시작 달/예측 첫 달로 폴백한다.
  plannedDate: z.string().refine((val) => !isNaN(Date.parse(val)), "유효한 날짜를 입력해주세요.").optional(),
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
      areaInPyeong: item.areaInPyeong?.toString() || null,
      pricePerPyeong: item.pricePerPyeong?.toString() || null,
      personCount: item.personCount || null,
      pricePerPerson: item.pricePerPerson?.toString() || null,
      durationMonths: item.durationMonths || null,
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
        areaInPyeong: validatedData.areaInPyeong,
        pricePerPyeong: validatedData.pricePerPyeong,
        personCount: validatedData.personCount,
        pricePerPerson: validatedData.pricePerPerson,
        durationMonths: validatedData.durationMonths,
        isGovernmentSubsidy: validatedData.isGovernmentSubsidy,
        subsidyAmount: validatedData.subsidyAmount,
        subsidyRate: validatedData.subsidyRate,
        plannedDate: validatedData.plannedDate ? new Date(validatedData.plannedDate) : null,
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
        areaInPyeong: item.areaInPyeong?.toString() || null,
        pricePerPyeong: item.pricePerPyeong?.toString() || null,
        personCount: item.personCount || null,
        pricePerPerson: item.pricePerPerson?.toString() || null,
        durationMonths: item.durationMonths || null,
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
