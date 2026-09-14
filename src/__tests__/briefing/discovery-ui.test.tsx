import "@testing-library/jest-dom/vitest";
import { afterEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { CompetitorDiscovery } from "@/components/reports/competitor/CompetitorDiscovery";
import { emptyPanelDraft, type PanelDraft } from "@/components/reports/competitor/CompetitorPanelForm";
import type { DiscoveryOverview, RankedDiscoveryCandidate } from "@/lib/briefing/discovery-contracts";

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
const candidate: RankedDiscoveryCandidate = { id: "candidate-a", storeKey: "farm-a", storeName: "후보농장", title: "대추방울토마토 2kg",
  productUrl: "https://smartstore.naver.com/farm-a/products/1", status: "WATCH", decisionReason: null, lastSeenAt: "2026-09-14T03:00:00Z",
  recommended: true, eligible: true, queryCount: 1, bestPosition: 2, reviewDelta: null, reasons: ["검색어 1개에서 비광고 확인"], evidence: [] };
const overview = (patch: Partial<DiscoveryOverview> = {}): DiscoveryOverview => ({ asOf: "2026-09-14T03:00:00Z", policyVersion: "v1", candidates: [candidate], recommendedCount: 1, latestRun: null, ...patch });
const stub = (body = overview(), fail = false) => {
  const fetch = vi.fn().mockImplementation(async (_url: string, init?: RequestInit) => ({ ok: !fail, json: async () => fail ? { error: "저장 서비스 점검 중" } : init?.method === "POST" ? { ok: true, evidenceCount: 1 } : body }));
  vi.stubGlobal("fetch", fetch); return fetch;
};
async function open(props: { fixedStoreKeys?: string[]; onUse?: (draft: PanelDraft) => void } = {}) {
  const rendered = render(<CompetitorDiscovery fixedStoreKeys={props.fixedStoreKeys ?? []} onUse={props.onUse ?? vi.fn()} />);
  const details = rendered.container.querySelector("details")!;
  details.open = true; fireEvent(details, new Event("toggle"));
  await screen.findByLabelText("후보 보기");
  return rendered;
}
const bodies = (fetch: ReturnType<typeof vi.fn>) => fetch.mock.calls.filter(c => c[1]?.method === "POST").map(c => JSON.parse(c[1].body));

it("loads only when opened, shows honest automation state and prefills no option facts", async () => {
  const fetch = stub(); const onUse = vi.fn();
  render(<CompetitorDiscovery fixedStoreKeys={[]} onUse={onUse} />);
  expect(fetch).not.toHaveBeenCalled();
  const details = screen.getByText("경쟁 판매처 추천 후보").closest("details")!;
  details.open = true; fireEvent(details, new Event("toggle"));
  await screen.findByText("후보농장");
  expect(screen.getByText(/자동 검색·주간 예약은 아직 준비 중/)).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "비교 등록 양식 채우기" }));
  expect(onUse).toHaveBeenCalledWith({ ...emptyPanelDraft, storeName: candidate.storeName, productUrl: candidate.productUrl });
  expect(bodies(fetch)).toEqual([]);
});

it("offers another option for an existing fixed store without preconfirming it", async () => {
  stub(); await open({ fixedStoreKeys: [candidate.storeKey] });
  await screen.findByText("고정 비교 중");
  expect(screen.getByRole("button", { name: "다른 옵션 등록 양식 채우기" })).toBeEnabled();
});

it("requires a reason before excluding a seller and sends only a decision", async () => {
  const fetch = stub(); await open(); await screen.findByText("후보농장");
  const button = screen.getByRole("button", { name: "판매처 추천 제외" });
  expect(button).toBeDisabled();
  fireEvent.change(screen.getByLabelText("후보농장 선정·제외 사유"), { target: { value: "우리 품종과 다름" } });
  fireEvent.click(button);
  await waitFor(() => expect(bodies(fetch)).toEqual([{ action: "decision", candidateId: "candidate-a", status: "EXCLUDED", reason: "우리 품종과 다름" }]));
  await screen.findByText(/고정 비교 목록은 유지됩니다/);
});

