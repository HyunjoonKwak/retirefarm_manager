"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Loader2, BarChart3, LineChart as LineChartIcon, TrendingUp, TrendingDown, Minus } from "lucide-react";
import {
  ComposedChart,
  Area,
  Line,
  Bar,
  BarChart,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import { formatExactPrice, formatDate } from "@/lib/utils/format";
import { PERIOD_OPTIONS, PriceHistory } from "./marketPriceTypes";
import { useMemo, useState } from "react";

// 식별 시리즈 색 (light/dark 모두 검증 통과)
const SERIES_COLOR = "#3b82f6";
// 거래량 미니 차트용 맥락 색 (식별 아님 — 패널 제목으로 식별)
const VOLUME_COLOR = "#94a3b8";

type PriceMode = "box" | "kg";

interface ChartPoint {
  date: string;
  fullDate: string;
  평균가: number;
  최고가: number;
  최저가: number;
  범위: [number, number];
  kg당: number | null;
  거래량: number;
  거래건수: number;
}

interface MarketPriceChartProps {
  selectedProduct: string;
  selectedVarieties: string[];
  selectedOrigin: string | null;
  selectedUnit: string | null;
  latestDate: string | null;
  priceHistory: PriceHistory[];
  loadingHistory: boolean;
  viewDays: string;
  onViewDaysChange: (days: string) => void;
}

function formatCompactPrice(value: number): string {
  if (value >= 100_000_000) return `${(value / 100_000_000).toFixed(1)}억`;
  if (value >= 10_000) return `${(value / 10_000).toFixed(value >= 100_000 ? 0 : 1)}만`;
  return value.toLocaleString();
}

interface TooltipPayloadEntry {
  payload?: ChartPoint;
}

function PriceTooltip({
  active,
  payload,
  mode,
}: {
  active?: boolean;
  payload?: TooltipPayloadEntry[];
  mode: PriceMode;
}) {
  if (!active || !payload || payload.length === 0) return null;
  const p = payload[0]?.payload;
  if (!p) return null;

  return (
    <div className="rounded-md border bg-popover text-popover-foreground shadow-md px-3 py-2 text-xs space-y-1">
      <p className="font-medium">{formatDate(p.fullDate)}</p>
      {mode === "box" ? (
        <>
          <p>
            평균가 <span className="font-semibold">{formatExactPrice(p.평균가)}</span>
          </p>
          <p className="text-muted-foreground">
            범위 {formatExactPrice(p.최저가)} ~ {formatExactPrice(p.최고가)}
          </p>
          {p.kg당 != null && (
            <p className="text-muted-foreground">kg당 {formatExactPrice(p.kg당)}</p>
          )}
        </>
      ) : (
        <p>
          kg당 단가 <span className="font-semibold">{p.kg당 != null ? formatExactPrice(p.kg당) : "-"}</span>
        </p>
      )}
      <p className="text-muted-foreground">
        {p.거래건수}건 · {p.거래량.toLocaleString()}개
      </p>
    </div>
  );
}

function VolumeTooltip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: TooltipPayloadEntry[];
}) {
  if (!active || !payload || payload.length === 0) return null;
  const p = payload[0]?.payload;
  if (!p) return null;
  return (
    <div className="rounded-md border bg-popover text-popover-foreground shadow-md px-3 py-1.5 text-xs">
      <span className="font-medium">{formatDate(p.fullDate)}</span> ·{" "}
      {p.거래량.toLocaleString()}개 ({p.거래건수}건)
    </div>
  );
}

