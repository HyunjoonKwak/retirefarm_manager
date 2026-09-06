/**
 * 스케줄러 관리 API
 * 스케줄러 초기화는 src/instrumentation.ts에서 서버 부팅 시 자동 수행되며,
 * 이 라우트는 상태 확인 / 수동 재초기화 / 즉시 실행용이다.
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import prisma from "@/lib/prisma";
import { logger } from "@/lib/logger";
import { getSessionUser, isAdmin } from "@/lib/auth/guards";
import {
  loadAllSchedules,
  getActiveSchedules,
  runScheduleNow,
  getSchedulerStatus,
} from "@/lib/scheduler";

// GET: 스케줄러 상태 조회 및 재초기화
export async function GET(request: NextRequest) {
  try {
    const user = await getSessionUser();
    if (!user) {
      return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const action = searchParams.get("action");

    if (action === "init") {
      // 전역 스케줄 재로드는 ADMIN 전용 (평시에는 instrumentation.ts가 자동 처리)
      if (!isAdmin(user)) {
        return NextResponse.json({ error: "권한이 없습니다." }, { status: 403 });
      }
      const count = await loadAllSchedules();
      return NextResponse.json({
        message: "Scheduler initialized successfully",
        ...getSchedulerStatus(),
        loadedSchedules: count,
        scheduleIds: getActiveSchedules(),
      });
    }

    const activeSchedules = getActiveSchedules();
    return NextResponse.json({
      ...getSchedulerStatus(),
      activeSchedules: activeSchedules.length,
      scheduleIds: activeSchedules,
    });
  } catch (error) {
    logger.error("Scheduler API error:", error);
    return NextResponse.json(
      { error: "스케줄러 API 오류가 발생했습니다." },
      { status: 500 }
    );
  }
}

const runNowSchema = z.object({
  settingsId: z.string().min(1, "settingsId가 필요합니다."),
});

// POST: 스케줄 즉시 실행 (본인 설정 또는 ADMIN만)
export async function POST(request: NextRequest) {
  try {
    const user = await getSessionUser();
    if (!user) {
      return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
    }

    const body = await request.json();
    const parsed = runNowSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message || "잘못된 요청입니다." },
        { status: 400 }
      );
    }

    const settings = await prisma.marketCollectionSettings.findUnique({
      where: { id: parsed.data.settingsId },
      select: { userId: true },
    });

    if (!settings) {
      return NextResponse.json(
        { error: "설정을 찾을 수 없습니다." },
        { status: 404 }
      );
    }

    if (settings.userId !== user.id && !isAdmin(user)) {
      return NextResponse.json({ error: "권한이 없습니다." }, { status: 403 });
    }

    const success = await runScheduleNow(parsed.data.settingsId);

    return NextResponse.json({
      success,
      message: success
        ? "스케줄이 실행되었습니다."
        : "스케줄 실행에 실패했습니다.",
    });
  } catch (error) {
    logger.error("Run schedule error:", error);
    return NextResponse.json(
      { error: "스케줄 실행 중 오류가 발생했습니다." },
      { status: 500 }
    );
  }
}