it("retains unknown metrics when saving evidence and never creates a price observation", async () => {
  const fetch = stub(overview({ candidates: [], recommendedCount: 0 })); await open();
  const details = screen.getByText("검색 근거 추가").closest("details")!; details.open = true; fireEvent(details, new Event("toggle"));
  fireEvent.change(screen.getByLabelText("후보 판매처 이름"), { target: { value: "새농장" } });
  fireEvent.change(screen.getByLabelText("후보 상품 URL"), { target: { value: candidate.productUrl } });
  fireEvent.change(screen.getByLabelText("후보 상품 제목"), { target: { value: candidate.title } });
  fireEvent.submit(screen.getByRole("button", { name: "근거 저장·추천 갱신" }).closest("form")!);
  await waitFor(() => expect(bodies(fetch)).toHaveLength(1));
  expect(bodies(fetch)[0]).toMatchObject({ action: "import", evidence: [{ position: null, reviewCount: null, reviewBasis: "UNKNOWN", adStatus: "UNKNOWN", relevance: "UNKNOWN" }] });
  expect(fetch.mock.calls.every(c => c[0] === "/api/briefings/discovery")).toBe(true);
  await screen.findByText(/검색 근거 1건을 저장/);
});

it("rejects product capture JSON instead of silently importing it as candidates", async () => {
  const fetch = stub(); await open();
  const details = screen.getByText("검색 근거 추가").closest("details")!; details.open = true; fireEvent(details, new Event("toggle"));
  const file = { size: 100, text: async () => JSON.stringify({ schemaVersion: "retirefarm-visible-product-v1", productUrl: candidate.productUrl }) };
  fireEvent.change(screen.getByLabelText("검색 후보 JSON 파일 가져오기"), { target: { files: [file] } });
  await screen.findByText(/상품 가격 수집 파일은 고정 패널에서/);
  expect(bodies(fetch)).toEqual([]);
});

it("shows a load failure instead of claiming an empty successful discovery", async () => {
  stub(overview(), true); await open();
  expect(await screen.findByRole("alert")).toHaveTextContent("저장 서비스 점검 중");
  expect(screen.queryByText(/표시할 후보가 없습니다/)).not.toBeInTheDocument();
});

it("rejects a capture from another query or before the selected job started", async () => {
  const startedAt = new Date(Date.now() - 5000).toISOString();
  const job = { id: "job-a", query: "tomato", searchUrl: "https://search.shopping.naver.com/ns/search?query=tomato",
    status: "RUNNING", reason: null, version: 2, createdAt: startedAt, startedAt, completedAt: null, evidenceCount: 0, runId: null };
  const fetch = vi.fn().mockImplementation(async (url: string) => ({ ok: true, json: async () => url.endsWith("/collection")
    ? { jobs: [job], lastSuccessAt: null } : overview() }));
  vi.stubGlobal("fetch", fetch);
  await open();
  const queue = screen.getByText("검색 수집 작업 관리").closest("details")!;
  queue.open = true; fireEvent(queue, new Event("toggle"));
  fireEvent.click(await screen.findByRole("button", { name: "이 작업에 파일 연결" }));
  const input = screen.getByLabelText("검색 후보 JSON 파일 가져오기");
  const base = { schemaVersion: "retirefarm-visible-search-v1", sourceUrl: "https://search.shopping.naver.com/ns/search?query=other",
    query: "other", capturedAt: new Date().toISOString(), searchSort: "UNKNOWN", searchEnvironment: "BROWSER_UNSPECIFIED",
    items: [{ productUrl: candidate.productUrl, urlStatus: "COMPOSED", title: "토마토", storeName: "농장", position: 1,
      adStatus: "UNKNOWN", purchaseLabel: "", reviewCount: null, reviewBasis: "UNKNOWN" }] };
  const send = (raw: unknown) => fireEvent.change(input, { target: { files: [{ size: 1000, text: async () => JSON.stringify(raw) }] } });
  send(base);
  expect(await screen.findByRole("alert")).toHaveTextContent(/작업과 검색어가 같고/);
  expect(screen.queryByRole("region", { name: "검색 수집 미리보기" })).not.toBeInTheDocument();
  send({ ...base, query: "tomato", sourceUrl: job.searchUrl, capturedAt: new Date(Date.now() - 10000).toISOString() });
  await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent(/작업 시작·재개 후/));
  send({ ...base, query: "tomato", sourceUrl: job.searchUrl });
  expect(await screen.findByRole("region", { name: "검색 수집 미리보기" })).toBeInTheDocument();
  expect(screen.getByText(/^연결 작업: tomato\./)).toBeInTheDocument();
  expect(bodies(fetch)).toEqual([]);
});

