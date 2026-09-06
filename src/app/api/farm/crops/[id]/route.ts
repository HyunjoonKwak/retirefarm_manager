import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { z } from "zod";
import prisma from "@/lib/prisma";
import { authOptions } from "@/lib/auth/options";
import { resolveCropCompletion, resolveCropEndDate } from "@/lib/utils/crop-completion";

const updateCropSchema = z.object({
  name: z.string().min(1).optional(),
  variety: z.string().optional(),
  plantingDate: z.string().refine((val) => !isNaN(Date.parse(val))).optional(),
  expectedHarvestDate: z.string().refine((val) => !isNaN(Date.parse(val))).optional(),
  plotId: z.string().nullable().optional(),
  status: z.enum(["GROWING", "HARVESTING", "COMPLETED", "FAILED"]).optional(),
  growthStage: z.enum([
    "SEEDING",
    "GERMINATION",
    "SEEDLING",
    "VEGETATIVE",
    "FLOWERING",
    "FRUITING",
    "HARVEST",
  ]).optional(),
  // 재배 종료일. 보통 status 전이 시 서버가 기록하며, 교정할 때만 보낸다. 진행 중 상태로 되돌리면 지운다.
  completedAt: z.string().refine((val) => !isNaN(Date.parse(val))).nullable().optional(),
  notes: z.string().optional(),
});

// GET: 개별 작물 조회
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

    const crop = await prisma.crop.findFirst({
      where: {
        id,
        userId: session.user.id,
      },
      include: {
        activities: {
          orderBy: { createdAt: "desc" },
          include: {
            log: {
              select: { id: true, date: true },
            },
          },
        },
        transactions: {
          orderBy: { date: "desc" },
        },
      },
    });

    if (!crop) {
      return NextResponse.json({ error: "작물을 찾을 수 없습니다." }, { status: 404 });
    }

    return NextResponse.json({
      crop: {
        ...crop,
        completedAtEstimated: resolveCropEndDate(crop).estimated,
        activities: crop.activities.map((activity) => ({
          ...activity,
          quantity: activity.quantity ? Number(activity.quantity) : null,
        })),
        transactions: crop.transactions.map((tx) => ({
          ...tx,
          amount: tx.amount.toString(),
        })),
      },
    });
  } catch (error) {
    console.error("Get crop error:", error);
    return NextResponse.json(
      { error: "작물 조회 중 오류가 발생했습니다." },
      { status: 500 }
    );
  }
}

// PATCH: 작물 수정
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
    const validatedData = updateCropSchema.parse(body);

    // 소유권 확인
    const existingCrop = await prisma.crop.findFirst({
      where: {
        id,
        userId: session.user.id,
      },
    });

    if (!existingCrop) {
      return NextResponse.json({ error: "작물을 찾을 수 없습니다." }, { status: 404 });
    }

    // 완료 시점 결정 (리뷰 A4): 전이 시 now, 레거시 종료 행은 편집 전 updatedAt으로 고정(추정)
    const completion = resolveCropCompletion(
      {
        status: existingCrop.status,
        completedAt: existingCrop.completedAt,
        completedAtEstimated: existingCrop.completedAtEstimated,
        updatedAt: existingCrop.updatedAt,
      },
      {
        status: validatedData.status,
        completedAt:
          validatedData.completedAt === undefined
            ? undefined
            : validatedData.completedAt === null
              ? null
              : new Date(validatedData.completedAt),
      }
    );

    const crop = await prisma.crop.update({
      where: { id },
      data: {
        ...validatedData,
        plantingDate: validatedData.plantingDate
          ? new Date(validatedData.plantingDate)
          : undefined,
        expectedHarvestDate: validatedData.expectedHarvestDate
          ? new Date(validatedData.expectedHarvestDate)
          : undefined,
        completedAt: completion.completedAt,
        completedAtEstimated: completion.estimated,
      },
    });

    return NextResponse.json({
      message: "작물 정보가 수정되었습니다.",
      crop,
      completedAtEstimated: completion.estimated,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      const firstIssue = error.issues[0];
      return NextResponse.json(
        { error: firstIssue?.message || "입력값이 올바르지 않습니다." },
        { status: 400 }
      );
    }

    console.error("Update crop error:", error);
    return NextResponse.json(
      { error: "작물 수정 중 오류가 발생했습니다." },
      { status: 500 }
    );
  }
}

// DELETE: 작물 삭제
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
    const existingCrop = await prisma.crop.findFirst({
      where: {
        id,
        userId: session.user.id,
      },
    });

    if (!existingCrop) {
      return NextResponse.json({ error: "작물을 찾을 수 없습니다." }, { status: 404 });
    }

    await prisma.crop.delete({
      where: { id },
    });

    return NextResponse.json({ message: "작물이 삭제되었습니다." });
  } catch (error) {
    console.error("Delete crop error:", error);
    return NextResponse.json(
      { error: "작물 삭제 중 오류가 발생했습니다." },
      { status: 500 }
    );
  }
}
