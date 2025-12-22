"use client";

import { useEffect, useState, useCallback } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
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
  Building2,
  MapPin,
  LineChart,
  Download,
  Settings,
} from "lucide-react";
import { MarketSettings } from "./MarketSettings";
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

interface Corporation {
  code: string;
  name: string;
}

const MAJOR_PRODUCTS = [
  "토마토",
  "딸기",
  "수박",
  "참외",
  "오이",
  "고추",
  "배추",
  "상추",
  "시금치",
  "양배추",
  "무",
  "당근",
  "감자",
  "고구마",
  "사과",
  "배",
  "포도",
  "감귤",
];

export function MarketPriceManager() {
  const [watchlist, setWatchlist] = useState<WatchlistItem[]>([]);
  const [products, setProducts] = useState<string[]>([]);
  const [varieties, setVarieties] = useState<string[]>([]);
  const [origins, setOrigins] = useState<string[]>([]);
  const [corporations, setCorporations] = useState<Corporation[]>([]);
  const [priceHistory, setPriceHistory] = useState<PriceHistory[]>([]);
  const [latestDate, setLatestDate] = useState<string | null>(null);

  const [loading, setLoading] = useState(true);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [collecting, setCollecting] = useState(false);

  const [selectedProduct, setSelectedProduct] = useState<string | null>(null);
  const [selectedVariety, setSelectedVariety] = useState<string | null>(null);
  const [selectedOrigin, setSelectedOrigin] = useState<string | null>(null);

  // 검색/등록 다이얼로그
  const [isSearchDialogOpen, setIsSearchDialogOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [filteredProducts, setFilteredProducts] = useState<string[]>([]);

  // 수집 다이얼로그
  const [isCollectDialogOpen, setIsCollectDialogOpen] = useState(false);
  const [collectDate, setCollectDate] = useState(() => {
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    return yesterday.toISOString().split("T")[0];
  });
  const [selectedCorps, setSelectedCorps] = useState<string[]>(["11000101"]);

  // 삭제 확인 다이얼로그
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [deleteConfirmName, setDeleteConfirmName] = useState<string>("");

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

  const fetchCorporations = useCallback(async () => {
    try {
      const response = await fetch("/api/market/garak/collect");
      const data = await response.json();
      setCorporations(data.corporations || []);
    } catch (error) {
      console.error("Failed to fetch corporations:", error);
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

  async function fetchVarieties(productName: string) {
    try {
      const response = await fetch(`/api/market/garak?action=varieties&productName=${encodeURIComponent(productName)}`);
      const data = await response.json();
      setVarieties(data.varieties || []);
    } catch (error) {
      console.error("Failed to fetch varieties:", error);
      setVarieties([]);
    }
  }

  async function fetchOrigins(productName: string) {
    try {
      const response = await fetch(`/api/market/garak?action=origins&productName=${encodeURIComponent(productName)}`);
      const data = await response.json();
      setOrigins(data.origins || []);
    } catch (error) {
      console.error("Failed to fetch origins:", error);
      setOrigins([]);
    }
  }

  async function fetchPriceHistory(productName: string, variety?: string | null, origin?: string | null) {
    setLoadingHistory(true);
    try {
      let url = `/api/market/garak?action=history&productName=${encodeURIComponent(productName)}&days=30`;
      if (variety) url += `&variety=${encodeURIComponent(variety)}`;
      if (origin) url += `&origin=${encodeURIComponent(origin)}`;

      const response = await fetch(url);
      const data = await response.json();
      setPriceHistory(data.history || []);
    } catch (error) {
      console.error("Failed to fetch price history:", error);
      setPriceHistory([]);
    } finally {
      setLoadingHistory(false);
    }
  }

  useEffect(() => {
    Promise.all([
      fetchWatchlist(),
      fetchProducts(),
      fetchCorporations(),
      fetchLatestDate(),
    ]).finally(() => setLoading(false));
  }, [fetchWatchlist, fetchProducts, fetchCorporations, fetchLatestDate]);

  useEffect(() => {
    if (selectedProduct) {
      fetchVarieties(selectedProduct);
      fetchOrigins(selectedProduct);
      fetchPriceHistory(selectedProduct, selectedVariety, selectedOrigin);
    }
  }, [selectedProduct, selectedVariety, selectedOrigin]);

  useEffect(() => {
    if (searchQuery) {
      const filtered = products.filter((p) =>
        p.toLowerCase().includes(searchQuery.toLowerCase())
      );
      setFilteredProducts(filtered);
    } else {
      setFilteredProducts(products);
    }
  }, [searchQuery, products]);

  function isAlreadyInWatchlist(productName: string, variety?: string, origin?: string) {
    return watchlist.some(
      (item) =>
        item.productName === productName &&
        (item.variety || "") === (variety || "") &&
        (item.origin || "") === (origin || "")
    );
  }

  async function handleAddToWatchlist(productName: string, variety?: string, origin?: string) {
    // 중복 확인
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
        setIsSearchDialogOpen(false);
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

  async function handleCollectData() {
    if (selectedCorps.length === 0) {
      toast.error("법인을 선택해주세요.");
      return;
    }

    setCollecting(true);
    try {
      const response = await fetch("/api/market/garak/collect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          date: collectDate,
          corporationCodes: selectedCorps,
        }),
      });

      const result = await response.json();

      if (!response.ok) {
        toast.error(result.error || "수집에 실패했습니다.");
      } else {
        toast.success(`${result.totalCount}건 조회, ${result.newCount}건 저장되었습니다.`);
        setIsCollectDialogOpen(false);
        fetchProducts();
        fetchLatestDate();
        if (selectedProduct) {
          fetchPriceHistory(selectedProduct, selectedVariety, selectedOrigin);
        }
      }
    } catch {
      toast.error("수집 중 오류가 발생했습니다.");
    } finally {
      setCollecting(false);
    }
  }

  function handleSelectProduct(productName: string) {
    setSelectedProduct(productName);
    setSelectedVariety(null);
    setSelectedOrigin(null);
    setVarieties([]);
    setOrigins([]);
  }

  function getPriceChangeIcon(change: number | null) {
    if (change === null) return <Minus className="h-3 w-3" />;
    if (change > 0) return <TrendingUp className="h-3 w-3" />;
    if (change < 0) return <TrendingDown className="h-3 w-3" />;
    return <Minus className="h-3 w-3" />;
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
    <Tabs defaultValue="prices" className="space-y-6">
      <TabsList>
        <TabsTrigger value="prices" className="flex items-center gap-2">
          <LineChart className="h-4 w-4" />
          시세 조회
        </TabsTrigger>
        <TabsTrigger value="settings" className="flex items-center gap-2">
          <Settings className="h-4 w-4" />
          설정
        </TabsTrigger>
      </TabsList>

      <TabsContent value="prices" className="space-y-6">
        {/* 요약 카드 */}
        <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Star className="h-4 w-4 text-yellow-500" />
              관심 품목
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{watchlist.length}개</div>
            <p className="text-xs text-muted-foreground">등록된 품목</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <LineChart className="h-4 w-4 text-blue-500" />
              조회 가능 품목
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{products.length}개</div>
            <p className="text-xs text-muted-foreground">가락시장 기준</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Calendar className="h-4 w-4 text-green-500" />
              최근 수집일
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {latestDate ? formatDate(latestDate) : "-"}
            </div>
            <p className="text-xs text-muted-foreground">경매 데이터</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Building2 className="h-4 w-4 text-purple-500" />
              데이터 소스
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">가락시장</div>
            <p className="text-xs text-muted-foreground">공공데이터 API</p>
          </CardContent>
        </Card>
      </div>

      {/* 데이터 수집 및 품목 검색 */}
      <div className="flex flex-wrap gap-2 justify-between">
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => setIsCollectDialogOpen(true)}>
            <Download className="mr-2 h-4 w-4" />
            데이터 수집
          </Button>
          <Button variant="outline" onClick={() => {
            setSearchQuery("");
            setFilteredProducts(products);
            setIsSearchDialogOpen(true);
          }}>
            <Search className="mr-2 h-4 w-4" />
            품목 검색
          </Button>
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => {
            fetchWatchlist();
            fetchLatestDate();
            if (selectedProduct) {
              fetchPriceHistory(selectedProduct, selectedVariety, selectedOrigin);
            }
          }}
        >
          <RefreshCw className="mr-2 h-4 w-4" />
          새로고침
        </Button>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* 품목 선택 */}
        <Card>
          <CardHeader>
            <CardTitle>품목 선택</CardTitle>
            <CardDescription>시세를 조회할 품목을 선택하세요.</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-2">
              {products.slice(0, 18).map((product) => (
                <Button
                  key={product}
                  variant={selectedProduct === product ? "default" : "outline"}
                  size="sm"
                  onClick={() => handleSelectProduct(product)}
                >
                  {product}
                </Button>
              ))}
            </div>

            {/* 품종/산지 필터 */}
            {selectedProduct && (varieties.length > 0 || origins.length > 0) && (
              <div className="mt-4 pt-4 border-t space-y-3">
                {varieties.length > 0 && (
                  <div className="space-y-2">
                    <Label className="text-sm">품종</Label>
                    <Select
                      value={selectedVariety || "all"}
                      onValueChange={(v) => setSelectedVariety(v === "all" ? null : v)}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="전체 품종" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">전체 품종</SelectItem>
                        {varieties.map((v) => (
                          <SelectItem key={v} value={v}>
                            {v}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}

                {origins.length > 0 && (
                  <div className="space-y-2">
                    <Label className="text-sm">산지</Label>
                    <Select
                      value={selectedOrigin || "all"}
                      onValueChange={(v) => setSelectedOrigin(v === "all" ? null : v)}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="전체 산지" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">전체 산지</SelectItem>
                        {origins.map((o) => (
                          <SelectItem key={o} value={o}>
                            {o}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}
              </div>
            )}
          </CardContent>
        </Card>

        {/* 관심 품목 */}
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
              <div className="space-y-2 max-h-[300px] overflow-y-auto">
                {watchlist.map((item) => (
                  <div
                    key={item.id}
                    className="flex items-center justify-between p-3 rounded-lg border hover:bg-muted/50 cursor-pointer"
                    onClick={() => {
                      handleSelectProduct(item.productName);
                      if (item.variety) setSelectedVariety(item.variety);
                      if (item.origin) setSelectedOrigin(item.origin);
                    }}
                  >
                    <div className="flex items-center gap-3">
                      <Star className="h-4 w-4 text-yellow-500 fill-yellow-500" />
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-medium">{item.productName}</span>
                          {item.variety && (
                            <Badge variant="outline" className="text-xs">
                              {item.variety}
                            </Badge>
                          )}
                        </div>
                        {item.origin && (
                          <p className="text-xs text-muted-foreground flex items-center gap-1">
                            <MapPin className="h-3 w-3" />
                            {item.origin}
                          </p>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      {item.latestPrice && (
                        <div className="text-right">
                          <p className="font-bold">{formatLargeNumber(item.latestPrice)}</p>
                          {item.priceChange !== null && (
                            <Badge
                              variant={getPriceChangeBadge(item.priceChange) as "default" | "secondary" | "destructive"}
                              className="text-xs"
                            >
                              {getPriceChangeIcon(item.priceChange)}
                              {Math.abs(item.priceChange).toFixed(1)}%
                            </Badge>
                          )}
                        </div>
                      )}
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-red-500 hover:text-red-600 hover:bg-red-50"
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
              <div className="flex flex-col items-center justify-center py-8 text-center">
                <Star className="h-12 w-12 text-muted-foreground mb-4" />
                <p className="text-muted-foreground">등록된 관심 품목이 없습니다.</p>
                <p className="text-xs text-muted-foreground mt-1">
                  품목 검색에서 원하는 품목을 추가해보세요.
                </p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* 선택된 품목 시세 정보 */}
      {selectedProduct && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <span>{selectedProduct} 시세</span>
                {selectedVariety && (
                  <Badge variant="outline">{selectedVariety}</Badge>
                )}
                {selectedOrigin && (
                  <Badge variant="secondary">{selectedOrigin}</Badge>
                )}
                {priceHistory.length > 0 && (
                  <Badge
                    variant={getPriceChangeBadge(
                      priceHistory.length > 1
                        ? ((priceHistory[0].avgPrice - priceHistory[1].avgPrice) /
                            priceHistory[1].avgPrice) *
                            100
                        : null
                    ) as "default" | "secondary" | "destructive"}
                    className="flex items-center gap-1"
                  >
                    {priceHistory.length > 1 ? (
                      <>
                        {getPriceChangeIcon(
                          ((priceHistory[0].avgPrice - priceHistory[1].avgPrice) /
                            priceHistory[1].avgPrice) *
                            100
                        )}
                        {Math.abs(
                          ((priceHistory[0].avgPrice - priceHistory[1].avgPrice) /
                            priceHistory[1].avgPrice) *
                            100
                        ).toFixed(1)}
                        %
                      </>
                    ) : (
                      <Minus className="h-3 w-3" />
                    )}
                  </Badge>
                )}
              </div>
              {isAlreadyInWatchlist(selectedProduct, selectedVariety || undefined, selectedOrigin || undefined) ? (
                <Button variant="secondary" size="sm" disabled>
                  <Star className="mr-2 h-4 w-4 fill-yellow-500 text-yellow-500" />
                  등록됨
                </Button>
              ) : (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handleAddToWatchlist(selectedProduct, selectedVariety || undefined, selectedOrigin || undefined)}
                >
                  <Star className="mr-2 h-4 w-4" />
                  관심 등록
                </Button>
              )}
            </CardTitle>
            <CardDescription>최근 30일간의 경매 시세 추이입니다.</CardDescription>
          </CardHeader>
          <CardContent>
            {loadingHistory ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
              </div>
            ) : priceHistory.length > 0 ? (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>날짜</TableHead>
                    <TableHead className="text-right">평균가</TableHead>
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

                    return (
                      <TableRow key={price.date}>
                        <TableCell>{formatDate(price.date)}</TableCell>
                        <TableCell className="text-right">
                          <div className="flex items-center justify-end gap-2">
                            <span className="font-medium">
                              {formatLargeNumber(price.avgPrice)}
                            </span>
                            {change !== null && (
                              <Badge
                                variant={getPriceChangeBadge(change) as "default" | "secondary" | "destructive"}
                                className="text-xs"
                              >
                                {getPriceChangeIcon(change)}
                                {Math.abs(change).toFixed(1)}%
                              </Badge>
                            )}
                          </div>
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
            ) : (
              <div className="flex flex-col items-center justify-center py-8 text-center">
                <LineChart className="h-12 w-12 text-muted-foreground mb-4" />
                <p className="text-muted-foreground">시세 데이터가 없습니다.</p>
                <p className="text-xs text-muted-foreground mt-1">
                  데이터 수집 버튼을 눌러 가락시장 경매 데이터를 수집해보세요.
                </p>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* 품목 검색 다이얼로그 */}
      <Dialog open={isSearchDialogOpen} onOpenChange={setIsSearchDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>품목 검색</DialogTitle>
            <DialogDescription>품목명으로 검색하여 관심 품목에 등록하세요.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="flex gap-2">
              <Input
                placeholder="품목명 입력 (예: 토마토, 딸기)"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>
            <div className="max-h-[300px] overflow-y-auto space-y-2">
              {filteredProducts.map((product) => {
                const isRegistered = isAlreadyInWatchlist(product);
                return (
                  <div
                    key={product}
                    className="flex items-center justify-between p-3 rounded-lg border hover:bg-muted/50 cursor-pointer"
                    onClick={() => {
                      handleSelectProduct(product);
                      setIsSearchDialogOpen(false);
                    }}
                  >
                    <div className="flex items-center gap-2">
                      <span className="font-medium">{product}</span>
                      {isRegistered && (
                        <Badge variant="secondary" className="text-xs">
                          등록됨
                        </Badge>
                      )}
                    </div>
                    <Button
                      variant={isRegistered ? "ghost" : "outline"}
                      size="sm"
                      disabled={isRegistered}
                      onClick={(e) => {
                        e.stopPropagation();
                        handleAddToWatchlist(product);
                      }}
                    >
                      <Star className={`h-4 w-4 ${isRegistered ? "fill-yellow-500 text-yellow-500" : ""}`} />
                    </Button>
                  </div>
                );
              })}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsSearchDialogOpen(false)}>
              닫기
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 데이터 수집 다이얼로그 */}
      <Dialog open={isCollectDialogOpen} onOpenChange={setIsCollectDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>가락시장 경매 데이터 수집</DialogTitle>
            <DialogDescription>
              지정한 날짜와 법인의 경매 결과를 수집합니다.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>수집 날짜</Label>
              <Input
                type="date"
                value={collectDate}
                onChange={(e) => setCollectDate(e.target.value)}
                max={new Date().toISOString().split("T")[0]}
              />
              <p className="text-xs text-muted-foreground">
                당일 데이터는 아직 없을 수 있으므로 어제 이전 날짜를 권장합니다.
              </p>
            </div>

            <div className="space-y-2">
              <Label>법인 선택</Label>
              <div className="grid grid-cols-2 gap-2">
                {corporations.map((corp) => (
                  <Button
                    key={corp.code}
                    variant={selectedCorps.includes(corp.code) ? "default" : "outline"}
                    size="sm"
                    className="justify-start"
                    onClick={() => {
                      setSelectedCorps((prev) =>
                        prev.includes(corp.code)
                          ? prev.filter((c) => c !== corp.code)
                          : [...prev, corp.code]
                      );
                    }}
                  >
                    {corp.name}
                  </Button>
                ))}
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsCollectDialogOpen(false)}>
              취소
            </Button>
            <Button onClick={handleCollectData} disabled={collecting}>
              {collecting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              수집 시작
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 삭제 확인 다이얼로그 */}
      <AlertDialog open={!!deleteConfirmId} onOpenChange={(open) => !open && setDeleteConfirmId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>관심 품목 삭제</AlertDialogTitle>
            <AlertDialogDescription>
              <strong>{deleteConfirmName}</strong>을(를) 관심 품목에서 삭제하시겠습니까?
              <br />
              삭제 후에도 품목 검색에서 다시 등록할 수 있습니다.
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
      </TabsContent>

      <TabsContent value="settings">
        <MarketSettings />
      </TabsContent>
    </Tabs>
  );
}
