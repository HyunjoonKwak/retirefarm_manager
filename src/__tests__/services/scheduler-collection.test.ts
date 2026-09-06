import { describe, it, expect, vi, beforeEach } from "vitest";

const { prismaMock, collectMock, cleanupMock } = vi.hoisted(() => ({
  prismaMock: {
    marketCollectionSettings: { findUnique: vi.fn(), findMany: vi.fn() },
    dataCollectionLog: { create: vi.fn() },
  },
  collectMock: vi.fn(),
  cleanupMock: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({ default: prismaMock }));
vi.mock("@/lib/logger", () => ({ logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));
vi.mock("@/lib/services/garak-market", () => ({
  collectAndSaveAuctionData: collectMock,
  cleanupOldAuctionData: cleanupMock,
}));
vi.mock("node-cron", () => ({
  default: { validate: () => true, schedule: () => ({ stop: vi.fn() }) },
}));

import { runScheduleNow, isCollectionRunning, clearAllSchedules, loadAllSchedules, getSchedulerStatus } from "@/lib/scheduler";

const SETTINGS = {
  id: "s1",
  autoCollectEnabled: true,
  collectDaysAgo: 1,
  corporationCodes: "11000101,11000102",
  targetProducts: "토마토",
  autoCleanupEnabled: true,
};

function collectionResult(status: "SUCCESS" | "PARTIAL" | "FAILED" | "EMPTY") {
  return {
    status,
    complete: status === "SUCCESS" || status === "EMPTY",
    totalCount: 5,
    newCount: 5,
    duplicateCount: 0,
    noAuction: status === "EMPTY",
    issues: status === "PARTIAL" ? ["페이지 1개 조회 실패 (2)"] : [],
    guidance: null,
    corporations: [],
    deduplicated: false,
  };
}

beforeEach(() => {
  clearAllSchedules();
  vi.clearAllMocks();
  prismaMock.marketCollectionSettings.findUnique.mockResolvedValue(SETTINGS);
  cleanupMock.mockResolvedValue({ deletedCount: 0, retentionDays: 90 });
});

describe("scheduler readiness", () => {
  it("distinguishes never initialized, successful registration, and load failure", async () => {
    expect(getSchedulerStatus().ready).toBe(false);
    prismaMock.marketCollectionSettings.findMany.mockResolvedValue([{ ...SETTINGS, collectTime: "09:30", collectDays: "0,1,2,3,4,5,6" }]);
    expect(await loadAllSchedules()).toBe(1);
    expect(getSchedulerStatus()).toEqual({ initialized: true, activeCount: 1, expectedCount: 1, ready: true });
    prismaMock.marketCollectionSettings.findMany.mockRejectedValueOnce(new Error("DB unavailable"));
    expect(await loadAllSchedules()).toBe(0);
    expect(getSchedulerStatus().ready).toBe(false);
  });
  it("shares registered jobs across independently loaded module instances", async () => {
    prismaMock.marketCollectionSettings.findMany.mockResolvedValue([{ ...SETTINGS, collectTime: "09:30", collectDays: "1" }]);
    await loadAllSchedules();
    vi.resetModules();
    const second = await import("@/lib/scheduler");
    expect(second.getSchedulerStatus().activeCount).toBe(1);
    second.clearAllSchedules();
    expect(getSchedulerStatus().ready).toBe(false);
  });
});

describe("scheduler executeCollection", () => {
  it("완전 성공(SUCCESS/EMPTY)일 때만 cleanup을 실행한다", async () => {
    collectMock.mockResolvedValueOnce(collectionResult("SUCCESS"));
    await runScheduleNow("s1");
    expect(cleanupMock).toHaveBeenCalledTimes(1);

    collectMock.mockResolvedValueOnce(collectionResult("PARTIAL"));
    await runScheduleNow("s1");
    expect(cleanupMock).toHaveBeenCalledTimes(1);

    collectMock.mockResolvedValueOnce(collectionResult("FAILED"));
    await runScheduleNow("s1");
    expect(cleanupMock).toHaveBeenCalledTimes(1);

    collectMock.mockResolvedValueOnce(collectionResult("EMPTY"));
    await runScheduleNow("s1");
    expect(cleanupMock).toHaveBeenCalledTimes(2);
  });

  it("같은 설정의 수집이 실행 중이면 다시 트리거돼도 건너뛴다", async () => {
    let release: (value: ReturnType<typeof collectionResult>) => void = () => {};
    collectMock.mockImplementationOnce(
      () => new Promise((resolve) => { release = resolve; })
    );

    const first = runScheduleNow("s1");
    await Promise.resolve();
    expect(isCollectionRunning("s1")).toBe(true);

    const second = await runScheduleNow("s1");
    expect(second).toBe(true);
    expect(collectMock).toHaveBeenCalledTimes(1);

    release(collectionResult("SUCCESS"));
    await first;
    expect(isCollectionRunning("s1")).toBe(false);
  });

  it("수집기가 던진 예외는 FAILED 로그로 남긴다", async () => {
    collectMock.mockRejectedValueOnce(new Error("GARAK_API_ID / GARAK_API_PASSWORD 환경변수가 설정되지 않았습니다."));
    await runScheduleNow("s1");
    expect(prismaMock.dataCollectionLog.create).toHaveBeenCalledTimes(1);
    expect(prismaMock.dataCollectionLog.create.mock.calls[0][0].data.status).toBe("FAILED");
    expect(cleanupMock).not.toHaveBeenCalled();
  });
});
