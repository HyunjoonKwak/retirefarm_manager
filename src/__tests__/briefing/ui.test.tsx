import "@testing-library/jest-dom/vitest";
import { afterEach, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { WeeklyBriefing } from "@/components/reports/WeeklyBriefing";
import { BriefingPriceAnalysis } from "@/components/reports/BriefingPriceAnalysis";
import { snapshotSchema } from "@/lib/briefing/contracts";

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
type Facet = { origin?: string; variety?: string; observedForOrigin?: boolean };
const emptyList = { runs: [], worker: { configured: false, lastSeenAt: null } };
const facetBody = (origins: string[], varieties: Facet[]) => ({
  periodStart: "2026-09-06T15:00:00Z", periodEnd: "2026-09-13T15:00:00Z", corporations: ["11000101"], scope: {}, asOf: "2026-09-14T01:00:00Z",
  origins: origins.map(origin => ({ origin, tradeCount: 2, varietyCount: 1 })), collectionState: "stored_records_only",
  varieties: varieties.map(item => ({ variety: item.variety, tradeCount: item.observedForOrigin === false ? 0 : 3, observedForOrigin: item.observedForOrigin ?? true })),
});
const ok = (body: unknown) => ({ ok: true, json: async () => body });
/** Routes the list, the facets endpoint (by query) and POSTs like the real API. */
const stubFetch = (facets: (params: URLSearchParams) => unknown, post: unknown = { snapshot: { periodStart: "2026-09-06T15:00:00Z", sources: [], metrics: [], limitations: [] } }) => {
  const fetch = vi.fn().mockImplementation(async (url: string, options?: RequestInit) => options?.method === "POST" ? ok(post)
    : url.startsWith("/api/briefings/facets?") ? ok(facets(new URL(url, "http://localhost").searchParams)) : ok(emptyList));
  vi.stubGlobal("fetch", fetch); return fetch;
};
const facetCalls = (fetch: ReturnType<typeof vi.fn>) => fetch.mock.calls.map(call => String(call[0])).filter(url => url.includes("/facets?")).map(url => decodeURIComponent(url.split("?")[1]));
const postBodies = (fetch: ReturnType<typeof vi.fn>) => fetch.mock.calls.filter(call => call[1]?.method === "POST").map(call => JSON.parse(call[1].body));
it("previews without enqueueing and clears the preview when a choice changes", async () => {
  const fetch = stubFetch(() => facetBody(["장수"], [{ variety: "대추" }]));
  render(<WeeklyBriefing />);
  await screen.findByText("아직 요청한 브리핑이 없습니다.");
  await screen.findByRole("option", { name: "장수 · 2건" });
  await waitFor(() => expect(screen.getByRole("button", { name: "시세 분석 미리보기" })).toBeEnabled());
  fireEvent.click(screen.getByRole("button", { name: "시세 분석 미리보기" }));
  expect(screen.getByLabelText("품목")).toBeDisabled();
  await screen.findByRole("heading", { name: "시세 분석 미리보기" });
  await waitFor(() => expect(screen.getByLabelText("품목")).toBeEnabled());
  expect(postBodies(fetch).map(body => body.action)).toEqual(["preview"]);
  fireEvent.change(screen.getByLabelText("산지 (선택)"), { target: { value: "장수" } });
  expect(screen.queryByRole("heading", { name: "시세 분석 미리보기" })).not.toBeInTheDocument();
  expect(screen.getByLabelText("산지 (선택)")).toHaveValue("장수");
});
it("offers only observed choices, explains that records are not proof of shipping, and submits the exact choice", async () => {
  const fetch = stubFetch(params => params.get("origin") === "평택"
    ? facetBody(["평택", "장수"], [{ variety: "대추빨강" }, { variety: "완숙", observedForOrigin: false }])
    : facetBody(["평택", "장수"], [{ variety: "대추빨강" }, { variety: "완숙" }]));
  render(<WeeklyBriefing />);
  await screen.findByText("아직 요청한 브리핑이 없습니다.");
  expect(screen.getByText(/자동 예약·알림은 준비 중/)).toBeInTheDocument();
  expect(screen.getByText(/실제 출하가 있었다는 증명은 아니고/)).toBeInTheDocument();
  await screen.findByRole("option", { name: "완숙 · 3건" });
  expect(screen.getByText(/산지 2곳 · 품종 2종 · 법인 1곳/)).toBeInTheDocument();
  expect(screen.queryByText(/11000101/)).not.toBeInTheDocument();
  fireEvent.change(screen.getByLabelText("품종 (선택)"), { target: { value: "완숙" } });
  expect(screen.getByLabelText("품종 (선택)")).toHaveValue("완숙");
  fireEvent.change(screen.getByLabelText("산지 (선택)"), { target: { value: "평택" } });
  // Origin change drops the variety immediately and keeps the origin list while the origin-scoped facets load.
  expect(screen.getByLabelText("품종 (선택)")).toHaveValue("");
  expect(screen.getByLabelText("산지 (선택)")).toHaveValue("평택");
  expect(screen.getByRole("option", { name: "장수 · 2건" })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "초안 생성 요청" })).toBeDisabled();
  const unobserved = await screen.findByRole("option", { name: "완숙 · 선택 산지 기록 없음" });
  expect(unobserved).toBeDisabled();
  expect(screen.getByRole("option", { name: "대추빨강 · 3건" })).toBeEnabled();
  expect(facetCalls(fetch)).toEqual(["productName=토마토", "productName=토마토&origin=평택"]);
  fireEvent.change(screen.getByLabelText("품종 (선택)"), { target: { value: "대추빨강" } });
  await waitFor(() => expect(screen.getByRole("button", { name: "초안 생성 요청" })).toBeEnabled());
  fireEvent.click(screen.getByRole("button", { name: "초안 생성 요청" }));
  await waitFor(() => expect(fetch).toHaveBeenCalledWith("/api/briefings", expect.objectContaining({
    method: "POST", body: JSON.stringify({ action: "enqueue", productName: "토마토", variety: "대추빨강", origin: "평택" }),
  })));
});
it("ignores a stale facets response and clears choices when the product changes", async () => {
  const pending: { params: URLSearchParams; resolve: (body: unknown) => void }[] = [];
  const fetch = vi.fn().mockImplementation((url: string) => url.startsWith("/api/briefings/facets?")
    ? new Promise(resolve => pending.push({ params: new URL(url, "http://localhost").searchParams, resolve: body => resolve(ok(body)) }))
    : Promise.resolve(ok(emptyList)));
  vi.stubGlobal("fetch", fetch); render(<WeeklyBriefing />);
  await waitFor(() => expect(pending).toHaveLength(1));
  fireEvent.change(screen.getByLabelText("품목"), { target: { value: "대추" } });
  await waitFor(() => expect(pending).toHaveLength(2));
  expect(pending.map(item => item.params.get("productName"))).toEqual(["토마토", "대추"]);
  pending[1].resolve(facetBody(["평택"], [{ variety: "생대추" }]));
  await screen.findByRole("option", { name: "평택 · 2건" });
  // Let the superseded response settle completely before asserting it was discarded.
  await act(async () => { pending[0].resolve(facetBody(["장수"], [{ variety: "토마토품종" }])); await new Promise(resolve => setTimeout(resolve, 20)); });
  expect(screen.getByRole("button", { name: "시세 분석 미리보기" })).toBeEnabled();
  expect(screen.queryByRole("option", { name: "장수 · 2건" })).not.toBeInTheDocument();
  expect(screen.getByRole("option", { name: "평택 · 2건" })).toBeInTheDocument();
  fireEvent.change(screen.getByLabelText("산지 (선택)"), { target: { value: "평택" } });
  expect(screen.getByLabelText("산지 (선택)")).toHaveValue("평택");
  fireEvent.change(screen.getByLabelText("품목"), { target: { value: "사과" } });
  expect(screen.getByLabelText("산지 (선택)")).toHaveValue("");
  expect(screen.getByLabelText("품종 (선택)")).toHaveValue("");
  expect(screen.queryByRole("option", { name: "평택 · 2건" })).not.toBeInTheDocument();
});
it("keeps a chosen origin visible and consistent with the request when the facets refresh fails", async () => {
  let fail = false;
  const fetch = stubFetch(() => { if (fail) throw new Error("offline"); return facetBody(["평택"], [{ variety: "대추빨강" }]); });
  render(<WeeklyBriefing />);
  await screen.findByRole("option", { name: "평택 · 2건" });
  fail = true;
  fireEvent.change(screen.getByLabelText("산지 (선택)"), { target: { value: "평택" } });
  await screen.findByRole("alert");
  expect(screen.getByLabelText("산지 (선택)")).toHaveValue("평택");
  expect(screen.getByRole("option", { name: "평택 · 기록 확인 안 됨" })).toBeInTheDocument();
  await waitFor(() => expect(screen.getByRole("button", { name: "시세 분석 미리보기" })).toBeEnabled());
  fireEvent.click(screen.getByRole("button", { name: "시세 분석 미리보기" }));
  await waitFor(() => expect(postBodies(fetch)).toEqual([{ action: "preview", productName: "토마토", variety: "", origin: "평택" }]));
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
