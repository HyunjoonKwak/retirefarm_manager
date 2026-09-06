// @vitest-environment node
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
const mocks = vi.hoisted(() => ({ authorized: vi.fn(), settings: vi.fn(), collect: vi.fn(), cleanup: vi.fn() }));
vi.mock("@/lib/auth/guards", () => ({ isValidCronRequest: mocks.authorized }));
vi.mock("@/lib/prisma", () => ({ default: { marketCollectionSettings: { findMany: mocks.settings } } }));
vi.mock("@/lib/logger", () => ({ logger: { error: vi.fn() } }));
vi.mock("@/lib/services/garak-market", () => ({ collectAndSaveAuctionData: mocks.collect, cleanupOldAuctionData: mocks.cleanup }));
import { GET } from "@/app/api/market/garak/cron/route";
beforeEach(() => {
  vi.resetAllMocks();
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-09-06T00:00:00Z"));
  mocks.authorized.mockReturnValue(true);
  mocks.settings.mockResolvedValue([{ userId: "user", collectDays: "0", collectTime: "09:00", collectDaysAgo: 1, corporationCodes: "11000101", targetProducts: "토마토", autoCleanupEnabled: true }]);
});
afterEach(() => vi.useRealTimers());
it.each(["FAILED", "PARTIAL"])("preserves old data and reports %s without claiming success", async (status) => {
  mocks.collect.mockResolvedValue({ status, complete: false, totalCount: 10, newCount: 2, issues: ["누락"] });
  const response = await GET(new NextRequest("http://localhost/api/market/garak/cron"));
  expect((await response.json()).results[0]).toMatchObject({ success: false, status, issues: ["누락"] });
  expect(mocks.cleanup).not.toHaveBeenCalled();
});
it("cleans up only after a complete collection", async () => {
  mocks.collect.mockResolvedValue({ status: "SUCCESS", complete: true, totalCount: 10, newCount: 10, issues: [] });
  await GET(new NextRequest("http://localhost/api/market/garak/cron"));
  expect(mocks.cleanup).toHaveBeenCalledOnce();
});
