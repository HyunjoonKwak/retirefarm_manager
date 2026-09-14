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

it("does not offer duplicate fixed-store registration", async () => {
  stub(); await open({ fixedStoreKeys: [candidate.storeKey] });
  await screen.findByText("고정 비교 중");
  expect(screen.getByRole("button", { name: "비교 등록 양식 채우기" })).toBeDisabled();
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
