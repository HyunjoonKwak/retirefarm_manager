import { afterEach, expect, it, vi } from "vitest";
import "@testing-library/jest-dom/vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { MarketVarietyAnalysis } from "@/components/market/MarketVarietyAnalysis";
const props = {
  productName: "토마토", origin: "논산", unit: null, grade: null, varieties: [] as string[],
  days: "30", onDaysChange: vi.fn(),
};
const response = (variety: string) => ({ ok: true, json: async () => ({
  analyzedCount: 5, excludedCount: 0, truncated: false,
  summaries: [{ variety, grade: "특", unit: "5kg", median: 10000, p25: 9000, p75: 11000, mean: 10000,
    tradeCount: 5, quantity: 10, kgPerPackage: 5, min: 9000, max: 11000, samples: [] }],
}) });
afterEach(() => vi.unstubAllGlobals());
it("renders a separate specification and converts its distribution to kg prices", async () => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(response("완숙")));
  render(<MarketVarietyAnalysis {...props} />);
  expect(await screen.findByText("완숙")).toBeInTheDocument();
  expect(screen.getByText("10,000원")).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "kg당 가격" }));
  expect(screen.getByText("2,000원/kg")).toBeInTheDocument();
  expect(screen.getByText("1,800원 ~ 2,200원")).toBeInTheDocument();
});
it("does not display the previous origin while loading or after a late response", async () => {
  let finishOld!: (value: ReturnType<typeof response>) => void;
  const fetchMock = vi.fn().mockImplementationOnce(() => new Promise(resolve => { finishOld = resolve; }))
    .mockResolvedValueOnce(response("새 산지 품종"));
  vi.stubGlobal("fetch", fetchMock);
  const { rerender } = render(<MarketVarietyAnalysis {...props} />);
  rerender(<MarketVarietyAnalysis {...props} origin="진주" />);
  expect(await screen.findByText("새 산지 품종")).toBeInTheDocument();
  await act(async () => finishOld(response("이전 산지 품종")));
  expect(screen.queryByText("이전 산지 품종")).not.toBeInTheDocument();
  expect(fetchMock.mock.calls[0][1].signal.aborted).toBe(true);
});
it("선택한 등급·품종을 요청에 넣고 현재 조건 안의 비교임을 알린다", async () => {
  const fetchMock = vi.fn().mockResolvedValue(response("완숙"));
  vi.stubGlobal("fetch", fetchMock);
  render(<MarketVarietyAnalysis {...props} grade="특" varieties={["완숙", "대추"]} />);
  expect(await screen.findByText("완숙")).toBeInTheDocument();
  const url = new URL(String(fetchMock.mock.calls[0][0]), "http://localhost");
  expect(url.searchParams.get("grade")).toBe("특");
  expect(url.searchParams.get("varieties")).toBe("완숙,대추");
  expect(screen.getByText(/현재 선택한 조건 안에서의 비교입니다/)).toBeInTheDocument();
  expect(screen.getByText(/가중 중앙값/)).toBeInTheDocument();
});
it("등급을 고르지 않으면 grade 파라미터를 보내지 않는다", async () => {
  const fetchMock = vi.fn().mockResolvedValue(response("완숙"));
  vi.stubGlobal("fetch", fetchMock);
  render(<MarketVarietyAnalysis {...props} />);
  expect(await screen.findByText("완숙")).toBeInTheDocument();
  const url = new URL(String(fetchMock.mock.calls[0][0]), "http://localhost");
  expect(url.searchParams.has("grade")).toBe(false);
  expect(url.searchParams.has("varieties")).toBe(false);
});
it("shows review candidates separately while retaining the center price and source units", async () => {
  const body = await response("완숙").json();
  const row = { ...body.summaries[0], origin: "논산", corporation: "중앙청과", corporationCode: "1", observedDays: 2,
    review: { status: "READY", lower: 6000, upper: 14000, count: 1, quantitySharePct: 5,
      samples: [{ id: "flag", auctionDate: "2026-09-06", price: 100000, unit: "5kg", quantity: 1 }] } };
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => ({ ...body, summaries: [row] }) }));
  render(<MarketVarietyAnalysis {...props} />);
  expect(await screen.findByText("검토 후보 보기")).toBeInTheDocument();
  expect(screen.getByText("1행 · 물량 5%")).toBeInTheDocument();
  expect(screen.getByText("논산 · 중앙청과")).toBeInTheDocument();
  expect(screen.getByText("10,000원")).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "kg당 가격" }));
  expect(screen.getByText("검토 경계 1,200원 ~ 2,800원/kg")).toBeInTheDocument();
  expect(screen.getByText(/100,000원 \/ 5kg × 1/)).toBeInTheDocument();
});
