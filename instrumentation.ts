/**
 * Next.js Instrumentation
 * 서버 시작 시 실행되는 초기화 코드
 */

export async function register() {
  // 빌드 시에는 실행하지 않음 (DB 연결 불가)
  if (process.env.NEXT_PHASE === "phase-production-build") {
    console.log("⏭️  Skipping scheduler initialization (build time)");
    return;
  }

  // 서버 환경에서만 실행
  if (process.env.NEXT_RUNTIME === "nodejs") {
    console.log("🚀 Server starting - Initializing market data scheduler...");

    try {
      const { loadAllSchedules } = await import("@/lib/scheduler");
      const count = await loadAllSchedules();
      console.log(`✅ Scheduler initialization complete: ${count} schedule(s) loaded`);
    } catch (error) {
      console.error("❌ Failed to initialize schedulers:", error);
    }
  }
}
