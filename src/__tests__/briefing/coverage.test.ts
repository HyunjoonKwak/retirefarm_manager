// @vitest-environment node
import { describe, expect, it } from "vitest";
import { summarizeCoverage, type CoverageLog } from "@/lib/briefing/coverage";

// Week of 2026-08-31 (Mon) .. 2026-09-06 (Sun) in KST: [2026-08-30T15:00Z, 2026-09-06T15:00Z)
const START = new Date("2026-08-31T00:00:00+09:00");
const END = new Date("2026-09-07T00:00:00+09:00");
const NOW = new Date("2026-09-14T10:00:00+09:00");
const CORPS = ["11000101", "11000102"];
const PRODUCT = "토마토";

type LogOverrides = Partial<Omit<CoverageLog, "targetDate">> & { targetDate: Date | string };
const log = (overrides: LogOverrides): CoverageLog => {
  const targetDate = new Date(overrides.targetDate);
  const startedAt = overrides.startedAt ?? new Date(targetDate.getTime() + 10 * 3600_000);
  return {
    id: overrides.id ?? `log-${startedAt.toISOString()}`,
    corporation: overrides.corporation ?? "11000101",
    targetProducts: overrides.targetProducts === undefined ? PRODUCT : overrides.targetProducts,
    status: overrides.status ?? "SUCCESS",
    completedAt: overrides.completedAt === undefined ? new Date(startedAt.getTime() + 60_000) : overrides.completedAt,
    ...overrides,
    targetDate,
    startedAt,
  };
};
const kstMidnight = (day: string) => `${day}T00:00:00+09:00`;
const weekDays = ["2026-08-31", "2026-09-01", "2026-09-02", "2026-09-03", "2026-09-04", "2026-09-05", "2026-09-06"];
const weekLogs = (corporation: string, status = "SUCCESS") => weekDays.map((d) => log({ corporation, status, targetDate: kstMidnight(d) }));
const run = (logs: CoverageLog[], overrides: Partial<Parameters<typeof summarizeCoverage>[0]> = {}) =>
  summarizeCoverage({ start: START, end: END, corporations: CORPS, productName: PRODUCT, logs, now: NOW, ...overrides });

