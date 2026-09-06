/**
 * 로컬(서버 TZ) 기준 월 구간. 구간은 [start, end) — end는 다음 달 1일 00:00.
 * 월말 23:59:59.999 방식 대신 반개구간을 써서 "월 마지막 날 09:00(KST에 저장된
 * date-only 값)"이 빠지는 문제를 막는다.
 */
export interface MonthRange {
  year: number;
  /** 1-12 */
  month: number;
  /** YYYY-MM */
  key: string;
  start: Date;
  /** exclusive */
  end: Date;
}

export function monthKey(year: number, monthIndex: number): string {
  const normalized = new Date(year, monthIndex, 1);
  return `${normalized.getFullYear()}-${String(normalized.getMonth() + 1).padStart(2, "0")}`;
}

/** monthIndex는 0부터 (Date.getMonth와 동일). 범위를 벗어나면 Date가 정규화한다. */
export function getMonthRange(year: number, monthIndex: number): MonthRange {
  const start = new Date(year, monthIndex, 1);
  const end = new Date(year, monthIndex + 1, 1);
  return {
    year: start.getFullYear(),
    month: start.getMonth() + 1,
    key: monthKey(year, monthIndex),
    start,
    end,
  };
}

export function getMonthRangeOf(date: Date): MonthRange {
  return getMonthRange(date.getFullYear(), date.getMonth());
}

export function addMonths(range: MonthRange, count: number): MonthRange {
  return getMonthRange(range.start.getFullYear(), range.start.getMonth() + count);
}

export function isInMonth(date: Date, range: MonthRange): boolean {
  const time = date.getTime();
  return time >= range.start.getTime() && time < range.end.getTime();
}

/** date가 range보다 앞이면 -1, 안이면 0, 뒤면 1 */
export function compareToMonth(date: Date, range: MonthRange): -1 | 0 | 1 {
  if (date.getTime() < range.start.getTime()) return -1;
  if (date.getTime() >= range.end.getTime()) return 1;
  return 0;
}

/** 연도 구간 [1월 1일, 다음 해 1월 1일) */
export function getYearRange(year: number): { start: Date; end: Date } {
  return { start: new Date(year, 0, 1), end: new Date(year + 1, 0, 1) };
}
