import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const { prismaMock, guardsMock } = vi.hoisted(() => ({
  prismaMock: {
    marketCollectionSettings: { findMany: vi.fn(), findUnique: vi.fn(), count: vi.fn() },
    dataCollectionLog: { create: vi.fn() },
  },
  guardsMock: {
    getSessionUser: vi.fn(),
    isAdmin: vi.fn(() => false),
    isValidCronRequest: vi.fn(() => false),
    requireAdminUser: vi.fn(),
  },
}));
vi.mock("@/lib/prisma", () => ({ default: prismaMock }));
vi.mock("@/lib/auth/guards", () => guardsMock);
vi.mock("@/lib/logger", () => ({ logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));
vi.mock("@/lib/services/garak-market", () => ({
  collectAndSaveAuctionData: vi.fn(),
  cleanupOldAuctionData: vi.fn(),
}));
vi.mock("node-cron", () => ({
  default: { validate: () => true, schedule: () => ({ stop: vi.fn() }) },
}));

import { GET as schedulerGet } from "@/app/api/market/garak/scheduler/route";
import { GET as healthGet } from "@/app/api/health/route";
import { clearAllSchedules } from "@/lib/scheduler";

const USER = { id: "u1", email: "u@example.com", role: "USER" };
const ADMIN = { id: "a1", email: "a@example.com", role: "ADMIN" };

beforeEach(() => {
  vi.clearAllMocks();
  clearAllSchedules();
  vi.spyOn(console, "info").mockImplementation(() => {});
});

describe("GET /api/health", () => {
  it("인증 없이 200이며 스케줄러 준비 여부는 bool 하나만 노출한다", async () => {
    const response = await healthGet();
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).toEqual({ status: "ok", marketSchedulerReady: false });
  });
});

describe("GET /api/market/garak/scheduler", () => {
  it("initialized는 하드코딩이 아니라 실제 로드 상태를 반영한다 (부팅 전 false)", async () => {
    guardsMock.getSessionUser.mockResolvedValue(USER);
    const response = await schedulerGet(new NextRequest("http://localhost/api/market/garak/scheduler"));
    const body = await response.json();
    expect(body).toMatchObject({ initialized: false, ready: false, activeSchedules: 0, scheduleIds: [], lastLoadOk: null });
  });

  it("관리자 init 후에는 등록 수·준비 여부가 실제 값으로 바뀌고 health도 같은 상태를 본다", async () => {
    guardsMock.getSessionUser.mockResolvedValue(ADMIN);
    guardsMock.isAdmin.mockReturnValue(true);
    prismaMock.marketCollectionSettings.findMany.mockResolvedValue([
      { id: "s1", collectTime: "09:30", collectDays: "1,2,3,4,5", autoCollectEnabled: true },
    ]);

    const init = await schedulerGet(new NextRequest("http://localhost/api/market/garak/scheduler?action=init"));
    const body = await init.json();
    expect(body).toMatchObject({ initialized: true, ready: true, loadedSchedules: 1, activeCount: 1, expectedCount: 1, lastLoadOk: true });
    expect(body.scheduleIds).toEqual(["s1"]);

    const health = await (await healthGet()).json();
    expect(health).toEqual({ status: "ok", marketSchedulerReady: true });
  });

  it("일반 사용자는 init을 호출할 수 없다", async () => {
    guardsMock.getSessionUser.mockResolvedValue(USER);
    guardsMock.isAdmin.mockReturnValue(false);
    const response = await schedulerGet(new NextRequest("http://localhost/api/market/garak/scheduler?action=init"));
    expect(response.status).toBe(403);
  });
});
