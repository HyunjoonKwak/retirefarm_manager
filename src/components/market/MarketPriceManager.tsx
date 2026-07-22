"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
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
  SortField,
  SortDirection,
  parseLocalDate,
  formatLocalDateStr,
} from "./marketPriceTypes";
import { MarketPriceChart } from "./MarketPriceChart";
import { MarketPriceFilter } from "./MarketPriceFilter";
import { MarketPriceWeeklyTable } from "./MarketPriceWeeklyTable";
import { MarketPriceDailyDetail } from "./MarketPriceDailyDetail";
import { MarketPriceWatchlist } from "./MarketPriceWatchlist";

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

  // Weekly price data computation
  const weeklyPriceData = useMemo(() => {
    if (priceHistory.length === 0 && noAuctionDates.length === 0) {
      return { weekStart: new Date(), weekEnd: new Date(), data: [], noAuctionSet: new Set<string>() };
    }

    const noAuctionSet = new Set(noAuctionDates);
    const sortedHistory = [...priceHistory].sort(
      (a, b) => parseLocalDate(b.date).getTime() - parseLocalDate(a.date).getTime()
    );

    let latestDateObj: Date;
    if (sortedHistory.length > 0) {
      latestDateObj = parseLocalDate(sortedHistory[0].date);
    } else if (noAuctionDates.length > 0) {
      const sortedNoAuction = [...noAuctionDates].sort().reverse();
      latestDateObj = parseLocalDate(sortedNoAuction[0]);
    } else {
      return { weekStart: new Date(), weekEnd: new Date(), data: [], noAuctionSet };
    }

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
      const dateKey = p.date.split("T")[0];
      const pDate = parseLocalDate(p.date);
      if (pDate >= weekStart && pDate <= weekEnd) {
        weekDataMap.set(dateKey, p);
      }
    });

    const fullWeek: (PriceHistory | null)[] = [];
    for (let i = 0; i < 7; i++) {
      const targetDate = new Date(weekStart);
      targetDate.setDate(weekStart.getDate() + i);
      const dateStr = formatLocalDateStr(targetDate);
      fullWeek.push(weekDataMap.get(dateStr) || null);
    }

    return { weekStart, weekEnd, data: fullWeek, noAuctionSet };
  }, [priceHistory, weekOffset, noAuctionDates]);

  // Filtered daily results
  const filteredDailyResults = useMemo(() => {
    let results = [...dailyResults];

    if (selectedVarieties.length > 0) {
      results = results.filter((r) => r.variety && selectedVarieties.includes(r.variety));
    }
    if (selectedOrigin) {
      results = results.filter((r) => r.origin === selectedOrigin);
    }
    if (selectedUnit) {
      results = results.filter((r) => r.unit === selectedUnit);
    }

    if (sortField) {
      results.sort((a, b) => {
        let aVal: string | number = "";
        let bVal: string | number = "";

        switch (sortField) {
          case "price": aVal = a.price; bVal = b.price; break;
          case "quantity": aVal = a.quantity; bVal = b.quantity; break;
          case "origin": aVal = a.origin || ""; bVal = b.origin || ""; break;
          case "unit": aVal = a.unit; bVal = b.unit; break;
          case "variety": aVal = a.variety || ""; bVal = b.variety || ""; break;
          case "corporation": aVal = a.corporation; bVal = b.corporation; break;
        }

        if (typeof aVal === "number" && typeof bVal === "number") {
          return sortDirection === "asc" ? aVal - bVal : bVal - aVal;
        }
        const comparison = String(aVal).localeCompare(String(bVal));
        return sortDirection === "asc" ? comparison : -comparison;
      });
    }

    return results;
  }, [dailyResults, selectedVarieties, selectedOrigin, selectedUnit, sortField, sortDirection]);

  const filteredDailyStats = useMemo(() => {
    if (filteredDailyResults.length === 0) return null;
    const prices = filteredDailyResults.map((r) => r.price);
    const totalQuantity = filteredDailyResults.reduce((sum, r) => sum + r.quantity, 0);
    const totalTradeAmount = filteredDailyResults.reduce(
      (sum, r) => sum + r.price * r.quantity,
      0
    );
    const weightedAvgPrice = totalQuantity > 0 ? Math.round(totalTradeAmount / totalQuantity) : 0;
    return {
      avgPrice: weightedAvgPrice,
      maxPrice: Math.max(...prices),
      minPrice: Math.min(...prices),
      tradeCount: filteredDailyResults.length,
      totalQuantity,
      totalTradeAmount,
    };
  }, [filteredDailyResults]);

  const originOptions = useMemo(() => {
    const uniqueOrigins = new Set(dailyResults.map((r) => r.origin).filter(Boolean));
    return Array.from(uniqueOrigins) as string[];
  }, [dailyResults]);

  const varietyOptions = useMemo(() => {
    const uniqueVarieties = new Set(dailyResults.map((r) => r.variety).filter(Boolean));
    return Array.from(uniqueVarieties) as string[];
  }, [dailyResults]);

  const unitOptions = useMemo(() => {
    const uniqueUnits = new Set(dailyResults.map((r) => r.unit).filter(Boolean));
    return Array.from(uniqueUnits) as string[];
  }, [dailyResults]);

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
    try {
      const [varietiesRes, originsRes] = await Promise.all([
        fetch(
          `/api/market/garak?action=varieties&productName=${encodeURIComponent(productName)}`
        ),
        fetch(
          `/api/market/garak?action=origins&productName=${encodeURIComponent(productName)}`
        ),
      ]);
      const [varietiesData, originsData] = await Promise.all([
        varietiesRes.json(),
        originsRes.json(),
      ]);
      setVarieties(varietiesData.varieties || []);
      setOrigins(originsData.origins || []);
    } catch (error) {
      console.error("Failed to fetch varieties:", error);
      setVarieties([]);
      setOrigins([]);
    }
  }, []);

  const fetchPriceHistory = useCallback(
    async (
      productName: string,
      varieties?: string[],
      origin?: string | null,
      days?: string,
      unit?: string | null
    ) => {
      setLoadingHistory(true);
      try {
        let url = `/api/market/garak?action=history&productName=${encodeURIComponent(productName)}&days=${days || viewDays}`;
        if (varieties && varieties.length > 0) {
          url += `&varieties=${encodeURIComponent(varieties.join(","))}`;
        }
        if (origin) url += `&origin=${encodeURIComponent(origin)}`;
        if (unit) url += `&unit=${encodeURIComponent(unit)}`;

        const response = await fetch(url);
        const data = await response.json();
        setPriceHistory(data.history || []);
        setNoAuctionDates(data.noAuctionDates || []);
      } catch (error) {
        console.error("Failed to fetch price history:", error);
        setPriceHistory([]);
        setNoAuctionDates([]);
      } finally {
        setLoadingHistory(false);
      }
    },
    [viewDays]
  );

  const fetchDailyDetail = useCallback(async (date: string, productName: string) => {
    setLoadingDaily(true);
    try {
      const url = `/api/market/garak?action=dailyDetail&date=${date}&productName=${encodeURIComponent(productName)}`;
      const response = await fetch(url);
      const data = await response.json();
      setDailyResults(data.results || []);
    } catch (error) {
      console.error("Failed to fetch daily detail:", error);
      setDailyResults([]);
    } finally {
      setLoadingDaily(false);
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

  useEffect(() => {
    if (selectedProduct) {
      fetchVarieties(selectedProduct);
      fetchPriceHistory(selectedProduct, selectedVarieties, selectedOrigin, viewDays, selectedUnit);
    }
  }, [selectedProduct, selectedVarieties, selectedOrigin, selectedUnit, viewDays, fetchVarieties, fetchPriceHistory]);

  useEffect(() => {
    if (selectedDate && selectedProduct) {
      fetchDailyDetail(selectedDate, selectedProduct);
    } else {
      setDailyResults([]);
    }
  }, [selectedDate, selectedProduct, fetchDailyDetail]);

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
          <MarketPriceChart
            selectedProduct={selectedProduct}
            selectedVarieties={selectedVarieties}
            selectedOrigin={selectedOrigin}
            selectedUnit={selectedUnit}
            latestDate={latestDate}
            priceHistory={priceHistory}
            loadingHistory={loadingHistory}
            viewDays={viewDays}
            onViewDaysChange={setViewDays}
          />

          <MarketPriceFilter
            varieties={varieties}
            origins={origins}
            unitOptions={unitOptions}
            selectedVarieties={selectedVarieties}
            selectedOrigin={selectedOrigin}
            selectedUnit={selectedUnit}
            filterPresets={filterPresets}
            presetNameInput={presetNameInput}
            onVarietiesChange={setSelectedVarieties}
            onOriginChange={setSelectedOrigin}
            onUnitChange={setSelectedUnit}
            onPresetNameChange={setPresetNameInput}
            onSavePreset={handleSaveFilterPreset}
            onLoadPreset={handleLoadFilterPreset}
            onDeletePreset={handleDeleteFilterPreset}
          />

          <MarketPriceWeeklyTable
            weeklyPriceData={weeklyPriceData}
            priceHistory={priceHistory}
            loadingHistory={loadingHistory}
            selectedDate={selectedDate}
            weekOffset={weekOffset}
            onDateSelect={setSelectedDate}
            onWeekOffsetChange={setWeekOffset}
          />
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
