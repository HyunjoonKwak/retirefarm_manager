// @vitest-environment node
import { expect, it } from "vitest";
import { dueRecoveryDates, completedDateStatus, recoveryScope, kstDateStart } from "@/lib/market-recovery-policy";
const setting = { collectTime: "09:30", collectDays: "1,2,3,4,5", collectDaysAgo: 0, corporationCodes: "a,b", targetProducts: "토마토,포도", createdAt: new Date("2026-01-01") };
it("uses Korean dates, scheduled weekdays, and the 60 minute grace period", () => {
  expect(dueRecoveryDates(setting, new Date("2026-09-07T01:29:59Z"))[0]).toBe("2026-09-04");
  expect(dueRecoveryDates(setting, new Date("2026-09-07T01:30:00Z"))[0]).toBe("2026-09-07");
  expect(dueRecoveryDates(setting, new Date("2026-09-07T01:30:00Z"))).not.toContain("2026-09-06");
});
it("respects collection lag and skips schedules before subscription creation", () => {
  expect(dueRecoveryDates({ ...setting, collectDaysAgo: 1, createdAt: new Date("2026-09-07T00:00:00Z") }, new Date("2026-09-07T02:00:00Z"))).toEqual(["2026-09-06"]);
  expect(dueRecoveryDates({ ...setting, collectTime: "29:99" }, new Date())).toEqual([]);
});
it("needs complete logs for every corporation and the same requested products", () => {
  const log = { targetDate: kstDateStart("2026-09-05"), corporation: "a", targetProducts: "포도, 토마토", status: "SUCCESS", startedAt: new Date() };
  expect(completedDateStatus(setting, "2026-09-05", [log])).toBeNull();
  expect(completedDateStatus(setting, "2026-09-05", [log, { ...log, corporation: "b", status: "EMPTY" }])).toBe("SUCCESS");
  expect(completedDateStatus(setting, "2026-09-05", [{ ...log, status: "FAILED" }, log, { ...log, corporation: "b" }])).toBeNull();
  expect(completedDateStatus(setting, "2026-09-05", [log, { ...log, corporation: "b", targetProducts: "딸기" }])).toBeNull();
});
it("condition keys ignore ordering but keep different commodities separate", () => {
  expect(recoveryScope(setting)).toBe(recoveryScope({ corporationCodes: "b,a", targetProducts: "포도, 토마토" }));
  expect(recoveryScope(setting)).not.toBe(recoveryScope({ ...setting, targetProducts: "딸기" }));
});
