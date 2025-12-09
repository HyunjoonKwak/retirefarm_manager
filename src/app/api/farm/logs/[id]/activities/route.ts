import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { z } from "zod";
import prisma from "@/lib/prisma";
import { authOptions } from "@/lib/auth/options";

const createActivitySchema = z.object({
  type: z.enum([
    "SEEDING",
    "TRANSPLANTING",
    "WATERING",
    "FERTILIZING",
    "PEST_CONTROL",
    "PRUNING",
    "HARVESTING",
    "PACKING",
    "SHIPPING",
    "MAINTENANCE",
    "OTHER",
  ]),
  cropId: z.string().optional(),
  plotId: z.string().optional(),
  description: z.string().min(1, "작업 내용을 입력해주세요."),
  quantity: z.number().min(0).optional(),
  unit: z.string().optional(),
  duration: z.number().min(0).optional(),
  workers: z.number().min(1).optional(),
});

// POST: 활동 추가
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.id) {
      return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
    }

    const { id: logId } = await params;
    const body = await request.json();
    const validatedData = createActivitySchema.parse(body);

    // 일지 소유권 확인
    const log = await prisma.farmingLog.findFirst({
      where: {
        id: logId,
        userId: session.user.id,
      },
    });

    if (!log) {
      return NextResponse.json({ error: "일지를 찾을 수 없습니다." }, { status: 404 });
    }

    // 작물 존재 확인 (선택된 경우)
    if (validatedData.cropId) {
      const crop = await prisma.crop.findFirst({
        where: {
          id: validatedData.cropId,
          userId: session.user.id,
        },
      });

      if (!crop) {
        return NextResponse.json({ error: "작물을 찾을 수 없습니다." }, { status: 404 });
      }
    }

    const activity = await prisma.farmActivity.create({
      data: {
        logId,
        type: validatedData.type,
        cropId: validatedData.cropId || null,
        plotId: validatedData.plotId || null,
        description: validatedData.description,
        quantity: validatedData.quantity,
        unit: validatedData.unit,
        duration: validatedData.duration,
        workers: validatedData.workers,
      },
      include: {
        crop: {
          select: { id: true, name: true },
        },
      },
    });

    return NextResponse.json({
      message: "활동이 추가되었습니다.",
      activity: {
        ...activity,
        quantity: activity.quantity ? Number(activity.quantity) : null,
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

    console.error("Create activity error:", error);
    return NextResponse.json(
      { error: "활동 추가 중 오류가 발생했습니다." },
      { status: 500 }
    );
  }
}
