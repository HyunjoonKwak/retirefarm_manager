"use client";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Loader2, Calendar, ChevronLeft, ChevronRight, TrendingUp, TrendingDown, Minus } from "lucide-react";
import { formatExactPrice, formatDate } from "@/lib/utils/format";
import {
  PriceHistory,
  DAY_NAMES,
  STAT_LABELS,
  parseLocalDate,
  formatLocalDateStr,
} from "./marketPriceTypes";

interface WeeklyPriceData {
  weekStart: Date;
  weekEnd: Date;
  data: (PriceHistory | null)[];
  noAuctionSet: Set<string>;
}

interface MarketPriceWeeklyTableProps {
  weeklyPriceData: WeeklyPriceData;
  priceHistory: PriceHistory[];
  loadingHistory: boolean;
  selectedDate: string;
  weekOffset: number;
  onDateSelect: (date: string) => void;
  onWeekOffsetChange: (offset: number) => void;
}

function getPriceChangeBadge(change: number | null): "default" | "secondary" | "destructive" {
  if (change === null) return "secondary";
  if (change > 0) return "destructive";
  if (change < 0) return "default";
  return "secondary";
}

function getPriceChangeIcon(change: number | null) {
  if (change === null) return <Minus className="h-3 w-3" />;
  if (change > 0) return <TrendingUp className="h-3 w-3" />;
  if (change < 0) return <TrendingDown className="h-3 w-3" />;
  return <Minus className="h-3 w-3" />;
}

export function MarketPriceWeeklyTable({
  weeklyPriceData,
  priceHistory,
  loadingHistory,
  selectedDate,
  weekOffset,
  onDateSelect,
  onWeekOffsetChange,
}: MarketPriceWeeklyTableProps) {
  function getWeekRangeText() {
    if (!weeklyPriceData.weekStart) return "";
    const start = formatDate(weeklyPriceData.weekStart.toISOString());
    const end = formatDate(weeklyPriceData.weekEnd.toISOString());
    return `${start} ~ ${end}`;
  }

  return (
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
              onClick={() => onWeekOffsetChange(weekOffset + 1)}
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
              onClick={() => onWeekOffsetChange(Math.max(0, weekOffset - 1))}
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
                  <TableHead className="text-right whitespace-nowrap">평균가({STAT_LABELS.weightedMean})</TableHead>
                  <TableHead className="text-right whitespace-nowrap hidden lg:table-cell text-amber-600">
                    kg당
                  </TableHead>
                  <TableHead className="text-right whitespace-nowrap hidden sm:table-cell">
                    변동
                  </TableHead>
                  <TableHead className="text-right whitespace-nowrap hidden md:table-cell">
                    최고가
                  </TableHead>
                  <TableHead className="text-right whitespace-nowrap hidden md:table-cell">
                    최저가
                  </TableHead>
                  <TableHead className="text-right whitespace-nowrap">거래</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {weeklyPriceData.data.map((price, index) => {
                  const targetDate = new Date(weeklyPriceData.weekStart);
                  targetDate.setDate(weeklyPriceData.weekStart.getDate() + index);
                  const dateStr = formatLocalDateStr(targetDate);
                  const dayName = DAY_NAMES[targetDate.getDay()];
                  const isNoAuction = weeklyPriceData.noAuctionSet.has(dateStr);

                  if (!price) {
                    return (
                      <TableRow
                        key={dateStr}
                        className={isNoAuction ? "bg-muted/40" : "text-muted-foreground"}
                      >
                        <TableCell className="text-xs sm:text-sm whitespace-nowrap">
                          {formatDate(dateStr)} ({dayName})
                          {isNoAuction && (
                            <Badge variant="secondary" className="ml-2 text-[10px]">
                              휴장
                            </Badge>
                          )}
                        </TableCell>
                        <TableCell
                          className="text-right text-muted-foreground"
                          colSpan={6}
                        >
                          {isNoAuction ? "경매 없는 날" : "-"}
                        </TableCell>
                      </TableRow>
                    );
                  }

                  const currentDateObj = parseLocalDate(price.date);
                  const prevData = priceHistory
                    .filter((p) => parseLocalDate(p.date).getTime() < currentDateObj.getTime())
                    .sort(
                      (a, b) =>
                        parseLocalDate(b.date).getTime() - parseLocalDate(a.date).getTime()
                    )[0];
                  const change = prevData
                    ? ((price.avgPrice - prevData.avgPrice) / prevData.avgPrice) * 100
                    : null;

                  return (
                    <TableRow
                      key={dateStr}
                      className={`cursor-pointer hover:bg-muted/50 ${
                        selectedDate === dateStr ? "bg-muted" : ""
                      }`}
                      onClick={() => onDateSelect(dateStr)}
                    >
                      <TableCell className="text-blue-600 dark:text-blue-400 hover:underline font-medium text-xs sm:text-sm whitespace-nowrap">
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
                            variant={getPriceChangeBadge(change)}
                            className="text-xs"
                          >
                            {getPriceChangeIcon(change)}
                            {Math.abs(change).toFixed(1)}%
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-right text-red-600 dark:text-red-400 hidden md:table-cell whitespace-nowrap">
                        {formatExactPrice(price.maxPrice)}
                      </TableCell>
                      <TableCell className="text-right text-blue-600 dark:text-blue-400 hidden md:table-cell whitespace-nowrap">
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
  );
}
