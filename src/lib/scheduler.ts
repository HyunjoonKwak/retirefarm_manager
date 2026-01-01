/**
 * 시세 데이터 자동 수집 스케줄러
 * node-cron 기반 자동 수집 관리
 */

import cron, { ScheduledTask } from "node-cron";
import prisma from "@/lib/prisma";
import { collectAndSaveAuctionData } from "@/lib/services/garak-market";

// 활성화된 Cron Job들을 저장하는 맵
const activeCronJobs = new Map<string, ScheduledTask>();

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
 * 다음 실행 시간 계산 (KST 기준)
 */
export function getNextRunTime(collectTime: string, collectDays: string): Date | null {
  try {
    const [hours, minutes] = collectTime.split(":").map(Number);
    const daysArray = collectDays.split(",").filter(Boolean).map(Number);

    if (daysArray.length === 0) return null;

    const now = new Date();

    // 오늘부터 7일간 확인
    for (let i = 0; i < 7; i++) {
      const targetDate = new Date(now);
      targetDate.setDate(now.getDate() + i);
      targetDate.setHours(hours, minutes, 0, 0);

      const targetDayOfWeek = targetDate.getDay();

      // 해당 요일이 수집 요일에 포함되고, 미래 시간인 경우
      if (daysArray.includes(targetDayOfWeek) && targetDate > now) {
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
 */
async function executeCollection(settingsId: string) {
  console.log(`🚀 [Scheduler] Executing collection for settings: ${settingsId}`);

  const settings = await prisma.marketCollectionSettings.findUnique({
    where: { id: settingsId },
    include: { user: { select: { name: true, email: true } } },
  });

  if (!settings) {
    console.error(`❌ [Scheduler] Settings not found: ${settingsId}`);
    return;
  }

  if (!settings.autoCollectEnabled) {
    console.log(`⏭️ [Scheduler] Auto collection disabled for: ${settingsId}`);
    return;
  }

  const userName = settings.user?.name || settings.user?.email || "Unknown";
  console.log(`   User: ${userName}`);

  try {
    // 수집 대상 날짜 계산
    const targetDate = new Date();
    targetDate.setDate(targetDate.getDate() - settings.collectDaysAgo);

    const corporationCodes = settings.corporationCodes.split(",").filter(Boolean);
    const targetProducts = settings.targetProducts.split(",").filter(Boolean);

    console.log(`   Target date: ${targetDate.toISOString().split("T")[0]}`);
    console.log(`   Corporations: ${corporationCodes.join(", ")}`);
    console.log(`   Products: ${targetProducts.length > 0 ? targetProducts.join(", ") : "전체"}`);

    let totalCount = 0;
    let newCount = 0;

    // 각 대상 품목별로 수집
    if (targetProducts.length > 0) {
      for (const product of targetProducts) {
        console.log(`   Collecting: ${product}`);
        const result = await collectAndSaveAuctionData(
          targetDate,
          corporationCodes,
          product.trim()
        );
        totalCount += result.totalCount;
        newCount += result.newCount;
      }
    } else {
      // 대상 품목이 없으면 전체 수집
      const result = await collectAndSaveAuctionData(
        targetDate,
        corporationCodes
      );
      totalCount = result.totalCount;
      newCount = result.newCount;
    }

    console.log(`✅ [Scheduler] Collection completed: ${totalCount} total, ${newCount} new`);

    // 수집 로그 저장
    await prisma.dataCollectionLog.create({
      data: {
        targetDate,
        corporation: corporationCodes.join(","),
        targetProducts: targetProducts.join(",") || null,
        totalCount,
        newCount,
        duplicateCount: totalCount - newCount,
        status: "SUCCESS",
        startedAt: new Date(),
        completedAt: new Date(),
      },
    });

    // 자동 정리가 활성화된 경우 오래된 데이터 정리
    if (settings.autoCleanupEnabled) {
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - settings.retentionDays);

      const deleted = await prisma.auctionResult.deleteMany({
        where: {
          auctionDate: { lt: cutoffDate },
        },
      });

      if (deleted.count > 0) {
        console.log(`🧹 [Scheduler] Cleaned up ${deleted.count} old records`);
      }
    }
  } catch (error) {
    console.error(`❌ [Scheduler] Collection failed:`, error);

    // 실패 로그 저장
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
export function registerSchedule(settingsId: string, collectTime: string, collectDays: string): boolean {
  try {
    // 기존 스케줄이 있으면 제거
    if (activeCronJobs.has(settingsId)) {
      console.log(`   Removing existing schedule: ${settingsId}`);
      const existingJob = activeCronJobs.get(settingsId);
      existingJob?.stop();
      activeCronJobs.delete(settingsId);
    }

    // Cron 표현식 생성
    const cronExpr = toCronExpression(collectTime, collectDays);

    // Cron 표현식 검증
    if (!cron.validate(cronExpr)) {
      console.error(`   ❌ Invalid cron expression: ${cronExpr}`);
      return false;
    }

    console.log(`   Creating cron job: ${cronExpr} (timezone: Asia/Seoul)`);

    // Cron Job 생성
    const task = cron.schedule(
      cronExpr,
      () => {
        console.log(`🕐 [Scheduler] Cron triggered for: ${settingsId}`);
        executeCollection(settingsId);
      },
      {
        timezone: "Asia/Seoul",
      }
    );

    activeCronJobs.set(settingsId, task);
    console.log(`   ✅ Schedule registered: ${settingsId}`);
    console.log(`   Active schedules: ${activeCronJobs.size}`);

    return true;
  } catch (error) {
    console.error(`   ❌ Failed to register schedule ${settingsId}:`, error);
    return false;
  }
}

/**
 * 스케줄 제거
 */
export function unregisterSchedule(settingsId: string): boolean {
  try {
    const job = activeCronJobs.get(settingsId);
    if (job) {
      job.stop();
      activeCronJobs.delete(settingsId);
      console.log(`✅ Schedule unregistered: ${settingsId}`);
      return true;
    }
    return false;
  } catch (error) {
    console.error(`Failed to unregister schedule ${settingsId}:`, error);
    return false;
  }
}

/**
 * 모든 cron job 정리
 */
export function clearAllSchedules(): number {
  const count = activeCronJobs.size;
  if (count === 0) {
    console.log("🧹 No existing cron jobs to clear");
    return 0;
  }

  console.log(`🧹 Clearing ${count} existing cron job(s)...`);
  activeCronJobs.forEach((job, settingsId) => {
    console.log(`   Stopping: ${settingsId}`);
    job.stop();
  });
  activeCronJobs.clear();
  console.log("✅ All cron jobs cleared");
  return count;
}

/**
 * 모든 활성 스케줄 로드 (서버 시작 시)
 */
export async function loadAllSchedules(): Promise<number> {
  try {
    // 기존 스케줄 모두 정리 (Hot Reload 중복 방지)
    clearAllSchedules();

    console.log("📅 Loading all active market collection schedules...");
    console.log(`   Current time: ${new Date().toISOString()}`);
    console.log(`   KST: ${new Date().toLocaleString("ko-KR", { timeZone: "Asia/Seoul" })}`);

    const settings = await prisma.marketCollectionSettings.findMany({
      where: {
        autoCollectEnabled: true,
      },
      include: {
        user: {
          select: { name: true, email: true },
        },
      },
    });

    console.log(`   Found ${settings.length} active schedule(s) in DB`);

    let loadedCount = 0;
    for (const setting of settings) {
      const userName = setting.user?.name || setting.user?.email || "Unknown";
      console.log(`   Registering schedule for user: ${userName}`);
      console.log(`     Time: ${setting.collectTime}`);
      console.log(`     Days: ${setting.collectDays}`);
      console.log(`     Products: ${setting.targetProducts || "전체"}`);

      const success = registerSchedule(
        setting.id,
        setting.collectTime,
        setting.collectDays
      );

      if (success) {
        loadedCount++;
        const nextRun = getNextRunTime(setting.collectTime, setting.collectDays);
        console.log(`     Next run: ${nextRun ? nextRun.toLocaleString("ko-KR", { timeZone: "Asia/Seoul" }) : "N/A"}`);
      }
    }

    console.log(`✅ Loaded ${loadedCount}/${settings.length} schedule(s)`);
    return loadedCount;
  } catch (error) {
    console.error("❌ Failed to load schedules:", error);
    return 0;
  }
}

/**
 * 스케줄 즉시 실행 (수동 테스트용)
 */
export async function runScheduleNow(settingsId: string): Promise<boolean> {
  try {
    console.log(`▶️ Running schedule immediately: ${settingsId}`);
    await executeCollection(settingsId);
    return true;
  } catch (error) {
    console.error(`Failed to run schedule ${settingsId}:`, error);
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
    console.error(`Failed to update schedule ${settingsId}:`, error);
    return false;
  }
}
