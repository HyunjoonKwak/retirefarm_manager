export interface WatchlistItem {
  id: string;
  productName: string;
  variety?: string | null;
  origin?: string | null;
  targetPrice?: number | null;
  isActive: boolean;
  latestPrice: number | null;
  latestDate: string | null;
  unit: string | null;
  latestVariety: string | null;
  priceChange: number | null;
}

export interface SavedFilterPreset {
  id: string;
  name: string;
  productName: string;
  varieties: string[];
  origin: string | null;
  unit: string | null;
}

export interface PriceHistory {
  date: string;
  avgPrice: number;
  maxPrice: number;
  minPrice: number;
  tradeCount: number;
  totalQuantity?: number;
  pricePerKg?: number | null;
}

export type NoAuctionDates = string[];

export interface DailyDetailResult {
  id: string;
  productName: string;
  variety: string | null;
  origin: string | null;
  price: number;
  unit: string;
  quantity: number;
  corporation: string;
  grade: string | null;
}

import { MARKET_PRODUCTS } from "@/lib/constants/market-products";

export const DEFAULT_PRODUCTS: readonly string[] = MARKET_PRODUCTS;

export const PERIOD_OPTIONS = [
  { value: "7", label: "일간", days: 7, description: "최근 7일" },
  { value: "30", label: "주간", days: 30, description: "최근 4주" },
  { value: "90", label: "월간", days: 90, description: "최근 3개월" },
  { value: "365", label: "연간", days: 365, description: "최근 1년" },
];

export const DAY_NAMES = ["일", "월", "화", "수", "목", "금", "토"];

export type SortField = "price" | "quantity" | "origin" | "unit" | "variety" | "corporation";
export type SortDirection = "asc" | "desc";

// Parse date string to local Date (avoids timezone issues)
export const parseLocalDate = (dateStr: string): Date => {
  const datePart = dateStr.split("T")[0];
  const [year, month, day] = datePart.split("-").map(Number);
  return new Date(year, month - 1, day);
};

// Format Date to YYYY-MM-DD string (local time)
export const formatLocalDateStr = (date: Date): string => {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
};

// ==================== 산지 연동 품종 필터 (facets) ====================
// GET /api/market/garak?action=facets 응답. 저장된 경매 기록 기준이며 산지 부재를 뜻하지 않는다.

export type VarietyAvailability =
  | "available" // 현재 산지·단위·기간 조건에 수집된 거래가 있음
  | "filtered_out" // 산지·기간에는 있으나 단위 조건 적용 시 0건
  | "no_period_records" // 그 산지에 과거 기록만 있음 (기간 밖)
  | "unobserved"; // 그 산지 저장 기록 없음 (부재 확정 아님)

export interface VarietyFacet {
  variety: string;
  originPeriodCount: number;
  matchingCount: number;
  lastSeenAt: string | null;
  availability: VarietyAvailability;
}

export interface VarietyFacetsScope {
  productName: string;
  origin: string | null;
  unit: string | null;
  days: number;
}

export interface VarietyFacetsResponse {
  facets: VarietyFacet[];
  scope: VarietyFacetsScope;
  asOf: string;
  collectionState: "stored_records_only";
}

export type VarietyFacetsStatus = "idle" | "loading" | "ready" | "error";

export interface VarietyFacetsState {
  status: VarietyFacetsStatus;
  /** 요청을 식별하는 키. 늦게 도착한 응답은 키가 다르면 버린다. */
  queryKey: string;
  facets: VarietyFacet[];
  scope: VarietyFacetsScope | null;
  asOf: string | null;
  error: string | null;
}

export const EMPTY_FACETS_STATE: VarietyFacetsState = {
  status: "idle",
  queryKey: "",
  facets: [],
  scope: null,
  asOf: null,
  error: null,
};

export function buildFacetsQueryKey(
  productName: string,
  origin: string | null,
  unit: string | null,
  days: string | number
): string {
  return JSON.stringify([productName, origin ?? "", unit ?? "", String(days)]);
}

export type VarietyOptionStatus = VarietyAvailability | "unknown";

