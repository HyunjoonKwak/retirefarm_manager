import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth/options";
import fs from "fs/promises";
import path from "path";

const CONFIG_DIR = process.env.CONFIG_DIR || "/app/config";
const SCHEDULE_FILE = path.join(CONFIG_DIR, "backup-schedule.json");

interface BackupSchedule {
  enabled: boolean;
  dayOfWeek: number; // 0=일요일, 1=월요일, ... 6=토요일
  hour: number; // 0-23
  minute: number; // 0-59
  retentionDays: number; // 백업 보관 일수
}

const DEFAULT_SCHEDULE: BackupSchedule = {
  enabled: true,
  dayOfWeek: 0, // 일요일
  hour: 2, // 새벽 2시
  minute: 0,
  retentionDays: 30, // 30일 보관
};

// GET: 스케줄 설정 조회
export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
    }

    let schedule: BackupSchedule;

    try {
      const data = await fs.readFile(SCHEDULE_FILE, "utf-8");
      schedule = JSON.parse(data);
    } catch {
      // 파일이 없으면 기본값 반환
      schedule = DEFAULT_SCHEDULE;
    }

    return NextResponse.json({ schedule });
  } catch (error) {
    console.error("Get schedule error:", error);
    return NextResponse.json({ error: "스케줄 조회에 실패했습니다." }, { status: 500 });
  }
}

// POST: 스케줄 설정 저장
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
    }

    const body = await request.json();
    const { enabled, dayOfWeek, hour, minute, retentionDays } = body;

    // 유효성 검사
    if (typeof enabled !== "boolean") {
      return NextResponse.json({ error: "enabled는 boolean이어야 합니다." }, { status: 400 });
    }
    if (dayOfWeek < 0 || dayOfWeek > 6) {
      return NextResponse.json({ error: "dayOfWeek는 0-6 사이여야 합니다." }, { status: 400 });
    }
    if (hour < 0 || hour > 23) {
      return NextResponse.json({ error: "hour는 0-23 사이여야 합니다." }, { status: 400 });
    }
    if (minute < 0 || minute > 59) {
      return NextResponse.json({ error: "minute는 0-59 사이여야 합니다." }, { status: 400 });
    }
    if (retentionDays < 1 || retentionDays > 365) {
      return NextResponse.json({ error: "retentionDays는 1-365 사이여야 합니다." }, { status: 400 });
    }

    const schedule: BackupSchedule = {
      enabled,
      dayOfWeek,
      hour,
      minute,
      retentionDays,
    };

    // 설정 디렉토리 생성
    try {
      await fs.access(CONFIG_DIR);
    } catch {
      await fs.mkdir(CONFIG_DIR, { recursive: true });
    }

    // 설정 저장
    await fs.writeFile(SCHEDULE_FILE, JSON.stringify(schedule, null, 2));

    // 크론탭 업데이트 (별도 스크립트 실행)
    // 이 부분은 Docker 환경에 따라 다르게 처리해야 할 수 있음

    return NextResponse.json({
      success: true,
      message: "스케줄이 저장되었습니다.",
      schedule,
    });
  } catch (error) {
    console.error("Save schedule error:", error);
    return NextResponse.json({ error: "스케줄 저장에 실패했습니다." }, { status: 500 });
  }
}
