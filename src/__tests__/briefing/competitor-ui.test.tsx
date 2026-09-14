import "@testing-library/jest-dom/vitest";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { CompetitorResearch } from "@/components/reports/CompetitorResearch";
import type { CompetitorEntry, CompetitorOverview } from "@/lib/briefing/competitor-contracts";
import type { ShoppingCandidate } from "@/lib/briefing/naver-shopping";

class ResizeObserverStub { observe() {} unobserve() {} disconnect() {} }
beforeEach(() => { vi.stubGlobal("ResizeObserver", ResizeObserverStub); });
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

const candidate = (patch: Partial<ShoppingCandidate>): ShoppingCandidate => ({
  productId: "p1", title: "대추방울토마토 2kg", url: "https://smartstore.naver.com/farmA/products/1", mallName: "농장A", listedPrice: 15900, rank: 1,
  productType: "2", proposedPackageKg: 2, varietyGroup: "JUJUBE", reviewReasons: ["VERIFY_PRICE_OPTION_SHIPPING", "WEIGHT_PROPOSED_FROM_TITLE"], excluded: false, storeKey: "farmA", ...patch,
});
const entry = (patch: Partial<CompetitorEntry>): CompetitorEntry => ({
  id: "e1", storeKey: "farmb", storeName: "농장B", productUrl: "https://smartstore.naver.com/farmb/products/9", productName: "대추방울토마토",
  varietyGroup: "JUJUBE", qualityGroup: "REGULAR", optionLabel: "2kg 로얄과", packageKg: 2, archivedAt: null, archiveReason: null,
  observations: [
    { id: "o2", observedAt: "2026-09-13T01:00:00.000Z", price: 16900, shippingFee: 0, availability: "IN_STOCK", notes: "쿠폰 없음" },
    { id: "o1", observedAt: "2026-09-06T01:00:00.000Z", price: 15900, shippingFee: 3000, availability: "IN_STOCK", notes: null },
  ], ...patch,
});
const overview = (patch: Partial<CompetitorOverview>): CompetitorOverview => ({
  configured: false, searchRetiredOn: "2026-07-31", asOf: "2026-09-14T01:00:00.000Z", target: 30, activeCount: 1, latestSearch: null, entries: [entry({})],
  groups: [{ key: "g1", packageKg: 2, label: "대추방울토마토 · 대추방울 · 일반 · 2kg", count: 1, medianDeliveredPrice: null, min: null, max: null, previousWeekChangePct: null, pairedCount: 0 }],
  limitations: ["검색 결과는 후보이며 API 노출 순서는 비광고 순위가 아닙니다."], ...patch,
});
const ok = (body: unknown) => ({ ok: true, status: 200, json: async () => body });
const fail = (status: number, error: string) => ({ ok: false, status, json: async () => ({ error }) });
type Handler = (init?: RequestInit) => unknown;
const stubFetch = (get: () => unknown, post: Handler = () => ok({ ok: true })) => {
  const fetch = vi.fn().mockImplementation(async (_url: string, init?: RequestInit) => init?.method === "POST" ? post(init) : get());
  vi.stubGlobal("fetch", fetch); return fetch;
};
const postBodies = (fetch: ReturnType<typeof vi.fn>) => fetch.mock.calls.filter(call => call[1]?.method === "POST").map(call => JSON.parse(String(call[1].body)));

it("shows API retirement without collecting keys and renders latest, history, and the 3-store rule", async () => {
  stubFetch(() => ok(overview({ configured: false })));
  render(<CompetitorResearch />);
  await screen.findByText(/고정 패널 1곳 \/ 목표 30곳/);
  expect(screen.getByText(/키를 추가할 필요 없이/)).toBeInTheDocument();
  expect(screen.getByLabelText("검색어")).toBeEnabled();
  expect(screen.queryByRole("button", { name: "검색 1회 실행" })).not.toBeInTheDocument();
  expect(screen.queryByLabelText(/client/i)).not.toBeInTheDocument();
  expect(screen.getByText(/판매가 16,900원 · 무료배송 · 배송 포함 16,900원 \(kg당 8,450원\)/)).toBeInTheDocument();
  expect(screen.getByText("관측 이력 2건")).toBeInTheDocument();
  expect(screen.getByText(/점포 3곳 이상일 때 표시합니다. \(현재 1곳\)/)).toBeInTheDocument();
  const link = screen.getAllByRole("link", { name: "상품 페이지 열기" })[0];
  expect(link).toHaveAttribute("rel", "noopener noreferrer");
  expect(link).toHaveAttribute("target", "_blank");
  expect(screen.getByText(/API 노출 순서는 비광고 순위가 아닙니다/)).toBeInTheDocument();
});

