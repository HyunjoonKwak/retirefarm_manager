/**
 * Next.js Instrumentation
 * 서버 시작 시 실행되는 초기화 코드 (시세 자동 수집 스케줄러 로드)
 */

export async function register() {
  // 빌드 시에는 실행하지 않음 (DB 연결 불가)
  if (process.env.NEXT_PHASE === "phase-production-build") {
    return;
  }

  // 서버 환경에서만 실행
  if (process.env.NEXT_RUNTIME === "nodejs") {
    try {
      const { loadAllSchedules } = await import("@/lib/scheduler");
      const { logger } = await import("@/lib/logger");
      const count = await loadAllSchedules();
      logger.info(`[Instrumentation] Scheduler initialized: ${count} schedule(s)`);
    } catch (error) {
      console.error("[Instrumentation] Failed to initialize schedulers:", error);
    }
  }
}
