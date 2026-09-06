"use client";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
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
import { Loader2, ArrowUpDown, ChevronUp, ChevronDown } from "lucide-react";
import { formatExactPrice } from "@/lib/utils/format";
import { DailyDetailResult, DailyStats, DAY_NAMES, SortField, SortDirection, STAT_LABELS } from "./marketPriceTypes";

interface MarketPriceDailyDetailProps {
  selectedDate: string;
  selectedProduct: string;
  selectedVarieties: string[];
  selectedOrigin: string | null;
  selectedUnit: string | null;
  selectedGrade: string | null;
  dailyResults: DailyDetailResult[];
  filteredDailyResults: DailyDetailResult[];
  filteredDailyStats: DailyStats | null;
  originOptions: string[];
  varietyOptions: string[];
  unitOptions: string[];
  gradeOptions: string[];
  loadingDaily: boolean;
  sortField: SortField | null;
  sortDirection: SortDirection;
  onClose: () => void;
  onVarietiesChange: (v: string[]) => void;
  onOriginChange: (o: string | null) => void;
  onUnitChange: (u: string | null) => void;
  onGradeChange: (g: string | null) => void;
  onToggleSort: (field: SortField) => void;
}

function formatDateWithDay(dateStr: string): string {
  const d = new Date(dateStr);
  const dayName = DAY_NAMES[d.getDay()];
  const [year, month, day] = dateStr.split("-");
  return `${year}.${month}.${day} (${dayName})`;
}