it("opens browser search without API calls and preserves historical candidates as unverified", async () => {
  const withSearch = overview({ latestSearch: { id: "s1", createdAt: "2026-09-14T00:30:00.000Z", status: "SUCCEEDED", errorCode: null,
    result: { query: "대추방울토마토", sort: "sim", observedAt: "2026-09-14T00:30:00.000Z", total: 2, excludedCount: 1, items: [
      candidate({}),
      candidate({ productId: "p2", rank: 2, title: "스테비아 토마토 주스", excluded: true, listedPrice: null, proposedPackageKg: null, varietyGroup: "UNKNOWN",
        reviewReasons: ["VERIFY_PRICE_OPTION_SHIPPING", "PRICE_UNAVAILABLE", "WEIGHT_MISSING", "HEURISTIC_STEVIA", "HEURISTIC_JUICE"] }),
    ] } } });
  const fetch = stubFetch(() => ok(withSearch));
  render(<CompetitorResearch />);
  await screen.findByText(/고정 패널 1곳 \/ 목표 30곳/);
  expect(screen.getByText(/2026년 7월 31일 종료/)).toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "검색 1회 실행" })).not.toBeInTheDocument();
  fireEvent.change(screen.getByLabelText("검색어"), { target: { value: "대추방울토마토 & 2kg" } });
  expect(screen.getByRole("link", { name: "네이버 쇼핑에서 찾기" })).toHaveAttribute("href", `https://search.shopping.naver.com/search/all?query=${encodeURIComponent("대추방울토마토 & 2kg")}`);
  expect(postBodies(fetch)).toEqual([]);
  expect(screen.getByText(/미검증 최저가 15,900원 · 추정 중량 2kg · 품종 추정 대추방울/)).toBeInTheDocument();
  expect(screen.getByText("중량은 제목 추정치")).toBeInTheDocument();
  expect(screen.queryByText(/API #2/)).not.toBeInTheDocument();
  fireEvent.click(screen.getByLabelText("제외 추정 후보도 표시"));
  await screen.findByText(/API #2/);
  expect(screen.getByText("제외 추정")).toBeInTheDocument();
  expect(screen.getByText("스테비아 추정 제외")).toBeInTheDocument();
  expect(screen.getByText("주스·음료 추정 제외")).toBeInTheDocument();
  fireEvent.click(screen.getAllByRole("button", { name: "패널 추가 양식에 채우기" })[0]);
  expect(screen.getByLabelText("판매처 이름")).toHaveValue("농장A");
  expect(screen.getByLabelText("스마트스토어 상품 URL")).toHaveValue("https://smartstore.naver.com/farmA/products/1");
  expect(screen.getByLabelText("포장 중량 (kg)")).toHaveValue("2");
  expect(screen.getByLabelText("비교 품목 (그룹 기준 라벨)")).toHaveValue("토마토");
  expect(screen.getByLabelText("상품·옵션명 (상품 페이지 표기 그대로)")).toHaveValue("대추방울토마토 2kg");
  expect(screen.getByLabelText("품종 그룹")).toHaveValue("JUJUBE");
  expect(screen.getByRole("button", { name: "패널에 추가" })).toBeDisabled();
  expect(postBodies(fetch)).toHaveLength(0);
});

it("adds a panel only after explicit confirmation and refreshes from the server", async () => {
  const fetch = stubFetch(() => ok(overview({})));
  render(<CompetitorResearch />);
  await screen.findByText(/고정 패널 1곳 \/ 목표 30곳/);
  fireEvent.change(screen.getByLabelText("판매처 이름"), { target: { value: "농장C" } });
  fireEvent.change(screen.getByLabelText("스마트스토어 상품 URL"), { target: { value: "https://smartstore.naver.com/farmc/products/77" } });
  expect(screen.getByLabelText("비교 품목 (그룹 기준 라벨)")).toHaveValue("토마토");
  fireEvent.change(screen.getByLabelText("비교 품목 (그룹 기준 라벨)"), { target: { value: "대추방울토마토" } });
  fireEvent.change(screen.getByLabelText("상품·옵션명 (상품 페이지 표기 그대로)"), { target: { value: "2kg 로얄과" } });
  fireEvent.change(screen.getByLabelText("포장 중량 (kg)"), { target: { value: "2" } });
  fireEvent.change(screen.getByLabelText("품종 그룹"), { target: { value: "JUJUBE" } });
  fireEvent.change(screen.getByLabelText("품질 그룹"), { target: { value: "GIFT" } });
  expect(screen.getByRole("button", { name: "패널에 추가" })).toBeDisabled();
  fireEvent.click(screen.getByRole("checkbox", { name: "상품 페이지에서 직접 확인함" }));
  fireEvent.click(screen.getByRole("button", { name: "패널에 추가" }));
  await screen.findByText(/고정 패널에 추가했습니다/);
  expect(postBodies(fetch)).toEqual([{ action: "addPanel", storeName: "농장C", productUrl: "https://smartstore.naver.com/farmc/products/77", productName: "대추방울토마토",
    varietyGroup: "JUJUBE", qualityGroup: "GIFT", sizeGrade: "UNKNOWN", sizeCriteria: "", optionLabel: "2kg 로얄과", packageKg: 2, cultivarName: "", color: "UNKNOWN", mixture: "UNKNOWN", processing: "UNKNOWN", confirmed: true }]);
  expect(fetch.mock.calls.filter(call => call[1]?.method !== "POST")).toHaveLength(2);
  expect(screen.getByLabelText("판매처 이름")).toHaveValue("");
  expect(screen.getByLabelText("비교 품목 (그룹 기준 라벨)")).toHaveValue("토마토");
});

it("rejects a non-smartstore URL before posting", async () => {
  const fetch = stubFetch(() => ok(overview({})));
  render(<CompetitorResearch />);
  await screen.findByText(/고정 패널 1곳 \/ 목표 30곳/);
  fireEvent.change(screen.getByLabelText("판매처 이름"), { target: { value: "농장C" } });
  fireEvent.change(screen.getByLabelText("스마트스토어 상품 URL"), { target: { value: "https://example.com/products/1" } });
  fireEvent.change(screen.getByLabelText("상품·옵션명 (상품 페이지 표기 그대로)"), { target: { value: "1kg" } });
  fireEvent.change(screen.getByLabelText("포장 중량 (kg)"), { target: { value: "1" } });
  fireEvent.click(screen.getByRole("checkbox", { name: "상품 페이지에서 직접 확인함" }));
  fireEvent.click(screen.getByRole("button", { name: "패널에 추가" }));
  expect(await screen.findByRole("alert")).toHaveTextContent(/smartstore.naver.com/);
  expect(postBodies(fetch)).toEqual([]);
});

it("records observations with blank=unknown, zero=free, ISO observedAt, and blocks in-stock without a price", async () => {
  const fetch = stubFetch(() => ok(overview({})));
  render(<CompetitorResearch />);
  await screen.findByText(/고정 패널 1곳 \/ 목표 30곳/);
  fireEvent.click(screen.getByRole("button", { name: "관측 기록" }));
  expect(await screen.findByRole("alert")).toHaveTextContent(/양수 판매가/);
  expect(postBodies(fetch)).toEqual([]);
  fireEvent.change(screen.getByLabelText("관측 시각"), { target: { value: "2026-09-13T10:30" } });
  fireEvent.change(screen.getByLabelText("판매가 (원, 비우면 미확인)"), { target: { value: "17,900" } });
  fireEvent.change(screen.getByLabelText("배송비 (원, 0은 무료)"), { target: { value: "0" } });
  fireEvent.change(screen.getByLabelText("메모 (선택)"), { target: { value: "  기획전가  " } });
  fireEvent.click(screen.getByRole("button", { name: "관측 기록" }));
  await screen.findByText("관측을 기록했습니다.");
  const [body] = postBodies(fetch);
  expect(body).toMatchObject({ action: "record", entryId: "e1", price: 17900, shippingFee: 0, availability: "IN_STOCK", notes: "기획전가" });
  expect(body.observedAt).toBe(new Date("2026-09-13T10:30").toISOString());
  fireEvent.change(screen.getByLabelText("재고 상태"), { target: { value: "OUT_OF_STOCK" } });
  fireEvent.click(screen.getByRole("button", { name: "관측 기록" }));
  await waitFor(() => expect(postBodies(fetch)).toHaveLength(2));
  expect(postBodies(fetch)[1]).toMatchObject({ action: "record", price: null, shippingFee: null, availability: "OUT_OF_STOCK" });
  expect(postBodies(fetch)[1]).not.toHaveProperty("notes");
});

it("archives with a reason, keeps history visible, and surfaces server errors", async () => {
  const archivedEntry = entry({ archivedAt: "2026-09-14T00:00:00.000Z", archiveReason: "판매 종료" });
  let archived = false;
  const fetch = stubFetch(() => ok(archived ? overview({ entries: [archivedEntry], activeCount: 0 }) : overview({})),
    init => { const body = JSON.parse(String(init?.body)); if (body.action === "archive") { archived = true; return ok({ ok: true }); } return fail(409, "이미 고정 비교군에 있는 점포입니다."); });
  render(<CompetitorResearch />);
  await screen.findByText(/고정 패널 1곳 \/ 목표 30곳/);
  expect(screen.getByRole("button", { name: "보관" })).toBeDisabled();
  fireEvent.change(screen.getByLabelText("보관 사유"), { target: { value: "판매 종료" } });
  fireEvent.click(screen.getByRole("button", { name: "보관" }));
  await screen.findByText(/고정 패널 0곳 \/ 목표 30곳/);
  expect(postBodies(fetch)).toEqual([{ action: "archive", entryId: "e1", reason: "판매 종료" }]);
  fireEvent.click(screen.getByRole("button", { name: "보관된 패널 1곳 보기" }));
  const card = screen.getByText("보관됨").closest("li") as HTMLElement;
  expect(within(card).getByText(/사유: 판매 종료/)).toBeInTheDocument();
  expect(within(card).getByText("관측 이력 2건")).toBeInTheDocument();
  expect(within(card).queryByRole("button", { name: "관측 기록" })).not.toBeInTheDocument();
});

it("keeps observation draft when saving fails", async () => {
  stubFetch(() => ok(overview({})), () => fail(503, "저장에 실패했습니다."));
  render(<CompetitorResearch />);
  await screen.findByText(/고정 패널 1곳 \/ 목표 30곳/);
  fireEvent.change(screen.getByLabelText("판매가 (원, 비우면 미확인)"), { target: { value: "18500" } });
  fireEvent.click(screen.getByRole("button", { name: "관측 기록" }));
  expect(await screen.findByText("저장에 실패했습니다.")).toBeInTheDocument();
  expect(screen.getByLabelText("판매가 (원, 비우면 미확인)")).toHaveValue("18500");
});

it("requires matching option and human review before prefilling, then explicitly saves", async () => {
  const fetch = stubFetch(() => ok(overview({ entries: [entry({ optionLabel: "중과 2kg" })] })));
  render(<CompetitorResearch />);
  await screen.findByText(/고정 패널 1곳 \/ 목표 30곳/);
  fireEvent.click(screen.getByText("상품 화면에서 가격 가져오기"));
  fireEvent.change(screen.getByLabelText("상품 화면 텍스트"), { target: { value: "선택 옵션: 중과 2kg\n총 금액 18,500원\n무료배송" } });
  fireEvent.click(screen.getByRole("button", { name: "가격 읽기" }));
  expect(screen.getByRole("button", { name: "기록 양식에 채우기" })).toBeDisabled();
  fireEvent.change(screen.getByLabelText("지금 선택한 옵션명"), { target: { value: "소과 2kg" } });
  expect(screen.getByRole("button", { name: "기록 양식에 채우기" })).toBeDisabled();
  fireEvent.change(screen.getByLabelText("지금 선택한 옵션명"), { target: { value: "중과 2kg" } });
  fireEvent.click(screen.getByRole("checkbox", { name: /선택 옵션·수량 1과/ }));
  fireEvent.click(screen.getByRole("button", { name: "기록 양식에 채우기" }));
  expect(screen.getByLabelText("판매가 (원, 비우면 미확인)")).toHaveValue("18500");
  expect(screen.getByLabelText("배송비 (원, 0은 무료)")).toHaveValue("0");
  expect(screen.getByLabelText("재고 상태")).toHaveValue("UNKNOWN");
  expect(postBodies(fetch)).toEqual([]);
  fireEvent.change(screen.getByLabelText("재고 상태"), { target: { value: "IN_STOCK" } });
  fireEvent.click(screen.getByRole("button", { name: "관측 기록" }));
  await waitFor(() => expect(postBodies(fetch)).toHaveLength(1));
  expect(postBodies(fetch)[0]).toMatchObject({ price: 18500, shippingFee: 0, availability: "IN_STOCK" });
  expect(postBodies(fetch)[0].notes).toContain("중과 2kg");
});

it("computes a local cost scenario without posting", async () => {
  const fetch = stubFetch(() => ok(overview({ groups: [{ key: "g1", packageKg: 2, label: "대추방울토마토 · 대추방울 · 일반 · 2kg", count: 3, medianDeliveredPrice: 12000, min: 11000, max: 13000, previousWeekChangePct: 2.5, pairedCount: 3 }] })));
  render(<CompetitorResearch />);
  await screen.findByText(/고정 패널 1곳 \/ 목표 30곳/);
  expect(screen.getByText(/전주 대비 \+2\.5% \(짝 3곳\)/)).toBeInTheDocument();
  fireEvent.change(screen.getByLabelText("내 포장 중량 (kg)"), { target: { value: "2" } });
  fireEvent.change(screen.getByLabelText("생산 원가 (원/kg)"), { target: { value: "3000" } });
  fireEvent.change(screen.getByLabelText("포장·자재비 (원/박스)"), { target: { value: "1000" } });
  fireEvent.change(screen.getByLabelText("내 배송비 부담 (원/박스)"), { target: { value: "3000" } });
  fireEvent.change(screen.getByLabelText("플랫폼 수수료 (%)"), { target: { value: "5" } });
  fireEvent.change(screen.getByLabelText("목표 마진 (% of 판매가)"), { target: { value: "15" } });
  fireEvent.change(screen.getByLabelText("비교 그룹 (대표 가격 있는 그룹만)"), { target: { value: "g1" } });
  expect(screen.getByText("12,500원")).toBeInTheDocument();
  expect(screen.getByText("+4.2%")).toBeInTheDocument();
  fireEvent.change(screen.getByLabelText("내 포장 중량 (kg)"), { target: { value: "3" } });
  expect(screen.queryByText("+4.2%")).not.toBeInTheDocument();
  expect(screen.getByText(/가격 차이 계산을 보류/)).toBeInTheDocument();
  expect(postBodies(fetch)).toEqual([]);
});

it("validates capture product identity and stores capture time rather than import time", async () => {
  const fetch = stubFetch(() => ok(overview({ entries: [entry({ optionLabel: "중과 2kg" })] })));
  render(<CompetitorResearch />);
  await screen.findByText(/고정 패널 1곳 \/ 목표 30곳/);
  fireEvent.click(screen.getByText("상품 화면에서 가격 가져오기"));
  const capturedAt = new Date(Date.now() - 20 * 60_000).toISOString();
  const payload = { schemaVersion: "retirefarm-visible-product-v1", capturedAt, productUrl: "https://smartstore.naver.com/wrong/products/9", title: "토마토", method: "product-region",
    text: "선택 옵션: 중과 2kg\n총 금액\n도움말\n18,500원\n무료배송" };
  fireEvent.change(screen.getByLabelText("상품 화면 텍스트"), { target: { value: JSON.stringify(payload) } });
  fireEvent.click(screen.getByRole("button", { name: "가격 읽기" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("다른 상품");
  expect(screen.queryByRole("button", { name: "기록 양식에 채우기" })).not.toBeInTheDocument();
  payload.productUrl = entry({}).productUrl;
  fireEvent.change(screen.getByLabelText("상품 화면 텍스트"), { target: { value: JSON.stringify(payload) } });
  fireEvent.click(screen.getByRole("button", { name: "가격 읽기" }));
  fireEvent.click(screen.getByRole("checkbox", { name: /선택 옵션·수량 1과/ }));
  fireEvent.click(screen.getByRole("button", { name: "기록 양식에 채우기" }));
  expect(postBodies(fetch)).toEqual([]);
  fireEvent.change(screen.getByLabelText("재고 상태"), { target: { value: "IN_STOCK" } });
  fireEvent.click(screen.getByRole("button", { name: "관측 기록" }));
  await waitFor(() => expect(postBodies(fetch)).toHaveLength(1));
  expect(postBodies(fetch)[0]).toMatchObject({ observedAt: capturedAt, price: 18500, shippingFee: 0 });
});

it("reads an exported JSON file into review without posting", async () => {
  const fetch = stubFetch(() => ok(overview({ entries: [entry({ optionLabel: "중과 2kg" })] })));
  render(<CompetitorResearch />);
  await screen.findByText(/고정 패널 1곳 \/ 목표 30곳/);
  fireEvent.click(screen.getByText("상품 화면에서 가격 가져오기"));
  const payload = { schemaVersion: "retirefarm-visible-product-v1", productUrl: entry({}).productUrl, capturedAt: new Date(Date.now() - 1000).toISOString(),
    title: "토마토", method: "selection", text: "선택 옵션: 중과 2kg\n총 금액 18,500원\n무료배송" };
  const file = Object.assign(new File([JSON.stringify(payload)], "capture.json", { type: "application/json" }), { text: async () => JSON.stringify(payload) });
  fireEvent.change(screen.getByLabelText("확장 프로그램 수집 파일 (.json)"), { target: { files: [file] } });
  await waitFor(() => expect(screen.getByRole("button", { name: "가격 읽기" })).toBeEnabled());
  fireEvent.click(screen.getByRole("button", { name: "가격 읽기" }));
  expect(await screen.findByText(/상품 주소 일치 확인/)).toBeInTheDocument();
  expect(postBodies(fetch)).toEqual([]);
});


it("requires renewed confirmation after option identity edits and submits the explicit attributes", async () => {
  const fetch = stubFetch(() => ok(overview({})));
  render(<CompetitorResearch />);
  await screen.findByText(/고정 패널 1곳 \/ 목표 30곳/);
  expect(screen.getByLabelText("확인한 품종명")).toHaveValue("");
  for (const label of ["과실 색상", "품종 혼합 여부", "가공 여부"]) expect(screen.getByLabelText(label)).toHaveValue("UNKNOWN");
  fireEvent.change(screen.getByLabelText("판매처 이름"), { target: { value: "농장C" } });
  fireEvent.change(screen.getByLabelText("스마트스토어 상품 URL"), { target: { value: "https://smartstore.naver.com/farmc/products/77" } });
  fireEvent.change(screen.getByLabelText("상품·옵션명 (상품 페이지 표기 그대로)"), { target: { value: "루체 주황 2kg" } });
  fireEvent.change(screen.getByLabelText("포장 중량 (kg)"), { target: { value: "2" } });
  fireEvent.click(screen.getByRole("checkbox", { name: "상품 페이지에서 직접 확인함" }));
  expect(screen.getByRole("button", { name: "패널에 추가" })).toBeEnabled();
  fireEvent.change(screen.getByLabelText("확인한 품종명"), { target: { value: "  루체  " } });
  expect(screen.getByRole("checkbox", { name: "상품 페이지에서 직접 확인함" })).not.toBeChecked();
  expect(screen.getByRole("button", { name: "패널에 추가" })).toBeDisabled();
  fireEvent.change(screen.getByLabelText("과실 색상"), { target: { value: "ORANGE" } });
  fireEvent.change(screen.getByLabelText("품종 혼합 여부"), { target: { value: "SINGLE" } });
  fireEvent.change(screen.getByLabelText("가공 여부"), { target: { value: "FRESH" } });
  expect(postBodies(fetch)).toEqual([]);
  fireEvent.click(screen.getByRole("checkbox", { name: "상품 페이지에서 직접 확인함" }));
  fireEvent.click(screen.getByRole("button", { name: "패널에 추가" }));
  await waitFor(() => expect(postBodies(fetch)).toHaveLength(1));
  expect(postBodies(fetch)[0]).toMatchObject({ cultivarName: "루체", color: "ORANGE", mixture: "SINGLE", processing: "FRESH", packageKg: 2 });
});

it("renders legacy identity as unknown without inventing a cultivar or processing type", async () => {
  stubFetch(() => ok(overview({ entries: [entry({})], groups: [] })));
  render(<CompetitorResearch />);
  await screen.findByText(/고정 패널 1곳 \/ 목표 30곳/);
  expect(screen.getByText(/품종명 미확인 · 색상 미확인/)).toBeInTheDocument();
  expect(screen.getByText(/집계할 그룹이 아직 없습니다/)).toHaveTextContent(/단일 품종/);
});