const searchCapture = (patch: Record<string, unknown> = {}) => ({ schemaVersion: "retirefarm-visible-search-v1", sourceUrl: "https://search.shopping.naver.com/ns/search?query=tomato&sort=SALE",
  query: "tomato", capturedAt: new Date(Date.now() - 1000).toISOString(), searchSort: "판매 많은순", searchEnvironment: "BROWSER_UNSPECIFIED",
  items: [{ productUrl: candidate.productUrl, urlStatus: "COMPOSED", title: "토마토", storeName: "농장", position: 1,
    adStatus: "UNKNOWN", purchaseLabel: "최근 1개월 50+명 구매", reviewCount: 12, reviewBasis: "UNKNOWN" }], ...patch });
async function openPaste() {
  const details = screen.getByText("검색 근거 추가").closest("details")!; details.open = true; fireEvent(details, new Event("toggle"));
  return screen.getByLabelText("검색 화면 수집 JSON 붙여넣기 (선택)");
}
const preview = (textarea: HTMLElement, text: string) => { fireEvent.change(textarea, { target: { value: text } }); fireEvent.click(screen.getByRole("button", { name: "붙여넣은 자료 미리보기" })); };
const region = () => screen.queryByRole("region", { name: "검색 수집 미리보기" });

it("previews pasted search capture JSON without posting and clears the pasted text", async () => {
  const fetch = stub(); await open();
  const textarea = await openPaste();
  expect(screen.getByRole("button", { name: "붙여넣은 자료 미리보기" })).toBeDisabled();
  preview(textarea, JSON.stringify(searchCapture()));
  expect(await screen.findByRole("region", { name: "검색 수집 미리보기" })).toBeInTheDocument();
  expect(textarea).toHaveValue("");
  expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  expect(bodies(fetch)).toEqual([]);
  fireEvent.change(textarea, { target: { value: "{" } });
  expect(region()).not.toBeInTheDocument();
  expect(bodies(fetch)).toEqual([]);
});

it("keeps the pasted capture observed time and search metadata through explicit review", async () => {
  const fetch = stub(); await open();
  const raw = searchCapture(); preview(await openPaste(), JSON.stringify(raw));
  await screen.findByRole("region", { name: "검색 수집 미리보기" });
  fireEvent.click(screen.getByRole("checkbox", { name: /목록 1/ }));
  fireEvent.click(screen.getByRole("checkbox", { name: /선택 항목의 상품 주소/ }));
  fireEvent.click(screen.getByRole("button", { name: "선택 1개 후보 저장" }));
  await waitFor(() => expect(bodies(fetch)).toHaveLength(1));
  expect(bodies(fetch)[0]).toMatchObject({ action: "import", evidence: [{ observedAt: raw.capturedAt, sourceUrl: "https://search.shopping.naver.com/ns/search?query=tomato&sort=SALE",
    searchSort: "판매 많은순", searchEnvironment: "BROWSER_UNSPECIFIED", collectionMethod: "EXTENSION", purchaseLabel: "최근 1개월 50+명 구매", reviewCount: 12, reviewBasis: "UNKNOWN", adStatus: "UNKNOWN" }] });
  expect(bodies(fetch)[0].collectionJobId).toBeUndefined();
});

