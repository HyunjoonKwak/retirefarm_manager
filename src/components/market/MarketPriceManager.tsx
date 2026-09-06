"use client";

import { useEffect, useState, useCallback, useMemo, useRef } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Loader2, Search, Star, RefreshCw, Plus, GripVertical, X, Settings2 } from "lucide-react";
import { toast } from "sonner";
import {
  WatchlistItem,
  SavedFilterPreset,
  PriceHistory,
  NoAuctionDates,
  DailyDetailResult,
  DEFAULT_PRODUCTS,
  PERIOD_OPTIONS,
  SortField,
  SortDirection,
  VarietyFacetsState,
  EMPTY_FACETS_STATE,
  buildFacetsQueryKey,
  buildVarietyOptions,
  preserveSelectedUnit,
  createLatestRequestGuard,
  computeWeeklyPriceData,
  filterAndSortDailyResults,
  summarizeDailyResults,
  buildFacetsUrl,
  facetsStateFromResponse,
} from "./marketPriceTypes";
import { MarketPriceChart } from "./MarketPriceChart";
import { MarketPriceFilter } from "./MarketPriceFilter";
import { MarketPriceWeeklyTable } from "./MarketPriceWeeklyTable";
import { MarketPriceDailyDetail } from "./MarketPriceDailyDetail";
import { MarketPriceWatchlist } from "./MarketPriceWatchlist";
import { MarketVarietyAnalysis } from "./MarketVarietyAnalysis";

