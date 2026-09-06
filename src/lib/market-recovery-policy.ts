import { createHash } from "node:crypto";

export const RECOVERY_LOOKBACK_DAYS = 7;
export const RECOVERY_INTERVAL_MINUTES = 15;
export const RECOVERY_GRACE_MINUTES = 60;
export const RECOVERY_MAX_ATTEMPTS = 3;
const DAY = 86400000;
const KST = 9 * 3600000;
export interface RecoverySettings {
  collectTime: string; collectDays: string; collectDaysAgo: number;
  corporationCodes: string; targetProducts: string; createdAt: Date;
}
export function canonicalList(value: string | null): string {
  return [...new Set((value ?? "").split(",").map(s => s.trim()).filter(Boolean))].sort().join(",");
}
export function recoveryScope(setting: Pick<RecoverySettings, "corporationCodes" | "targetProducts">): string {
  return createHash("sha256").update(JSON.stringify([canonicalList(setting.corporationCodes), canonicalList(setting.targetProducts)])).digest("hex");
}
export function kstDateKey(date: Date): string { return new Date(date.getTime() + KST).toISOString().slice(0, 10); }
export function kstDateStart(date: string): Date { return new Date(`${date}T00:00:00+09:00`); }

/** 최근 7일의 예약 중 유예 시간을 지난 날짜만 반환한다. 서버 TZ에 의존하지 않는다. */
export function dueRecoveryDates(setting: RecoverySettings, now: Date): string[] {
  if (!/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(setting.collectTime)
    || !Number.isInteger(setting.collectDaysAgo) || setting.collectDaysAgo < 0 || setting.collectDaysAgo > 7) return [];
  const days = setting.collectDays.split(",").filter(Boolean).map(Number);
  if (!days.length || days.some(d => !Number.isInteger(d) || d < 0 || d > 6)) return [];
  const [hour, minute] = setting.collectTime.split(":").map(Number);
  const today = kstDateStart(kstDateKey(now)).getTime();
  return Array.from({ length: RECOVERY_LOOKBACK_DAYS }, (_, i) => today - i * DAY)
    .filter(start => {
      const scheduledAt = start + (hour * 60 + minute) * 60000;
      return days.includes(new Date(start + KST).getUTCDay())
        && scheduledAt >= setting.createdAt.getTime()
        && scheduledAt + RECOVERY_GRACE_MINUTES * 60000 <= now.getTime();
    })
    .map(start => kstDateKey(new Date(start - setting.collectDaysAgo * DAY)));
}
export interface RecoveryLog {
  targetDate: Date; corporation: string; targetProducts: string | null;
  status: string; startedAt: Date;
}
/** 호출자는 최신순 로그를 넘긴다. 다른 품목/법인의 성공으로 누락을 덮지 않는다. */
export function completedDateStatus(setting: RecoverySettings, targetDate: string, logs: RecoveryLog[]): "SUCCESS" | "EMPTY" | null {
  const products = canonicalList(setting.targetProducts);
  const codes = canonicalList(setting.corporationCodes).split(",").filter(Boolean);
  if (!codes.length) return null;
  const statuses = codes.map(code => logs.find(log =>
    log.corporation === code && kstDateKey(log.targetDate) === targetDate
      && canonicalList(log.targetProducts) === products)?.status);
  if (!statuses.every(status => status === "SUCCESS" || status === "EMPTY")) return null;
  return statuses.every(status => status === "EMPTY") ? "EMPTY" : "SUCCESS";
}
