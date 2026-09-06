/**
 * 시세 데이터 자동 수집 스케줄러
 * node-cron 기반 자동 수집 관리
 */

import cron, { ScheduledTask } from "node-cron";
import prisma from "@/lib/prisma";
import { logger } from "@/lib/logger";
import {
  collectAndSaveAuctionData,
  cleanupOldAuctionData,
} from "@/lib/services/garak-market";

// instrumentation과 라우트가 별도 번들로 로드되어도 같은 프로세스 상태를 공유한다.
const shared = globalThis as typeof globalThis & {
  marketSchedulerState?: { jobs: Map<string, ScheduledTask>; running: Set<string>; expected: Set<string>; initialized: boolean };
};
const state = shared.marketSchedulerState ??= {
  jobs: new Map<string, ScheduledTask>(), running: new Set<string>(), expected: new Set<string>(), initialized: false,
};
const activeCronJobs = state.jobs;
const runningSettings = state.running;

export function getSchedulerStatus() {
  const activeCount = activeCronJobs.size;
  const expectedCount = state.expected.size;
  return { initialized: state.initialized, activeCount, expectedCount,
    ready: state.initialized && activeCount === expectedCount };
}

export function isCollectionRunning(settingsId: string): boolean {
  return runningSettings.has(settingsId);
}

/**
 * 수집 시간(HH:mm)을 cron 표현식으로 변환
 * @param collectTime 수집 시간 (HH:mm 형식)
 * @param collectDays 수집 요일 문자열 (쉼표 구분, 0=일, 6=토)
 */
function toCronExpression(collectTime: string, collectDays: string): string {
  const [hour, minute] = collectTime.split(":").map(Number);
  const days = collectDays || "*";
  return `${minute} ${hour} * * ${days}`;
}

/**
 * 다음 실행 시간 계산 (서버 로컬 기준)
 */
export function getNextRunTime(
  collectTime: string,
  collectDays: string
): Date | null {
  try {
    const [hours, minutes] = collectTime.split(":").map(Number);
    const daysArray = collectDays.split(",").filter(Boolean).map(Number);

    if (daysArray.length === 0) return null;

    const now = new Date();

    for (let i = 0; i <= 7; i++) {
      const targetDate = new Date(now);
      targetDate.setDate(now.getDate() + i);
      targetDate.setHours(hours, minutes, 0, 0);

      if (daysArray.includes(targetDate.getDay()) && targetDate > now) {
        return targetDate;
      }
    }

    return null;
  } catch {
    return null;
  }
}

/**
 * 수집 실행 함수
 * 수집 자체의 성공/실패 로그는 collectAndSaveAuctionData가 법인별로 기록하므로
 * 여기서는 별도 SUCCESS 로그를 남기지 않는다 (이중 기록 방지).
 */
async function executeCollection(settingsId: string) {
  if (runningSettings.has(settingsId)) {
    logger.warn(`[Scheduler] 이전 수집이 아직 실행 중이라 건너뜁니다: ${settingsId}`);
    return;
  }
  runningSettings.add(settingsId);
  try {
    await executeCollectionInner(settingsId);
  } finally {
    runningSettings.delete(settingsId);
  }
}

async function executeCollectionInner(settingsId: string) {
  const settings = await prisma.marketCollectionSettings.findUnique({
    where: { id: settingsId },
  });

  if (!settings) {
    logger.error(`[Scheduler] Settings not found: ${settingsId}`);
    return;
  }

  if (!settings.autoCollectEnabled) {
    logger.info(`[Scheduler] Auto collection disabled: ${settingsId}`);
    return;
  }

  try {
    const targetDate = new Date();
    targetDate.setDate(targetDate.getDate() - settings.collectDaysAgo);

    const corporationCodes = settings.corporationCodes
      .split(",")
      .filter(Boolean);

    // collectAndSaveAuctionData가 쉼표 구분 다품목을 내부에서 분리 처리함
    const result = await collectAndSaveAuctionData(
      targetDate,
      corporationCodes,
      settings.targetProducts || undefined
    );

    logger.info(
      `[Scheduler] Collection done (${settingsId}): status=${result.status}, total=${result.totalCount}, new=${result.newCount}`
    );

    if (!result.complete) {
      logger.warn(
        `[Scheduler] 수집이 완전하지 않아 정리(cleanup)를 건너뜁니다 (${settingsId}): ${result.issues.join(" | ") || result.status}`
      );
    } else if (settings.autoCleanupEnabled) {
      await cleanupOldAuctionData();
    }
  } catch (error) {
    logger.error(`[Scheduler] Collection failed (${settingsId}):`, error);

    await prisma.dataCollectionLog.create({
      data: {
        targetDate: new Date(),
        corporation: settings.corporationCodes,
        targetProducts: settings.targetProducts || null,
        totalCount: 0,
        newCount: 0,
        duplicateCount: 0,
        status: "FAILED",
        errorMessage: error instanceof Error ? error.message : "Unknown error",
        startedAt: new Date(),
        completedAt: new Date(),
      },
    });
  }
}

