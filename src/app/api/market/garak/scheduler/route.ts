/**
 * 스케줄러 관리 API
 * 서버 시작 시 스케줄러 초기화 및 상태 확인
 */

import { NextRequest, NextResponse } from "next/server";
import {
  loadAllSchedules,
  getActiveSchedules,
  runScheduleNow,
} from "@/lib/scheduler";

// 스케줄러 초기화 상태
let isInitialized = false;

// GET: 스케줄러 상태 조회 및 초기화
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const action = searchParams.get("action");

    // 초기화 액션
    if (action === "init") {
      if (isInitialized) {
        const activeSchedules = getActiveSchedules();
        return NextResponse.json({
          message: "Scheduler already initialized",
          initialized: true,
          activeSchedules: activeSchedules.length,
          scheduleIds: activeSchedules,
        });
      }

      console.log("🚀 [API] Initializing scheduler via API call...");
      const count = await loadAllSchedules();
      isInitialized = true;

      return NextResponse.json({
        message: "Scheduler initialized successfully",
        initialized: true,
        loadedSchedules: count,
        scheduleIds: getActiveSchedules(),
      });
    }

    // 상태 조회
    const activeSchedules = getActiveSchedules();
    return NextResponse.json({
      initialized: isInitialized,
      activeSchedules: activeSchedules.length,
      scheduleIds: activeSchedules,
    });
  } catch (error) {
    console.error("Scheduler API error:", error);
    return NextResponse.json(
      { error: "스케줄러 API 오류가 발생했습니다.", details: String(error) },
      { status: 500 }
    );
  }
}

// POST: 스케줄 즉시 실행
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { settingsId } = body;

    if (!settingsId) {
      return NextResponse.json(
        { error: "settingsId가 필요합니다." },
        { status: 400 }
      );
    }

    console.log(`▶️ [API] Running schedule now: ${settingsId}`);
    const success = await runScheduleNow(settingsId);

    return NextResponse.json({
      success,
      message: success ? "스케줄이 실행되었습니다." : "스케줄 실행에 실패했습니다.",
    });
  } catch (error) {
    console.error("Run schedule error:", error);
    return NextResponse.json(
      { error: "스케줄 실행 중 오류가 발생했습니다." },
      { status: 500 }
    );
  }
}
