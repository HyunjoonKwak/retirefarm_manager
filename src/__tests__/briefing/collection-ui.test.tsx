import "@testing-library/jest-dom/vitest";
import { afterEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { CollectionQueue } from "@/components/reports/competitor/CollectionQueue";
import type { CollectionJob } from "@/lib/briefing/collection-contracts";

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
const job = (patch: Partial<CollectionJob> = {}): CollectionJob => ({
  id: "job-a", query: "토마토 2kg", searchUrl: "https://search.shopping.naver.com/ns/search?query=tomato",
  status: "PENDING", reason: null, version: 1, createdAt: "2026-09-14T08:00:00Z",
  startedAt: null, completedAt: null, runId: null, evidenceCount: 0, ...patch,
});
function stub(initial: CollectionJob[], next = initial, fail = false) {
  let jobs = initial;
  const fetch = vi.fn().mockImplementation(async (_url, init) => {
    if (init?.method === "POST") {
      if (fail) return { ok: false, json: async () => ({ error: "작업 상태가 변경됐습니다." }) };
      jobs = next; return { ok: true, json: async () => ({ ok: true }) };
    }
    return { ok: true, json: async () => ({ jobs, lastSuccessAt: null }) };
  });
  vi.stubGlobal("fetch", fetch);
  return fetch;
}
function open(disabled = false, onSelect = vi.fn()) {
  const rendered = render(<CollectionQueue selectedJobId={null} onSelect={onSelect} refreshKey={0} disabled={disabled} />);
  const details = rendered.container.querySelector("details")!;
  details.open = true; fireEvent(details, new Event("toggle"));
  return onSelect;
}
const posted = (fetch: ReturnType<typeof vi.fn>) => fetch.mock.calls.filter(c => c[1]?.method === "POST").map(c => JSON.parse(c[1].body));

it("does not contact the queue while collapsed and never claims automatic execution", () => {
  const fetch = stub([]);
  render(<CollectionQueue selectedJobId={null} onSelect={vi.fn()} refreshKey={0} disabled={false} />);
  expect(fetch).not.toHaveBeenCalled();
  const details = screen.getByText("검색 수집 작업 관리").closest("details")!;
  details.open = true; fireEvent(details, new Event("toggle"));
  expect(screen.getByText(/자동 방문·주간 예약은 아직 실행하지 않습니다/)).toBeInTheDocument();
});
it("rejects excessive query lists, then creates only normalized query input", async () => {
  const fetch = stub([]); open();
  await screen.findByText("등록된 수집 작업이 없습니다.");
  fireEvent.change(screen.getByLabelText(/이번 주 수집 검색어/), { target: { value: "a\nb\nc\nd" } });
  fireEvent.click(screen.getByRole("button", { name: "이번 주 작업 준비" }));
  expect(await screen.findByRole("alert")).toHaveTextContent(/1~3개/);
  expect(posted(fetch)).toEqual([]);
  fireEvent.change(screen.getByLabelText(/이번 주 수집 검색어/), { target: { value: " Tomato  2KG \n토마토 3kg" } });
  fireEvent.click(screen.getByRole("button", { name: "이번 주 작업 준비" }));
  await screen.findByText(/이번 주 검색 작업을 준비했습니다/);
  expect(posted(fetch)).toEqual([{ action: "create", queries: ["tomato 2kg", "토마토 3kg"] }]);
});
it("starts a versioned job and selects only its refreshed running version for import", async () => {
  const running = job({ status: "RUNNING", version: 2, startedAt: "2026-09-14T08:01:00Z" });
  const fetch = stub([job()], [running]); const onSelect = open();
  fireEvent.click(await screen.findByRole("button", { name: "수집 시작" }));
  await waitFor(() => expect(onSelect).toHaveBeenLastCalledWith(running));
  expect(posted(fetch)).toEqual([{ action: "start", jobId: "job-a", version: 1 }]);
  expect(screen.getByRole("link", { name: "검색 열기 (현재 탭)" })).not.toHaveAttribute("target", "_blank");
});
it("records a concrete security stop and offers explicit resume, without reporting success", async () => {
  const running = job({ status: "RUNNING", version: 2 });
  const blocked = job({ status: "BLOCKED", version: 3, reason: "SECURITY_CHECK" });
  const fetch = stub([running], [blocked]); const onSelect = open();
  fireEvent.click(await screen.findByRole("button", { name: "중단 기록" }));
  await screen.findByRole("button", { name: "확인 후 재개" });
  expect(posted(fetch)).toEqual([{ action: "block", jobId: "job-a", version: 2, reason: "SECURITY_CHECK" }]);
  expect(screen.getByText("중단 사유: 네이버 보안 확인")).toBeInTheDocument();
  expect(screen.getByText("마지막 작업 완료: 완료 기록 없음")).toBeInTheDocument();
  expect(onSelect).toHaveBeenCalledWith(null);
});
it("keeps a stale-version error visible and does not select a supposedly running job", async () => {
  const fetch = stub([job({ status: "BLOCKED", version: 3 })], [], true); const onSelect = open();
  fireEvent.click(await screen.findByRole("button", { name: "확인 후 재개" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("작업 상태가 변경됐습니다.");
  expect(onSelect).not.toHaveBeenCalled();
  expect(posted(fetch)).toEqual([{ action: "resume", jobId: "job-a", version: 3 }]);
});
it("disables another start while a job runs, and mutations while a capture is being reviewed", async () => {
  stub([job({ status: "RUNNING" }), job({ id: "job-b", query: "토마토 3kg" })]);
  open(true);
  expect(await screen.findByRole("button", { name: "수집 시작" })).toBeDisabled();
  expect(screen.getByRole("button", { name: "중단 기록" })).toBeDisabled();
});
