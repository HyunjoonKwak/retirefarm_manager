/** Diagnose only the requesting user's stored schedule; never turn an invalid job into ready. */
export function marketScheduleIssues(setting: { collectTime: string; collectDays: string; collectDaysAgo: number }): string[] {
  const issues: string[] = [];
  if (!/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(setting.collectTime)) issues.push("수집 시각을 00:00~23:59 범위로 다시 저장해 주세요.");
  const parts = setting.collectDays.split(",");
  if (!parts.length || parts.some(day => !/^[0-6]$/.test(day))) issues.push("수집 요일을 한 개 이상 다시 선택해 주세요.");
  if (!Number.isInteger(setting.collectDaysAgo) || setting.collectDaysAgo < 0 || setting.collectDaysAgo > 7) issues.push("수집 대상일을 0~7일 전 범위로 다시 저장해 주세요.");
  return issues;
}
