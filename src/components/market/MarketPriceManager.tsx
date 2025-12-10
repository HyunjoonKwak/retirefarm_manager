"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
  Plus,
  LineChart,
} from "lucide-react";
import { formatLargeNumber } from "@/lib/utils/format";
import { toast } from "sonner";

interface MarketItem {
  itemCode: string;
  itemName: string;
  unit: string;
}

interface WatchlistItem {
  id: string;
  itemCode: string;
  itemName: string;
  targetPrice: string | null;
  createdAt: string;
}

interface PriceData {
  id: string;
  itemCode: string;
  itemName: string;
  marketName: string;
  date: string;
  avgPrice: string;
  maxPrice: string;
  minPrice: string;
  tradingVolume: string;
}

export function MarketPriceManager() {
  const [items, setItems] = useState<MarketItem[]>([]);
  const [watchlist, setWatchlist] = useState<WatchlistItem[]>([]);
  const [selectedItem, setSelectedItem] = useState<MarketItem | null>(null);
  const [prices, setPrices] = useState<PriceData[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [loadingPrices, setLoadingPrices] = useState(false);
  const [isSearchDialogOpen, setIsSearchDialogOpen] = useState(false);
  const [searchResults, setSearchResults] = useState<MarketItem[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);

  async function fetchWatchlist() {
    try {
      const response = await fetch("/api/market/watchlist");
      const data = await response.json();
      setWatchlist(data.watchlist || []);
    } catch (error) {
      console.error("Failed to fetch watchlist:", error);
    }
  }

  async function fetchItems() {
    try {
      const response = await fetch("/api/market/prices");
      const data = await response.json();
      setItems(data.items || []);
    } catch (error) {
      console.error("Failed to fetch items:", error);
    } finally {
      setLoading(false);
    }
  }

  async function fetchPrices(itemCode: string) {
    setLoadingPrices(true);
    try {
      const response = await fetch(`/api/market/prices?itemCode=${itemCode}`);
      const data = await response.json();
      setPrices(data.prices || []);
    } catch (error) {
      console.error("Failed to fetch prices:", error);
    } finally {
      setLoadingPrices(false);
    }
  }

  useEffect(() => {
    fetchItems();
    fetchWatchlist();
  }, []);

  async function handleSearch() {
    if (!searchQuery.trim()) {
      setSearchResults(items);
      return;
    }

    setSearchLoading(true);
    try {
      const response = await fetch(`/api/market/prices?search=${encodeURIComponent(searchQuery)}`);
      const data = await response.json();
      setSearchResults(data.items || []);
    } catch (error) {
      console.error("Search failed:", error);
    } finally {
      setSearchLoading(false);
    }
  }

  async function handleAddToWatchlist(item: MarketItem) {
    try {
      const response = await fetch("/api/market/watchlist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          itemCode: item.itemCode,
          itemName: item.itemName,
        }),
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

  async function handleRemoveFromWatchlist(itemCode: string) {
    try {
      const response = await fetch(`/api/market/watchlist?itemCode=${itemCode}`, {
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
    }
  }

  function handleSelectItem(item: MarketItem) {
    setSelectedItem(item);
    fetchPrices(item.itemCode);
  }

  function isInWatchlist(itemCode: string): boolean {
    return watchlist.some((w) => w.itemCode === itemCode);
  }

  function getPriceChange(prices: PriceData[]): { value: number; direction: "up" | "down" | "same" } {
    if (prices.length < 2) return { value: 0, direction: "same" };
    const latest = Number(prices[0]?.avgPrice || 0);
    const previous = Number(prices[1]?.avgPrice || 0);
    if (previous === 0) return { value: 0, direction: "same" };
    const change = ((latest - previous) / previous) * 100;
    return {
      value: Math.abs(change),
      direction: change > 0 ? "up" : change < 0 ? "down" : "same",
    };
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
      {/* 요약 카드 */}
      <div className="grid gap-4 md:grid-cols-3">
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
              전체 품목
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{items.length}개</div>
            <p className="text-xs text-muted-foreground">조회 가능</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <TrendingUp className="h-4 w-4 text-green-500" />
              시세 정보
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">30일</div>
            <p className="text-xs text-muted-foreground">데이터 보관</p>
          </CardContent>
        </Card>
      </div>

      {/* 품목 검색 및 관심 목록 */}
      <div className="grid gap-6 lg:grid-cols-2">
        {/* 품목 검색 */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center justify-between">
              품목 검색
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setSearchResults(items);
                  setSearchQuery("");
                  setIsSearchDialogOpen(true);
                }}
              >
                <Search className="mr-2 h-4 w-4" />
                검색
              </Button>
            </CardTitle>
            <CardDescription>품목을 검색하고 시세를 확인하세요.</CardDescription>
          </CardHeader>
          <CardContent>
            {/* 빠른 검색 - 주요 품목 */}
            <div className="flex flex-wrap gap-2">
              {items.slice(0, 12).map((item) => (
                <Button
                  key={item.itemCode}
                  variant={selectedItem?.itemCode === item.itemCode ? "default" : "outline"}
                  size="sm"
                  onClick={() => handleSelectItem(item)}
                >
                  {item.itemName}
                </Button>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* 관심 품목 */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Star className="h-5 w-5 text-yellow-500" />
              관심 품목
            </CardTitle>
            <CardDescription>자주 확인하는 품목을 관리하세요.</CardDescription>
          </CardHeader>
          <CardContent>
            {watchlist.length > 0 ? (
              <div className="space-y-2">
                {watchlist.map((item) => (
                  <div
                    key={item.id}
                    className="flex items-center justify-between p-2 rounded-lg border hover:bg-muted/50 cursor-pointer"
                    onClick={() =>
                      handleSelectItem({
                        itemCode: item.itemCode,
                        itemName: item.itemName,
                        unit: "",
                      })
                    }
                  >
                    <div className="flex items-center gap-2">
                      <Star className="h-4 w-4 text-yellow-500 fill-yellow-500" />
                      <span className="font-medium">{item.itemName}</span>
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 text-red-500"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleRemoveFromWatchlist(item.itemCode);
                      }}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
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
      {selectedItem && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <span>{selectedItem.itemName} 시세</span>
                {prices.length > 0 && (
                  <Badge
                    variant={
                      getPriceChange(prices).direction === "up"
                        ? "destructive"
                        : getPriceChange(prices).direction === "down"
                        ? "default"
                        : "secondary"
                    }
                    className="flex items-center gap-1"
                  >
                    {getPriceChange(prices).direction === "up" && <TrendingUp className="h-3 w-3" />}
                    {getPriceChange(prices).direction === "down" && <TrendingDown className="h-3 w-3" />}
                    {getPriceChange(prices).direction === "same" && <Minus className="h-3 w-3" />}
                    {getPriceChange(prices).value.toFixed(1)}%
                  </Badge>
                )}
              </div>
              <div className="flex items-center gap-2">
                {!isInWatchlist(selectedItem.itemCode) ? (
                  <Button variant="outline" size="sm" onClick={() => handleAddToWatchlist(selectedItem)}>
                    <Plus className="mr-2 h-4 w-4" />
                    관심 등록
                  </Button>
                ) : (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleRemoveFromWatchlist(selectedItem.itemCode)}
                  >
                    <Star className="mr-2 h-4 w-4 fill-yellow-500 text-yellow-500" />
                    관심 해제
                  </Button>
                )}
              </div>
            </CardTitle>
            <CardDescription>최근 30일간의 시세 추이입니다.</CardDescription>
          </CardHeader>
          <CardContent>
            {loadingPrices ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
              </div>
            ) : prices.length > 0 ? (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>날짜</TableHead>
                    <TableHead>시장</TableHead>
                    <TableHead className="text-right">평균가</TableHead>
                    <TableHead className="text-right">최고가</TableHead>
                    <TableHead className="text-right">최저가</TableHead>
                    <TableHead className="text-right">거래량</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {prices.map((price) => (
                    <TableRow key={price.id}>
                      <TableCell>{new Date(price.date).toLocaleDateString("ko-KR")}</TableCell>
                      <TableCell>{price.marketName}</TableCell>
                      <TableCell className="text-right font-medium">
                        {formatLargeNumber(price.avgPrice)}
                      </TableCell>
                      <TableCell className="text-right text-red-600">
                        {formatLargeNumber(price.maxPrice)}
                      </TableCell>
                      <TableCell className="text-right text-blue-600">
                        {formatLargeNumber(price.minPrice)}
                      </TableCell>
                      <TableCell className="text-right">{formatLargeNumber(price.tradingVolume)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            ) : (
              <div className="flex flex-col items-center justify-center py-8 text-center">
                <LineChart className="h-12 w-12 text-muted-foreground mb-4" />
                <p className="text-muted-foreground">시세 데이터가 없습니다.</p>
                <p className="text-xs text-muted-foreground mt-1">
                  KAMIS API 연동 후 데이터가 수집됩니다.
                </p>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* 검색 다이얼로그 */}
      <Dialog open={isSearchDialogOpen} onOpenChange={setIsSearchDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>품목 검색</DialogTitle>
            <DialogDescription>품목명 또는 코드로 검색하세요.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="flex gap-2">
              <Input
                placeholder="품목명 또는 코드 입력"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleSearch()}
              />
              <Button onClick={handleSearch} disabled={searchLoading}>
                {searchLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
              </Button>
            </div>
            <div className="max-h-[300px] overflow-y-auto space-y-2">
              {searchResults.map((item) => (
                <div
                  key={item.itemCode}
                  className="flex items-center justify-between p-3 rounded-lg border hover:bg-muted/50 cursor-pointer"
                  onClick={() => {
                    handleSelectItem(item);
                    setIsSearchDialogOpen(false);
                  }}
                >
                  <div>
                    <p className="font-medium">{item.itemName}</p>
                    <p className="text-xs text-muted-foreground">
                      코드: {item.itemCode} · 단위: {item.unit}
                    </p>
                  </div>
                  {isInWatchlist(item.itemCode) ? (
                    <Star className="h-5 w-5 text-yellow-500 fill-yellow-500" />
                  ) : (
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleAddToWatchlist(item);
                      }}
                    >
                      <Star className="h-5 w-5" />
                    </Button>
                  )}
                </div>
              ))}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsSearchDialogOpen(false)}>
              닫기
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
