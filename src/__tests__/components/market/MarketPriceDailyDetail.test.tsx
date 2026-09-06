import { describe, it, expect, vi, beforeAll } from "vitest";
import "@testing-library/jest-dom/vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { MarketPriceDailyDetail } from "@/components/market/MarketPriceDailyDetail";
import { summarizeDailyResults, type DailyDetailResult } from "@/components/market/marketPriceTypes";

beforeAll(() => {
  window.HTMLElement.prototype.scrollIntoView = vi.fn();
  window.HTMLElement.prototype.hasPointerCapture = vi.fn();
});

const rows: DailyDetailResult[] = [
  { id: "1", productName: "딸기", variety: "설향", origin: "충남 논산시", price: 30000, unit: "2kg", quantity: 10, corporation: "A", grade: "특" },
  { id: "2", productName: "딸기", variety: "설향", origin: "충남 논산시", price: 0, unit: "2kg", quantity: 3, corporation: "B", grade: "특" },
];

function renderDetail(overrides: Partial<Parameters<typeof MarketPriceDailyDetail>[0]> = {}) {
  const filtered = overrides.filteredDailyResults ?? rows;
  const props = {
    selectedDate: "2026-09-04",
    selectedProduct: "딸기",
    selectedVarieties: [] as string[],
    selectedOrigin: null,
    selectedUnit: null,
    selectedGrade: "특" as string | null,
    dailyResults: rows,
    filteredDailyResults: filtered,
    filteredDailyStats: summarizeDailyResults(filtered),
    originOptions: ["충남 논산시"],
    varietyOptions: ["설향"],
    unitOptions: ["2kg"],
    gradeOptions: ["특", "상"],
    loadingDaily: false,
    sortField: null,
    sortDirection: "desc" as const,
    onClose: vi.fn(),
    onVarietiesChange: vi.fn(),
    onOriginChange: vi.fn(),
    onUnitChange: vi.fn(),
    onGradeChange: vi.fn(),
    onToggleSort: vi.fn(),
    ...overrides,
  };
  return { ...render(<MarketPriceDailyDetail {...props} />), props };
}

describe("MarketPriceDailyDetail — 등급·통계 표시", () => {
  it("선택한 등급을 제목에 알리고 평균가가 수량 가중평균임을 밝힌다", () => {
    renderDetail();
    expect(screen.getByText(/특 등급/)).toBeInTheDocument();
    expect(screen.getByText("평균가(수량 가중평균)")).toBeInTheDocument();
    // 유효하지 않은 행은 평균에서 빼되 숨기지 않고 건수로 알린다.
    expect(screen.getByText(/유효하지 않은 1행은 집계에서 제외/)).toBeInTheDocument();
    expect(screen.getByText("1건")).toBeInTheDocument();
  });

  it("조건 때문에 비면 그날 거래가 없는 것과 구분하고 등급까지 초기화할 수 있다", () => {
    const { props } = renderDetail({ filteredDailyResults: [], selectedGrade: "상" });
    expect(screen.getByText(/선택한 조건에 맞는 거래가 없습니다/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "필터 초기화" }));
    expect(props.onGradeChange).toHaveBeenCalledWith(null);
    expect(props.onVarietiesChange).toHaveBeenCalledWith([]);
  });

  it("조건이 없는데 비면 그날 거래가 없다고 알린다", () => {
    renderDetail({ filteredDailyResults: [], selectedGrade: null, dailyResults: [] });
    expect(screen.getByText("해당 날짜의 거래 내역이 없습니다.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "필터 초기화" })).toBeNull();
  });
});
