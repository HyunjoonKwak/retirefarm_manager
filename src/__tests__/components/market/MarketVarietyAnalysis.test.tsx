import { afterEach, expect, it, vi } from "vitest";
import "@testing-library/jest-dom/vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { MarketVarietyAnalysis } from "@/components/market/MarketVarietyAnalysis";
const props = { productName: "토마토", origin: "논산", unit: null, days: "30", onDaysChange: vi.fn() };
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
