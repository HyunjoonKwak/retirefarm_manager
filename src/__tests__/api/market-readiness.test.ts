// @vitest-environment node
import { afterEach, beforeEach, expect, it, vi } from "vitest";
const m = vi.hoisted(() => ({ schedule: vi.fn(), check: vi.fn(), state: vi.fn(), ready: vi.fn() }));
vi.mock("node-cron", () => ({ default: { schedule: m.schedule } }));
vi.mock("@/lib/services/market-recovery", () => ({ checkMarketRecovery: m.check, getRecoveryState: m.state }));
vi.mock("@/lib/scheduler", () => ({ isMarketSchedulerReady: m.ready }));
import { startMarketRecoveryScheduler } from "@/lib/market-recovery-scheduler";
import { GET } from "@/app/api/health/ready/route";
beforeEach(() => {
  vi.clearAllMocks(); vi.useFakeTimers(); vi.setSystemTime(new Date("2026-09-07T00:00:00Z"));
  delete (globalThis as typeof globalThis & { marketRecoveryTask?: unknown }).marketRecoveryTask;
  m.schedule.mockReturnValue({}); m.check.mockResolvedValue(undefined); m.ready.mockReturnValue(true);
  m.state.mockReturnValue({ lastCheckOk: null, checking: false, lastHeartbeatAt: null });
});
afterEach(() => { vi.clearAllTimers(); vi.useRealTimers(); });
it("starts one periodic watcher and one asynchronous boot check", async () => {
  startMarketRecoveryScheduler(); startMarketRecoveryScheduler();
  expect(m.schedule).toHaveBeenCalledOnce();
  await vi.advanceTimersByTimeAsync(5000); expect(m.check).toHaveBeenCalledOnce();
});
it("reports 503 before initialization and 200 while a live long-running pass is working", async () => {
  startMarketRecoveryScheduler(); expect((await GET()).status).toBe(503);
  m.state.mockReturnValue({ checking: true, lastCheckOk: null, lastCheckedAt: null, lastHeartbeatAt: new Date().toISOString() });
  expect((await GET()).status).toBe(200);
  m.state.mockReturnValue({ checking: false, lastCheckOk: false, lastHeartbeatAt: new Date().toISOString() });
  expect((await GET()).status).toBe(503);
});
it("detects a stalled watcher even when the web server and schedule registry are alive", async () => {
  startMarketRecoveryScheduler();
  m.state.mockReturnValue({ checking: true, lastCheckOk: true, lastHeartbeatAt: new Date(Date.now() - 36 * 60000).toISOString() });
  const response = await GET(); expect(response.status).toBe(503);
  expect(await response.json()).toEqual({ ready: false, marketSchedulerReady: true, marketRecoveryReady: false });
});
