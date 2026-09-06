import { describe, it, expect, vi, afterEach } from "vitest";
import "@testing-library/jest-dom/vitest";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MarketRecoveryStatus, type RecoveryStatus } from "@/components/market/MarketRecoveryStatus";

function status(overrides: Partial<RecoveryStatus> = {}): RecoveryStatus {
  return {
    enabled: true,
    lookbackDays: 7,
    checkIntervalMinutes: 15,
    graceMinutes: 60,
    schedulerReady: true,
    lastCheckedAt: "2026-09-06T09:30:00.000Z",
    checking: false,
    summary: { pending: 0, running: 0, failed: 0 },
    jobs: [],
    ...overrides,
  };
}

function job(overrides: Partial<RecoveryStatus["jobs"][number]> = {}) {
  return {
    id: "lease-key-should-not-be-shown",
    targetDate: "2026-09-01",
    status: "PENDING",
    attempts: 1,
    nextAttemptAt: null,
    lastError: null,
    updatedAt: "2026-09-06T09:00:00.000Z",
    ...overrides,
  };
}

function ok(body: RecoveryStatus) {
  return { ok: true, status: 200, json: async () => body };
}

function setVisibility(state: "visible" | "hidden") {
  Object.defineProperty(document, "visibilityState", { value: state, configurable: true });
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
  setVisibility("visible");
});

