"use client";
import { useEffect, useState, useMemo } from "react";
import { useSession } from "next-auth/react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Loader2, Search, Star, RefreshCw, Plus, GripVertical, X, Settings2 } from "lucide-react";
import { toast } from "sonner";
import {
  SavedFilterPreset,
  DEFAULT_PRODUCTS,
  PERIOD_OPTIONS,
  SortField,
  SortDirection,
  EMPTY_FACETS_STATE,
  buildFacetsQueryKey,
  buildVarietyOptions,
  preserveSelectedOption,
  computeWeeklyPriceData,
  filterAndSortDailyResults,
  summarizeDailyResults,
} from "./marketPriceTypes";
import { useMarketPriceData } from "./useMarketPriceData";
import { useMarketPresets } from "./useMarketPresets";
import { MarketFilterPresets } from "./MarketFilterPresets";
import { MarketPriceChart } from "./MarketPriceChart";
import { MarketPriceFilter } from "./MarketPriceFilter";
import { MarketPriceWeeklyTable } from "./MarketPriceWeeklyTable";
import { MarketPriceDailyDetail } from "./MarketPriceDailyDetail";
import { MarketPriceWatchlist } from "./MarketPriceWatchlist";
import { MarketFreshnessNotice } from "./MarketFreshnessNotice";
import { MarketVarietyAnalysis } from "./MarketVarietyAnalysis";

