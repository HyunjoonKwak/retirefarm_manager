import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { z } from "zod";
import prisma from "@/lib/prisma";
import { authOptions } from "@/lib/auth/options";
import { isTerminalCropStatus } from "@/lib/utils/crop-completion";

const createCropSchema = z.object({
  name: z.string().min(1, "작물명을 입력해주세요."),
  variety: z.string().optional(),
  plantingDate: z.string().refine((val) => !isNaN(Date.parse(val)), "유효한 날짜를 입력해주세요."),
  expectedHarvestDate: z.string().refine((val) => !isNaN(Date.parse(val)), "유효한 날짜를 입력해주세요."),
  plotId: z.string().optional(),
  notes: z.string().optional(),
});

// GET: 작물 목록 조회
export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.id) {
      return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const status = searchParams.get("status");

    const whereClause: {
      userId: string;
      status?: "GROWING" | "HARVESTING" | "COMPLETED" | "FAILED";
    } = {
      userId: session.user.id,
    };

    if (status && ["GROWING", "HARVESTING", "COMPLETED", "FAILED"].includes(status)) {
      whereClause.status = status as "GROWING" | "HARVESTING" | "COMPLETED" | "FAILED";
    }

    const crops = await prisma.crop.findMany({
      where: whereClause,
      include: {
        activities: {
          take: 5,
          orderBy: { createdAt: "desc" },
          include: {
            log: {
              select: { date: true },
            },
          },
        },
        _count: {
          select: { activities: true, transactions: true },
        },
      },
      orderBy: { plantingDate: "desc" },
    });

    // 활동 내 Decimal 변환 + 완료일 추정 여부 (레거시 종료 행은 completedAt이 없다)
    const serializedCrops = crops.map((crop) => ({
      ...crop,
      completedAtEstimated: isTerminalCropStatus(crop.status) && (crop.completedAt === null || crop.completedAtEstimated),
      activities: crop.activities.map((activity) => ({
        ...activity,
        quantity: activity.quantity ? Number(activity.quantity) : null,
      })),
    }));

    return NextResponse.json({ crops: serializedCrops });
  } catch (error) {
    console.error("Get crops error:", error);
    return NextResponse.json(
      { error: "작물 조회 중 오류가 발생했습니다." },
      { status: 500 }
    );
  }
}

// POST: 작물 등록
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.id) {
      return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
    }

    const body = await request.json();
    const validatedData = createCropSchema.parse(body);

    const crop = await prisma.crop.create({
      data: {
        userId: session.user.id,
        name: validatedData.name,
        variety: validatedData.variety,
        plantingDate: new Date(validatedData.plantingDate),
        expectedHarvestDate: new Date(validatedData.expectedHarvestDate),
        plotId: validatedData.plotId,
        notes: validatedData.notes,
      },
    });

    return NextResponse.json({
      message: "작물이 등록되었습니다.",
      crop,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      const firstIssue = error.issues[0];
      return NextResponse.json(
        { error: firstIssue?.message || "입력값이 올바르지 않습니다." },
        { status: 400 }
      );
    }

    console.error("Create crop error:", error);
    return NextResponse.json(
      { error: "작물 등록 중 오류가 발생했습니다." },
      { status: 500 }
    );
  }
}
