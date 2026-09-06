import { marketScheduleIssues } from "@/lib/market-schedule-validation";
import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getSessionUser } from "@/lib/auth/guards";
import { getSchedulerStatus } from "@/lib/scheduler";
import { getRecoveryState } from "@/lib/services/market-recovery";
import { RECOVERY_GRACE_MINUTES, RECOVERY_INTERVAL_MINUTES, RECOVERY_LOOKBACK_DAYS, RECOVERY_MAX_ATTEMPTS, recoveryScope } from "@/lib/market-recovery-policy";

export const dynamic = "force-dynamic";
// 로그인한 사용자 본인의 설정에 연결된 결과만 반환한다. 입력 파라미터는 받지 않는다.
export async function GET() {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  try {
    const setting = await prisma.marketCollectionSettings.findUnique({ where: { userId: user.id } });
    const rows = setting ? await prisma.marketRecoveryJob.findMany({
      where: { settingsId: setting.id, scope: recoveryScope(setting) },
      orderBy: [{ targetDate: "desc" }, { updatedAt: "desc" }], take: 30,
      select: { id: true, targetDate: true, status: true, attempts: true, nextAttemptAt: true, lastError: true, updatedAt: true },
    }) : [];
    return NextResponse.json({
      enabled: setting?.autoCollectEnabled ?? false, lookbackDays: RECOVERY_LOOKBACK_DAYS,
      checkIntervalMinutes: RECOVERY_INTERVAL_MINUTES, graceMinutes: RECOVERY_GRACE_MINUTES,
      maxAttempts: RECOVERY_MAX_ATTEMPTS,
      configurationErrors: setting?.autoCollectEnabled ? marketScheduleIssues(setting) : [],
      schedulerReady: getSchedulerStatus().ready, ...getRecoveryState(),
      summary: {
        pending: rows.filter(j => j.status === "PENDING" || (["FAILED", "PARTIAL"].includes(j.status) && j.attempts < RECOVERY_MAX_ATTEMPTS)).length,
        running: rows.filter(j => j.status === "RUNNING").length,
        failed: rows.filter(j => ["FAILED", "PARTIAL"].includes(j.status) && j.attempts >= RECOVERY_MAX_ATTEMPTS).length,
      },
      jobs: rows.map(job => ({ ...job, nextAttemptAt: ["PENDING", "FAILED", "PARTIAL"].includes(job.status) && job.attempts < RECOVERY_MAX_ATTEMPTS ? job.nextAttemptAt : null })),
    });
  } catch {
    return NextResponse.json({ error: "자동 보충 상태를 조회하지 못했습니다." }, { status: 500 });
  }
}
