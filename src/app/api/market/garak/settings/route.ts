import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { z } from "zod";
import prisma from "@/lib/prisma";
import { logger } from "@/lib/logger";
import { authOptions } from "@/lib/auth/options";
import { CORPORATION_CODES } from "@/lib/services/garak-market";
import { updateSchedule } from "@/lib/scheduler";

const updateSettingsSchema = z.object({
  autoCollectEnabled: z.boolean().optional(),
  collectTime: z.string().regex(/^(?:[01]\d|2[0-3]):[0-5]\d$/, "수집 시각은 00:00~23:59 범위여야 합니다.").optional(),
  collectDaysAgo: z.number().int().min(0).max(7).optional(), // 0=오늘, 1=어제, ...
  collectDays: z.array(z.number().int().min(0).max(6)).min(1, "수집 요일을 한 개 이상 선택해 주세요.").max(7).optional(), // 0=일, 1=월, ..., 6=토
  corporationCodes: z.array(z.string()).optional(),
  targetProducts: z.array(z.string()).optional(),
  retentionDays: z.number().int().min(7).max(365).optional(),
  autoCleanupEnabled: z.boolean().optional(),
  defaultViewDays: z.number().int().min(7).max(90).optional(),
});

// GET: 설정 조회
export async function GET() {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.id) {
      return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
    }

    // 사용자 설정 조회 또는 기본값 반환
    let settings = await prisma.marketCollectionSettings.findUnique({
      where: { userId: session.user.id },
    });

    // 설정이 없으면 기본값 생성
    if (!settings) {
      settings = await prisma.marketCollectionSettings.create({
        data: {
          userId: session.user.id,
        },
      });
    }

    // 법인코드를 배열로 변환
    const corporationCodes = settings.corporationCodes.split(",").filter(Boolean);
    // 대상 품목을 배열로 변환
    const targetProducts = settings.targetProducts.split(",").filter(Boolean);
    // 수집 요일을 배열로 변환
    const collectDays = settings.collectDays.split(",").filter(Boolean).map(Number);

    // 법인 목록 (선택 가능한 옵션)
    const availableCorporations = Object.entries(CORPORATION_CODES).map(([code, name]) => ({
      code,
      name,
      selected: corporationCodes.includes(code),
    }));

    return NextResponse.json({
      settings: {
        ...settings,
        corporationCodes,
        targetProducts,
        collectDays,
      },
      availableCorporations,
    });
  } catch (error) {
    logger.error("Get market settings error:", error);
    return NextResponse.json(
      { error: "설정 조회 중 오류가 발생했습니다." },
      { status: 500 }
    );
  }
}

// PATCH: 설정 업데이트
export async function PATCH(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.id) {
      return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
    }

    const body = await request.json();
    const validatedData = updateSettingsSchema.parse(body);

    // 법인코드 배열을 문자열로 변환
    const updateData: Record<string, unknown> = {};

    if (validatedData.autoCollectEnabled !== undefined) {
      updateData.autoCollectEnabled = validatedData.autoCollectEnabled;
    }
    if (validatedData.collectTime !== undefined) {
      updateData.collectTime = validatedData.collectTime;
    }
    if (validatedData.collectDaysAgo !== undefined) {
      updateData.collectDaysAgo = validatedData.collectDaysAgo;
    }
    if (validatedData.collectDays !== undefined) {
      updateData.collectDays = validatedData.collectDays.join(",");
    }
    if (validatedData.corporationCodes !== undefined) {
      // 유효한 법인코드만 필터링
      const validCodes = validatedData.corporationCodes.filter(
        (code) => code in CORPORATION_CODES
      );
      updateData.corporationCodes = validCodes.join(",");
    }
    if (validatedData.targetProducts !== undefined) {
      updateData.targetProducts = validatedData.targetProducts.join(",");
    }
    if (validatedData.retentionDays !== undefined) {
      updateData.retentionDays = validatedData.retentionDays;
    }
    if (validatedData.autoCleanupEnabled !== undefined) {
      updateData.autoCleanupEnabled = validatedData.autoCleanupEnabled;
    }
    if (validatedData.defaultViewDays !== undefined) {
      updateData.defaultViewDays = validatedData.defaultViewDays;
    }

    const settings = await prisma.marketCollectionSettings.upsert({
      where: { userId: session.user.id },
      update: updateData,
      create: {
        userId: session.user.id,
        ...updateData,
      },
    });

    // 스케줄 재등록 (자동 수집 설정이 변경되었을 수 있으므로)
    try {
      await updateSchedule(settings.id);
    } catch (scheduleError) {
      logger.error("[Settings] Failed to update schedule:", scheduleError);
      // 스케줄 업데이트 실패해도 설정 저장은 성공으로 처리
    }

    return NextResponse.json({
      message: "설정이 저장되었습니다.",
      settings,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: error.issues[0]?.message || "입력값이 올바르지 않습니다." },
        { status: 400 }
      );
    }

    logger.error("Update market settings error:", error);
    return NextResponse.json(
      { error: "설정 저장 중 오류가 발생했습니다." },
      { status: 500 }
    );
  }
}