/**
 * 스케줄 등록
 */
export function registerSchedule(
  settingsId: string,
  collectTime: string,
  collectDays: string
): boolean {
  state.expected.add(settingsId);
  try {
    if (activeCronJobs.has(settingsId)) {
      const existingJob = activeCronJobs.get(settingsId);
      existingJob?.stop();
      activeCronJobs.delete(settingsId);
    }

    const cronExpr = toCronExpression(collectTime, collectDays);

    if (!cron.validate(cronExpr)) {
      logger.error(`[Scheduler] Invalid cron expression: ${cronExpr}`);
      return false;
    }

    const task = cron.schedule(
      cronExpr,
      async () => {
        try { await executeCollection(settingsId); }
        catch (error) { logger.error("[Scheduler] Scheduled execution failed:", error); }
      },
      {
        timezone: "Asia/Seoul",
      }
    );

    activeCronJobs.set(settingsId, task);
    logger.info(
      `[Scheduler] Registered ${settingsId} (${cronExpr}, KST). Active: ${activeCronJobs.size}`
    );

    return true;
  } catch (error) {
    logger.error(`[Scheduler] Failed to register ${settingsId}:`, error);
    return false;
  }
}

/**
 * 스케줄 제거
 */
export function unregisterSchedule(settingsId: string): boolean {
  try {
    state.expected.delete(settingsId);
    const job = activeCronJobs.get(settingsId);
    if (job) {
      job.stop();
      activeCronJobs.delete(settingsId);
      logger.info(`[Scheduler] Unregistered: ${settingsId}`);
      return true;
    }
    return false;
  } catch (error) {
    logger.error(`[Scheduler] Failed to unregister ${settingsId}:`, error);
    return false;
  }
}

/**
 * 모든 cron job 정리
 */
export function clearAllSchedules(): number {
  state.initialized = false;
  state.expected.clear();
  const count = activeCronJobs.size;
  if (count === 0) return 0;

  activeCronJobs.forEach((job) => {
    job.stop();
  });
  activeCronJobs.clear();
  logger.info(`[Scheduler] Cleared ${count} cron job(s)`);
  return count;
}

/**
 * 모든 활성 스케줄 로드 (서버 시작 시)
 */
export async function loadAllSchedules(): Promise<number> {
  try {
    // 기존 스케줄 모두 정리 (Hot Reload 중복 방지)
    clearAllSchedules();

    const settings = await prisma.marketCollectionSettings.findMany({
      where: { autoCollectEnabled: true },
    });

    let loadedCount = 0;
    for (const setting of settings) {
      const success = registerSchedule(
        setting.id,
        setting.collectTime,
        setting.collectDays
      );
      if (success) loadedCount++;
    }

    state.initialized = true;
    // 부팅 진단은 운영 환경에서도 한 줄 남긴다. 사용자/설정 ID는 포함하지 않는다.
    console.info(`[Scheduler] Loaded ${loadedCount}/${settings.length} schedule(s), ready=${getSchedulerStatus().ready}`);
    return loadedCount;
  } catch (error) {
    state.initialized = false;
    logger.error("[Scheduler] Failed to load schedules:", error);
    return 0;
  }
}

/**
 * 스케줄 즉시 실행 (수동 테스트용)
 */
export async function runScheduleNow(settingsId: string): Promise<boolean> {
  try {
    await executeCollection(settingsId);
    return true;
  } catch (error) {
    logger.error(`[Scheduler] Failed to run ${settingsId}:`, error);
    return false;
  }
}

/**
 * 활성 스케줄 목록 조회
 */
export function getActiveSchedules(): string[] {
  return Array.from(activeCronJobs.keys());
}

/**
 * 스케줄 설정 변경 시 재등록
 */
export async function updateSchedule(settingsId: string): Promise<boolean> {
  try {
    const setting = await prisma.marketCollectionSettings.findUnique({
      where: { id: settingsId },
    });

    if (!setting) {
      unregisterSchedule(settingsId);
      return false;
    }

    if (!setting.autoCollectEnabled) {
      unregisterSchedule(settingsId);
      return true;
    }

    return registerSchedule(settingsId, setting.collectTime, setting.collectDays);
  } catch (error) {
    logger.error(`[Scheduler] Failed to update ${settingsId}:`, error);
    return false;
  }
}
