import "@testing-library/jest-dom/vitest";
import { afterEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { WeeklyBriefing } from "@/components/reports/WeeklyBriefing";

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
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
