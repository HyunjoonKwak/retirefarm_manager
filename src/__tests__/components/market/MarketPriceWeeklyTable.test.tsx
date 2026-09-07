import { describe, it, expect, vi } from "vitest";
import "@testing-library/jest-dom/vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { MarketPriceWeeklyTable } from "@/components/market/MarketPriceWeeklyTable";
import { computeWeeklyPriceData, type PriceHistory } from "@/components/market/marketPriceTypes";

const history: PriceHistory[] = [
  { date: "2026-09-07", avgPrice: 7854, maxPrice: 13000, minPrice: 7000, tradeCount: 8, pricePerKg: 3927 },
  { date: "2026-09-08", avgPrice: 8500, maxPrice: 12000, minPrice: 6000, tradeCount: 5, pricePerKg: 4250 },
];

function renderTable(overrides: Partial<Parameters<typeof MarketPriceWeeklyTable>[0]> = {}) {
  const props = {
    weeklyPriceData: computeWeeklyPriceData(history, [], 0),
    priceHistory: history,
    loadingHistory: false,
    selectedDate: "",
    weekOffset: 0,
    onDateSelect: vi.fn(),
    onWeekOffsetChange: vi.fn(),
    ...overrides,
  };
  return { ...render(<MarketPriceWeeklyTable {...props} />), props };
}

describe("MarketPriceWeeklyTable — 좁은 폭 보조 정보", () => {
  it("최고·최저 열이 숨겨지는 폭을 위해 평균가 아래에 범위를 함께 싣는다", () => {
    renderTable();
    expect(screen.getByText("7,000원~13,000원")).toBeInTheDocument();
    expect(screen.getByText("6,000원~12,000원")).toBeInTheDocument();
  });

  it("변동률도 함께 보여주고 날짜를 누르면 그 날짜를 선택한다", () => {
    const { props } = renderTable();
    // 9/8은 직전 거래일(9/7) 대비 등락을 함께 표시한다.
    expect(screen.getByText(/\+8\.2%/)).toBeInTheDocument();
    fireEvent.click(screen.getByText(/\(월\)/));
    expect(props.onDateSelect).toHaveBeenCalledWith("2026-09-07");
  });
});