describe("MarketRecoveryStatus", () => {
  it("보충 대상이 없으면 오류가 아니라 정상 상태로 설명한다", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(ok(status())));
    render(<MarketRecoveryStatus />);

    expect(await screen.findByText(/표시할 자동 보충 작업이 없습니다/)).toBeInTheDocument();
    expect(screen.getByText(/마지막 점검 시각과 수집 로그를 함께 확인/)).toBeInTheDocument();
    expect(screen.queryByRole("alert")).toBeNull();
    expect(
      screen.getByText(/최근 7일의 예약분 중 수집 기록이 없거나 실패한 날을 보충합니다/)
    ).toHaveTextContent("60분이 지난 날짜가 대상이며, 15분마다 확인하고 날짜마다 최대 3번까지 시도합니다");
  });

  it("대상 날짜를 응답 값 그대로 보여주고 내부 식별자는 노출하지 않는다", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        ok(
          status({
            summary: { pending: 1, running: 0, failed: 1 },
            jobs: [
              job({ targetDate: "2026-09-01", status: "FAILED", attempts: 2, lastError: "페이지 2 조회 실패" }),
              job({
                id: "lease-2",
                targetDate: "2026-08-31",
                status: "PENDING",
                attempts: 1,
                nextAttemptAt: "2026-09-06T10:00:00.000Z",
                updatedAt: "2026-09-06T09:10:00.000Z",
              }),
            ],
          })
        )
      )
    );
    const { container } = render(<MarketRecoveryStatus />);

    expect(await screen.findByText("2026-09-01")).toBeInTheDocument();
    expect(screen.getByText("2026-08-31")).toBeInTheDocument();
    expect(screen.getByText("실패")).toBeInTheDocument();
    expect(screen.getByText("2/3회 시도")).toBeInTheDocument();
    expect(screen.getByText("페이지 2 조회 실패")).toBeInTheDocument();
    expect(screen.getByText(/다음 보충 예정/)).toBeInTheDocument();
    expect(screen.getByText(/대기 1 · 진행 중 0 · 실패 1/)).toBeInTheDocument();
    // lease 같은 기술 키는 화면에 나오지 않는다
    expect(container.textContent).not.toContain("lease");
  });

  it("최신 5건만 보여주고 나머지는 건수로 알린다", async () => {
    const jobs = Array.from({ length: 7 }, (_, i) =>
      job({
        id: `lease-${i}`,
        targetDate: `2026-09-0${i + 1}`,
        updatedAt: `2026-09-06T0${i}:00:00.000Z`,
      })
    );
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(ok(status({ jobs }))));
    render(<MarketRecoveryStatus />);

    // updatedAt 최신순 5건
    expect(await screen.findByText("2026-09-07")).toBeInTheDocument();
    expect(screen.getByText("2026-09-03")).toBeInTheDocument();
    expect(screen.queryByText("2026-09-02")).toBeNull();
    expect(screen.getByText(/최근 5건만 표시했습니다. \(전체 7건\)/)).toBeInTheDocument();
  });

  it("조회에 실패하면 정상으로 표시하지 않고 재조회 버튼을 준다", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ ok: false, status: 500, json: async () => ({ error: "서버 오류" }) })
      .mockResolvedValueOnce(ok(status()));
    vi.stubGlobal("fetch", fetchMock);
    render(<MarketRecoveryStatus />);

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("자동 보충 상태를 확인하지 못했습니다");
    expect(alert).toHaveTextContent("서버 오류");
    expect(screen.queryByText(/표시할 자동 보충 작업이 없습니다/)).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "다시 조회" }));
    expect(await screen.findByText(/표시할 자동 보충 작업이 없습니다/)).toBeInTheDocument();
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("스케줄러 준비가 끝나지 않으면 경고를 보여준다", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(ok(status({ schedulerReady: false }))));
    render(<MarketRecoveryStatus />);
    expect(await screen.findByRole("status")).toHaveTextContent("자동 수집 준비가 끝나지 않아");
  });

  it("자동 보충이 꺼져 있으면 그 사실을 알린다", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(ok(status({ enabled: false }))));
    render(<MarketRecoveryStatus />);
    expect(await screen.findByText(/자동 보충이 꺼져 있습니다/)).toBeInTheDocument();
  });

  it("화면이 열려 있을 때만 주기 조회하고, 숨겨지면 호출하지 않는다", async () => {
    vi.useFakeTimers();
    const fetchMock = vi.fn().mockResolvedValue(ok(status()));
    vi.stubGlobal("fetch", fetchMock);
    render(<MarketRecoveryStatus pollIntervalMs={1000} />);
    await act(async () => {});
    expect(fetchMock).toHaveBeenCalledTimes(1);

    await act(async () => {
      vi.advanceTimersByTime(1000);
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);

    // 백그라운드 탭에서는 주기 조회를 건너뛴다
    setVisibility("hidden");
    await act(async () => {
      vi.advanceTimersByTime(3000);
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("언마운트하면 진행 중 요청을 취소한다", async () => {
    const fetchMock = vi.fn().mockImplementation(() => new Promise(() => {}));
    vi.stubGlobal("fetch", fetchMock);
    const { unmount } = render(<MarketRecoveryStatus />);
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());

    const signal = fetchMock.mock.calls[0][1].signal as AbortSignal;
    expect(signal.aborted).toBe(false);
    unmount();
    expect(signal.aborted).toBe(true);
  });

  it("수집 설정 문제가 오면 구체 문구와 수정 안내를 경고로 보여준다", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        ok(
          status({
            configurationErrors: [
              "수집 시각을 00:00~23:59 범위로 다시 저장해 주세요.",
              "수집 요일을 한 개 이상 다시 선택해 주세요.",
            ],
          })
        )
      )
    );
    render(<MarketRecoveryStatus />);

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("수집 설정이 올바르지 않아 자동 수집과 보충이 실행되지 않습니다.");
    expect(alert).toHaveTextContent("수집 시각을 00:00~23:59 범위로 다시 저장해 주세요.");
    expect(alert).toHaveTextContent("수집 요일을 한 개 이상 다시 선택해 주세요.");
    expect(alert).toHaveTextContent("수집 설정을 고쳐 저장하면 다음 점검부터 다시 실행됩니다.");
  });

  it("수집 설정 문제가 없으면 경고를 만들지 않는다", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(ok(status({ configurationErrors: [] }))));
    render(<MarketRecoveryStatus />);
    await screen.findByText(/보충이 필요한 날짜가 없습니다|자동 보충/);
    expect(screen.queryByRole("alert")).toBeNull();
  });
});
