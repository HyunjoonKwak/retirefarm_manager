import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { z } from "zod";
import prisma from "@/lib/prisma";
import { authOptions } from "@/lib/auth/options";
import { blockNoteContentSchema } from "@/lib/utils/blocknote";

const updateLogSchema = z.object({
  temperature: z.number().min(-50).max(60).optional(),
  humidity: z.number().min(0).max(100).optional(),
  rainfall: z.number().min(0).optional(),
  weather: z.string().optional(),
  notes: z.string().optional(),
  content: blockNoteContentSchema.optional(),
});

// GET: 개별 영농일지 조회
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

    const log = await prisma.farmingLog.findFirst({
      where: {
        id,
        userId: session.user.id,
      },
      include: {
        activities: {
          include: {
            crop: {
              select: { id: true, name: true, variety: true },
            },
            materialUsages: {
              include: {
                item: {
                  select: { id: true, name: true, unit: true },
                },
              },
            },
          },
        },
      },
    });

    if (!log) {
      return NextResponse.json({ error: "일지를 찾을 수 없습니다." }, { status: 404 });
    }

    return NextResponse.json({
      log: {
        ...log,
        temperature: log.temperature ? Number(log.temperature) : null,
        rainfall: log.rainfall ? Number(log.rainfall) : null,
        activities: log.activities.map((activity) => ({
          ...activity,
          quantity: activity.quantity ? Number(activity.quantity) : null,
          materialUsages: activity.materialUsages.map((usage) => ({
            ...usage,
            quantity: Number(usage.quantity),
          })),
        })),
      },
    });
  } catch (error) {
    console.error("Get log error:", error);
    return NextResponse.json(
      { error: "일지 조회 중 오류가 발생했습니다." },
      { status: 500 }
    );
  }
}

// PATCH: 영농일지 수정
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
    const validatedData = updateLogSchema.parse(body);

    // 소유권 확인
    const existingLog = await prisma.farmingLog.findFirst({
      where: {
        id,
        userId: session.user.id,
      },
    });

    if (!existingLog) {
      return NextResponse.json({ error: "일지를 찾을 수 없습니다." }, { status: 404 });
    }

    const log = await prisma.farmingLog.update({
      where: { id },
      data: validatedData,
      include: {
        activities: true,
      },
    });

    return NextResponse.json({
      message: "일지가 수정되었습니다.",
      log: {
        ...log,
        temperature: log.temperature ? Number(log.temperature) : null,
        rainfall: log.rainfall ? Number(log.rainfall) : null,
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

    console.error("Update log error:", error);
    return NextResponse.json(
      { error: "일지 수정 중 오류가 발생했습니다." },
      { status: 500 }
    );
  }
}

// DELETE: 영농일지 삭제
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
    const existingLog = await prisma.farmingLog.findFirst({
      where: {
        id,
        userId: session.user.id,
      },
    });

    if (!existingLog) {
      return NextResponse.json({ error: "일지를 찾을 수 없습니다." }, { status: 404 });
    }

    await prisma.farmingLog.delete({
      where: { id },
    });

    return NextResponse.json({ message: "일지가 삭제되었습니다." });
  } catch (error) {
    console.error("Delete log error:", error);
    return NextResponse.json(
      { error: "일지 삭제 중 오류가 발생했습니다." },
      { status: 500 }
    );
  }
}
