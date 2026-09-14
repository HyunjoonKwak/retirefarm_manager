import "@testing-library/jest-dom/vitest";
import { afterEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { WeeklyBriefing } from "@/components/reports/WeeklyBriefing";
import { BriefingPriceAnalysis } from "@/components/reports/BriefingPriceAnalysis";
import { snapshotSchema } from "@/lib/briefing/contracts";

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
it("previews without enqueueing and clears the preview when filters change", async () => {
  const fetch = vi.fn().mockImplementation(async (_url, options) => ({ ok: true, json: async () => options?.method === "POST"
    ? { snapshot: { periodStart: "2026-09-06T15:00:00Z", sources: [], metrics: [], limitations: [] } }
    : { runs: [], worker: { configured: false, lastSeenAt: null } } }));
  vi.stubGlobal("fetch", fetch); render(<WeeklyBriefing />);
  await screen.findByText("아직 요청한 브리핑이 없습니다.");
  fireEvent.click(screen.getByRole("button", { name: "시세 분석 미리보기" }));
  expect(screen.getByLabelText("품목")).toBeDisabled();
  await screen.findByRole("heading", { name: "시세 분석 미리보기" });
  await waitFor(() => expect(screen.getByLabelText("품목")).toBeEnabled());
  expect(fetch.mock.calls.filter(call => call[1]?.method === "POST").map(call => JSON.parse(call[1].body).action)).toEqual(["preview"]);
  fireEvent.change(screen.getByLabelText("산지 (선택)"), { target: { value: "장수" } });
  expect(screen.queryByRole("heading", { name: "시세 분석 미리보기" })).not.toBeInTheDocument();
});
it("renders collection uncertainty and supplied rates without inventing missing rates", () => {
  const coverage = { periodStart: "2026-09-06T15:00:00Z", periodEnd: "2026-09-13T15:00:00Z", totalSlots: 7, verifiedSlots: 6,
    emptySlots: 0, partialSlots: 0, failedSlots: 0, unknownSlots: 1, issues: [{ date: "2026-09-13", corporationCode: "11000101", status: "UNKNOWN" }] };
  const snapshot = snapshotSchema.parse({ schemaVersion: 1, rulesVersion: "briefing-v1", statisticsVersion: "auction-unit-weighted-v1",
    periodStart: coverage.periodStart, periodEnd: coverage.periodEnd, generatedAt: "2026-09-14T01:00:00Z", sources: [], limitations: [],
    metrics: [{ id: "price-0", label: "대추 · 평택 · 특 · 3kg", value: 20000, unit: "원/3kg", sourceId: "market" }],
    analysis: { version: 1, coverage: { current: coverage, previous: coverage, fourWeeks: coverage }, comparisons: [{ metricId: "price-0", currentDays: 2, currentTrades: 3,
      previous: { price: 10000, tradeCount: 3, observedDays: 2, changePct: null, status: "UNVERIFIED_COLLECTION" },
      fourWeeks: { price: null, tradeCount: 0, observedDays: 0, changePct: null, status: "NO_BASELINE" } }] },
  });
  const { rerender } = render(<BriefingPriceAnalysis snapshot={snapshot} />);
  expect(screen.getByText("등락률 보류 · 수집 확인 부족")).toBeInTheDocument();
  expect(screen.getByText("등락률 보류 · 비교 거래 없음")).toBeInTheDocument();
  expect(screen.queryByText(/100%/)).not.toBeInTheDocument();
  expect(screen.getAllByText(/확인 기록 없음/)).toHaveLength(3);
  expect(screen.getByText(/공개 일평균과 다르며/)).toBeInTheDocument();
  snapshot.analysis!.comparisons[0].previous = { ...snapshot.analysis!.comparisons[0].previous, changePct: 100, status: "COMPARABLE" };
  rerender(<BriefingPriceAnalysis snapshot={snapshot} />);
  expect(screen.getByText("대비 +100%")).toBeInTheDocument();
});
it("shows an offline queue honestly and submits the exact product filters without creating a schedule", async () => {
  const fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ runs: [], worker: { configured: false, lastSeenAt: null } }) });
  vi.stubGlobal("fetch", fetch); render(<WeeklyBriefing />);
  await screen.findByText("아직 요청한 브리핑이 없습니다.");
  expect(screen.getByText(/자동 예약·알림은 준비 중/)).toBeInTheDocument();
  fireEvent.change(screen.getByLabelText("품종 (선택)"), { target: { value: "대추빨강" } });
  fireEvent.change(screen.getByLabelText("산지 (선택)"), { target: { value: "평택" } });
  fireEvent.click(screen.getByRole("button", { name: "초안 생성 요청" }));
  await waitFor(() => expect(fetch).toHaveBeenCalledWith("/api/briefings", expect.objectContaining({
    method: "POST", body: JSON.stringify({ action: "enqueue", productName: "토마토", variety: "대추빨강", origin: "평택" }),
  })));
});
it("renders model text as text and exposes missing data and retry status", async () => {
  const prose = '<img src=x onerror="alert()">';
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => ({
    worker: { configured: true, lastSeenAt: null }, runs: [{ id: "job", status: "BLOCKED", lastError: "RATE_LIMIT",
      snapshot: { periodStart: "2026-09-06T15:00:00Z", limitations: ["경쟁점 미수집"], sources: [], metrics: [] },
      briefing: { status: "DRAFT", body: { summary: prose, sections: [], actions: [], limitations: [] } },
    }],
  }) }));
  const { container } = render(<WeeklyBriefing />);
  expect(await screen.findByText(prose)).toBeInTheDocument(); expect(container.querySelector("img")).toBeNull();
  expect(screen.getByText("경쟁점 미수집")).toBeInTheDocument();
  expect(screen.getByText("Codex 사용량 한도 회복 후 재시도해 주세요.")).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "연결 확인 후 재시도" })).toBeInTheDocument();
});