export function MarketPriceChart({
  selectedProduct,
  selectedVarieties,
  selectedOrigin,
  selectedUnit,
  latestDate,
  priceHistory,
  loadingHistory,
  viewDays,
  onViewDaysChange,
}: MarketPriceChartProps) {
  const [priceMode, setPriceMode] = useState<PriceMode>("box");

  const chartData = useMemo<ChartPoint[]>(() => {
    return [...priceHistory].reverse().map((p) => ({
      date: formatDate(p.date).slice(5),
      fullDate: p.date,
      평균가: p.avgPrice,
      최고가: p.maxPrice,
      최저가: p.minPrice,
      범위: [p.minPrice, p.maxPrice] as [number, number],
      kg당: p.pricePerKg ?? null,
      거래량: p.totalQuantity ?? 0,
      거래건수: p.tradeCount,
    }));
  }, [priceHistory]);

  const hasKgPrice = useMemo(
    () => priceHistory.some((p) => p.pricePerKg != null),
    [priceHistory]
  );

  const hasVolume = useMemo(
    () => chartData.some((d) => d.거래량 > 0),
    [chartData]
  );

  // 헤드라인 통계: 최신 평균가, 전일 대비, 기간 최고/최저
  const summary = useMemo(() => {
    if (chartData.length === 0) return null;
    const latest = chartData[chartData.length - 1];
    const prev = chartData.length > 1 ? chartData[chartData.length - 2] : null;
    const change =
      prev && prev.평균가 > 0
        ? ((latest.평균가 - prev.평균가) / prev.평균가) * 100
        : null;
    const periodHigh = Math.max(...chartData.map((d) => d.최고가));
    const periodLow = Math.min(...chartData.map((d) => d.최저가));
    const totalVolume = chartData.reduce((sum, d) => sum + d.거래량, 0);
    return { latest, change, periodHigh, periodLow, totalVolume };
  }, [chartData]);

  const effectiveMode: PriceMode = priceMode === "kg" && hasKgPrice ? "kg" : "box";

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <CardTitle className="flex items-center gap-2 flex-wrap">
            <BarChart3 className="h-5 w-5 flex-shrink-0" />
            <span>{selectedProduct} 시세</span>
            {selectedVarieties.length > 0 &&
              selectedVarieties.map((v) => (
                <Badge key={v} variant="outline" className="text-xs">
                  {v}
                </Badge>
              ))}
            {selectedOrigin && (
              <Badge variant="secondary" className="text-xs">
                {selectedOrigin}
              </Badge>
            )}
            {selectedUnit && (
              <Badge variant="default" className="text-xs">
                {selectedUnit}
              </Badge>
            )}
          </CardTitle>
          {latestDate && (
            <span className="text-xs text-muted-foreground whitespace-nowrap">
              최신: {formatDate(latestDate)}
            </span>
          )}
        </div>

        <div className="flex flex-col sm:flex-row gap-2 mt-3">
          <div className="flex gap-1 flex-1">
            {PERIOD_OPTIONS.map((opt) => (
              <Button
                key={opt.value}
                variant={viewDays === opt.value ? "default" : "outline"}
                size="sm"
                onClick={() => onViewDaysChange(opt.value)}
                className="flex-1"
              >
                {opt.label}
              </Button>
            ))}
          </div>
          {hasKgPrice && (
            <div className="flex gap-1">
              <Button
                variant={effectiveMode === "box" ? "secondary" : "ghost"}
                size="sm"
                onClick={() => setPriceMode("box")}
              >
                경락가
              </Button>
              <Button
                variant={effectiveMode === "kg" ? "secondary" : "ghost"}
                size="sm"
                onClick={() => setPriceMode("kg")}
              >
                kg당 단가
              </Button>
            </div>
          )}
        </div>

        <p className="text-xs text-muted-foreground mt-1">
          {PERIOD_OPTIONS.find((o) => o.value === viewDays)?.description}
          {effectiveMode === "box" ? (
            <span className="ml-2">
              • 선: 수량 가중평균 · 음영: 최저~최고가 범위
            </span>
          ) : (
            <span className="ml-2">• kg 환산 단가 (수량 가중평균)</span>
          )}
        </p>
      </CardHeader>
      <CardContent>
        {loadingHistory ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        ) : chartData.length > 0 ? (
          <div className="space-y-1">
            {summary && (
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-3">
                <div className="rounded-md border p-2">
                  <p className="text-[11px] text-muted-foreground">최근 평균가</p>
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className="text-sm font-semibold">
                      {formatExactPrice(summary.latest.평균가)}
                    </span>
                    {summary.change !== null && (
                      <span
                        className={`inline-flex items-center gap-0.5 text-[11px] ${
                          summary.change > 0
                            ? "text-red-600 dark:text-red-400"
                            : summary.change < 0
                              ? "text-blue-600 dark:text-blue-400"
                              : "text-muted-foreground"
                        }`}
                      >
                        {summary.change > 0 ? (
                          <TrendingUp className="h-3 w-3" />
                        ) : summary.change < 0 ? (
                          <TrendingDown className="h-3 w-3" />
                        ) : (
                          <Minus className="h-3 w-3" />
                        )}
                        {Math.abs(summary.change).toFixed(1)}%
                      </span>
                    )}
                  </div>
                </div>
                <div className="rounded-md border p-2">
                  <p className="text-[11px] text-muted-foreground">기간 최고가</p>
                  <p className="text-sm font-semibold">
                    {formatExactPrice(summary.periodHigh)}
                  </p>
                </div>
                <div className="rounded-md border p-2">
                  <p className="text-[11px] text-muted-foreground">기간 최저가</p>
                  <p className="text-sm font-semibold">
                    {formatExactPrice(summary.periodLow)}
                  </p>
                </div>
                <div className="rounded-md border p-2">
                  <p className="text-[11px] text-muted-foreground">기간 총 거래량</p>
                  <p className="text-sm font-semibold">
                    {summary.totalVolume > 0
                      ? `${formatCompactPrice(summary.totalVolume)}개`
                      : "-"}
                  </p>
                </div>
              </div>
            )}

            <div className="h-[280px]">
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart
                  data={chartData}
                  margin={{ top: 4, right: 8, left: 0, bottom: 0 }}
                >
                  <CartesianGrid
                    strokeDasharray="3 3"
                    stroke="var(--border)"
                    vertical={false}
                  />
                  <XAxis
                    dataKey="date"
                    fontSize={11}
                    tickLine={false}
                    axisLine={false}
                    tick={{ fill: "var(--muted-foreground)" }}
                    minTickGap={24}
                  />
                  <YAxis
                    fontSize={11}
                    tickLine={false}
                    axisLine={false}
                    tick={{ fill: "var(--muted-foreground)" }}
                    tickFormatter={formatCompactPrice}
                    width={44}
                    domain={["auto", "auto"]}
                  />
                  <Tooltip
                    content={<PriceTooltip mode={effectiveMode} />}
                    cursor={{ stroke: "var(--border)" }}
                  />
                  {effectiveMode === "box" && (
                    <Area
                      type="monotone"
                      dataKey="범위"
                      stroke="none"
                      fill={SERIES_COLOR}
                      fillOpacity={0.14}
                      activeDot={false}
                      connectNulls
                    />
                  )}
                  <Line
                    type="monotone"
                    dataKey={effectiveMode === "box" ? "평균가" : "kg당"}
                    stroke={SERIES_COLOR}
                    strokeWidth={2}
                    dot={chartData.length <= 45 ? { r: 2.5, strokeWidth: 0, fill: SERIES_COLOR } : false}
                    activeDot={{ r: 4 }}
                    connectNulls
                  />
                </ComposedChart>
              </ResponsiveContainer>
            </div>

            {hasVolume && (
              <div>
                <p className="text-[11px] text-muted-foreground mb-0.5 pl-1">거래량</p>
                <div className="h-[56px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart
                      data={chartData}
                      margin={{ top: 0, right: 8, left: 0, bottom: 0 }}
                    >
                      <XAxis dataKey="date" hide />
                      <YAxis hide width={44} />
                      <Tooltip
                        content={<VolumeTooltip />}
                        cursor={{ fill: "var(--muted)" }}
                      />
                      <Bar
                        dataKey="거래량"
                        fill={VOLUME_COLOR}
                        fillOpacity={0.7}
                        radius={[2, 2, 0, 0]}
                        maxBarSize={18}
                      />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>
            )}
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
  );
}
