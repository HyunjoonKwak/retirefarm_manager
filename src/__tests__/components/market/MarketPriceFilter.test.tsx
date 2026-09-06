import { describe, it, expect, vi, beforeAll } from "vitest";
import "@testing-library/jest-dom/vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { MarketPriceFilter } from "@/components/market/MarketPriceFilter";
import {
  buildVarietyOptions,
  EMPTY_FACETS_STATE,
  type VarietyFacetsState,
} from "@/components/market/marketPriceTypes";

beforeAll(() => {
  // Radix Select in jsdom
  window.HTMLElement.prototype.scrollIntoView = vi.fn();
  window.HTMLElement.prototype.hasPointerCapture = vi.fn();
});

const readyState: VarietyFacetsState = {
  status: "ready",
  queryKey: "k",
  facets: [
    { variety: "설향", originPeriodCount: 12, matchingCount: 12, lastSeenAt: "2026-09-05", availability: "available" },
    { variety: "죽향", originPeriodCount: 4, matchingCount: 0, lastSeenAt: "2026-09-01", availability: "filtered_out" },
    { variety: "금실", originPeriodCount: 0, matchingCount: 0, lastSeenAt: "2026-03-10", availability: "no_period_records" },
    { variety: "매향", originPeriodCount: 0, matchingCount: 0, lastSeenAt: null, availability: "unobserved" },
  ],
  scope: { productName: "딸기", origin: "논산", unit: "2kg", days: 30 },
  asOf: "2026-09-06T09:30:00.000Z",
  error: null,
};

function renderFilter(overrides: Partial<Parameters<typeof MarketPriceFilter>[0]> = {}) {
  const selectedVarieties = overrides.selectedVarieties ?? ["죽향"];
  const showAllVarieties = overrides.showAllVarieties ?? false;
  const facetsState = overrides.facetsStatus === "error"
    ? { ...EMPTY_FACETS_STATE, status: "error" as const, error: "HTTP 500" }
    : readyState;
  const props = {
    origins: ["논산", "진주"],
    selectedOrigin: "논산",
    onOriginChange: vi.fn(),
    varietyOptions: buildVarietyOptions({
      varieties: ["설향", "죽향", "금실", "매향"],
      facetsState,
      selectedVarieties,
      showAll: showAllVarieties,
    }),
    selectedVarieties,
    onVarietiesChange: vi.fn(),
    showAllVarieties,
    onShowAllVarietiesChange: vi.fn(),
    facetsStatus: facetsState.status,
    facetsAsOf: facetsState.asOf,
    facetsError: facetsState.error,
    facetsScope: facetsState.scope,
    unitOptions: ["2kg"],
    selectedUnit: "2kg",
    onUnitChange: vi.fn(),
    canExtendPeriod: true,
    onExtendPeriod: vi.fn(),
    filterPresets: [],
    presetNameInput: "",
    onPresetNameChange: vi.fn(),
    onSavePreset: vi.fn(),
    onLoadPreset: vi.fn(),
    onDeletePreset: vi.fn(),
    ...overrides,
  };
  return { ...render(<MarketPriceFilter {...props} />), props };
}

describe("MarketPriceFilter — 산지 연동 품종", () => {
  it("산지 선택이 품종 목록보다 위에 있다", () => {
    renderFilter();
    const origin = screen.getByText("산지");
    const varietySection = screen.getByTestId("variety-section");
    expect(origin.compareDocumentPosition(varietySection) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("기본 보기: 거래 확인 품종과 선택된 품종만 보이고 건수·이유·수집 기준이 표시된다", () => {
    renderFilter();
    expect(screen.getByRole("button", { name: /설향/ })).toHaveTextContent("12건");
    expect(screen.getByRole("button", { name: /죽향/ })).toHaveAttribute("aria-pressed", "true");
    expect(screen.queryByRole("button", { name: /금실/ })).toBeNull();
    expect(screen.queryByRole("button", { name: /매향/ })).toBeNull();
    expect(screen.getByRole("button", { name: "전체 보기 (+2)" })).toBeInTheDocument();
    expect(screen.getByText(/거래 확인 1개/)).toHaveTextContent("수집 자료 기준");
    expect(screen.getByText(/산지 부재를 뜻하지 않습니다/)).toBeInTheDocument();
  });

  it("선택됐지만 거래 없는 품종은 안내와 함께 남고, 버튼으로 해제·단위 해제·기간 확장이 가능하다", () => {
    const { props } = renderFilter({ selectedVarieties: ["죽향", "금실"] });
    const note = screen.getByRole("note");
    expect(note).toHaveTextContent("죽향(단위 외 4건)");
    expect(note).toHaveTextContent("금실(기간 외");

    fireEvent.click(screen.getByRole("button", { name: /죽향/ }));
    expect(props.onVarietiesChange).toHaveBeenCalledWith(["금실"]);

    fireEvent.click(screen.getByRole("button", { name: "단위 해제" }));
    expect(props.onUnitChange).toHaveBeenCalledWith(null);

    fireEvent.click(screen.getByRole("button", { name: "기간 확장" }));
    expect(props.onExtendPeriod).toHaveBeenCalled();
  });

  it("전체 보기 토글은 자동으로 켜지지 않고 사용자가 눌러야 하며, 켜면 이유와 함께 탐색 선택이 가능하다", () => {
    const { props } = renderFilter();
    fireEvent.click(screen.getByRole("button", { name: "전체 보기 (+2)" }));
    expect(props.onShowAllVarietiesChange).toHaveBeenCalledWith(true);

    const expanded = renderFilter({ showAllVarieties: true });
    const 매향 = expanded.getByRole("button", { name: /매향/ });
    expect(매향).toHaveTextContent("기록 없음");
    expect(매향).toHaveAttribute("title", expect.stringContaining("부재를 뜻하지 않음"));
    fireEvent.click(매향);
    expect(expanded.props.onVarietiesChange).toHaveBeenCalledWith(["죽향", "매향"]);
    expect(expanded.getByRole("button", { name: "거래 확인만 보기" })).toBeInTheDocument();
  });

  it("facets 요청 실패면 확인 필요 안내와 함께 전체 목록을 보여준다", () => {
    renderFilter({ facetsStatus: "error", facetsError: "HTTP 500" });
    expect(screen.getByRole("status")).toHaveTextContent("거래 확인 실패");
    expect(screen.getByRole("button", { name: /매향/ })).toHaveTextContent("확인 필요");
    expect(screen.queryByRole("button", { name: /전체 보기/ })).toBeNull();
  });
});