export function MarketPriceManager() {
  const { data: session } = useSession();
  // 계정이 바뀌면 이전 계정의 조회 결과와 선택 조건을 남기지 않는다.
  const accountKey = session?.user?.id ?? "anonymous";

  // Product list management
  const [productList, setProductList] = useState<string[]>(() => {
    if (typeof window !== "undefined") {
      try {
        const saved = localStorage.getItem("market_productList");
        const parsed: unknown = saved ? JSON.parse(saved) : null;
        if (Array.isArray(parsed)) return parsed.filter((item): item is string => typeof item === "string");
      } catch {
        // 손상된 값이면 기본 목록으로 시작한다.
      }
    }
    return DEFAULT_PRODUCTS.slice(0, 10);
  });
  const [selectedProduct, setSelectedProduct] = useState<string | null>(() => {
    if (typeof window !== "undefined") return localStorage.getItem("market_selectedProduct") || null;
    return null;
  });
  const [isEditingProducts, setIsEditingProducts] = useState(false);
  const [newProductInput, setNewProductInput] = useState("");
  const [draggedProduct, setDraggedProduct] = useState<string | null>(null);

  // Filters
  const [selectedVarieties, setSelectedVarieties] = useState<string[]>([]);
  const [selectedOrigin, setSelectedOrigin] = useState<string | null>(null);
  const [selectedUnit, setSelectedUnit] = useState<string | null>(null);
  const [selectedGrade, setSelectedGrade] = useState<string | null>(null);
  const [viewDays, setViewDays] = useState("30");
  const [showAllVarieties, setShowAllVarieties] = useState(false);
  const [selectedDate, setSelectedDate] = useState<string>("");
  const [weekOffset, setWeekOffset] = useState(0);
  const [sortField, setSortField] = useState<SortField | null>(null);
  const [sortDirection, setSortDirection] = useState<SortDirection>("desc");
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [deleteConfirmName, setDeleteConfirmName] = useState<string>("");

  const data = useMarketPriceData({
    accountKey, selectedProduct, selectedVarieties, selectedOrigin, selectedUnit, selectedGrade, viewDays, selectedDate,
  });
  const presets = useMarketPresets(accountKey);
  const { watchlist, varieties, origins, priceHistory, noAuctionDates, latestDate, dailyResults, facetsState } = data;

  // localStorage sync (기기 단위 편의값)
  useEffect(() => {
    localStorage.setItem("market_productList", JSON.stringify(productList));
  }, [productList]);

  useEffect(() => {
    if (selectedProduct) localStorage.setItem("market_selectedProduct", selectedProduct);
  }, [selectedProduct]);

  useEffect(() => {
    if (!selectedProduct) return;
    localStorage.setItem(
      `market_filter_${selectedProduct}`,
      JSON.stringify({ varieties: selectedVarieties, origin: selectedOrigin, unit: selectedUnit, grade: selectedGrade })
    );
  }, [selectedProduct, selectedVarieties, selectedOrigin, selectedUnit, selectedGrade]);

  // 계정 전환 시 이전 계정의 선택 조건을 화면에 남기지 않는다.
  useEffect(() => {
    setSelectedVarieties([]);
    setSelectedOrigin(null);
    setSelectedUnit(null);
    setSelectedGrade(null);
    setSelectedDate("");
    setWeekOffset(0);
    setShowAllVarieties(false);
  }, [accountKey]);

  const weeklyPriceData = useMemo(
    () => computeWeeklyPriceData(priceHistory, noAuctionDates, weekOffset),
    [priceHistory, weekOffset, noAuctionDates]
  );

  const filteredDailyResults = useMemo(
    () => filterAndSortDailyResults(dailyResults, {
      selectedVarieties, selectedOrigin, selectedUnit, selectedGrade, sortField, sortDirection,
    }),
    [dailyResults, selectedVarieties, selectedOrigin, selectedUnit, selectedGrade, sortField, sortDirection]
  );

  const filteredDailyStats = useMemo(() => summarizeDailyResults(filteredDailyResults), [filteredDailyResults]);

  // 산지 목록은 origins API가 기준이라 특정 날짜를 닫아도 사라지지 않는다.
  const originOptions = useMemo(
    () => preserveSelectedOption(
      Array.from(new Set([...origins, ...dailyResults.map((r) => r.origin).filter((v): v is string => Boolean(v))])),
      selectedOrigin
    ),
    [origins, dailyResults, selectedOrigin]
  );

  const varietyOptions = useMemo(
    () => Array.from(new Set([...varieties, ...dailyResults.map((r) => r.variety).filter((v): v is string => Boolean(v))])),
    [varieties, dailyResults]
  );

  // 일별 자료에만 있는 값이면 날짜를 닫을 때 비므로 선택값을 남겨 해제할 수 있게 한다.
  const unitOptions = useMemo(
    () => preserveSelectedOption(
      Array.from(new Set([...(facetsState.units ?? []), ...dailyResults.map((r) => r.unit).filter(Boolean)])),
      selectedUnit
    ),
    [dailyResults, selectedUnit, facetsState.units]
  );

  const gradeOptions = useMemo(
    () => preserveSelectedOption(
      Array.from(new Set([
        ...(facetsState.grades ?? []),
        ...dailyResults.map((r) => r.grade).filter((v): v is string => Boolean(v)),
      ])),
      selectedGrade
    ),
    [dailyResults, selectedGrade, facetsState.grades]
  );

  const varietyOptionsResult = useMemo(
    () => buildVarietyOptions({
      varieties,
      facetsState:
        facetsState.queryKey === buildFacetsQueryKey(selectedProduct || "", selectedOrigin, selectedUnit, selectedGrade, viewDays)
          ? facetsState
          : { ...EMPTY_FACETS_STATE, status: "loading" },
      selectedVarieties,
      showAll: showAllVarieties,
    }),
    [varieties, facetsState, selectedVarieties, showAllVarieties, selectedProduct, selectedOrigin, selectedUnit, selectedGrade, viewDays]
  );

  const canExtendPeriod = PERIOD_OPTIONS.findIndex((o) => o.value === viewDays) < PERIOD_OPTIONS.length - 1;

  function handleExtendPeriod() {
    const next = PERIOD_OPTIONS[PERIOD_OPTIONS.findIndex((o) => o.value === viewDays) + 1];
    if (next) setViewDays(next.value);
  }

  function isAlreadyInWatchlist(productName: string, names?: string[], origin?: string) {
    const variety = names && names.length > 0 ? names[0] : undefined;
    return watchlist.some(
      (item) =>
        item.productName === productName &&
        (item.variety || "") === (variety || "") &&
        (item.origin || "") === (origin || "")
    );
  }

  async function handleAddToWatchlist(productName: string, names?: string[], origin?: string) {
    const variety = names && names.length > 0 ? names[0] : undefined;
    if (isAlreadyInWatchlist(productName, names, origin)) {
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
        return;
      }
      toast.success("관심 품목에 추가되었습니다.");
      data.refreshWatchlist();
    } catch {
      toast.error("등록 중 오류가 발생했습니다.");
    }
  }

  async function handleConfirmDelete() {
    if (!deleteConfirmId) return;
    try {
      const response = await fetch(`/api/market/garak/watchlist?id=${deleteConfirmId}`, { method: "DELETE" });
      if (!response.ok) {
        const result = await response.json();
        toast.error(result.error || "삭제에 실패했습니다.");
      } else {
        toast.success("관심 품목에서 제거되었습니다.");
        data.refreshWatchlist();
      }
    } catch {
      toast.error("삭제 중 오류가 발생했습니다.");
    } finally {
      setDeleteConfirmId(null);
      setDeleteConfirmName("");
    }
  }

  function applySelection(varietyNames: string[], origin: string | null, unit: string | null, grade: string | null) {
    setSelectedVarieties(varietyNames);
    setSelectedOrigin(origin);
    setSelectedUnit(unit);
    setSelectedGrade(grade);
  }

  function handleSelectProduct(productName: string) {
    setSelectedProduct(productName);
    let restored = false;
    if (typeof window !== "undefined") {
      try {
        const saved = localStorage.getItem(`market_filter_${productName}`);
        if (saved) {
          const parsed = JSON.parse(saved);
          applySelection(
            Array.isArray(parsed?.varieties) ? parsed.varieties : [],
            typeof parsed?.origin === "string" ? parsed.origin : null,
            typeof parsed?.unit === "string" ? parsed.unit : null,
            typeof parsed?.grade === "string" ? parsed.grade : null
          );
          restored = true;
        }
      } catch {
        restored = false;
      }
    }
    if (!restored) applySelection([], null, null, null);
    setSelectedDate("");
    setWeekOffset(0);
    setShowAllVarieties(false);
  }

  function handleApplyPreset(preset: SavedFilterPreset) {
    setSelectedProduct(preset.productName);
    applySelection(preset.varieties, preset.origin, preset.unit, preset.grade ?? null);
    setSelectedDate("");
    setWeekOffset(0);
    toast.success(`${preset.name} 조건이 적용되었습니다.`);
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

  function handleDragOver(e: React.DragEvent, targetProduct: string) {
    e.preventDefault();
    if (!draggedProduct || draggedProduct === targetProduct) return;
    const newList = [...productList];
    newList.splice(newList.indexOf(draggedProduct), 1);
    newList.splice(newList.indexOf(targetProduct), 0, draggedProduct);
    setProductList(newList);
  }

  function toggleSort(field: SortField) {
    if (sortField === field) {
      setSortDirection(sortDirection === "asc" ? "desc" : "asc");
      return;
    }
    setSortField(field);
    setSortDirection("desc");
  }

  if (data.loading) {
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
            <Button variant="ghost" size="sm" onClick={() => setIsEditingProducts(!isEditingProducts)}>
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
                onDragStart={() => setDraggedProduct(product)}
                onDragOver={(e) => handleDragOver(e, product)}
                onDragEnd={() => setDraggedProduct(null)}
                className={`flex items-center ${isEditingProducts ? "cursor-grab" : ""}`}
              >
                {isEditingProducts && <GripVertical className="h-4 w-4 text-muted-foreground mr-1" />}
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
                      aria-label={`${product} 삭제`}
                      onClick={(e) => { e.stopPropagation(); handleRemoveProduct(product); }}
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
                onKeyDown={(e) => { if (e.key === "Enter") handleAddProduct(); }}
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
              <Badge variant="default" className="text-sm">{selectedProduct}</Badge>
              <Button
                variant={isAlreadyInWatchlist(selectedProduct, selectedVarieties, selectedOrigin || undefined) ? "secondary" : "outline"}
                size="sm"
                onClick={() => handleAddToWatchlist(selectedProduct, selectedVarieties, selectedOrigin || undefined)}
                disabled={isAlreadyInWatchlist(selectedProduct, selectedVarieties, selectedOrigin || undefined)}
              >
                <Star
                  className={`h-4 w-4 ${
                    isAlreadyInWatchlist(selectedProduct, selectedVarieties, selectedOrigin || undefined)
                      ? "fill-yellow-500 text-yellow-500"
                      : ""
                  }`}
                />
                관심등록
              </Button>
              <Button variant="ghost" size="icon" aria-label="새로고침" onClick={data.refresh}>
                <RefreshCw className="h-4 w-4" />
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {data.historyError && <p role="alert" className="text-sm text-destructive">{data.historyError}</p>}
      {data.dailyError && <p role="alert" className="text-sm text-destructive">{data.dailyError}</p>}
      <MarketFreshnessNotice latestDate={latestDate} />
      {selectedProduct && (
        <>
          {selectedUnit && <MarketPriceChart
            selectedProduct={selectedProduct}
            selectedVarieties={selectedVarieties}
            selectedOrigin={selectedOrigin}
            selectedUnit={selectedUnit}
            selectedGrade={selectedGrade}
            latestDate={latestDate}
            priceHistory={priceHistory}
            loadingHistory={data.loadingHistory}
            viewDays={viewDays}
            onViewDaysChange={setViewDays}
          />}

          <MarketPriceFilter
            origins={originOptions}
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
            gradeOptions={gradeOptions}
            selectedGrade={selectedGrade}
            onGradeChange={setSelectedGrade}
            canExtendPeriod={canExtendPeriod}
            onExtendPeriod={handleExtendPeriod}
          />

          <MarketFilterPresets
            productName={selectedProduct}
            varieties={selectedVarieties}
            origin={selectedOrigin}
            unit={selectedUnit}
            grade={selectedGrade}
            presets={presets}
            onApply={handleApplyPreset}
          />

          <MarketVarietyAnalysis
            productName={selectedProduct}
            origin={selectedOrigin}
            unit={selectedUnit}
            grade={selectedGrade}
            varieties={selectedVarieties}
            days={viewDays}
            onDaysChange={setViewDays}
          />
          {!selectedUnit && <p className="text-sm text-muted-foreground">포장 가격 추이는 단위를 선택하면 표시됩니다. 전체 규격은 위 비교표에서 나눠 확인할 수 있습니다.</p>}
          {selectedUnit && <MarketPriceWeeklyTable
            weeklyPriceData={weeklyPriceData}
            priceHistory={priceHistory}
            loadingHistory={data.loadingHistory}
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
          selectedGrade={selectedGrade}
          dailyResults={dailyResults}
          filteredDailyResults={filteredDailyResults}
          filteredDailyStats={filteredDailyStats}
          originOptions={originOptions}
          varietyOptions={varietyOptions}
          unitOptions={unitOptions}
          gradeOptions={gradeOptions}
          loadingDaily={data.loadingDaily}
          sortField={sortField}
          sortDirection={sortDirection}
          onClose={() => setSelectedDate("")}
          onVarietiesChange={setSelectedVarieties}
          onOriginChange={setSelectedOrigin}
          onUnitChange={setSelectedUnit}
          onGradeChange={setSelectedGrade}
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