export interface VarietyOption {
  variety: string;
  status: VarietyOptionStatus;
  matchingCount: number;
  originPeriodCount: number;
  lastSeenAt: string | null;
  selected: boolean;
  /** 버튼 옆 짧은 표시 */
  shortLabel: string;
  /** 툴팁·안내용 전체 이유 */
  reason: string;
}

export interface VarietyOptionsResult {
  /** 현재 표시할 품종 (선택된 품종은 항상 포함) */
  options: VarietyOption[];
  /** 전체 보기로만 볼 수 있는 품종 수 */
  hiddenCount: number;
  /** 현재 조건에 거래가 확인된 품종 수 */
  availableCount: number;
  /** 선택됐지만 현재 조건에 거래가 없는 품종 */
  selectedUnavailable: VarietyOption[];
  mode: VarietyFacetsStatus;
}

function formatLastSeen(lastSeenAt: string | null): string {
  if (!lastSeenAt) return "기록 없음";
  const date = new Date(lastSeenAt);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

export function describeAvailability(
  facet: Pick<VarietyOption, "status" | "matchingCount" | "originPeriodCount" | "lastSeenAt">,
  scope: Pick<VarietyFacetsScope, "unit" | "days"> | null,
  mode: VarietyFacetsStatus
): { shortLabel: string; reason: string } {
  const days = scope?.days ?? "선택한";
  switch (facet.status) {
    case "available":
      return {
        shortLabel: `${facet.matchingCount}건`,
        reason: `현재 산지·단위·기간 조건에서 수집된 거래 ${facet.matchingCount}건`,
      };
    case "filtered_out":
      return {
        shortLabel: `단위 외 ${facet.originPeriodCount}건`,
        reason: `산지·기간에는 ${facet.originPeriodCount}건 있으나 단위 '${scope?.unit ?? ""}' 조건에서 0건 — 단위를 해제하면 표시됩니다`,
      };
    case "no_period_records":
      return {
        shortLabel: `기간 외 (${formatLastSeen(facet.lastSeenAt)})`,
        reason: `최근 ${days}일 안에는 수집된 거래 기록이 없습니다 — 마지막 거래 ${formatLastSeen(facet.lastSeenAt)}. 기간을 넓히면 표시될 수 있습니다`,
      };
    case "unobserved":
      return {
        shortLabel: "기록 없음",
        reason: "이 산지에서 저장된 거래 기록이 없습니다 (수집 자료 기준이며 산지 부재를 뜻하지 않음) — 확인 필요",
      };
    default:
      return mode === "loading"
        ? { shortLabel: "확인 중", reason: "수집 자료를 확인하는 중입니다" }
        : { shortLabel: "확인 필요", reason: mode === "error" ? "수집 자료 확인에 실패했습니다 — 직접 선택해 탐색할 수 있습니다" : "현재 조건의 기록을 확인할 수 없습니다 — 직접 선택해 탐색할 수 있습니다" };
  }
}

/**
 * 품종 버튼 목록을 만든다.
 * - 후보 = facets 순서 + 기존 varieties API 값 + 현재 선택값 (중복 제거)
 * - 기본 보기: 거래 확인(available) + 선택된 품종. 전체 보기: 모두.
 * - facets 실패: 모두 '확인 필요'로 보이고 선택 가능 (전체 탐색 허용).
 * - facets 확인 중이고 이전 결과가 없으면 선택된 품종만 보인다 (자동 전체 확장 금지).
 */
export function buildVarietyOptions(input: {
  varieties: string[];
  facetsState: VarietyFacetsState;
  selectedVarieties: string[];
  showAll: boolean;
}): VarietyOptionsResult {
  const { varieties, facetsState, selectedVarieties, showAll } = input;
  const mode = facetsState.status;
  const facetMap = new Map(facetsState.facets.map((f) => [f.variety, f]));
  const hasFacets = facetsState.facets.length > 0 && mode === "ready";

  const names = [
    ...facetsState.facets.map((f) => f.variety),
    ...varieties,
    ...selectedVarieties,
  ].filter((name, index, all) => name && all.indexOf(name) === index);

  const all = names.map<VarietyOption>((variety) => {
    const facet = facetMap.get(variety);
    const status: VarietyOptionStatus = hasFacets && facet ? facet.availability : "unknown";
    const base = {
      status,
      matchingCount: facet?.matchingCount ?? 0,
      originPeriodCount: facet?.originPeriodCount ?? 0,
      lastSeenAt: facet?.lastSeenAt ?? null,
    };
    const { shortLabel, reason } = describeAvailability(base, facetsState.scope, mode);
    return {
      variety,
      ...base,
      selected: selectedVarieties.includes(variety),
      shortLabel,
      reason,
    };
  });

  const exploreAll = showAll || mode === "error";
  const options = all.filter((option) => {
    if (option.selected) return true;
    if (exploreAll) return true;
    if (!hasFacets) return false;
    return option.status === "available";
  });

  return {
    options,
    hiddenCount: all.length - options.length,
    availableCount: all.filter((o) => o.status === "available").length,
    selectedUnavailable: all.filter((o) => o.selected && o.status !== "available" && o.status !== "unknown"),
    mode,
  };
}

/** 보유 단위가 현재 일별 자료에 없어 사라지지 않도록 선택값을 목록에 보존한다. */
export function preserveSelectedUnit(unitOptions: string[], selectedUnit: string | null): string[] {
  if (!selectedUnit || unitOptions.includes(selectedUnit)) return unitOptions;
  return [...unitOptions, selectedUnit];
}

/** 서버 history/facets의 origin contains 규칙과 같은 판정 (표준 산지코드 도입 전). */
export function originMatches(recordOrigin: string | null | undefined, selectedOrigin: string | null): boolean {
  if (!selectedOrigin) return true;
  return Boolean(recordOrigin && recordOrigin.includes(selectedOrigin));
}

/**
 * 마지막 요청만 반영하기 위한 가드. start()는 이전 요청을 abort하고 새 signal을 준다.
 * 응답을 state에 쓰기 전에 isLatest(key, signal)로 요청 자체를 확인한다.
 */
export function createLatestRequestGuard() {
  let current: { key: string; controller: AbortController } | null = null;
  return {
    start(key: string): AbortSignal {
      current?.controller.abort();
      current = { key, controller: new AbortController() };
      return current.controller.signal;
    },
    isLatest(key: string, signal: AbortSignal): boolean {
      return current?.key === key && current.controller.signal === signal && !signal.aborted;
    },
    cancel(): void {
      current?.controller.abort();
      current = null;
    },
  };
}

export type LatestRequestGuard = ReturnType<typeof createLatestRequestGuard>;

// ==================== Manager에서 분리한 순수 계산 (800줄 규칙) ====================

export interface WeeklyPriceData {
  weekStart: Date;
  weekEnd: Date;
  data: (PriceHistory | null)[];
  noAuctionSet: Set<string>;
}

/** 최신 거래일이 속한 주(월~일)를 기준으로 weekOffset 주 전의 7일 자료를 만든다. */
export function computeWeeklyPriceData(
  priceHistory: PriceHistory[],
  noAuctionDates: NoAuctionDates,
  weekOffset: number
): WeeklyPriceData {
  const noAuctionSet = new Set(noAuctionDates);
  if (priceHistory.length === 0 && noAuctionDates.length === 0) {
    return { weekStart: new Date(), weekEnd: new Date(), data: [], noAuctionSet };
  }

  const sortedHistory = [...priceHistory].sort(
    (a, b) => parseLocalDate(b.date).getTime() - parseLocalDate(a.date).getTime()
  );

  const latestDateObj =
    sortedHistory.length > 0
      ? parseLocalDate(sortedHistory[0].date)
      : parseLocalDate([...noAuctionDates].sort().reverse()[0]);

  const dayOfWeek = latestDateObj.getDay();
  const daysToMonday = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
  const currentMonday = new Date(latestDateObj);
  currentMonday.setDate(latestDateObj.getDate() + daysToMonday);
  currentMonday.setHours(0, 0, 0, 0);

  const weekStart = new Date(currentMonday);
  weekStart.setDate(weekStart.getDate() - weekOffset * 7);
  const weekEnd = new Date(weekStart);
  weekEnd.setDate(weekStart.getDate() + 6);

  const weekDataMap = new Map<string, PriceHistory>();
  sortedHistory.forEach((p) => {
    const pDate = parseLocalDate(p.date);
    if (pDate >= weekStart && pDate <= weekEnd) {
      weekDataMap.set(p.date.split("T")[0], p);
    }
  });

  const data = Array.from({ length: 7 }, (_, i) => {
    const targetDate = new Date(weekStart);
    targetDate.setDate(weekStart.getDate() + i);
    return weekDataMap.get(formatLocalDateStr(targetDate)) ?? null;
  });

  return { weekStart, weekEnd, data, noAuctionSet };
}

export interface DailyFilterOptions {
  selectedVarieties: string[];
  selectedOrigin: string | null;
  selectedUnit: string | null;
  sortField: SortField | null;
  sortDirection: SortDirection;
}

function dailySortValue(result: DailyDetailResult, field: SortField): string | number {
  switch (field) {
    case "price": return result.price;
    case "quantity": return result.quantity;
    case "origin": return result.origin || "";
    case "unit": return result.unit;
    case "variety": return result.variety || "";
    case "corporation": return result.corporation;
  }
}

/** 일별 낙찰 목록에 품종·산지(contains)·단위 필터와 정렬을 적용한다. 원본 배열은 바꾸지 않는다. */
export function filterAndSortDailyResults(
  dailyResults: DailyDetailResult[],
  options: DailyFilterOptions
): DailyDetailResult[] {
  const { selectedVarieties, selectedOrigin, selectedUnit, sortField, sortDirection } = options;
  const filtered = dailyResults.filter(
    (r) =>
      (selectedVarieties.length === 0 || (r.variety !== null && selectedVarieties.includes(r.variety))) &&
      originMatches(r.origin, selectedOrigin) &&
      (!selectedUnit || r.unit === selectedUnit)
  );

  if (!sortField) return filtered;

  return [...filtered].sort((a, b) => {
    const aVal = dailySortValue(a, sortField);
    const bVal = dailySortValue(b, sortField);
    if (typeof aVal === "number" && typeof bVal === "number") {
      return sortDirection === "asc" ? aVal - bVal : bVal - aVal;
    }
    const comparison = String(aVal).localeCompare(String(bVal));
    return sortDirection === "asc" ? comparison : -comparison;
  });
}

export interface DailyStats {
  avgPrice: number;
  maxPrice: number;
  minPrice: number;
  tradeCount: number;
  totalQuantity: number;
  totalTradeAmount: number;
}

/** 수량 가중 평균가와 범위. 결과가 없으면 null. */
export function summarizeDailyResults(results: DailyDetailResult[]): DailyStats | null {
  if (results.length === 0) return null;
  const prices = results.map((r) => r.price);
  const totalQuantity = results.reduce((sum, r) => sum + r.quantity, 0);
  const totalTradeAmount = results.reduce((sum, r) => sum + r.price * r.quantity, 0);
  return {
    avgPrice: totalQuantity > 0 ? Math.round(totalTradeAmount / totalQuantity) : 0,
    maxPrice: Math.max(...prices),
    minPrice: Math.min(...prices),
    tradeCount: results.length,
    totalQuantity,
    totalTradeAmount,
  };
}

export function buildFacetsUrl(productName: string, origin: string | null, unit: string | null, days: string): string {
  let url = `/api/market/garak?action=facets&productName=${encodeURIComponent(productName)}&days=${days}`;
  if (origin) url += `&origin=${encodeURIComponent(origin)}`;
  if (unit) url += `&unit=${encodeURIComponent(unit)}`;
  return url;
}

/** facets 응답을 상태로 바꾼다. 형식이 어긋나거나 실패하면 error 상태 (빈 목록으로 덮지 않음). */
export function facetsStateFromResponse(
  key: string,
  ok: boolean,
  status: number,
  data: Partial<VarietyFacetsResponse> & { error?: string } | null
): VarietyFacetsState {
  if (!ok || !data || !Array.isArray(data.facets)) {
    return { ...EMPTY_FACETS_STATE, status: "error", queryKey: key, error: data?.error || `HTTP ${status}` };
  }
  return {
    status: "ready",
    queryKey: key,
    facets: data.facets,
    scope: data.scope ?? null,
    asOf: data.asOf ?? null,
    error: null,
  };
}