it("rejects invalid, generic and oversize pasted text without importing or keeping a stale preview", async () => {
  const fetch = stub(); await open();
  const textarea = await openPaste();
  const file = { size: 1000, text: async () => JSON.stringify(searchCapture()) };
  fireEvent.change(screen.getByLabelText("검색 후보 JSON 파일 가져오기"), { target: { files: [file] } });
  await screen.findByRole("region", { name: "검색 수집 미리보기" });
  preview(textarea, "{not json");
  expect(await screen.findByRole("alert")).toHaveTextContent(/JSON/);
  expect(region()).not.toBeInTheDocument();
  preview(textarea, JSON.stringify({ action: "import", evidence: [{ productUrl: candidate.productUrl, storeName: "농장", title: "토마토", query: "tomato", observedAt: new Date().toISOString(),
    position: 1, adStatus: "UNKNOWN", relevance: "UNKNOWN", purchaseLabel: "", reviewCount: null, reviewBasis: "UNKNOWN" }] }));
  await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent(/검색 화면 수집 JSON/));
  expect(region()).not.toBeInTheDocument();
  preview(textarea, JSON.stringify({ schemaVersion: "retirefarm-visible-product-v1", productUrl: candidate.productUrl }));
  await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent(/검색 화면 수집 JSON/));
  // 90,000 Hangul characters are under 256K characters but over 256KB of UTF-8, so a byte check must reject before parsing.
  const oversize = "가".repeat(90000);
  preview(textarea, oversize);
  await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent(/256KB/));
  expect(textarea).toHaveValue(oversize);
  expect(region()).not.toBeInTheDocument();
  expect(bodies(fetch)).toEqual([]);
});

it("applies the selected-job query and start-time checks to pasted captures", async () => {
  const startedAt = new Date(Date.now() - 5000).toISOString();
  const job = { id: "job-b", query: "tomato", searchUrl: "https://search.shopping.naver.com/ns/search?query=tomato",
    status: "RUNNING", reason: null, version: 3, createdAt: startedAt, startedAt, completedAt: null, evidenceCount: 0, runId: null };
  const fetch = vi.fn().mockImplementation(async (url: string) => ({ ok: true, json: async () => url.endsWith("/collection") ? { jobs: [job], lastSuccessAt: null } : overview() }));
  vi.stubGlobal("fetch", fetch);
  await open();
  const queue = screen.getByText("검색 수집 작업 관리").closest("details")!; queue.open = true; fireEvent(queue, new Event("toggle"));
  fireEvent.click(await screen.findByRole("button", { name: "이 작업에 파일 연결" }));
  const textarea = await openPaste();
  preview(textarea, JSON.stringify(searchCapture({ query: "other", sourceUrl: "https://search.shopping.naver.com/ns/search?query=other" })));
  expect(await screen.findByRole("alert")).toHaveTextContent(/작업과 검색어가 같고/);
  expect(region()).not.toBeInTheDocument();
  preview(textarea, JSON.stringify(searchCapture({ capturedAt: new Date(Date.now() - 10000).toISOString() })));
  await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent(/작업 시작·재개 후/));
  expect(region()).not.toBeInTheDocument();
  preview(textarea, JSON.stringify(searchCapture()));
  expect(await screen.findByRole("region", { name: "검색 수집 미리보기" })).toBeInTheDocument();
  expect(screen.getByText(/^연결 작업: tomato\./)).toBeInTheDocument();
  expect(bodies(fetch)).toEqual([]);
});