export function MarketPriceDailyDetail({
  selectedDate,
  selectedProduct,
  selectedVarieties,
  selectedOrigin,
  selectedUnit,
  selectedGrade,
  dailyResults,
  filteredDailyResults,
  filteredDailyStats,
  originOptions,
  varietyOptions,
  unitOptions,
  gradeOptions,
  loadingDaily,
  sortField,
  sortDirection,
  onClose,
  onVarietiesChange,
  onOriginChange,
  onUnitChange,
  onGradeChange,
  onToggleSort,
}: MarketPriceDailyDetailProps) {
  function getSortIcon(field: SortField) {
    if (sortField !== field)
      return <ArrowUpDown className="h-3 w-3 opacity-50" />;
    return sortDirection === "asc" ? (
      <ChevronUp className="h-3 w-3" />
    ) : (
      <ChevronDown className="h-3 w-3" />
    );
  }

  const hasFilter = selectedVarieties.length > 0 || selectedOrigin || selectedUnit || selectedGrade;

  return (
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
              {selectedGrade && ` / ${selectedGrade} 등급`}
            </CardDescription>
          </div>
          <Button
            variant="outline"
            size="sm"
            className="self-end sm:self-auto"
            onClick={onClose}
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
            {/* Filters for daily detail */}
            <div className="p-3 bg-white rounded-lg border space-y-3">
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
                            onVarietiesChange(selectedVarieties.filter((sv) => sv !== v));
                          } else {
                            onVarietiesChange([...selectedVarieties, v]);
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
                    onValueChange={(v) => onOriginChange(v === "_all" ? null : v)}
                  >
                    <SelectTrigger className="w-32">
                      <SelectValue placeholder="전체" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="_all">전체</SelectItem>
                      {originOptions.map((o) => (
                        <SelectItem key={o} value={o}>
                          {o}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {unitOptions.length > 0 && (
                  <div className="flex items-center gap-2">
                    <Label className="text-sm whitespace-nowrap">단위</Label>
                    <Select
                      value={selectedUnit || "_all"}
                      onValueChange={(v) => onUnitChange(v === "_all" ? null : v)}
                    >
                      <SelectTrigger className="w-28">
                        <SelectValue placeholder="전체" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="_all">전체</SelectItem>
                        {unitOptions.map((u) => (
                          <SelectItem key={u} value={u}>
                            {u}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}

                {gradeOptions.length > 0 && (
                  <div className="flex items-center gap-2">
                    <Label className="text-sm whitespace-nowrap">등급</Label>
                    <Select
                      value={selectedGrade || "_all"}
                      onValueChange={(v) => onGradeChange(v === "_all" ? null : v)}
                    >
                      <SelectTrigger className="w-28">
                        <SelectValue placeholder="전체" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="_all">전체</SelectItem>
                        {gradeOptions.map((g) => (
                          <SelectItem key={g} value={g}>
                            {g}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}

                {hasFilter && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      onVarietiesChange([]);
                      onOriginChange(null);
                      onUnitChange(null);
                      onGradeChange(null);
                    }}
                  >
                    필터 초기화
                  </Button>
                )}
              </div>
            </div>

            {/* Stats summary */}
            {filteredDailyStats && (
              <div className="grid grid-cols-3 sm:grid-cols-6 gap-2 sm:gap-3 text-center">
                <div className="p-2 bg-white rounded border">
                  <p className="text-[10px] sm:text-xs text-muted-foreground">평균가({STAT_LABELS.weightedMean})</p>
                  <p className="font-bold text-xs sm:text-sm">
                    {formatExactPrice(filteredDailyStats.avgPrice)}
                  </p>
                </div>
                <div className="p-2 bg-white rounded border">
                  <p className="text-[10px] sm:text-xs text-red-600">최고가</p>
                  <p className="font-bold text-red-600 text-xs sm:text-sm">
                    {formatExactPrice(filteredDailyStats.maxPrice)}
                  </p>
                </div>
                <div className="p-2 bg-white rounded border">
                  <p className="text-[10px] sm:text-xs text-blue-600">최저가</p>
                  <p className="font-bold text-blue-600 text-xs sm:text-sm">
                    {formatExactPrice(filteredDailyStats.minPrice)}
                  </p>
                </div>
                <div className="p-2 bg-white rounded border">
                  <p className="text-[10px] sm:text-xs text-muted-foreground">거래건수</p>
                  <p className="font-bold text-xs sm:text-sm">{filteredDailyStats.tradeCount}건</p>
                </div>
                <div className="p-2 bg-white rounded border">
                  <p className="text-[10px] sm:text-xs text-muted-foreground">총수량</p>
                  <p className="font-bold text-xs sm:text-sm">
                    {filteredDailyStats.totalQuantity.toLocaleString()}
                  </p>
                </div>
                <div className="p-2 bg-white rounded border">
                  <p className="text-[10px] sm:text-xs text-green-600">거래금액</p>
                  <p className="font-bold text-green-600 text-xs sm:text-sm">
                    {filteredDailyStats.totalTradeAmount.toLocaleString()}원
                  </p>
                </div>
                {filteredDailyStats.excludedCount > 0 && (
                  <p className="col-span-3 sm:col-span-6 text-[10px] sm:text-xs text-muted-foreground text-left">
                    가격·수량이 유효하지 않은 {filteredDailyStats.excludedCount}행은 집계에서 제외했습니다. 원본은 아래 표에 남아 있습니다.
                  </p>
                )}
              </div>
            )}

            {/* Trade detail table */}
            <div className="max-h-[500px] overflow-y-auto overflow-x-auto -mx-3 sm:mx-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead
                      className="cursor-pointer hover:bg-muted/50 whitespace-nowrap"
                      onClick={() => onToggleSort("variety")}
                    >
                      <div className="flex items-center gap-1">
                        품종 {getSortIcon("variety")}
                      </div>
                    </TableHead>
                    <TableHead
                      className="cursor-pointer hover:bg-muted/50 whitespace-nowrap hidden sm:table-cell"
                      onClick={() => onToggleSort("origin")}
                    >
                      <div className="flex items-center gap-1">
                        산지 {getSortIcon("origin")}
                      </div>
                    </TableHead>
                    <TableHead
                      className="text-right cursor-pointer hover:bg-muted/50 whitespace-nowrap"
                      onClick={() => onToggleSort("price")}
                    >
                      <div className="flex items-center justify-end gap-1">
                        가격 {getSortIcon("price")}
                      </div>
                    </TableHead>
                    <TableHead
                      className="cursor-pointer hover:bg-muted/50 whitespace-nowrap hidden md:table-cell"
                      onClick={() => onToggleSort("unit")}
                    >
                      <div className="flex items-center gap-1">
                        단위 {getSortIcon("unit")}
                      </div>
                    </TableHead>
                    <TableHead
                      className="text-right cursor-pointer hover:bg-muted/50 whitespace-nowrap"
                      onClick={() => onToggleSort("quantity")}
                    >
                      <div className="flex items-center justify-end gap-1">
                        수량 {getSortIcon("quantity")}
                      </div>
                    </TableHead>
                    <TableHead className="hidden lg:table-cell whitespace-nowrap">등급</TableHead>
                    <TableHead
                      className="cursor-pointer hover:bg-muted/50 whitespace-nowrap hidden sm:table-cell"
                      onClick={() => onToggleSort("corporation")}
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
                      <TableCell className="text-xs sm:text-sm whitespace-nowrap">
                        {result.variety || "-"}
                      </TableCell>
                      <TableCell className="hidden sm:table-cell text-xs sm:text-sm">
                        {result.origin || "-"}
                      </TableCell>
                      <TableCell className="text-right font-medium text-xs sm:text-sm whitespace-nowrap">
                        {formatExactPrice(result.price)}
                      </TableCell>
                      <TableCell className="hidden md:table-cell text-xs sm:text-sm">
                        {result.unit}
                      </TableCell>
                      <TableCell className="text-right text-xs sm:text-sm">
                        {result.quantity}
                      </TableCell>
                      <TableCell className="hidden lg:table-cell text-xs sm:text-sm">
                        {result.grade || "-"}
                      </TableCell>
                      <TableCell className="text-xs hidden sm:table-cell">
                        {result.corporation}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>

            <div className="text-sm text-muted-foreground text-right">
              총 {filteredDailyResults.length}건
              {hasFilter &&
                dailyResults.length !== filteredDailyResults.length &&
                ` (전체 ${dailyResults.length}건 중)`}
            </div>
          </div>
        ) : (
          <div className="py-8 text-center space-y-2">
            {/* 조건 때문에 빈 것과 그날 거래가 없는 것을 구분한다. */}
            <p className="text-muted-foreground">
              {hasFilter
                ? "선택한 조건에 맞는 거래가 없습니다. 조건을 넓혀 확인해 주세요."
                : "해당 날짜의 거래 내역이 없습니다."}
            </p>
            {hasFilter && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  onVarietiesChange([]);
                  onOriginChange(null);
                  onUnitChange(null);
                  onGradeChange(null);
                }}
              >
                필터 초기화
              </Button>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
