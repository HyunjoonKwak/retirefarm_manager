/**
 * 외부 자산 스냅샷 합산 조회 (Asset Hub Integration §2, §6 자본 준비)
 *
 * GET  — 캐시 기반 요약 (TTL 초과 시 자동 수집)
 * POST — 수동 갱신 (수집 강제 후 요약 반환)
 *
 * 읽기 전용 소비자 — 자산 값을 수정하는 경로는 없다 (§1.5 지배 원칙).
 */

import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth/options";
import { getSnapshotSummary } from "@/lib/services/external-snapshot";
import { logger } from "@/lib/logger";

export const dynamic = "force-dynamic";

async function handle(forceRefresh: boolean) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json(
      { success: false, error: "로그인이 필요합니다." },
      { status: 401 }
    );
  }

  try {
    const summary = await getSnapshotSummary({ forceRefresh });
    return NextResponse.json({ success: true, data: summary });
  } catch (error) {
    logger.error("Snapshot summary error:", error);
    return NextResponse.json(
      { success: false, error: "스냅샷 요약 조회에 실패했습니다." },
      { status: 500 }
    );
  }
}

export async function GET() {
  return handle(false);
}

export async function POST() {
  return handle(true);
}
