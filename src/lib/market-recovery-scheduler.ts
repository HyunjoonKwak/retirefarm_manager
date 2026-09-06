import cron, { type ScheduledTask } from "node-cron";
import { checkMarketRecovery, getRecoveryState } from "@/lib/services/market-recovery";
import { RECOVERY_INTERVAL_MINUTES } from "@/lib/market-recovery-policy";
const shared = globalThis as typeof globalThis & { marketRecoveryTask?: ScheduledTask };

export function startMarketRecoveryScheduler() {
  if (shared.marketRecoveryTask) return;
  shared.marketRecoveryTask = cron.schedule(`*/${RECOVERY_INTERVAL_MINUTES} * * * *`, async () => {
    await checkMarketRecovery();
  }, { timezone: "Asia/Seoul", noOverlap: true });
  // 웹 서버 시작을 네트워크 보충 작업으로 막지 않는다.
  setTimeout(() => { void checkMarketRecovery(); }, 5000).unref();
}
export function isMarketRecoveryReady(now = Date.now()) {
  const current = getRecoveryState();
  return Boolean(shared.marketRecoveryTask && current.lastHeartbeatAt
    && (current.checking || current.lastCheckOk === true)
    && now - new Date(current.lastHeartbeatAt).getTime() < 35 * 60000);
}
