// @vitest-environment node
import { beforeEach, afterEach, expect, it, vi } from "vitest";
import { PrismaClient } from "@prisma/client";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { execFileSync } from "node:child_process";
const m = vi.hoisted(() => ({ db: null as unknown as PrismaClient, collect: vi.fn(), running: vi.fn(), user: vi.fn() }));
vi.mock("@/lib/prisma", () => ({ default: new Proxy({}, { get: (_, key) => {
  const value = Reflect.get(m.db, key);
  return typeof value === "function" ? value.bind(m.db) : value;
} }) }));
vi.mock("@/lib/services/garak-market", () => ({ collectAndSaveAuctionData: m.collect }));
vi.mock("@/lib/scheduler", () => ({ getSchedulerStatus: () => ({ ready: true }), isCollectionRunning: m.running, loadAllSchedules: vi.fn() }));
vi.mock("@/lib/auth/guards", () => ({ getSessionUser: m.user }));
vi.mock("@/lib/logger", () => ({ logger: { error: vi.fn() } }));
import { checkMarketRecovery, getRecoveryState } from "@/lib/services/market-recovery";
import { recoveryScope, kstDateStart } from "@/lib/market-recovery-policy";
import { GET } from "@/app/api/market/garak/recovery/route";
let dir: string;
let setting: Awaited<ReturnType<PrismaClient["marketCollectionSettings"]["create"]>>;
const now = new Date("2026-09-07T02:00:00Z");
const result = (status: string) => ({ status, complete: ["SUCCESS", "EMPTY"].includes(status), totalCount: 2, newCount: 2, issues: [] });
beforeEach(async () => {
  vi.clearAllMocks();
  vi.useFakeTimers({ toFake: ["Date"] }); vi.setSystemTime(now);
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "market-recovery-"));
  const file = path.join(dir, "db.sqlite");
  const migrations = fs.readdirSync("prisma/migrations").filter(s => /^\d/.test(s)).sort();
  execFileSync("sqlite3", [file], { input: migrations.map(s => fs.readFileSync(`prisma/migrations/${s}/migration.sql`, "utf8")).join("\n") });
  m.db = new PrismaClient({ datasources: { db: { url: `file:${file}` } } });
  await m.db.user.create({ data: { id: "owner", email: "owner@test.invalid" } });
  setting = await m.db.marketCollectionSettings.create({ data: { userId: "owner", autoCollectEnabled: true, corporationCodes: "11000101,11000102", collectDays: "1", collectDaysAgo: 0, targetProducts: "토마토,포도", createdAt: new Date("2026-09-07T00:00:00Z") } });
  m.collect.mockResolvedValue(result("SUCCESS")); m.running.mockReturnValue(false); m.user.mockResolvedValue({ id: "owner" });
});
afterEach(async () => { await m.db.$disconnect(); vi.useRealTimers(); fs.rmSync(dir, { recursive: true, force: true }); });
it("migrates the existing schema and does not fetch dates already completed by every corporation", async () => {
  for (const corporation of ["11000101", "11000102"]) await m.db.dataCollectionLog.create({ data: { corporation, targetDate: kstDateStart("2026-09-07"), targetProducts: "포도,토마토", status: "SUCCESS", totalCount: 2, newCount: 2 } });
  await checkMarketRecovery(now);
  expect(m.collect).not.toHaveBeenCalled(); expect(await m.db.marketRecoveryJob.count()).toBe(0);
  expect(getRecoveryState().lastCheckOk).toBe(true);
});
it("records a completed recovery and does not execute it twice", async () => {
  await checkMarketRecovery(now); await checkMarketRecovery(now);
  expect(m.collect).toHaveBeenCalledOnce();
  expect(await m.db.marketRecoveryJob.findFirst()).toMatchObject({ status: "SUCCESS", attempts: 1, leaseToken: null });
});
it("waits between failed attempts, caps at three across checks, and notifies once", async () => {
  m.collect.mockResolvedValue(result("FAILED"));
  await checkMarketRecovery(now); await checkMarketRecovery(now);
  expect(m.collect).toHaveBeenCalledTimes(1);
  vi.setSystemTime(new Date(now.getTime() + 61 * 60000)); await checkMarketRecovery(new Date());
  vi.setSystemTime(new Date(now.getTime() + 122 * 60000)); await checkMarketRecovery(new Date());
  await checkMarketRecovery(new Date());
  expect(m.collect).toHaveBeenCalledTimes(3);
  expect(await m.db.notification.count()).toBe(1);
  expect(await m.db.marketRecoveryJob.findFirst()).toMatchObject({ status: "FAILED", attempts: 3 });
});
it("recovers an expired process lease and does not overlap a regular scheduled collection", async () => {
  await m.db.marketRecoveryJob.create({ data: { settingsId: setting.id, scope: recoveryScope(setting), targetDate: "2026-09-07", nextAttemptAt: now, status: "RUNNING", attempts: 1, leaseToken: "old", leaseUntil: new Date(now.getTime() - 1000) } });
  m.running.mockReturnValue(true); await checkMarketRecovery(now); expect(m.collect).not.toHaveBeenCalled();
  m.running.mockReturnValue(false); await checkMarketRecovery(now); expect(m.collect).toHaveBeenCalledOnce();
  expect(await m.db.marketRecoveryJob.findFirst()).toMatchObject({ status: "SUCCESS", attempts: 2 });
});
it("API rejects anonymous access and only returns jobs for the logged-in settings", async () => {
  await checkMarketRecovery(now);
  m.user.mockResolvedValue(null); expect((await GET()).status).toBe(401);
  m.user.mockResolvedValue({ id: "another-user" }); expect((await (await GET()).json()).jobs).toEqual([]);
  m.user.mockResolvedValue({ id: "owner" }); const data = await (await GET()).json();
  expect(data.jobs).toHaveLength(1); expect(data.jobs[0]).not.toHaveProperty("leaseToken");
  expect(data.jobs[0].nextAttemptAt).toBeNull();
});
it("re-enabling the same scope can resume a cancelled job without losing its date", async () => {
  await m.db.marketRecoveryJob.create({ data: { settingsId: setting.id, scope: recoveryScope(setting), targetDate: "2026-09-07", nextAttemptAt: now, status: "CANCELLED", attempts: 0 } });
  await checkMarketRecovery(now);
  expect(m.collect).toHaveBeenCalledOnce();
  expect(await m.db.marketRecoveryJob.findFirst()).toMatchObject({ status: "SUCCESS", attempts: 1 });
});
it("a process lost on its third attempt becomes failed and notifies instead of remaining RUNNING", async () => {
  await m.db.marketRecoveryJob.create({ data: { settingsId: setting.id, scope: recoveryScope(setting), targetDate: "2026-09-07", nextAttemptAt: now, status: "RUNNING", attempts: 3, leaseToken: "old", leaseUntil: new Date(now.getTime() - 1000) } });
  await checkMarketRecovery(now); await checkMarketRecovery(now);
  expect(m.collect).not.toHaveBeenCalled();
  expect(await m.db.marketRecoveryJob.findFirst()).toMatchObject({ status: "FAILED", leaseToken: null });
  expect(await m.db.notification.count()).toBe(1);
});
it("limits a large backlog to three collection calls per pass", async () => {
  await m.db.marketCollectionSettings.update({ where: { id: setting.id }, data: { collectDays: "0,1,2,3,4,5,6", createdAt: new Date("2026-01-01") } });
  await checkMarketRecovery(now);
  expect(m.collect).toHaveBeenCalledTimes(3);
  expect(await m.db.marketRecoveryJob.count({ where: { status: "PENDING" } })).toBe(4);
});

it("does not reset a persisted future retry when reconciling the same job", async () => {
  const nextAttemptAt = new Date(now.getTime() + 60 * 60000);
  await m.db.marketRecoveryJob.create({ data: { settingsId: setting.id, scope: recoveryScope(setting), targetDate: "2026-09-07", nextAttemptAt, status: "FAILED", attempts: 1 } });
  await checkMarketRecovery(now);
  expect(m.collect).not.toHaveBeenCalled();
  expect(await m.db.marketRecoveryJob.findFirst()).toMatchObject({ nextAttemptAt, attempts: 1 });
  vi.setSystemTime(nextAttemptAt);
  await checkMarketRecovery(new Date());
  expect(m.collect).toHaveBeenCalledOnce();
});