describe("summarizeCoverage", () => {
  it("builds 7 days × distinct corporations and marks every slot UNKNOWN when no records exist", () => {
    const result = run([]);
    expect(result.periodStart).toBe(START.toISOString());
    expect(result.periodEnd).toBe(END.toISOString());
    expect(result.totalSlots).toBe(14);
    expect(result.unknownSlots).toBe(14);
    expect(result.verifiedSlots).toBe(0);
    expect(result.issues).toHaveLength(14);
    expect(result.issues[0]).toEqual({ date: "2026-08-31", corporationCode: "11000101", status: "UNKNOWN" });
    expect(result.issues[13]).toEqual({ date: "2026-09-06", corporationCode: "11000102", status: "UNKNOWN" });
  });

  it("supports a 28-day window", () => {
    const result = run([], { start: new Date("2026-08-10T00:00:00+09:00"), end: END, corporations: ["11000101"] });
    expect(result.totalSlots).toBe(28);
    expect(result.issues[0].date).toBe("2026-08-10");
    expect(result.issues[27].date).toBe("2026-09-06");
  });

  it("counts a fully verified week with SUCCESS and EMPTY as verified, EMPTY as subset", () => {
    const logs = [...weekLogs("11000101"), ...weekLogs("11000102").map((l, i) => (i === 6 ? { ...l, status: "EMPTY" } : l))];
    const result = run(logs);
    expect(result.verifiedSlots).toBe(14);
    expect(result.emptySlots).toBe(1);
    expect(result.unknownSlots).toBe(0);
    expect(result.issues).toEqual([]);
  });

  it("resolves KST day boundaries: 23:59 KST stays on that day, 00:00 KST of end is excluded", () => {
    const logs = [
      log({ targetDate: "2026-08-31T23:59:59+09:00" }), // 2026-08-31 KST (14:59 UTC)
      log({ targetDate: "2026-08-30T23:59:59+09:00" }), // before window
      log({ targetDate: "2026-09-07T00:00:00+09:00" }), // end, excluded
      log({ targetDate: "2026-09-06T18:00:00Z" }), // 2026-09-07 03:00 KST, excluded
      log({ targetDate: "2026-09-06T14:30:00Z" }), // 2026-09-06 23:30 KST, included
    ];
    const result = run(logs, { corporations: ["11000101"] });
    expect(result.verifiedSlots).toBe(2);
    expect(result.issues.map((i) => i.date)).toEqual(["2026-09-01", "2026-09-02", "2026-09-03", "2026-09-04", "2026-09-05"]);
  });

  it("maps a UTC-midnight targetDate (manual API) to the same KST day", () => {
    const result = run([log({ targetDate: "2026-09-02T00:00:00Z" })], { corporations: ["11000101"] });
    expect(result.issues.map((i) => i.date)).not.toContain("2026-09-02");
  });

  it("marks FAILED after SUCCESS when the failure is the latest completed log", () => {
    const logs = [
      log({ id: "a", targetDate: kstMidnight("2026-09-01"), startedAt: new Date("2026-09-01T10:00:00+09:00"), status: "SUCCESS" }),
      log({ id: "b", targetDate: kstMidnight("2026-09-01"), startedAt: new Date("2026-09-01T12:00:00+09:00"), status: "FAILED" }),
    ];
    const result = run(logs, { corporations: ["11000101"] });
    expect(result.failedSlots).toBe(1);
    expect(result.issues).toContainEqual({ date: "2026-09-01", corporationCode: "11000101", status: "FAILED" });
  });

  it("marks SUCCESS when a successful retry completes after a FAILED or PARTIAL log", () => {
    const logs = [
      log({ id: "a", targetDate: kstMidnight("2026-09-01"), startedAt: new Date("2026-09-01T10:00:00+09:00"), status: "FAILED" }),
      log({ id: "b", targetDate: kstMidnight("2026-09-01"), startedAt: new Date("2026-09-01T11:00:00+09:00"), status: "PARTIAL" }),
      log({ id: "c", targetDate: kstMidnight("2026-09-01"), startedAt: new Date("2026-09-01T12:00:00+09:00"), status: "SUCCESS" }),
    ];
    const result = run(logs, { corporations: ["11000101"] });
    expect(result.verifiedSlots).toBe(1);
    expect(result.partialSlots).toBe(0);
    expect(result.failedSlots).toBe(0);
  });

  it("orders by completedAt before startedAt", () => {
    const logs = [
      log({ id: "slow", targetDate: kstMidnight("2026-09-01"), startedAt: new Date("2026-09-01T10:00:00+09:00"), completedAt: new Date("2026-09-01T13:00:00+09:00"), status: "PARTIAL" }),
      log({ id: "fast", targetDate: kstMidnight("2026-09-01"), startedAt: new Date("2026-09-01T11:00:00+09:00"), completedAt: new Date("2026-09-01T11:01:00+09:00"), status: "SUCCESS" }),
    ];
    expect(run(logs, { corporations: ["11000101"] }).partialSlots).toBe(1);
  });

  it("prefers the worse status on an exact time tie, then id", () => {
    const t = new Date("2026-09-01T11:00:00+09:00");
    const c = new Date("2026-09-01T11:01:00+09:00");
    const tie = [
      log({ id: "z", targetDate: kstMidnight("2026-09-01"), startedAt: t, completedAt: c, status: "SUCCESS" }),
      log({ id: "a", targetDate: kstMidnight("2026-09-01"), startedAt: t, completedAt: c, status: "PARTIAL" }),
    ];
    expect(run(tie, { corporations: ["11000101"] }).partialSlots).toBe(1);
    expect(run([...tie].reverse(), { corporations: ["11000101"] }).partialSlots).toBe(1);
    const sameStatus = [
      log({ id: "a", targetDate: kstMidnight("2026-09-02"), startedAt: t, completedAt: c, status: "SUCCESS" }),
      log({ id: "b", targetDate: kstMidnight("2026-09-02"), startedAt: t, completedAt: c, status: "SUCCESS" }),
    ];
    expect(run(sameStatus, { corporations: ["11000101"] }).verifiedSlots).toBe(1);
  });

  it("ignores logs for unrelated products, unrelated corporations, and an unknown status value", () => {
    const logs = [
      log({ targetDate: kstMidnight("2026-09-01"), targetProducts: "포도" }),
      log({ targetDate: kstMidnight("2026-09-01"), targetProducts: "토마토주스" }),
      log({ targetDate: kstMidnight("2026-09-01"), corporation: "99999999" }),
      log({ targetDate: kstMidnight("2026-09-02"), status: "WEIRD" }),
    ];
    const result = run(logs, { corporations: ["11000101"] });
    expect(result.unknownSlots).toBe(7);
    expect(result.verifiedSlots).toBe(0);
  });

  it("matches exact tokens in a comma-separated scope and treats null/blank scope as all products", () => {
    const logs = [
      log({ targetDate: kstMidnight("2026-09-01"), targetProducts: "포도, 토마토 ,딸기" }),
      log({ targetDate: kstMidnight("2026-09-02"), targetProducts: null }),
      log({ targetDate: kstMidnight("2026-09-03"), targetProducts: "  " }),
    ];
    const result = run(logs, { corporations: ["11000101"] });
    expect(result.verifiedSlots).toBe(3);
    expect(result.issues.map((i) => i.date)).toEqual(["2026-08-31", "2026-09-04", "2026-09-05", "2026-09-06"]);
  });

  it("treats a latest log with null completedAt as UNKNOWN and excludes future logs", () => {
    const logs = [
      log({ id: "done", targetDate: kstMidnight("2026-09-01"), startedAt: new Date("2026-09-01T10:00:00+09:00"), status: "SUCCESS" }),
      log({ id: "running", targetDate: kstMidnight("2026-09-01"), startedAt: new Date("2026-09-01T12:00:00+09:00"), completedAt: null, status: "SUCCESS" }),
      log({ id: "stale", targetDate: kstMidnight("2026-09-02"), startedAt: new Date("2026-09-02T09:00:00+09:00"), completedAt: null }),
      log({ id: "ok", targetDate: kstMidnight("2026-09-02"), startedAt: new Date("2026-09-02T10:00:00+09:00"), status: "SUCCESS" }),
      log({ id: "future", targetDate: kstMidnight("2026-09-03"), startedAt: new Date("2026-09-15T10:00:00+09:00"), status: "SUCCESS" }),
      log({ id: "future-completion", targetDate: kstMidnight("2026-09-04"), startedAt: new Date("2026-09-04T10:00:00+09:00"), completedAt: new Date("2026-09-15T10:00:00+09:00"), status: "SUCCESS" }),
    ];
    const result = run(logs, { corporations: ["11000101"] });
    expect(result.issues).toContainEqual({ date: "2026-09-01", corporationCode: "11000101", status: "UNKNOWN" });
    expect(result.issues.map((i) => i.date)).not.toContain("2026-09-02");
    expect(result.issues).toContainEqual({ date: "2026-09-03", corporationCode: "11000101", status: "UNKNOWN" });
    expect(result.issues).toContainEqual({ date: "2026-09-04", corporationCode: "11000101", status: "UNKNOWN" });
    expect(result.verifiedSlots).toBe(1);
  });

  it("dedupes corporations, ignoring whitespace and blanks", () => {
    const result = run(weekLogs("11000101"), { corporations: ["11000101", " 11000101 ", "", "11000101"] });
    expect(result.totalSlots).toBe(7);
    expect(result.verifiedSlots).toBe(7);
  });

  it("never exposes error messages and never infers closure from weekdays", () => {
    const logs = [{ ...log({ targetDate: kstMidnight("2026-09-06"), status: "FAILED" }), errorMessage: "secret detail" }];
    const result = run(logs, { corporations: ["11000101"] });
    expect(JSON.stringify(result)).not.toContain("secret");
    expect(result.issues.find((i) => i.date === "2026-09-06")?.status).toBe("FAILED");
    expect(result.unknownSlots).toBe(6);
  });

  it("rejects an inverted range and an empty product name", () => {
    expect(() => run([], { start: END, end: START })).toThrow();
    expect(() => run([], { productName: " " })).toThrow();
  });
});
