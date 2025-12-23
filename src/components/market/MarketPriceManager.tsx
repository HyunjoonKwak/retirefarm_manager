"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Search,
  Star,
  Loader2,
  Trash2,
  TrendingUp,
  TrendingDown,
  Minus,
  RefreshCw,
  Calendar,
  MapPin,
  LineChart as LineChartIcon,
  ArrowUpDown,
  BarChart3,
  ChevronUp,
  ChevronDown,
  Plus,
  GripVertical,
  X,
  ChevronLeft,
  ChevronRight,
  Settings2,
} from "lucide-react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts";
import { formatExactPrice, formatDate } from "@/lib/utils/format";
import { toast } from "sonner";

interface WatchlistItem {
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

interface SavedFilterPreset {
  id: string;
  name: string;
  productName: string;
  varieties: string[];
  origin: string | null;
  unit: string | null;
}

interface PriceHistory {
  date: string;
  avgPrice: number;
  maxPrice: number;
  minPrice: number;
  tradeCount: number;
  totalQuantity?: number;
  pricePerKg?: number | null;
}

interface DailyDetailResult {
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

// 기본 품목 목록
const DEFAULT_PRODUCTS = [
  "토마토", "포도", "딸기", "수박", "참외", "오이", "고추",
  "배추", "상추", "시금치", "양배추", "무", "당근",
  "감자", "고구마", "사과", "배", "감귤", "복숭아", "멜론",
];

const PERIOD_OPTIONS = [
  { value: "7", label: "일간", days: 7, description: "최근 7일" },
  { value: "30", label: "주간", days: 30, description: "최근 4주" },
  { value: "90", label: "월간", days: 90, description: "최근 3개월" },
  { value: "365", label: "연간", days: 365, description: "최근 1년" },
];

// 요일 이름
const DAY_NAMES = ["일", "월", "화", "수", "목", "금", "토"];

// 정렬 타입
type SortField = "price" | "quantity" | "origin" | "unit" | "variety" | "corporation";
type SortDirection = "asc" | "desc";

export function MarketPriceManager() {
  const [watchlist, setWatchlist] = useState<WatchlistItem[]>([]);
  const [varieties, setVarieties] = useState<string[]>([]);
  const [origins, setOrigins] = useState<string[]>([]);
  const [priceHistory, setPriceHistory] = useState<PriceHistory[]>([]);
  const [latestDate, setLatestDate] = useState<string | null>(null);
  const [dailyResults, setDailyResults] = useState<DailyDetailResult[]>([]);

  const [loading, setLoading] = useState(true);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [loadingDaily, setLoadingDaily] = useState(false);

  // 품목 관리 (단일 선택, 커스텀 목록)
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

  // 필터 (그래프 아래 통합) - 품목별 localStorage 저장
  const [selectedVarieties, setSelectedVarieties] = useState<string[]>([]);
  const [selectedOrigin, setSelectedOrigin] = useState<string | null>(null);
  const [selectedUnit, setSelectedUnit] = useState<string | null>(null);
  const [viewDays, setViewDays] = useState("30");

  // 필터 프리셋 저장
  const [filterPresets, setFilterPresets] = useState<SavedFilterPreset[]>(() => {
    if (typeof window !== "undefined") {
      const saved = localStorage.getItem("market_filterPresets");
      return saved ? JSON.parse(saved) : [];
    }
    return [];
  });
  const [presetNameInput, setPresetNameInput] = useState("");
  const [selectedDate, setSelectedDate] = useState<string>("");

  // 일별 시세 주간 페이지네이션
  const [weekOffset, setWeekOffset] = useState(0);

  // 상세 거래 내역 정렬
  const [sortField, setSortField] = useState<SortField | null>(null);
  const [sortDirection, setSortDirection] = useState<SortDirection>("desc");

  // 삭제 확인 다이얼로그
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [deleteConfirmName, setDeleteConfirmName] = useState<string>("");

  // localStorage 동기화
  useEffect(() => {
    localStorage.setItem("market_productList", JSON.stringify(productList));
  }, [productList]);

  useEffect(() => {
    if (selectedProduct) {
      localStorage.setItem("market_selectedProduct", selectedProduct);
    }
  }, [selectedProduct]);

  // 품목별 필터 저장 (품종/산지/단위)
  useEffect(() => {
    if (selectedProduct) {
      const filterKey = `market_filter_${selectedProduct}`;
      localStorage.setItem(filterKey, JSON.stringify({
        varieties: selectedVarieties,
        origin: selectedOrigin,
        unit: selectedUnit,
      }));
    }
  }, [selectedProduct, selectedVarieties, selectedOrigin, selectedUnit]);

  // 필터 프리셋 저장
  useEffect(() => {
    localStorage.setItem("market_filterPresets", JSON.stringify(filterPresets));
  }, [filterPresets]);

  // 차트 데이터 (역순으로 정렬하여 시간순 표시)
  const chartData = useMemo(() => {
    return [...priceHistory].reverse().map(p => ({
      date: formatDate(p.date).slice(5),
      평균가: p.avgPrice,
      최고가: p.maxPrice,
      최저가: p.minPrice,
      "kg당": p.pricePerKg || null,
    }));
  }, [priceHistory]);

  // pricePerKg 데이터가 있는지 확인
  const hasKgPrice = useMemo(() => {
    return priceHistory.some(p => p.pricePerKg != null);
  }, [priceHistory]);

  // 주간 단위로 그룹화된 일별 시세 데이터
  const weeklyPriceData = useMemo(() => {
    if (priceHistory.length === 0) return { weekStart: new Date(), weekEnd: new Date(), data: [] };

    const sortedHistory = [...priceHistory].sort((a, b) =>
      new Date(b.date).getTime() - new Date(a.date).getTime()
    );

    if (sortedHistory.length === 0) return { weekStart: new Date(), weekEnd: new Date(), data: [] };

    // 현재 주의 일요일 찾기
    const latestDateObj = new Date(sortedHistory[0].date);
    const dayOfWeek = latestDateObj.getDay();
    const currentSunday = new Date(latestDateObj);
    currentSunday.setDate(latestDateObj.getDate() - dayOfWeek);
    currentSunday.setHours(0, 0, 0, 0);

    // 데이터를 주간으로 그룹화
    const weekStart = new Date(currentSunday);
    weekStart.setDate(weekStart.getDate() - weekOffset * 7);

    const weekEnd = new Date(weekStart);
    weekEnd.setDate(weekStart.getDate() + 6);

    // 해당 주의 데이터 필터링
    const weekData = sortedHistory.filter(p => {
      const d = new Date(p.date);
      return d >= weekStart && d <= weekEnd;
    });

    // 일요일부터 토요일까지 빈 슬롯 포함하여 정렬
    const fullWeek: (PriceHistory | null)[] = [];
    for (let i = 0; i < 7; i++) {
      const targetDate = new Date(weekStart);
      targetDate.setDate(weekStart.getDate() + i);
      const dateStr = targetDate.toISOString().split("T")[0];

      const found = weekData.find(p => p.date.split("T")[0] === dateStr);
      fullWeek.push(found || null);
    }

    return {
      weekStart,
      weekEnd,
      data: fullWeek,
    };
  }, [priceHistory, weekOffset]);

  // 필터가 적용된 일별 결과
  const filteredDailyResults = useMemo(() => {
    let results = [...dailyResults];

    if (selectedVarieties.length > 0) {
      results = results.filter(r => r.variety && selectedVarieties.includes(r.variety));
    }
    if (selectedOrigin) {
      results = results.filter(r => r.origin === selectedOrigin);
    }
    if (selectedUnit) {
      results = results.filter(r => r.unit === selectedUnit);
    }

    // 정렬 적용
    if (sortField) {
      results.sort((a, b) => {
        let aVal: string | number = "";
        let bVal: string | number = "";

        switch (sortField) {
          case "price":
            aVal = a.price;
            bVal = b.price;
            break;
          case "quantity":
            aVal = a.quantity;
            bVal = b.quantity;
            break;
          case "origin":
            aVal = a.origin || "";
            bVal = b.origin || "";
            break;
          case "unit":
            aVal = a.unit;
            bVal = b.unit;
            break;
          case "variety":
            aVal = a.variety || "";
            bVal = b.variety || "";
            break;
          case "corporation":
            aVal = a.corporation;
            bVal = b.corporation;
            break;
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

  // 필터링된 결과의 통계 (필터 적용됨, 가중평균)
  const filteredDailyStats = useMemo(() => {
    if (filteredDailyResults.length === 0) return null;

    const prices = filteredDailyResults.map(r => r.price);
    const totalQuantity = filteredDailyResults.reduce((sum, r) => sum + r.quantity, 0);

    // 가중평균: sum(price * quantity) / sum(quantity)
    const totalWeightedPrice = filteredDailyResults.reduce((sum, r) => sum + (r.price * r.quantity), 0);
    const weightedAvgPrice = totalQuantity > 0 ? Math.round(totalWeightedPrice / totalQuantity) : 0;

    return {
      avgPrice: weightedAvgPrice,
      maxPrice: Math.max(...prices),
      minPrice: Math.min(...prices),
      tradeCount: filteredDailyResults.length,
      totalQuantity,
    };
  }, [filteredDailyResults]);

  // 산지 목록 추출
  const originOptions = useMemo(() => {
    const uniqueOrigins = new Set(dailyResults.map(r => r.origin).filter(Boolean));
    return Array.from(uniqueOrigins) as string[];
  }, [dailyResults]);

  // 품종 목록 추출
  const varietyOptions = useMemo(() => {
    const uniqueVarieties = new Set(dailyResults.map(r => r.variety).filter(Boolean));
    return Array.from(uniqueVarieties) as string[];
  }, [dailyResults]);

  // 단위 목록 추출
  const unitOptions = useMemo(() => {
    const uniqueUnits = new Set(dailyResults.map(r => r.unit).filter(Boolean));
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
      const response = await fetch(`/api/market/garak?action=varieties&productName=${encodeURIComponent(productName)}`);
      const data = await response.json();
      setVarieties(data.varieties || []);
      // 산지 목록도 함께 가져오기
      const originsResponse = await fetch(`/api/market/garak?action=origins&productName=${encodeURIComponent(productName)}`);
      const originsData = await originsResponse.json();
      setOrigins(originsData.origins || []);
    } catch (error) {
      console.error("Failed to fetch varieties:", error);
      setVarieties([]);
      setOrigins([]);
    }
  }, []);

  const fetchPriceHistory = useCallback(async (
    productName: string,
    varieties?: string[],
    origin?: string | null,
    days?: string,
    unit?: string | null
  ) => {
    setLoadingHistory(true);
    try {
      let url = `/api/market/garak?action=history&productName=${encodeURIComponent(productName)}&days=${days || viewDays}`;
      // 다중 품종 필터 전달 (쉼표 구분)
      if (varieties && varieties.length > 0) {
        url += `&varieties=${encodeURIComponent(varieties.join(","))}`;
      }
      if (origin) url += `&origin=${encodeURIComponent(origin)}`;
      if (unit) url += `&unit=${encodeURIComponent(unit)}`;

      const response = await fetch(url);
      const data = await response.json();
      setPriceHistory(data.history || []);
    } catch (error) {
      console.error("Failed to fetch price history:", error);
      setPriceHistory([]);
    } finally {
      setLoadingHistory(false);
    }
  }, [viewDays]);

  const fetchDailyDetail = useCallback(async (
    date: string,
    productName: string
  ) => {
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
    Promise.all([
      fetchWatchlist(),
      fetchLatestDate(),
    ]).finally(() => setLoading(false));
  }, [fetchWatchlist, fetchLatestDate]);

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
    // 다중 품종 선택 시에는 첫 번째 품종만 사용
    const variety = varieties && varieties.length > 0 ? varieties[0] : undefined;
    return watchlist.some(
      (item) =>
        item.productName === productName &&
        (item.variety || "") === (variety || "") &&
        (item.origin || "") === (origin || "")
    );
  }

  async function handleAddToWatchlist(productName: string, varieties?: string[], origin?: string) {
    // 다중 품종 선택 시에는 첫 번째 품종만 사용
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

  function handleDeleteClick(id: string, productName: string) {
    setDeleteConfirmId(id);
    setDeleteConfirmName(productName);
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
    // 저장된 필터 불러오기
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

  // 필터 프리셋 저장
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

  // 필터 프리셋 불러오기
  function handleLoadFilterPreset(preset: SavedFilterPreset) {
    setSelectedProduct(preset.productName);
    setSelectedVarieties(preset.varieties);
    setSelectedOrigin(preset.origin);
    setSelectedUnit(preset.unit || null);
    setSelectedDate("");
    setWeekOffset(0);
    toast.success(`${preset.name} 필터가 적용되었습니다.`);
  }

  // 필터 프리셋 삭제
  function handleDeleteFilterPreset(presetId: string) {
    setFilterPresets(filterPresets.filter(p => p.id !== presetId));
    toast.success("필터 조합이 삭제되었습니다.");
  }

  // 품목 추가
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

  // 품목 제거
  function handleRemoveProduct(product: string) {
    setProductList(productList.filter(p => p !== product));
    if (selectedProduct === product) {
      setSelectedProduct(null);
    }
  }

  // 품목 순서 변경 (드래그 앤 드롭)
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

  // 정렬 토글
  function toggleSort(field: SortField) {
    if (sortField === field) {
      setSortDirection(sortDirection === "asc" ? "desc" : "asc");
    } else {
      setSortField(field);
      setSortDirection("desc");
    }
  }

  function getSortIcon(field: SortField) {
    if (sortField !== field) return <ArrowUpDown className="h-3 w-3 opacity-50" />;
    return sortDirection === "asc"
      ? <ChevronUp className="h-3 w-3" />
      : <ChevronDown className="h-3 w-3" />;
  }

  function getPriceChangeIcon(change: number | null) {
    if (change === null) return <Minus className="h-3 w-3" />;
    if (change > 0) return <TrendingUp className="h-3 w-3" />;
    if (change < 0) return <TrendingDown className="h-3 w-3" />;
    return <Minus className="h-3 w-3" />;
  }

  function getPriceChangeColor(change: number | null) {
    if (change === null) return "text-gray-500";
    if (change > 0) return "text-red-500";
    if (change < 0) return "text-blue-500";
    return "text-gray-500";
  }

  function getPriceChangeBadge(change: number | null) {
    if (change === null) return "secondary";
    if (change > 0) return "destructive";
    if (change < 0) return "default";
    return "secondary";
  }

  // 날짜에 요일 추가
  function formatDateWithDay(dateStr: string) {
    const d = new Date(dateStr);
    const dayName = DAY_NAMES[d.getDay()];
    return `${formatDate(dateStr)} (${dayName})`;
  }

  // 주간 범위 텍스트
  function getWeekRangeText() {
    if (!weeklyPriceData.weekStart) return "";
    const start = formatDate(weeklyPriceData.weekStart.toISOString());
    const end = formatDate(weeklyPriceData.weekEnd.toISOString());
    return `${start} ~ ${end}`;
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
      {/* 품목 선택 */}
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
          {/* 품목 버튼 (단일 선택) */}
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

          {/* 편집 모드: 품목 추가 */}
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
              <span className="text-xs text-muted-foreground">
                드래그하여 순서 변경 가능
              </span>
            </div>
          )}

          {/* 선택된 품목 + 액션 버튼 */}
          {selectedProduct && !isEditingProducts && (
            <div className="flex items-center gap-3 pt-3 border-t">
              <Badge variant="default" className="text-sm">
                {selectedProduct}
              </Badge>
              <Button
                variant={isAlreadyInWatchlist(selectedProduct, selectedVarieties, selectedOrigin || undefined) ? "secondary" : "outline"}
                size="sm"
                onClick={() => handleAddToWatchlist(selectedProduct, selectedVarieties, selectedOrigin || undefined)}
                disabled={isAlreadyInWatchlist(selectedProduct, selectedVarieties, selectedOrigin || undefined)}
              >
                <Star className={`h-4 w-4 ${isAlreadyInWatchlist(selectedProduct, selectedVarieties, selectedOrigin || undefined) ? "fill-yellow-500 text-yellow-500" : ""}`} />
                관심등록
              </Button>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => {
                  fetchWatchlist();
                  fetchLatestDate();
                  if (selectedProduct) {
                    fetchPriceHistory(selectedProduct, selectedVarieties, selectedOrigin, viewDays, selectedUnit);
                  }
                }}
              >
                <RefreshCw className="h-4 w-4" />
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* 선택된 품목이 있을 때 시세 정보 표시 */}
      {selectedProduct && (
        <>
          {/* 가격 추이 차트 */}
          <Card>
            <CardHeader className="pb-2">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <CardTitle className="flex items-center gap-2 flex-wrap">
                  <BarChart3 className="h-5 w-5 flex-shrink-0" />
                  <span>{selectedProduct} 시세</span>
                  {selectedVarieties.length > 0 && selectedVarieties.map(v => (
                    <Badge key={v} variant="outline" className="text-xs">{v}</Badge>
                  ))}
                  {selectedOrigin && <Badge variant="secondary" className="text-xs">{selectedOrigin}</Badge>}
                  {selectedUnit && <Badge variant="default" className="text-xs">{selectedUnit}</Badge>}
                </CardTitle>
                {latestDate && (
                  <span className="text-xs text-muted-foreground whitespace-nowrap">
                    최신: {formatDate(latestDate)}
                  </span>
                )}
              </div>
              {/* 기간 선택 탭 */}
              <div className="flex gap-1 mt-3">
                {PERIOD_OPTIONS.map((opt) => (
                  <Button
                    key={opt.value}
                    variant={viewDays === opt.value ? "default" : "outline"}
                    size="sm"
                    onClick={() => setViewDays(opt.value)}
                    className="flex-1"
                  >
                    {opt.label}
                  </Button>
                ))}
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                {PERIOD_OPTIONS.find(o => o.value === viewDays)?.description}
                <span className="ml-2 text-amber-600">• 평균가: 수량 가중평균</span>
                {hasKgPrice && <span className="ml-2">• kg당: 1kg 환산 단가</span>}
              </p>
            </CardHeader>
            <CardContent>
              {loadingHistory ? (
                <div className="flex items-center justify-center py-16">
                  <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                </div>
              ) : chartData.length > 0 ? (
                <div className="h-[300px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={chartData}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="date" fontSize={12} />
                      <YAxis
                        fontSize={12}
                        tickFormatter={(v) => `${v.toLocaleString()}`}
                      />
                      <Tooltip
                        formatter={(value: number) => formatExactPrice(value)}
                        labelFormatter={(label) => `날짜: ${label}`}
                      />
                      <Legend />
                      <Line
                        type="monotone"
                        dataKey="평균가"
                        stroke="#3b82f6"
                        strokeWidth={2}
                        dot={{ r: 3 }}
                      />
                      <Line
                        type="monotone"
                        dataKey="최고가"
                        stroke="#ef4444"
                        strokeWidth={1}
                        strokeDasharray="5 5"
                        dot={false}
                      />
                      <Line
                        type="monotone"
                        dataKey="최저가"
                        stroke="#22c55e"
                        strokeWidth={1}
                        strokeDasharray="5 5"
                        dot={false}
                      />
                      {hasKgPrice && (
                        <Line
                          type="monotone"
                          dataKey="kg당"
                          stroke="#f59e0b"
                          strokeWidth={2}
                          dot={{ r: 2 }}
                          connectNulls
                        />
                      )}
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center py-16 text-center">
                  <LineChartIcon className="h-12 w-12 text-muted-foreground mb-4" />
                  <p className="text-muted-foreground">시세 데이터가 없습니다.</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    데이터 수집 페이지에서 가락시장 경매 데이터를 수집해보세요.
                  </p>
                </div>
              )}
            </CardContent>
          </Card>

          {/* 필터 (그래프 아래) */}
          <Card>
            <CardContent className="py-4 space-y-4">
              {/* 품종 다중선택 */}
              {varieties.length > 0 && (
                <div className="space-y-2">
                  <Label className="text-sm">품종 (다중선택)</Label>
                  <div className="flex flex-wrap gap-2">
                    {varieties.map((v) => (
                      <Button
                        key={v}
                        variant={selectedVarieties.includes(v) ? "default" : "outline"}
                        size="sm"
                        onClick={() => {
                          if (selectedVarieties.includes(v)) {
                            setSelectedVarieties(selectedVarieties.filter(sv => sv !== v));
                          } else {
                            setSelectedVarieties([...selectedVarieties, v]);
                          }
                        }}
                      >
                        {v}
                      </Button>
                    ))}
                  </div>
                </div>
              )}

              {/* 산지 단일선택 */}
              <div className="flex flex-wrap items-center gap-4">
                <div className="flex items-center gap-2">
                  <Label className="text-sm whitespace-nowrap">산지</Label>
                  <Select
                    value={selectedOrigin || "_all"}
                    onValueChange={(v) => setSelectedOrigin(v === "_all" ? null : v)}
                  >
                    <SelectTrigger className="w-32">
                      <SelectValue placeholder="전체" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="_all">전체</SelectItem>
                      {origins.map((o) => (
                        <SelectItem key={o} value={o}>{o}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {/* 단위 선택 */}
                {unitOptions.length > 0 && (
                  <div className="flex items-center gap-2">
                    <Label className="text-sm whitespace-nowrap">단위</Label>
                    <Select
                      value={selectedUnit || "_all"}
                      onValueChange={(v) => setSelectedUnit(v === "_all" ? null : v)}
                    >
                      <SelectTrigger className="w-28">
                        <SelectValue placeholder="전체" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="_all">전체</SelectItem>
                        {unitOptions.map((u) => (
                          <SelectItem key={u} value={u}>{u}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}

                {(selectedVarieties.length > 0 || selectedOrigin || selectedUnit) && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      setSelectedVarieties([]);
                      setSelectedOrigin(null);
                      setSelectedUnit(null);
                    }}
                  >
                    필터 초기화
                  </Button>
                )}
              </div>

              {/* 선택된 품종 표시 */}
              {selectedVarieties.length > 0 && (
                <div className="flex flex-wrap gap-1 pt-2 border-t">
                  <span className="text-xs text-muted-foreground mr-2">선택됨:</span>
                  {selectedVarieties.map((v) => (
                    <Badge
                      key={v}
                      variant="secondary"
                      className="cursor-pointer hover:bg-destructive hover:text-destructive-foreground"
                      onClick={() => setSelectedVarieties(selectedVarieties.filter(sv => sv !== v))}
                    >
                      {v}
                      <X className="h-3 w-3 ml-1" />
                    </Badge>
                  ))}
                </div>
              )}

              {/* 필터 조합 저장 */}
              {(selectedVarieties.length > 0 || selectedOrigin || selectedUnit) && (
                <div className="flex flex-wrap items-center gap-2 pt-3 border-t">
                  <Input
                    placeholder="조합 이름 (선택사항)"
                    value={presetNameInput}
                    onChange={(e) => setPresetNameInput(e.target.value)}
                    className="w-40 h-8 text-sm"
                    onKeyDown={(e) => {
                      if (e.key === "Enter") handleSaveFilterPreset();
                    }}
                  />
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleSaveFilterPreset}
                  >
                    <Star className="h-3 w-3 mr-1" />
                    조합 저장
                  </Button>
                </div>
              )}

              {/* 저장된 필터 조합 */}
              {filterPresets.length > 0 && (
                <div className="space-y-2 pt-3 border-t">
                  <Label className="text-sm text-muted-foreground">저장된 조합</Label>
                  <div className="flex flex-wrap gap-2">
                    {filterPresets.map((preset) => (
                      <Badge
                        key={preset.id}
                        variant="outline"
                        className="cursor-pointer hover:bg-primary hover:text-primary-foreground group"
                        onClick={() => handleLoadFilterPreset(preset)}
                      >
                        {preset.name}
                        <button
                          className="ml-1 opacity-50 group-hover:opacity-100 hover:text-destructive"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDeleteFilterPreset(preset.id);
                          }}
                        >
                          <X className="h-3 w-3" />
                        </button>
                      </Badge>
                    ))}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          {/* 일별 시세 테이블 (주간 단위) */}
          <Card>
            <CardHeader className="pb-3">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <CardTitle className="flex items-center gap-2">
                  <Calendar className="h-5 w-5" />
                  일별 시세
                </CardTitle>
                <div className="flex items-center gap-1 sm:gap-2">
                  <Button
                    variant="outline"
                    size="icon"
                    className="h-8 w-8"
                    onClick={() => setWeekOffset(weekOffset + 1)}
                    disabled={loadingHistory}
                  >
                    <ChevronLeft className="h-4 w-4" />
                  </Button>
                  <span className="text-xs sm:text-sm text-muted-foreground min-w-[120px] sm:min-w-[180px] text-center">
                    {getWeekRangeText()}
                  </span>
                  <Button
                    variant="outline"
                    size="icon"
                    className="h-8 w-8"
                    onClick={() => setWeekOffset(Math.max(0, weekOffset - 1))}
                    disabled={weekOffset === 0 || loadingHistory}
                  >
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                </div>
              </div>
              <CardDescription className="text-xs">
                날짜 클릭 → 상세 거래 내역
              </CardDescription>
            </CardHeader>
            <CardContent>
              {loadingHistory ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                </div>
              ) : weeklyPriceData.data && weeklyPriceData.data.length > 0 ? (
                <div className="overflow-x-auto -mx-4 sm:mx-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="whitespace-nowrap">날짜</TableHead>
                      <TableHead className="text-right whitespace-nowrap">평균가</TableHead>
                      <TableHead className="text-right whitespace-nowrap hidden lg:table-cell text-amber-600">kg당</TableHead>
                      <TableHead className="text-right whitespace-nowrap hidden sm:table-cell">변동</TableHead>
                      <TableHead className="text-right whitespace-nowrap hidden md:table-cell">최고가</TableHead>
                      <TableHead className="text-right whitespace-nowrap hidden md:table-cell">최저가</TableHead>
                      <TableHead className="text-right whitespace-nowrap">거래</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {weeklyPriceData.data.map((price, index) => {
                      const targetDate = new Date(weeklyPriceData.weekStart);
                      targetDate.setDate(weeklyPriceData.weekStart.getDate() + index);
                      const dateStr = targetDate.toISOString().split("T")[0];
                      const dayName = DAY_NAMES[targetDate.getDay()];

                      if (!price) {
                        return (
                          <TableRow key={dateStr} className="text-muted-foreground">
                            <TableCell className="text-xs sm:text-sm whitespace-nowrap">{formatDate(dateStr)} ({dayName})</TableCell>
                            <TableCell className="text-right">-</TableCell>
                            <TableCell className="text-right hidden lg:table-cell">-</TableCell>
                            <TableCell className="text-right hidden sm:table-cell">-</TableCell>
                            <TableCell className="text-right hidden md:table-cell">-</TableCell>
                            <TableCell className="text-right hidden md:table-cell">-</TableCell>
                            <TableCell className="text-right">-</TableCell>
                          </TableRow>
                        );
                      }

                      // 이전 날짜 데이터 찾기 (변동 계산용)
                      const prevData = weeklyPriceData.data.slice(0, index).reverse().find(p => p !== null);
                      const change = prevData
                        ? ((price.avgPrice - prevData.avgPrice) / prevData.avgPrice) * 100
                        : null;

                      return (
                        <TableRow
                          key={dateStr}
                          className={`cursor-pointer hover:bg-muted/50 ${selectedDate === dateStr ? "bg-blue-50" : ""}`}
                          onClick={() => setSelectedDate(dateStr)}
                        >
                          <TableCell className="text-blue-600 hover:underline font-medium text-xs sm:text-sm whitespace-nowrap">
                            {formatDate(price.date)} ({dayName})
                          </TableCell>
                          <TableCell className="text-right font-medium text-xs sm:text-sm whitespace-nowrap">
                            {formatExactPrice(price.avgPrice)}
                          </TableCell>
                          <TableCell className="text-right hidden lg:table-cell text-amber-600 text-xs sm:text-sm whitespace-nowrap">
                            {price.pricePerKg ? formatExactPrice(price.pricePerKg) : "-"}
                          </TableCell>
                          <TableCell className="text-right hidden sm:table-cell">
                            {change !== null && (
                              <Badge
                                variant={getPriceChangeBadge(change) as "default" | "secondary" | "destructive"}
                                className="text-xs"
                              >
                                {getPriceChangeIcon(change)}
                                {Math.abs(change).toFixed(1)}%
                              </Badge>
                            )}
                          </TableCell>
                          <TableCell className="text-right text-red-600 hidden md:table-cell whitespace-nowrap">
                            {formatExactPrice(price.maxPrice)}
                          </TableCell>
                          <TableCell className="text-right text-blue-600 hidden md:table-cell whitespace-nowrap">
                            {formatExactPrice(price.minPrice)}
                          </TableCell>
                          <TableCell className="text-right text-xs sm:text-sm whitespace-nowrap">
                            {price.tradeCount}건
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
                </div>
              ) : (
                <div className="text-center py-8 text-muted-foreground">
                  데이터가 없습니다.
                </div>
              )}
            </CardContent>
          </Card>
        </>
      )}

      {/* 선택 날짜 거래 내역 */}
      {selectedDate && selectedProduct && (
        <Card className="border-blue-200 bg-blue-50/30">
          <CardHeader className="pb-3">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div className="min-w-0">
                <CardTitle className="flex items-center gap-2 text-blue-700 text-sm sm:text-base">
                  <ArrowUpDown className="h-4 w-4 sm:h-5 sm:w-5 flex-shrink-0" />
                  <span className="truncate">{formatDateWithDay(selectedDate)} 상세 내역</span>
                </CardTitle>
                <CardDescription className="text-xs sm:text-sm truncate">
                  {selectedProduct}
                  {selectedVarieties.length > 0 && ` / ${selectedVarieties.join(", ")}`}
                  {selectedOrigin && ` / ${selectedOrigin}`}
                  {selectedUnit && ` / ${selectedUnit}`}
                </CardDescription>
              </div>
              <Button
                variant="outline"
                size="sm"
                className="self-end sm:self-auto"
                onClick={() => setSelectedDate("")}
              >
                닫기
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            {loadingDaily ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
              </div>
            ) : filteredDailyResults.length > 0 ? (
              <div className="space-y-4">
                {/* 필터 (상세 내역용) */}
                <div className="p-3 bg-white rounded-lg border space-y-3">
                  {/* 품종 다중선택 */}
                  {varietyOptions.length > 0 && (
                    <div className="space-y-2">
                      <Label className="text-sm">품종 (다중선택)</Label>
                      <div className="flex flex-wrap gap-2">
                        {varietyOptions.map((v) => (
                          <Button
                            key={v}
                            variant={selectedVarieties.includes(v) ? "default" : "outline"}
                            size="sm"
                            onClick={() => {
                              if (selectedVarieties.includes(v)) {
                                setSelectedVarieties(selectedVarieties.filter(sv => sv !== v));
                              } else {
                                setSelectedVarieties([...selectedVarieties, v]);
                              }
                            }}
                          >
                            {v}
                          </Button>
                        ))}
                      </div>
                    </div>
                  )}

                  <div className="flex flex-wrap items-center gap-4">
                    <div className="flex items-center gap-2">
                      <Label className="text-sm whitespace-nowrap">산지</Label>
                      <Select
                        value={selectedOrigin || "_all"}
                        onValueChange={(v) => setSelectedOrigin(v === "_all" ? null : v)}
                      >
                        <SelectTrigger className="w-32">
                          <SelectValue placeholder="전체" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="_all">전체</SelectItem>
                          {originOptions.map((o) => (
                            <SelectItem key={o} value={o}>{o}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    {/* 단위 선택 */}
                    {unitOptions.length > 0 && (
                      <div className="flex items-center gap-2">
                        <Label className="text-sm whitespace-nowrap">단위</Label>
                        <Select
                          value={selectedUnit || "_all"}
                          onValueChange={(v) => setSelectedUnit(v === "_all" ? null : v)}
                        >
                          <SelectTrigger className="w-28">
                            <SelectValue placeholder="전체" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="_all">전체</SelectItem>
                            {unitOptions.map((u) => (
                              <SelectItem key={u} value={u}>{u}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    )}

                    {(selectedVarieties.length > 0 || selectedOrigin || selectedUnit) && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          setSelectedVarieties([]);
                          setSelectedOrigin(null);
                          setSelectedUnit(null);
                        }}
                      >
                        필터 초기화
                      </Button>
                    )}
                  </div>
                </div>

                {/* 통계 요약 (필터 적용됨) */}
                {filteredDailyStats && (
                  <div className="grid grid-cols-3 sm:grid-cols-5 gap-2 sm:gap-3 text-center">
                    <div className="p-2 bg-white rounded border">
                      <p className="text-[10px] sm:text-xs text-muted-foreground">평균가</p>
                      <p className="font-bold text-xs sm:text-sm">{formatExactPrice(filteredDailyStats.avgPrice)}</p>
                    </div>
                    <div className="p-2 bg-white rounded border">
                      <p className="text-[10px] sm:text-xs text-red-600">최고가</p>
                      <p className="font-bold text-red-600 text-xs sm:text-sm">{formatExactPrice(filteredDailyStats.maxPrice)}</p>
                    </div>
                    <div className="p-2 bg-white rounded border">
                      <p className="text-[10px] sm:text-xs text-blue-600">최저가</p>
                      <p className="font-bold text-blue-600 text-xs sm:text-sm">{formatExactPrice(filteredDailyStats.minPrice)}</p>
                    </div>
                    <div className="p-2 bg-white rounded border">
                      <p className="text-[10px] sm:text-xs text-muted-foreground">거래건수</p>
                      <p className="font-bold text-xs sm:text-sm">{filteredDailyStats.tradeCount}건</p>
                    </div>
                    <div className="p-2 bg-white rounded border">
                      <p className="text-[10px] sm:text-xs text-muted-foreground">총수량</p>
                      <p className="font-bold text-xs sm:text-sm">{filteredDailyStats.totalQuantity.toLocaleString()}</p>
                    </div>
                  </div>
                )}

                {/* 거래 내역 테이블 */}
                <div className="max-h-[500px] overflow-y-auto overflow-x-auto -mx-3 sm:mx-0">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead
                          className="cursor-pointer hover:bg-muted/50 whitespace-nowrap"
                          onClick={() => toggleSort("variety")}
                        >
                          <div className="flex items-center gap-1">
                            품종 {getSortIcon("variety")}
                          </div>
                        </TableHead>
                        <TableHead
                          className="cursor-pointer hover:bg-muted/50 whitespace-nowrap hidden sm:table-cell"
                          onClick={() => toggleSort("origin")}
                        >
                          <div className="flex items-center gap-1">
                            산지 {getSortIcon("origin")}
                          </div>
                        </TableHead>
                        <TableHead
                          className="text-right cursor-pointer hover:bg-muted/50 whitespace-nowrap"
                          onClick={() => toggleSort("price")}
                        >
                          <div className="flex items-center justify-end gap-1">
                            가격 {getSortIcon("price")}
                          </div>
                        </TableHead>
                        <TableHead
                          className="cursor-pointer hover:bg-muted/50 whitespace-nowrap hidden md:table-cell"
                          onClick={() => toggleSort("unit")}
                        >
                          <div className="flex items-center gap-1">
                            단위 {getSortIcon("unit")}
                          </div>
                        </TableHead>
                        <TableHead
                          className="text-right cursor-pointer hover:bg-muted/50 whitespace-nowrap"
                          onClick={() => toggleSort("quantity")}
                        >
                          <div className="flex items-center justify-end gap-1">
                            수량 {getSortIcon("quantity")}
                          </div>
                        </TableHead>
                        <TableHead className="hidden lg:table-cell whitespace-nowrap">등급</TableHead>
                        <TableHead
                          className="cursor-pointer hover:bg-muted/50 whitespace-nowrap hidden sm:table-cell"
                          onClick={() => toggleSort("corporation")}
                        >
                          <div className="flex items-center gap-1">
                            법인 {getSortIcon("corporation")}
                          </div>
                        </TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredDailyResults.map((result) => (
                        <TableRow key={result.id}>
                          <TableCell className="text-xs sm:text-sm whitespace-nowrap">{result.variety || "-"}</TableCell>
                          <TableCell className="hidden sm:table-cell text-xs sm:text-sm">{result.origin || "-"}</TableCell>
                          <TableCell className="text-right font-medium text-xs sm:text-sm whitespace-nowrap">
                            {formatExactPrice(result.price)}
                          </TableCell>
                          <TableCell className="hidden md:table-cell text-xs sm:text-sm">{result.unit}</TableCell>
                          <TableCell className="text-right text-xs sm:text-sm">{result.quantity}</TableCell>
                          <TableCell className="hidden lg:table-cell text-xs sm:text-sm">{result.grade || "-"}</TableCell>
                          <TableCell className="text-xs hidden sm:table-cell">{result.corporation}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>

                <div className="text-sm text-muted-foreground text-right">
                  총 {filteredDailyResults.length}건
                  {(selectedVarieties.length > 0 || selectedOrigin) && dailyResults.length !== filteredDailyResults.length &&
                    ` (전체 ${dailyResults.length}건 중)`
                  }
                </div>
              </div>
            ) : (
              <p className="text-center text-muted-foreground py-8">
                해당 날짜의 거래 내역이 없습니다.
              </p>
            )}
          </CardContent>
        </Card>
      )}

      {/* 관심 품목 카드 */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Star className="h-5 w-5 text-yellow-500" />
            관심 품목
          </CardTitle>
          <CardDescription>자주 확인하는 품목의 최신 시세입니다.</CardDescription>
        </CardHeader>
        <CardContent>
          {watchlist.length > 0 ? (
            <div className="grid gap-2 sm:gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {watchlist.map((item) => (
                <div
                  key={item.id}
                  className="flex items-center justify-between p-3 sm:p-4 rounded-lg border hover:bg-muted/50 cursor-pointer transition-colors"
                  onClick={() => {
                    handleSelectProduct(item.productName);
                    if (item.variety) setSelectedVarieties([item.variety]);
                    if (item.origin) setSelectedOrigin(item.origin);
                  }}
                >
                  <div className="flex items-center gap-2 sm:gap-3 flex-1 min-w-0">
                    <Star className="h-4 w-4 sm:h-5 sm:w-5 text-yellow-500 fill-yellow-500 flex-shrink-0" />
                    <div className="min-w-0">
                      <div className="flex items-center gap-1 sm:gap-2 flex-wrap">
                        <span className="font-medium text-sm sm:text-base">{item.productName}</span>
                        {item.variety && (
                          <Badge variant="outline" className="text-[10px] sm:text-xs">{item.variety}</Badge>
                        )}
                      </div>
                      {item.origin && (
                        <p className="text-[10px] sm:text-xs text-muted-foreground flex items-center gap-1 mt-0.5 sm:mt-1">
                          <MapPin className="h-2.5 w-2.5 sm:h-3 sm:w-3" />
                          {item.origin}
                        </p>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-1 sm:gap-2">
                    {item.latestPrice && (
                      <div className="text-right">
                        <p className="font-bold text-xs sm:text-sm">{formatExactPrice(item.latestPrice)}</p>
                        {item.priceChange !== null && (
                          <div className={`flex items-center justify-end gap-0.5 text-[10px] sm:text-xs ${getPriceChangeColor(item.priceChange)}`}>
                            {getPriceChangeIcon(item.priceChange)}
                            {Math.abs(item.priceChange).toFixed(1)}%
                          </div>
                        )}
                      </div>
                    )}
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 sm:h-8 sm:w-8 text-red-500 hover:text-red-600 hover:bg-red-50 flex-shrink-0"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDeleteClick(item.id, item.productName);
                      }}
                    >
                      <Trash2 className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <Star className="h-12 w-12 text-muted-foreground mb-4" />
              <p className="text-muted-foreground">등록된 관심 품목이 없습니다.</p>
              <p className="text-xs text-muted-foreground mt-1">
                품목을 선택하고 관심 등록 버튼을 눌러주세요.
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* 삭제 확인 다이얼로그 */}
      <AlertDialog open={!!deleteConfirmId} onOpenChange={(open) => !open && setDeleteConfirmId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>관심 품목 삭제</AlertDialogTitle>
            <AlertDialogDescription>
              <strong>{deleteConfirmName}</strong>을(를) 관심 품목에서 삭제하시겠습니까?
              <br />
              삭제 후에도 다시 등록할 수 있습니다.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>취소</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleConfirmDelete}
              className="bg-red-500 hover:bg-red-600"
            >
              삭제
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
