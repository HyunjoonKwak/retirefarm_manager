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
import { formatLargeNumber, formatDate } from "@/lib/utils/format";
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

interface PriceHistory {
  date: string;
  avgPrice: number;
  maxPrice: number;
  minPrice: number;
  tradeCount: number;
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

interface DailyStats {
  avgPrice: number;
  maxPrice: number;
  minPrice: number;
  tradeCount: number;
  totalQuantity: number;
}

// 대표 품목 (토마토, 포도 우선)
const MAJOR_PRODUCTS = [
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

export function MarketPriceManager() {
  const [watchlist, setWatchlist] = useState<WatchlistItem[]>([]);
  const [products, setProducts] = useState<string[]>([]);
  const [varieties, setVarieties] = useState<string[]>([]);
  const [origins, setOrigins] = useState<string[]>([]);
  const [priceHistory, setPriceHistory] = useState<PriceHistory[]>([]);
  const [latestDate, setLatestDate] = useState<string | null>(null);
  const [dailyResults, setDailyResults] = useState<DailyDetailResult[]>([]);
  const [dailyStats, setDailyStats] = useState<DailyStats | null>(null);
  const [dateHasData, setDateHasData] = useState<boolean | null>(null);

  const [loading, setLoading] = useState(true);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [loadingDaily, setLoadingDaily] = useState(false);

  // 검색 및 필터
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedProducts, setSelectedProducts] = useState<string[]>(() => {
    if (typeof window !== "undefined") {
      const saved = localStorage.getItem("market_selectedProducts");
      return saved ? JSON.parse(saved) : [];
    }
    return [];
  });
  const [selectedVariety, setSelectedVariety] = useState<string | null>(null);
  const [selectedOrigin, setSelectedOrigin] = useState<string | null>(null);
  const [regionFilter, setRegionFilter] = useState(""); // 지역 필터 (직접 입력)
  const [viewDays, setViewDays] = useState("30");
  const [selectedDate, setSelectedDate] = useState<string>(""); // 특정 날짜 조회

  // 페이지네이션 관련
  const [detailPageSize, setDetailPageSize] = useState(20);
  const [detailPage, setDetailPage] = useState(1);

  // 현재 조회 중인 품목 (첫 번째 선택 품목)
  const selectedProduct = selectedProducts.length > 0 ? selectedProducts[0] : null;

  // 선택 품목 변경 시 로컬스토리지 저장
  useEffect(() => {
    localStorage.setItem("market_selectedProducts", JSON.stringify(selectedProducts));
  }, [selectedProducts]);

  // 삭제 확인 다이얼로그
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [deleteConfirmName, setDeleteConfirmName] = useState<string>("");

  // 품종 다중선택 (일별 상세 조회용)
  const [selectedVarieties, setSelectedVarieties] = useState<string[]>([]);

  // 검색 결과 필터링
  const filteredProducts = useMemo(() => {
    if (!searchQuery.trim()) return products;
    return products.filter((p) =>
      p.toLowerCase().includes(searchQuery.toLowerCase())
    );
  }, [searchQuery, products]);

  // 가격 통계 계산
  const priceStats = useMemo(() => {
    if (priceHistory.length === 0) return null;

    const latest = priceHistory[0];
    const oldest = priceHistory[priceHistory.length - 1];
    const allAvgPrices = priceHistory.map(p => p.avgPrice);
    const allMaxPrices = priceHistory.map(p => p.maxPrice);
    const allMinPrices = priceHistory.map(p => p.minPrice);

    const periodAvg = allAvgPrices.reduce((a, b) => a + b, 0) / allAvgPrices.length;
    const periodMax = Math.max(...allMaxPrices);
    const periodMin = Math.min(...allMinPrices);
    const periodChange = oldest.avgPrice > 0
      ? ((latest.avgPrice - oldest.avgPrice) / oldest.avgPrice) * 100
      : 0;
    const totalTrades = priceHistory.reduce((sum, p) => sum + p.tradeCount, 0);

    return {
      latestPrice: latest.avgPrice,
      latestDate: latest.date,
      periodAvg: Math.round(periodAvg),
      periodMax,
      periodMin,
      periodChange,
      totalTrades,
      dayChange: priceHistory.length > 1
        ? ((latest.avgPrice - priceHistory[1].avgPrice) / priceHistory[1].avgPrice) * 100
        : 0,
    };
  }, [priceHistory]);

  // 차트 데이터 (역순으로 정렬하여 시간순 표시)
  const chartData = useMemo(() => {
    return [...priceHistory].reverse().map(p => ({
      date: formatDate(p.date).slice(5), // MM.DD 형식
      평균가: p.avgPrice,
      최고가: p.maxPrice,
      최저가: p.minPrice,
    }));
  }, [priceHistory]);

  // 다중 품종 필터링된 일별 결과
  const filteredDailyResults = useMemo(() => {
    if (selectedVarieties.length === 0) return dailyResults;
    return dailyResults.filter((r) =>
      r.variety && selectedVarieties.includes(r.variety)
    );
  }, [dailyResults, selectedVarieties]);

  // 필터링된 결과의 통계
  const filteredDailyStats = useMemo(() => {
    if (selectedVarieties.length === 0 || filteredDailyResults.length === 0) return dailyStats;
    const prices = filteredDailyResults.map((r) => r.price);
    return {
      avgPrice: Math.round(prices.reduce((a, b) => a + b, 0) / prices.length),
      maxPrice: Math.max(...prices),
      minPrice: Math.min(...prices),
      tradeCount: filteredDailyResults.length,
      totalQuantity: filteredDailyResults.reduce((sum, r) => sum + r.quantity, 0),
    };
  }, [filteredDailyResults, dailyStats, selectedVarieties]);

  const fetchWatchlist = useCallback(async () => {
    try {
      const response = await fetch("/api/market/garak/watchlist");
      const data = await response.json();
      setWatchlist(data.watchlist || []);
    } catch (error) {
      console.error("Failed to fetch watchlist:", error);
    }
  }, []);

  const fetchProducts = useCallback(async () => {
    try {
      const response = await fetch("/api/market/garak?action=products");
      const data = await response.json();
      setProducts(data.products || MAJOR_PRODUCTS);
    } catch (error) {
      console.error("Failed to fetch products:", error);
      setProducts(MAJOR_PRODUCTS);
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
    } catch (error) {
      console.error("Failed to fetch varieties:", error);
      setVarieties([]);
    }
  }, []);

  const fetchPriceHistory = useCallback(async (
    productName: string,
    variety?: string | null,
    origin?: string | null,
    days?: string,
    region?: string
  ) => {
    setLoadingHistory(true);
    try {
      let url = `/api/market/garak?action=history&productName=${encodeURIComponent(productName)}&days=${days || viewDays}`;
      if (variety) url += `&variety=${encodeURIComponent(variety)}`;
      // 지역 필터가 있으면 우선 사용, 없으면 선택된 산지 사용
      const originToUse = region?.trim() || origin;
      if (originToUse) url += `&origin=${encodeURIComponent(originToUse)}`;

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

  // 특정 날짜 상세 데이터 조회
  const fetchDailyDetail = useCallback(async (
    date: string,
    productName: string,
    variety?: string | null,
    origin?: string | null
  ) => {
    setLoadingDaily(true);
    try {
      let url = `/api/market/garak?action=dailyDetail&date=${date}&productName=${encodeURIComponent(productName)}`;
      if (variety) url += `&variety=${encodeURIComponent(variety)}`;
      if (origin) url += `&origin=${encodeURIComponent(origin)}`;

      const response = await fetch(url);
      const data = await response.json();
      setDailyResults(data.results || []);
      setDailyStats(data.stats || null);
      setDateHasData(data.hasData);
    } catch (error) {
      console.error("Failed to fetch daily detail:", error);
      setDailyResults([]);
      setDailyStats(null);
      setDateHasData(false);
    } finally {
      setLoadingDaily(false);
    }
  }, []);

  // 날짜 데이터 존재 여부 확인
  const checkDateData = useCallback(async (date: string) => {
    try {
      const response = await fetch(`/api/market/garak?action=checkDate&date=${date}`);
      const data = await response.json();
      setDateHasData(data.hasData);
      return data.hasData;
    } catch (error) {
      console.error("Failed to check date data:", error);
      setDateHasData(null);
      return null;
    }
  }, []);

  useEffect(() => {
    Promise.all([
      fetchWatchlist(),
      fetchProducts(),
      fetchLatestDate(),
    ]).finally(() => setLoading(false));
  }, [fetchWatchlist, fetchProducts, fetchLatestDate]);

  useEffect(() => {
    if (selectedProduct) {
      fetchVarieties(selectedProduct);
      // 다중 품종 선택 시 첫 번째 품종으로 히스토리 조회 (또는 전체)
      const varietyToFetch = selectedVarieties.length === 1 ? selectedVarieties[0] : null;
      fetchPriceHistory(selectedProduct, varietyToFetch, null, viewDays, regionFilter);
    }
  }, [selectedProduct, selectedVarieties, viewDays, regionFilter, fetchVarieties, fetchPriceHistory]);

  // 특정 날짜 선택 시 데이터 조회
  useEffect(() => {
    setDetailPage(1); // 날짜 변경 시 페이지 리셋
    if (selectedDate && selectedProduct) {
      // 다중 품종 선택 시 첫 번째 품종 사용 (또는 전체)
      const varietyToFetch = selectedVarieties.length === 1 ? selectedVarieties[0] : null;
      fetchDailyDetail(selectedDate, selectedProduct, varietyToFetch, regionFilter || null);
    } else if (selectedDate) {
      checkDateData(selectedDate);
    } else {
      setDailyResults([]);
      setDailyStats(null);
      setDateHasData(null);
    }
  }, [selectedDate, selectedProduct, selectedVarieties, regionFilter, fetchDailyDetail, checkDateData]);

  function isAlreadyInWatchlist(productName: string, variety?: string, origin?: string) {
    return watchlist.some(
      (item) =>
        item.productName === productName &&
        (item.variety || "") === (variety || "") &&
        (item.origin || "") === (origin || "")
    );
  }

  async function handleAddToWatchlist(productName: string, variety?: string, origin?: string) {
    if (isAlreadyInWatchlist(productName, variety, origin)) {
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
    setSelectedProducts((prev) => {
      if (prev.includes(productName)) {
        // 이미 선택된 경우 제거
        return prev.filter((p) => p !== productName);
      } else {
        // 새로 추가
        return [...prev, productName];
      }
    });
    setSelectedVariety(null);
    setSelectedOrigin(null);
    setVarieties([]);
    setOrigins([]);
  }

  // 쉼표로 구분된 품목 입력 처리
  function handleMultipleProductInput(input: string) {
    const products = input.split(",").map((p) => p.trim()).filter((p) => p.length > 0);
    if (products.length > 0) {
      setSelectedProducts((prev) => {
        const newProducts = [...prev];
        products.forEach((p) => {
          if (!newProducts.includes(p)) {
            newProducts.push(p);
          }
        });
        return newProducts;
      });
      setSearchQuery("");
    }
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

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
        {/* 품목 선택 + 필터 (한 줄) */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Search className="h-4 w-4" />
              품목 선택
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* 품목 버튼 (복수 선택) */}
            <div className="flex flex-wrap gap-2">
              {MAJOR_PRODUCTS.map((product) => (
                <Button
                  key={product}
                  variant={selectedProducts.includes(product) ? "default" : "outline"}
                  size="sm"
                  onClick={() => handleSelectProduct(product)}
                >
                  {product}
                </Button>
              ))}
            </div>

            {/* 직접입력 + 선택된 품목 */}
            <div className="flex flex-wrap items-center gap-3 pt-3 border-t">
              <Input
                placeholder="품목 입력 (,구분)"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && searchQuery.trim()) {
                    handleMultipleProductInput(searchQuery.trim());
                  }
                }}
                className="w-36"
              />

              {selectedProducts.length > 0 && (
                <>
                  <div className="flex flex-wrap gap-1">
                    {selectedProducts.map((p) => (
                      <Badge
                        key={p}
                        variant={p === selectedProduct ? "default" : "secondary"}
                        className="text-sm cursor-pointer"
                        onClick={() => {
                          setSelectedProducts((prev) => [p, ...prev.filter((x) => x !== p)]);
                        }}
                      >
                        {p}
                        <button
                          className="ml-1 hover:text-red-500"
                          onClick={(e) => {
                            e.stopPropagation();
                            setSelectedProducts((prev) => prev.filter((x) => x !== p));
                          }}
                        >
                          ×
                        </button>
                      </Badge>
                    ))}
                  </div>
                  <Button
                    variant={isAlreadyInWatchlist(selectedProduct!, selectedVariety || undefined, regionFilter || undefined) ? "secondary" : "outline"}
                    size="sm"
                    onClick={() => handleAddToWatchlist(selectedProduct!, selectedVariety || undefined, regionFilter || undefined)}
                    disabled={isAlreadyInWatchlist(selectedProduct!, selectedVariety || undefined, regionFilter || undefined)}
                  >
                    <Star className={`h-4 w-4 ${isAlreadyInWatchlist(selectedProduct!, selectedVariety || undefined, regionFilter || undefined) ? "fill-yellow-500 text-yellow-500" : ""}`} />
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setSelectedProducts([])}
                  >
                    초기화
                  </Button>
                </>
              )}

              <Button
                variant="ghost"
                size="icon"
                onClick={() => {
                  fetchWatchlist();
                  fetchLatestDate();
                  if (selectedProduct) {
                    fetchPriceHistory(selectedProduct, selectedVariety, null, viewDays, regionFilter);
                  }
                }}
              >
                <RefreshCw className="h-4 w-4" />
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* 선택된 품목이 있을 때 시세 정보 표시 */}
        {selectedProduct && (
          <>
            {/* 가격 요약 카드 */}
            <div className="grid gap-4 md:grid-cols-5">
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium">현재가</CardTitle>
                </CardHeader>
                <CardContent>
                  {loadingHistory ? (
                    <Loader2 className="h-6 w-6 animate-spin" />
                  ) : priceStats ? (
                    <>
                      <div className="text-2xl font-bold">{formatLargeNumber(priceStats.latestPrice)}</div>
                      <div className={`flex items-center gap-1 text-sm ${getPriceChangeColor(priceStats.dayChange)}`}>
                        {getPriceChangeIcon(priceStats.dayChange)}
                        <span>전일대비 {Math.abs(priceStats.dayChange).toFixed(1)}%</span>
                      </div>
                    </>
                  ) : (
                    <div className="text-muted-foreground">데이터 없음</div>
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium">{viewDays}일 평균</CardTitle>
                </CardHeader>
                <CardContent>
                  {loadingHistory ? (
                    <Loader2 className="h-6 w-6 animate-spin" />
                  ) : priceStats ? (
                    <>
                      <div className="text-2xl font-bold">{formatLargeNumber(priceStats.periodAvg)}</div>
                      <div className={`flex items-center gap-1 text-sm ${getPriceChangeColor(priceStats.periodChange)}`}>
                        {getPriceChangeIcon(priceStats.periodChange)}
                        <span>기간변동 {Math.abs(priceStats.periodChange).toFixed(1)}%</span>
                      </div>
                    </>
                  ) : (
                    <div className="text-muted-foreground">데이터 없음</div>
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium text-red-600">최고가</CardTitle>
                </CardHeader>
                <CardContent>
                  {loadingHistory ? (
                    <Loader2 className="h-6 w-6 animate-spin" />
                  ) : priceStats ? (
                    <div className="text-2xl font-bold text-red-600">{formatLargeNumber(priceStats.periodMax)}</div>
                  ) : (
                    <div className="text-muted-foreground">데이터 없음</div>
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium text-blue-600">최저가</CardTitle>
                </CardHeader>
                <CardContent>
                  {loadingHistory ? (
                    <Loader2 className="h-6 w-6 animate-spin" />
                  ) : priceStats ? (
                    <div className="text-2xl font-bold text-blue-600">{formatLargeNumber(priceStats.periodMin)}</div>
                  ) : (
                    <div className="text-muted-foreground">데이터 없음</div>
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium">거래건수</CardTitle>
                </CardHeader>
                <CardContent>
                  {loadingHistory ? (
                    <Loader2 className="h-6 w-6 animate-spin" />
                  ) : priceStats ? (
                    <>
                      <div className="text-2xl font-bold">{priceStats.totalTrades.toLocaleString()}건</div>
                      <div className="text-sm text-muted-foreground">{viewDays}일간 누적</div>
                    </>
                  ) : (
                    <div className="text-muted-foreground">데이터 없음</div>
                  )}
                </CardContent>
              </Card>
            </div>

            {/* 가격 추이 차트 */}
            <Card>
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <CardTitle className="flex items-center gap-3">
                    <BarChart3 className="h-5 w-5" />
                    {selectedProduct} 시세 추이
                    {selectedVariety && <Badge variant="outline">{selectedVariety}</Badge>}
                    {regionFilter && <Badge variant="secondary">{regionFilter}</Badge>}
                  </CardTitle>
                  {latestDate && (
                    <span className="text-xs text-muted-foreground">
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
                          tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`}
                        />
                        <Tooltip
                          formatter={(value: number) => formatLargeNumber(value)}
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
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                ) : (
                  <div className="flex flex-col items-center justify-center py-16 text-center">
                    <LineChartIcon className="h-12 w-12 text-muted-foreground mb-4" />
                    <p className="text-muted-foreground">시세 데이터가 없습니다.</p>
                    <p className="text-xs text-muted-foreground mt-1">
                      데이터 수집 버튼을 눌러 가락시장 경매 데이터를 수집해보세요.
                    </p>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* 일별 시세 테이블 */}
            <Card>
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <CardTitle className="flex items-center gap-2">
                    <Calendar className="h-5 w-5" />
                    일별 시세 데이터
                  </CardTitle>
                  <Badge variant="outline" className="text-xs">
                    날짜 클릭 → 상세 거래 내역
                  </Badge>
                </div>
                {/* 조회 필터 */}
                <div className="flex flex-wrap items-center gap-3 mt-3 pt-3 border-t">
                  <Select
                    value={selectedProduct || "_none"}
                    onValueChange={(v) => {
                      if (v === "_none") {
                        setSelectedProducts([]);
                      } else {
                        setSelectedProducts([v]);
                      }
                    }}
                  >
                    <SelectTrigger className="w-28">
                      <SelectValue placeholder="품목" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="_none">품목 선택</SelectItem>
                      {MAJOR_PRODUCTS.map((p) => (
                        <SelectItem key={p} value={p}>{p}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>

                  <Input
                    placeholder="산지 필터"
                    value={regionFilter}
                    onChange={(e) => setRegionFilter(e.target.value)}
                    className="w-28"
                  />

                  {(selectedProduct || selectedVarieties.length > 0 || regionFilter) && (
                    <Badge variant="secondary" className="text-xs">
                      {selectedProduct && `${selectedProduct}`}
                      {selectedProduct && selectedVarieties.length > 0 && ` / ${selectedVarieties.length}개 품종`}
                      {regionFilter && ` / ${regionFilter}`}
                    </Badge>
                  )}
                </div>
              </CardHeader>
              <CardContent>
                {/* 품종 다중선택 필터 */}
                {varieties.length > 0 && (
                  <div className="mb-4 space-y-2">
                    <div className="flex items-center justify-between">
                      <Label className="text-sm font-medium">품종 필터 (다중선택)</Label>
                      {selectedVarieties.length > 0 && (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-6 text-xs"
                          onClick={() => setSelectedVarieties([])}
                        >
                          초기화
                        </Button>
                      )}
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {varieties.slice(0, 20).map((v) => (
                        <Button
                          key={v}
                          variant={selectedVarieties.includes(v) ? "default" : "outline"}
                          size="sm"
                          className="h-7 text-xs px-2"
                          onClick={() => {
                            setSelectedVarieties((prev) =>
                              prev.includes(v)
                                ? prev.filter((x) => x !== v)
                                : [...prev, v]
                            );
                          }}
                        >
                          {v}
                        </Button>
                      ))}
                      {varieties.length > 20 && (
                        <Badge variant="secondary" className="text-xs">
                          +{varieties.length - 20}개 더
                        </Badge>
                      )}
                    </div>
                  </div>
                )}
                {loadingHistory ? (
                  <div className="flex items-center justify-center py-8">
                    <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                  </div>
                ) : priceHistory.length > 0 ? (
                  <div className="max-h-[400px] overflow-y-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>날짜</TableHead>
                          <TableHead className="text-right">평균가</TableHead>
                          <TableHead className="text-right">변동</TableHead>
                          <TableHead className="text-right">최고가</TableHead>
                          <TableHead className="text-right">최저가</TableHead>
                          <TableHead className="text-right">거래건수</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {priceHistory.map((price, index) => {
                          const prevPrice = priceHistory[index + 1];
                          const change = prevPrice
                            ? ((price.avgPrice - prevPrice.avgPrice) / prevPrice.avgPrice) * 100
                            : null;
                          const dateStr = price.date.split("T")[0];

                          return (
                            <TableRow
                              key={price.date}
                              className={`cursor-pointer hover:bg-muted/50 ${selectedDate === dateStr ? "bg-blue-50" : ""}`}
                              onClick={() => setSelectedDate(dateStr)}
                            >
                              <TableCell className="text-blue-600 hover:underline">
                                {formatDate(price.date)}
                              </TableCell>
                              <TableCell className="text-right font-medium">
                                {formatLargeNumber(price.avgPrice)}
                              </TableCell>
                              <TableCell className="text-right">
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
                              <TableCell className="text-right text-red-600">
                                {formatLargeNumber(price.maxPrice)}
                              </TableCell>
                              <TableCell className="text-right text-blue-600">
                                {formatLargeNumber(price.minPrice)}
                              </TableCell>
                              <TableCell className="text-right">
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

        {/* 선택 날짜 거래 내역 - 품목 선택 여부와 관계없이 표시 */}
        {selectedDate && selectedProduct && (
          <Card className="border-blue-200 bg-blue-50/30">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="flex items-center gap-2 text-blue-700">
                    <ArrowUpDown className="h-5 w-5" />
                    {formatDate(selectedDate)} 상세 거래 내역
                  </CardTitle>
                  <CardDescription>
                    {selectedProduct} {selectedVariety && `/ ${selectedVariety}`} {regionFilter && `/ ${regionFilter}`}
                  </CardDescription>
                </div>
                <Button
                  variant="outline"
                  size="sm"
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
              ) : filteredDailyStats && filteredDailyResults.length > 0 ? (
                <div className="space-y-4">
                  {/* 품종 다중선택 필터 (상세 내역용) */}
                  {dailyResults.length > 0 && (
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <Label className="text-sm font-medium">품종 필터 (다중선택)</Label>
                        {selectedVarieties.length > 0 && (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-6 text-xs"
                            onClick={() => setSelectedVarieties([])}
                          >
                            초기화
                          </Button>
                        )}
                      </div>
                      <div className="flex flex-wrap gap-1.5">
                        {Array.from(new Set(dailyResults.map((r) => r.variety).filter(Boolean))).slice(0, 15).map((v) => (
                          <Button
                            key={v}
                            variant={selectedVarieties.includes(v!) ? "default" : "outline"}
                            size="sm"
                            className="h-7 text-xs px-2"
                            onClick={() => {
                              setSelectedVarieties((prev) =>
                                prev.includes(v!)
                                  ? prev.filter((x) => x !== v)
                                  : [...prev, v!]
                              );
                            }}
                          >
                            {v}
                          </Button>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* 통계 요약 */}
                  <div className="grid grid-cols-5 gap-3 text-center">
                    <div className="p-2 bg-white rounded border">
                      <p className="text-xs text-muted-foreground">평균가</p>
                      <p className="font-bold">{formatLargeNumber(filteredDailyStats.avgPrice)}</p>
                    </div>
                    <div className="p-2 bg-white rounded border">
                      <p className="text-xs text-red-600">최고가</p>
                      <p className="font-bold text-red-600">{formatLargeNumber(filteredDailyStats.maxPrice)}</p>
                    </div>
                    <div className="p-2 bg-white rounded border">
                      <p className="text-xs text-blue-600">최저가</p>
                      <p className="font-bold text-blue-600">{formatLargeNumber(filteredDailyStats.minPrice)}</p>
                    </div>
                    <div className="p-2 bg-white rounded border">
                      <p className="text-xs text-muted-foreground">거래건수</p>
                      <p className="font-bold">{filteredDailyStats.tradeCount}건</p>
                    </div>
                    <div className="p-2 bg-white rounded border">
                      <p className="text-xs text-muted-foreground">총수량</p>
                      <p className="font-bold">{filteredDailyStats.totalQuantity.toLocaleString()}</p>
                    </div>
                  </div>

                  {/* 페이지 크기 선택 */}
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="text-sm text-muted-foreground">표시:</span>
                      {[10, 20, 30, 50].map((size) => (
                        <Button
                          key={size}
                          variant={detailPageSize === size ? "default" : "outline"}
                          size="sm"
                          className="h-7 px-2"
                          onClick={() => {
                            setDetailPageSize(size);
                            setDetailPage(1);
                          }}
                    >
                      {size}건
                    </Button>
                  ))}
                </div>
                <span className="text-sm text-muted-foreground">
                  총 {filteredDailyResults.length}건
                  {selectedVarieties.length > 0 && ` (전체 ${dailyResults.length}건 중)`}
                </span>
              </div>

              {/* 거래 내역 테이블 */}
              <div className="max-h-[400px] overflow-y-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>품종</TableHead>
                      <TableHead>산지</TableHead>
                      <TableHead className="text-right">가격</TableHead>
                      <TableHead>단위</TableHead>
                      <TableHead className="text-right">수량</TableHead>
                      <TableHead>등급</TableHead>
                      <TableHead>법인</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredDailyResults
                      .slice((detailPage - 1) * detailPageSize, detailPage * detailPageSize)
                      .map((result) => (
                      <TableRow key={result.id}>
                        <TableCell>{result.variety || "-"}</TableCell>
                        <TableCell>{result.origin || "-"}</TableCell>
                        <TableCell className="text-right font-medium">
                          {formatLargeNumber(result.price)}
                        </TableCell>
                        <TableCell>{result.unit}</TableCell>
                        <TableCell className="text-right">{result.quantity}</TableCell>
                        <TableCell>{result.grade || "-"}</TableCell>
                        <TableCell className="text-xs">{result.corporation}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>

              {/* 페이지네이션 */}
              {filteredDailyResults.length > detailPageSize && (
                <div className="flex items-center justify-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setDetailPage((p) => Math.max(1, p - 1))}
                    disabled={detailPage === 1}
                  >
                    이전
                  </Button>
                  <span className="text-sm">
                    {detailPage} / {Math.ceil(filteredDailyResults.length / detailPageSize)}
                  </span>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setDetailPage((p) => Math.min(Math.ceil(filteredDailyResults.length / detailPageSize), p + 1))}
                    disabled={detailPage >= Math.ceil(filteredDailyResults.length / detailPageSize)}
                  >
                    다음
                  </Button>
                </div>
              )}
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
              <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
                {watchlist.map((item) => (
                  <div
                    key={item.id}
                    className="flex items-center justify-between p-4 rounded-lg border hover:bg-muted/50 cursor-pointer transition-colors"
                    onClick={() => {
                      handleSelectProduct(item.productName);
                      if (item.variety) setSelectedVarieties([item.variety]);
                      if (item.origin) setSelectedOrigin(item.origin);
                    }}
                  >
                    <div className="flex items-center gap-3 flex-1 min-w-0">
                      <Star className="h-5 w-5 text-yellow-500 fill-yellow-500 flex-shrink-0" />
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-medium">{item.productName}</span>
                          {item.variety && (
                            <Badge variant="outline" className="text-xs">{item.variety}</Badge>
                          )}
                        </div>
                        {item.origin && (
                          <p className="text-xs text-muted-foreground flex items-center gap-1 mt-1">
                            <MapPin className="h-3 w-3" />
                            {item.origin}
                          </p>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      {item.latestPrice && (
                        <div className="text-right">
                          <p className="font-bold">{formatLargeNumber(item.latestPrice)}</p>
                          {item.priceChange !== null && (
                            <div className={`flex items-center justify-end gap-1 text-xs ${getPriceChangeColor(item.priceChange)}`}>
                              {getPriceChangeIcon(item.priceChange)}
                              {Math.abs(item.priceChange).toFixed(1)}%
                            </div>
                          )}
                        </div>
                      )}
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-red-500 hover:text-red-600 hover:bg-red-50 flex-shrink-0"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDeleteClick(item.id, item.productName);
                        }}
                      >
                        <Trash2 className="h-4 w-4" />
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