export function MarketPriceManager() {
  const [watchlist, setWatchlist] = useState<WatchlistItem[]>([]);
  const [varieties, setVarieties] = useState<string[]>([]);
  const [origins, setOrigins] = useState<string[]>([]);
  const [priceHistory, setPriceHistory] = useState<PriceHistory[]>([]);
  const [noAuctionDates, setNoAuctionDates] = useState<NoAuctionDates>([]);
  const [latestDate, setLatestDate] = useState<string | null>(null);
  const [dailyResults, setDailyResults] = useState<DailyDetailResult[]>([]);

  const [loading, setLoading] = useState(true);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [loadingDaily, setLoadingDaily] = useState(false);

  // Product list management
  const [productList, setProductList] = useState<string[]>(() => {
    if (typeof window !== "undefined") {
      const saved = localStorage.getItem("market_productList");
      return saved ? JSON.parse(saved) : DEFAULT_PRODUCTS.slice(0, 10);
    }
    return DEFAULT_PRODUCTS.slice(0, 10);
  });
  const [selectedProduct, setSelectedProduct] = useState<string | null>(() => {
    if (typeof window !== "undefined") {
      const saved = localStorage.getItem("market_selectedProduct");
      return saved || null;
    }
    return null;
  });
  const [isEditingProducts, setIsEditingProducts] = useState(false);
  const [newProductInput, setNewProductInput] = useState("");
  const [draggedProduct, setDraggedProduct] = useState<string | null>(null);

  // Filters
  const [selectedVarieties, setSelectedVarieties] = useState<string[]>([]);
  const [selectedOrigin, setSelectedOrigin] = useState<string | null>(null);
  const [selectedUnit, setSelectedUnit] = useState<string | null>(null);
  const [viewDays, setViewDays] = useState("30");

  // 산지 연동 품종 후보 (facets). 품종 선택에는 의존하지 않는다.
  const [facetsState, setFacetsState] = useState<VarietyFacetsState>(EMPTY_FACETS_STATE);
  const [showAllVarieties, setShowAllVarieties] = useState(false);

  // 늦게 도착한 응답이 새 조건의 결과를 덮지 않도록 요청별 가드
  const facetsGuard = useRef(createLatestRequestGuard());
  const listsGuard = useRef(createLatestRequestGuard());
  const historyGuard = useRef(createLatestRequestGuard());
  const dailyGuard = useRef(createLatestRequestGuard());

  // Filter presets
  const [filterPresets, setFilterPresets] = useState<SavedFilterPreset[]>(() => {
    if (typeof window !== "undefined") {
      const saved = localStorage.getItem("market_filterPresets");
      return saved ? JSON.parse(saved) : [];
    }
    return [];
  });
  const [presetNameInput, setPresetNameInput] = useState("");
  const [selectedDate, setSelectedDate] = useState<string>("");

  // Weekly pagination
  const [weekOffset, setWeekOffset] = useState(0);

  // Sort state for daily detail
  const [sortField, setSortField] = useState<SortField | null>(null);
  const [sortDirection, setSortDirection] = useState<SortDirection>("desc");

  // Delete confirmation
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [deleteConfirmName, setDeleteConfirmName] = useState<string>("");

  // localStorage sync
  useEffect(() => {
    localStorage.setItem("market_productList", JSON.stringify(productList));
  }, [productList]);

  useEffect(() => {
    if (selectedProduct) {
      localStorage.setItem("market_selectedProduct", selectedProduct);
    }
  }, [selectedProduct]);

  useEffect(() => {
    if (selectedProduct) {
      const filterKey = `market_filter_${selectedProduct}`;
      localStorage.setItem(
        filterKey,
        JSON.stringify({ varieties: selectedVarieties, origin: selectedOrigin, unit: selectedUnit })
      );
    }
  }, [selectedProduct, selectedVarieties, selectedOrigin, selectedUnit]);

  useEffect(() => {
    localStorage.setItem("market_filterPresets", JSON.stringify(filterPresets));
  }, [filterPresets]);

  // Weekly price data computation (pure helper in marketPriceTypes)
  const weeklyPriceData = useMemo(
    () => computeWeeklyPriceData(priceHistory, noAuctionDates, weekOffset),
    [priceHistory, weekOffset, noAuctionDates]
  );

  // Filtered daily results — 산지는 서버 history/facets와 같은 contains 규칙
  const filteredDailyResults = useMemo(
    () =>
      filterAndSortDailyResults(dailyResults, {
        selectedVarieties,
        selectedOrigin,
        selectedUnit,
        sortField,
        sortDirection,
      }),
    [dailyResults, selectedVarieties, selectedOrigin, selectedUnit, sortField, sortDirection]
  );

  const filteredDailyStats = useMemo(() => summarizeDailyResults(filteredDailyResults), [filteredDailyResults]);

  const originOptions = useMemo(() => {
    const uniqueOrigins = new Set(dailyResults.map((r) => r.origin).filter(Boolean));
    return Array.from(uniqueOrigins) as string[];
  }, [dailyResults]);

  const varietyOptions = useMemo(() => {
    const uniqueVarieties = new Set(dailyResults.map((r) => r.variety).filter(Boolean));
    return Array.from(uniqueVarieties) as string[];
  }, [dailyResults]);

  // 일별 자료에만 있는 단위 목록이라 날짜를 닫으면 비는데, 선택한 단위는 남겨 해제할 수 있게 한다.
  const unitOptions = useMemo(() => {
    const uniqueUnits = new Set([...(facetsState.units ?? []), ...dailyResults.map((r) => r.unit).filter(Boolean)]);
    return preserveSelectedUnit(Array.from(uniqueUnits) as string[], selectedUnit);
  }, [dailyResults, selectedUnit, facetsState.units]);

  const varietyOptionsResult = useMemo(
    () =>
      buildVarietyOptions({
        varieties,
        facetsState: facetsState.queryKey === buildFacetsQueryKey(selectedProduct || "", selectedOrigin, selectedUnit, viewDays)
          ? facetsState : { ...EMPTY_FACETS_STATE, status: "loading" },
        selectedVarieties,
        showAll: showAllVarieties,
      }),
    [varieties, facetsState, selectedVarieties, showAllVarieties, selectedProduct, selectedOrigin, selectedUnit, viewDays]
  );

  const canExtendPeriod = PERIOD_OPTIONS.findIndex((o) => o.value === viewDays) < PERIOD_OPTIONS.length - 1;

  function handleExtendPeriod() {
    const index = PERIOD_OPTIONS.findIndex((o) => o.value === viewDays);
    const next = PERIOD_OPTIONS[index + 1];
    if (next) setViewDays(next.value);
  }

  const fetchWatchlist = useCallback(async () => {
    try {
      const response = await fetch("/api/market/garak/watchlist");
      const data = await response.json();
      setWatchlist(data.watchlist || []);
    } catch (error) {
      console.error("Failed to fetch watchlist:", error);
    }
  }, []);

  const fetchLatestDate = useCallback(async () => {
    try {
      const response = await fetch("/api/market/garak?action=latest");
      const data = await response.json();
      setLatestDate(data.latestDate);
    } catch (error) {
      console.error("Failed to fetch latest date:", error);
    }
  }, []);

  const fetchVarieties = useCallback(async (productName: string) => {
    const signal = listsGuard.current.start(productName);
    setVarieties([]); setOrigins([]);
    try {
      const [varietiesRes, originsRes] = await Promise.all([
        fetch(
          `/api/market/garak?action=varieties&productName=${encodeURIComponent(productName)}`, { signal }
        ),
        fetch(
          `/api/market/garak?action=origins&productName=${encodeURIComponent(productName)}`, { signal }
        ),
      ]);
      const [varietiesData, originsData] = await Promise.all([
        varietiesRes.json(),
        originsRes.json(),
      ]);
      if (!listsGuard.current.isLatest(productName, signal)) return;
      if (!varietiesRes.ok || !originsRes.ok) throw new Error("목록 조회 실패");
      setVarieties(varietiesData.varieties || []);
      setOrigins(originsData.origins || []);
    } catch (error) {
      if (!listsGuard.current.isLatest(productName, signal)) return;
      console.error("Failed to fetch varieties:", error);
      setVarieties([]);
      setOrigins([]);
    }
  }, []);

  // 품종 후보(facets): 품목·산지·단위·기간에만 의존. 오류는 빈 목록으로 덮지 않고 error 상태로 남긴다.
  const fetchFacets = useCallback(
    async (productName: string, origin: string | null, unit: string | null, days: string) => {
      const key = buildFacetsQueryKey(productName, origin, unit, days);
      const signal = facetsGuard.current.start(key);
      setFacetsState({ ...EMPTY_FACETS_STATE, status: "loading", queryKey: key });
      try {
        const response = await fetch(buildFacetsUrl(productName, origin, unit, days), { signal });
        const data = await response.json().catch(() => null);
        if (!facetsGuard.current.isLatest(key, signal)) return;
        setFacetsState(facetsStateFromResponse(key, response.ok, response.status, data));
      } catch (error) {
        if (signal.aborted || !facetsGuard.current.isLatest(key, signal)) return;
        console.error("Failed to fetch variety facets:", error);
        setFacetsState({
          ...EMPTY_FACETS_STATE,
          status: "error",
          queryKey: key,
          error: error instanceof Error ? error.message : "요청 실패",
        });
      }
    },
    []
  );

  const fetchPriceHistory = useCallback(
    async (
      productName: string,
      varieties?: string[],
      origin?: string | null,
      days?: string,
      unit?: string | null
    ) => {
      const key = JSON.stringify([productName, varieties ?? [], origin ?? "", days || viewDays, unit ?? ""]);
      const signal = historyGuard.current.start(key);
      setLoadingHistory(true);
      setPriceHistory([]); setNoAuctionDates([]);
      try {
        let url = `/api/market/garak?action=history&productName=${encodeURIComponent(productName)}&days=${days || viewDays}`;
        if (varieties && varieties.length > 0) {
          url += `&varieties=${encodeURIComponent(varieties.join(","))}`;
        }
        if (origin) url += `&origin=${encodeURIComponent(origin)}`;
        if (unit) url += `&unit=${encodeURIComponent(unit)}`;

        const response = await fetch(url, { signal });
        const data = await response.json();
        if (!historyGuard.current.isLatest(key, signal)) return;
        setPriceHistory(data.history || []);
        setNoAuctionDates(data.noAuctionDates || []);
      } catch (error) {
        if (signal.aborted || !historyGuard.current.isLatest(key, signal)) return;
        console.error("Failed to fetch price history:", error);
        setPriceHistory([]);
        setNoAuctionDates([]);
      } finally {
        // 늦은 응답이 새 요청의 로딩 표시를 끄지 않게 한다
        if (historyGuard.current.isLatest(key, signal)) setLoadingHistory(false);
      }
    },
    [viewDays]
  );

  const fetchDailyDetail = useCallback(async (date: string, productName: string) => {
    const key = JSON.stringify([date, productName]);
    const signal = dailyGuard.current.start(key);
    setLoadingDaily(true);
    setDailyResults([]);
    try {
      const url = `/api/market/garak?action=dailyDetail&date=${date}&productName=${encodeURIComponent(productName)}`;
      const response = await fetch(url, { signal });
      const data = await response.json();
      if (!dailyGuard.current.isLatest(key, signal)) return;
      setDailyResults(data.results || []);
    } catch (error) {
      if (signal.aborted || !dailyGuard.current.isLatest(key, signal)) return;
      console.error("Failed to fetch daily detail:", error);
      setDailyResults([]);
    } finally {
      if (dailyGuard.current.isLatest(key, signal)) setLoadingDaily(false);
    }
  }, []);

  useEffect(() => {
    Promise.all([fetchWatchlist(), fetchLatestDate()]).finally(() => setLoading(false));
  }, [fetchWatchlist, fetchLatestDate]);

  useEffect(() => {
    function handleVisibilityChange() {
      if (document.visibilityState === "visible") {
        fetchLatestDate();
        if (selectedProduct) {
          fetchPriceHistory(selectedProduct, selectedVarieties, selectedOrigin, viewDays, selectedUnit);
        }
      }
    }
    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => document.removeEventListener("visibilitychange", handleVisibilityChange);
  }, [fetchLatestDate, fetchPriceHistory, selectedProduct, selectedVarieties, selectedOrigin, viewDays, selectedUnit]);

  // 기존 품종/산지 목록 API — 품목이 바뀔 때만
  useEffect(() => {
    if (selectedProduct) {
      fetchVarieties(selectedProduct);
    } else {
      listsGuard.current.cancel();
      setVarieties([]);
      setOrigins([]);
    }
  }, [selectedProduct, fetchVarieties]);

  // 품종 후보(facets) — 품종 선택은 의존성에 넣지 않는다 (A를 골라도 B 후보가 숨지 않게)
  useEffect(() => {
    if (selectedProduct) {
      fetchFacets(selectedProduct, selectedOrigin, selectedUnit, viewDays);
    } else {
      facetsGuard.current.cancel();
      setFacetsState(EMPTY_FACETS_STATE);
    }
  }, [selectedProduct, selectedOrigin, selectedUnit, viewDays, fetchFacets]);

  useEffect(() => {
    if (selectedProduct) {
      fetchPriceHistory(selectedProduct, selectedVarieties, selectedOrigin, viewDays, selectedUnit);
    }
  }, [selectedProduct, selectedVarieties, selectedOrigin, selectedUnit, viewDays, fetchPriceHistory]);

  useEffect(() => {
    if (selectedDate && selectedProduct) {
      fetchDailyDetail(selectedDate, selectedProduct);
    } else {
      dailyGuard.current.cancel();
      setDailyResults([]);
    }
  }, [selectedDate, selectedProduct, fetchDailyDetail]);

  // 언마운트 시 진행 중 요청 정리
  useEffect(() => {
    const guards = [facetsGuard.current, historyGuard.current, dailyGuard.current, listsGuard.current];
    return () => guards.forEach((guard) => guard.cancel());
  }, []);

  function isAlreadyInWatchlist(productName: string, varieties?: string[], origin?: string) {
    const variety = varieties && varieties.length > 0 ? varieties[0] : undefined;
    return watchlist.some(
      (item) =>
        item.productName === productName &&
        (item.variety || "") === (variety || "") &&
        (item.origin || "") === (origin || "")
    );
  }

  async function handleAddToWatchlist(productName: string, varieties?: string[], origin?: string) {
    const variety = varieties && varieties.length > 0 ? varieties[0] : undefined;
    if (isAlreadyInWatchlist(productName, varieties, origin)) {
      toast.warning("이미 관심 품목에 등록되어 있습니다.");
      return;
    }
    try {
      const response = await fetch("/api/market/garak/watchlist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ productName, variety, origin }),
      });
      const result = await response.json();
      if (!response.ok) {
        toast.error(result.error || "등록에 실패했습니다.");
      } else {
        toast.success("관심 품목에 추가되었습니다.");
        fetchWatchlist();
      }
    } catch {
      toast.error("등록 중 오류가 발생했습니다.");
    }
  }

  async function handleConfirmDelete() {
    if (!deleteConfirmId) return;
    try {
      const response = await fetch(`/api/market/garak/watchlist?id=${deleteConfirmId}`, {
        method: "DELETE",
      });
      if (!response.ok) {
        const result = await response.json();
        toast.error(result.error || "삭제에 실패했습니다.");
      } else {
        toast.success("관심 품목에서 제거되었습니다.");
        fetchWatchlist();
      }
    } catch {
      toast.error("삭제 중 오류가 발생했습니다.");
    } finally {
      setDeleteConfirmId(null);
      setDeleteConfirmName("");
    }
  }

  function handleSelectProduct(productName: string) {
    setSelectedProduct(productName);
    if (typeof window !== "undefined") {
      const filterKey = `market_filter_${productName}`;
      const savedFilter = localStorage.getItem(filterKey);
      if (savedFilter) {
        try {
          const { varieties, origin, unit } = JSON.parse(savedFilter);
          setSelectedVarieties(varieties || []);
          setSelectedOrigin(origin || null);
          setSelectedUnit(unit || null);
        } catch {
          setSelectedVarieties([]);
          setSelectedOrigin(null);
          setSelectedUnit(null);
        }
      } else {
        setSelectedVarieties([]);
        setSelectedOrigin(null);
        setSelectedUnit(null);
      }
    } else {
      setSelectedVarieties([]);
      setSelectedOrigin(null);
      setSelectedUnit(null);
    }
    setSelectedDate("");
    setWeekOffset(0);
    setShowAllVarieties(false);
  }

  function handleSaveFilterPreset() {
    if (!selectedProduct) {
      toast.warning("품목을 먼저 선택해주세요.");
      return;
    }
    if (selectedVarieties.length === 0 && !selectedOrigin && !selectedUnit) {
      toast.warning("저장할 필터를 선택해주세요.");
      return;
    }
    const nameParts = [selectedProduct];
    if (selectedVarieties.length > 0) nameParts.push(selectedVarieties.join(","));
    if (selectedOrigin) nameParts.push(selectedOrigin);
    if (selectedUnit) nameParts.push(selectedUnit);
    const name = presetNameInput.trim() || nameParts.join(" ");
    const newPreset: SavedFilterPreset = {
      id: `preset_${Date.now()}`,
      name,
      productName: selectedProduct,
      varieties: selectedVarieties,
      origin: selectedOrigin,
      unit: selectedUnit,
    };
    setFilterPresets([...filterPresets, newPreset]);
    setPresetNameInput("");
    toast.success("필터 조합이 저장되었습니다.");
  }

  function handleLoadFilterPreset(preset: SavedFilterPreset) {
    setSelectedProduct(preset.productName);
    setSelectedVarieties(preset.varieties);
    setSelectedOrigin(preset.origin);
    setSelectedUnit(preset.unit || null);
    setSelectedDate("");
    setWeekOffset(0);
    toast.success(`${preset.name} 필터가 적용되었습니다.`);
  }

  function handleDeleteFilterPreset(presetId: string) {
    setFilterPresets(filterPresets.filter((p) => p.id !== presetId));
    toast.success("필터 조합이 삭제되었습니다.");
  }

  function handleAddProduct() {
    const trimmed = newProductInput.trim();
    if (!trimmed) return;
    if (productList.includes(trimmed)) {
      toast.warning("이미 목록에 있는 품목입니다.");
      return;
    }
    setProductList([...productList, trimmed]);
    setNewProductInput("");
    toast.success(`${trimmed}이(가) 추가되었습니다.`);
  }

  function handleRemoveProduct(product: string) {
    setProductList(productList.filter((p) => p !== product));
    if (selectedProduct === product) setSelectedProduct(null);
  }

  function handleDragStart(product: string) {
    setDraggedProduct(product);
  }

  function handleDragOver(e: React.DragEvent, targetProduct: string) {
    e.preventDefault();
    if (!draggedProduct || draggedProduct === targetProduct) return;
    const newList = [...productList];
    const draggedIdx = newList.indexOf(draggedProduct);
    const targetIdx = newList.indexOf(targetProduct);
    newList.splice(draggedIdx, 1);
    newList.splice(targetIdx, 0, draggedProduct);
    setProductList(newList);
  }

  function handleDragEnd() {
    setDraggedProduct(null);
  }

  function toggleSort(field: SortField) {
    if (sortField === field) {
      setSortDirection(sortDirection === "asc" ? "desc" : "asc");
    } else {
      setSortField(field);
      setSortDirection("desc");
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Product selector */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base flex items-center gap-2">
              <Search className="h-4 w-4" />
              품목 선택
            </CardTitle>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setIsEditingProducts(!isEditingProducts)}
            >
              <Settings2 className="h-4 w-4 mr-1" />
              {isEditingProducts ? "완료" : "편집"}
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap gap-2">
            {productList.map((product) => (
              <div
                key={product}
                draggable={isEditingProducts}
                onDragStart={() => handleDragStart(product)}
                onDragOver={(e) => handleDragOver(e, product)}
                onDragEnd={handleDragEnd}
                className={`flex items-center ${isEditingProducts ? "cursor-grab" : ""}`}
              >
                {isEditingProducts && (
                  <GripVertical className="h-4 w-4 text-muted-foreground mr-1" />
                )}
                <Button
                  variant={selectedProduct === product ? "default" : "outline"}
                  size="sm"
                  onClick={() => !isEditingProducts && handleSelectProduct(product)}
                  className={isEditingProducts ? "pr-1" : ""}
                >
                  {product}
                  {isEditingProducts && (
                    <button
                      className="ml-2 hover:text-red-500"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleRemoveProduct(product);
                      }}
                    >
                      <X className="h-3 w-3" />
                    </button>
                  )}
                </Button>
              </div>
            ))}
          </div>

          {isEditingProducts && (
            <div className="flex items-center gap-2 pt-3 border-t">
              <Input
                placeholder="품목명 입력"
                value={newProductInput}
                onChange={(e) => setNewProductInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleAddProduct();
                }}
                className="w-40"
              />
              <Button size="sm" onClick={handleAddProduct}>
                <Plus className="h-4 w-4 mr-1" />
                추가
              </Button>
              <span className="text-xs text-muted-foreground">드래그하여 순서 변경 가능</span>
            </div>
          )}

          {selectedProduct && !isEditingProducts && (
            <div className="flex items-center gap-3 pt-3 border-t">
              <Badge variant="default" className="text-sm">
                {selectedProduct}
              </Badge>
              <Button
                variant={
                  isAlreadyInWatchlist(selectedProduct, selectedVarieties, selectedOrigin || undefined)
                    ? "secondary"
                    : "outline"
                }
                size="sm"
                onClick={() =>
                  handleAddToWatchlist(
                    selectedProduct,
                    selectedVarieties,
                    selectedOrigin || undefined
                  )
                }
                disabled={isAlreadyInWatchlist(
                  selectedProduct,
                  selectedVarieties,
                  selectedOrigin || undefined
                )}
              >
                <Star
                  className={`h-4 w-4 ${
                    isAlreadyInWatchlist(
                      selectedProduct,
                      selectedVarieties,
                      selectedOrigin || undefined
                    )
                      ? "fill-yellow-500 text-yellow-500"
                      : ""
                  }`}
                />
                관심등록
              </Button>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => {
                  fetchWatchlist();
                  fetchLatestDate();
                  if (selectedProduct) {
                    fetchPriceHistory(
                      selectedProduct,
                      selectedVarieties,
                      selectedOrigin,
                      viewDays,
                      selectedUnit
                    );
                  }
                }}
              >
                <RefreshCw className="h-4 w-4" />
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {selectedProduct && (
        <>
          {selectedUnit && <MarketPriceChart
            selectedProduct={selectedProduct}
            selectedVarieties={selectedVarieties}
            selectedOrigin={selectedOrigin}
            selectedUnit={selectedUnit}
            latestDate={latestDate}
            priceHistory={priceHistory}
            loadingHistory={loadingHistory}
            viewDays={viewDays}
            onViewDaysChange={setViewDays}
          />}

          <MarketPriceFilter
            origins={origins}
            selectedOrigin={selectedOrigin}
            onOriginChange={setSelectedOrigin}
            varietyOptions={varietyOptionsResult}
            selectedVarieties={selectedVarieties}
            onVarietiesChange={setSelectedVarieties}
            showAllVarieties={showAllVarieties}
            onShowAllVarietiesChange={setShowAllVarieties}
            facetsStatus={facetsState.status}
            facetsAsOf={facetsState.asOf}
            facetsError={facetsState.error}
            facetsScope={facetsState.scope}
            unitOptions={unitOptions}
            selectedUnit={selectedUnit}
            onUnitChange={setSelectedUnit}
            canExtendPeriod={canExtendPeriod}
            onExtendPeriod={handleExtendPeriod}
            filterPresets={filterPresets}
            presetNameInput={presetNameInput}
            onPresetNameChange={setPresetNameInput}
            onSavePreset={handleSaveFilterPreset}
            onLoadPreset={handleLoadFilterPreset}
            onDeletePreset={handleDeleteFilterPreset}
          />

          <MarketVarietyAnalysis productName={selectedProduct} origin={selectedOrigin} unit={selectedUnit} days={viewDays} onDaysChange={setViewDays} />
          {!selectedUnit && <p className="text-sm text-muted-foreground">포장 가격 추이는 단위를 선택하면 표시됩니다. 전체 규격은 위 비교표에서 나눠 확인할 수 있습니다.</p>}
          {selectedUnit && <MarketPriceWeeklyTable
            weeklyPriceData={weeklyPriceData}
            priceHistory={priceHistory}
            loadingHistory={loadingHistory}
            selectedDate={selectedDate}
            weekOffset={weekOffset}
            onDateSelect={setSelectedDate}
            onWeekOffsetChange={setWeekOffset}
          />}
        </>
      )}

      {selectedDate && selectedProduct && (
        <MarketPriceDailyDetail
          selectedDate={selectedDate}
          selectedProduct={selectedProduct}
          selectedVarieties={selectedVarieties}
          selectedOrigin={selectedOrigin}
          selectedUnit={selectedUnit}
          dailyResults={dailyResults}
          filteredDailyResults={filteredDailyResults}
          filteredDailyStats={filteredDailyStats}
          originOptions={originOptions}
          varietyOptions={varietyOptions}
          unitOptions={unitOptions}
          loadingDaily={loadingDaily}
          sortField={sortField}
          sortDirection={sortDirection}
          onClose={() => setSelectedDate("")}
          onVarietiesChange={setSelectedVarieties}
          onOriginChange={setSelectedOrigin}
          onUnitChange={setSelectedUnit}
          onToggleSort={toggleSort}
        />
      )}

      <MarketPriceWatchlist
        watchlist={watchlist}
        deleteConfirmId={deleteConfirmId}
        deleteConfirmName={deleteConfirmName}
        onSelectItem={(item) => {
          handleSelectProduct(item.productName);
          if (item.variety) setSelectedVarieties([item.variety]);
          if (item.origin) setSelectedOrigin(item.origin);
        }}
        onDeleteClick={(id, name) => {
          setDeleteConfirmId(id);
          setDeleteConfirmName(name);
        }}
        onConfirmDelete={handleConfirmDelete}
        onCancelDelete={() => {
          setDeleteConfirmId(null);
          setDeleteConfirmName("");
        }}
      />
    </div>
  );
}
