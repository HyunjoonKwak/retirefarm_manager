"use client";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
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
import { Star, MapPin, Trash2, TrendingUp, TrendingDown, Minus } from "lucide-react";
import { formatExactPrice } from "@/lib/utils/format";
import { WatchlistItem } from "./marketPriceTypes";

interface MarketPriceWatchlistProps {
  watchlist: WatchlistItem[];
  deleteConfirmId: string | null;
  deleteConfirmName: string;
  onSelectItem: (item: WatchlistItem) => void;
  onDeleteClick: (id: string, name: string) => void;
  onConfirmDelete: () => void;
  onCancelDelete: () => void;
}

function getPriceChangeColor(change: number | null): string {
  if (change === null) return "text-gray-500";
  if (change > 0) return "text-red-500";
  if (change < 0) return "text-blue-500";
  return "text-gray-500";
}

function getPriceChangeIcon(change: number | null) {
  if (change === null) return <Minus className="h-3 w-3" />;
  if (change > 0) return <TrendingUp className="h-3 w-3" />;
  if (change < 0) return <TrendingDown className="h-3 w-3" />;
  return <Minus className="h-3 w-3" />;
}

export function MarketPriceWatchlist({
  watchlist,
  deleteConfirmId,
  deleteConfirmName,
  onSelectItem,
  onDeleteClick,
  onConfirmDelete,
  onCancelDelete,
}: MarketPriceWatchlistProps) {
  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Star className="h-5 w-5 text-yellow-500" />
            관심 품목
          </CardTitle>
          <CardDescription>최신 거래일의 대표 규격 시세입니다. 등락은 같은 품종·등급·단위의 이전 거래와 비교합니다.</CardDescription>
        </CardHeader>
        <CardContent>
          {watchlist.length > 0 ? (
            <div className="grid gap-2 sm:gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {watchlist.map((item) => (
                <div
                  key={item.id}
                  className="flex items-center justify-between p-3 sm:p-4 rounded-lg border hover:bg-muted/50 cursor-pointer transition-colors"
                  onClick={() => onSelectItem(item)}
                >
                  <div className="flex items-center gap-2 sm:gap-3 flex-1 min-w-0">
                    <Star className="h-4 w-4 sm:h-5 sm:w-5 text-yellow-500 fill-yellow-500 flex-shrink-0" />
                    <div className="min-w-0">
                      <div className="flex items-center gap-1 sm:gap-2 flex-wrap">
                        <span className="font-medium text-sm sm:text-base">{item.productName}</span>
                        {item.variety && (
                          <Badge variant="outline" className="text-[10px] sm:text-xs">
                            {item.variety}
                          </Badge>
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
                        <p className="font-bold text-xs sm:text-sm">
                          {formatExactPrice(item.latestPrice)}
                          {item.unit && <span className="text-xs font-normal"> / {item.unit}</span>}
                        </p>
                        <p className="text-[10px] text-muted-foreground">{item.latestVariety || "품종 미상"} · {item.latestGrade || "등급 미상"}</p>
                        {item.latestDate && <p className="text-[10px] text-muted-foreground">{new Date(item.latestDate).toLocaleDateString("ko-KR")} 거래</p>}
                        {item.priceChange !== null && (
                          <div
                            className={`flex items-center justify-end gap-0.5 text-[10px] sm:text-xs ${getPriceChangeColor(item.priceChange)}`}
                          >
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
                        onDeleteClick(item.id, item.productName);
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

      <AlertDialog
        open={!!deleteConfirmId}
        onOpenChange={(open) => !open && onCancelDelete()}
      >
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
              onClick={onConfirmDelete}
              className="bg-red-500 hover:bg-red-600"
            >
              삭제
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
