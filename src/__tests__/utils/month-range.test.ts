import { describe, it, expect } from "vitest";
import {
  getMonthRange,
  getMonthRangeOf,
  addMonths,
  isInMonth,
  compareToMonth,
  monthKey,
} from "@/lib/utils/month-range";

describe("month-range", () => {
  it("구간은 [1일 00:00, 다음 달 1일 00:00) 이다", () => {
    const range = getMonthRange(2026, 8); // 2026-09
    expect(range.key).toBe("2026-09");
    expect(range.start).toEqual(new Date(2026, 8, 1));
    expect(range.end).toEqual(new Date(2026, 9, 1));
  });

  it("월 마지막 날 09:00 (KST에 저장된 date-only 값)도 그 달에 포함된다", () => {
    const range = getMonthRange(2026, 8);
    const lastDayMorning = new Date(2026, 8, 30, 9, 0, 0);
    const lastDayLate = new Date(2026, 8, 30, 23, 59, 59, 999);
    const nextMonthStart = new Date(2026, 9, 1, 0, 0, 0);
    expect(isInMonth(lastDayMorning, range)).toBe(true);
    expect(isInMonth(lastDayLate, range)).toBe(true);
    expect(isInMonth(nextMonthStart, range)).toBe(false);
    expect(compareToMonth(nextMonthStart, range)).toBe(1);
    expect(compareToMonth(new Date(2026, 7, 31), range)).toBe(-1);
  });

  it("addMonths와 monthKey는 연도 경계를 넘어 정규화한다", () => {
    const range = getMonthRangeOf(new Date(2026, 10, 15));
    expect(addMonths(range, 3).key).toBe("2027-02");
    expect(monthKey(2026, 12)).toBe("2027-01");
  });
});
