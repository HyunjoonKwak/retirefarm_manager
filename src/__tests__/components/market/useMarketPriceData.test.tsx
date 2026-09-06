import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { useMarketPriceData, type MarketDataParams } from "@/components/market/useMarketPriceData";
const requestMock = vi.fn();
const base: MarketDataParams = {
  accountKey: "A", selectedProduct: "토마토", selectedVarieties: ["완숙"], selectedOrigin: "논산",
  selectedUnit: "5kg", selectedGrade: "특", viewDays: "30", selectedDate: "2026-09-07",
};
const reply = (body: unknown, status = 200) => Promise.resolve(new Response(JSON.stringify(body), { status }));
const actionOf = (url: string) => new URL(url, "http://localhost").searchParams.get("action");
function normal(url: string) {
  switch (actionOf(url)) {
    case "varieties": return reply({ varieties: ["완숙"] });
    case "origins": return reply({ origins: ["논산"] });
    case "facets": return reply({ facets: [{ variety: "완숙", availability: "available" }], units: ["5kg"], grades: ["특"] });
    case "history": return reply({ history: [{ date: "2026-09-07", avgPrice: 200 }], noAuctionDates: [] });
    case "dailyDetail": return reply({ results: [] });
    default: return reply({ watchlist: [], latestDate: "2026-09-07" });
  }
}
beforeEach(() => { vi.clearAllMocks(); vi.stubGlobal("fetch", requestMock); requestMock.mockImplementation(normal); });
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
it("restarts unchanged market scopes when the account changes", async () => {
  const { result, rerender } = renderHook(props => useMarketPriceData(props), { initialProps: base });
  await waitFor(() => expect(result.current.facetsState.status).toBe("ready"));
  rerender({ ...base, accountKey: "B" });
  await waitFor(() => expect(result.current.facetsState.status).toBe("ready"));
  for (const action of ["facets", "origins", "history", "dailyDetail"]) {
    expect(requestMock.mock.calls.filter(([url]) => actionOf(url) === action)).toHaveLength(2);
  }
  expect(result.current.origins).toEqual(["논산"]);
});
it("ignores a late response from the previous grade", async () => {
  let resolveOld!: (response: Response) => void;
  requestMock.mockImplementation((url: string) => {
    const query = new URL(url, "http://localhost").searchParams;
    if (query.get("action") === "history" && query.get("grade") === "특") return new Promise<Response>(resolve => { resolveOld = resolve; });
    return normal(url);
  });
  const { result, rerender } = renderHook(props => useMarketPriceData(props), { initialProps: base });
  rerender({ ...base, selectedGrade: "상" });
  await waitFor(() => expect(result.current.priceHistory[0]?.avgPrice).toBe(200));
  await act(async () => { resolveOld(new Response(JSON.stringify({ history: [{ avgPrice: 100 }] }))); });
  expect(result.current.priceHistory[0]?.avgPrice).toBe(200);
  expect(result.current.loadingHistory).toBe(false);
});
it("exposes query failure separately from an empty successful result", async () => {
  requestMock.mockImplementation((url: string) => actionOf(url) === "history" ? reply({ error: "offline" }, 500) : normal(url));
  const { result, rerender } = renderHook(props => useMarketPriceData(props), { initialProps: base });
  await waitFor(() => expect(result.current.historyError).toBeTruthy());
  expect(result.current.priceHistory).toEqual([]);
  requestMock.mockImplementation(normal); rerender({ ...base, viewDays: "7" });
  await waitFor(() => expect(result.current.priceHistory).toHaveLength(1)); expect(result.current.historyError).toBeNull();
});
