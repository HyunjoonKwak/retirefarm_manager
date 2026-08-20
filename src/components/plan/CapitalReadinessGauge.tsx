"use client";

/**
 * 자본 준비 게이지 (Asset Hub Integration §6)
 *
 * §2 스냅샷 합산값(portfolio_manager 투자 + asset_manager 부동산)을
 * 목표 자본(순설립비 + 초기 생활비 버퍼) 대비 게이지로 보여준다.
 * 읽기 전용 소비 — 자산 수동 입력 필드는 만들지 않는다 (§1.5 지배 원칙).
 * 값이 틀렸으면 소유 서비스에서 고친다.
 */

import { useState } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Gauge, RefreshCw, Loader2, AlertTriangle } from "lucide-react";
import { formatLargeNumber } from "@/lib/utils/format";
import { toast } from "sonner";

export interface CapitalReadinessData {
  totalKrw: number;
  sources: Array<{
    source: string;
    asOf: string;
    collectedAt: string;
    stale: boolean;
    asOfDaysAgo: number;
    subtotalKrw: number;
    items: Array<{ category: string; label: string; valueKrw: number }>;
  }>;
  configuredSourceCount: number;
  errors: string[];
  targetCapital: number;
  targetDate: string;
}

const SOURCE_LABELS: Record<string, string> = {
  portfolio_manager: "투자자산 (portfolio)",
  asset_manager: "부동산 (asset)",
};

interface Props {
  data: CapitalReadinessData;
  onRefreshed: () => void;
}

export function CapitalReadinessGauge({ data, onRefreshed }: Props) {
  const [refreshing, setRefreshing] = useState(false);

  const coverage =
    data.targetCapital > 0
      ? Math.min(100, Math.round((data.totalKrw / data.targetCapital) * 100))
      : 0;
  const remainingMonths = Math.max(
    0,
    Math.ceil(
      (new Date(data.targetDate).getTime() - Date.now()) /
        (30.44 * 24 * 60 * 60 * 1000)
    )
  );

  async function handleRefresh() {
    setRefreshing(true);
    try {
      const response = await fetch("/api/assets/snapshot-summary", {
        method: "POST",
      });
      const result = await response.json();
      if (!response.ok || !result.success) {
        throw new Error(result.error || "갱신 실패");
      }
      const errors: string[] = result.data?.errors ?? [];
      if (errors.length > 0) {
        toast.warning(`일부 소스 갱신 실패: ${errors.join(" / ")}`);
      } else {
        toast.success("자산 스냅샷을 갱신했습니다.");
      }
      onRefreshed();
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "스냅샷 갱신 중 오류가 발생했습니다."
      );
    } finally {
      setRefreshing(false);
    }
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between space-y-0">
        <div>
          <CardTitle className="flex items-center gap-2">
            <Gauge className="h-5 w-5" />
            자본 준비 게이지
          </CardTitle>
          <CardDescription>
            연동 자산 스냅샷 합산 · 목표 자본 대비 (읽기 전용 — 값 수정은 각
            소유 서비스에서)
          </CardDescription>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={handleRefresh}
          disabled={refreshing}
        >
          {refreshing ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <RefreshCw className="h-4 w-4" />
          )}
          <span className="ml-1 hidden sm:inline">갱신</span>
        </Button>
      </CardHeader>
      <CardContent className="space-y-4">
        {data.configuredSourceCount === 0 ? (
          <p className="py-2 text-sm text-muted-foreground">
            연동된 스냅샷 소스가 없습니다. 서버 환경변수에 portfolio_manager /
            asset_manager 스냅샷 토큰을 설정하세요.
          </p>
        ) : (
          <>
            <div className="space-y-2">
              <div className="flex items-end justify-between">
                <div>
                  <p className="text-xs text-muted-foreground">현재 준비 자산</p>
                  <p className="text-2xl font-bold">
                    {formatLargeNumber(data.totalKrw)}
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-xs text-muted-foreground">
                    목표 자본 (순설립비 + 생활비 버퍼)
                  </p>
                  <p className="font-semibold">
                    {formatLargeNumber(data.targetCapital)}
                  </p>
                </div>
              </div>
              <Progress value={coverage} className="h-3" />
              <div className="flex justify-between text-xs text-muted-foreground">
                <span>{coverage}% 준비됨</span>
                <span>목표일까지 약 {remainingMonths}개월</span>
              </div>
            </div>

            {data.errors.length > 0 && (
              <div className="flex items-start gap-2 rounded-md border border-yellow-300 bg-yellow-50 p-2 text-xs text-yellow-800 dark:border-yellow-800 dark:bg-yellow-950 dark:text-yellow-200">
                <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                <span>
                  일부 소스 수집 실패 — 마지막 성공값으로 표시 중입니다.
                </span>
              </div>
            )}

            <div className="space-y-3">
              {data.sources.map((source) => (
                <div key={source.source} className="rounded-lg border p-3">
                  <div className="mb-2 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium">
                        {SOURCE_LABELS[source.source] ?? source.source}
                      </span>
                      {source.stale && (
                        <Badge variant="outline" className="text-yellow-600">
                          {source.asOfDaysAgo}일 전 기준
                        </Badge>
                      )}
                    </div>
                    <span className="font-semibold">
                      {formatLargeNumber(source.subtotalKrw)}
                    </span>
                  </div>
                  <div className="grid gap-1 text-xs text-muted-foreground sm:grid-cols-2">
                    {source.items.map((item) => (
                      <div
                        key={item.category}
                        className="flex justify-between gap-2"
                      >
                        <span>{item.label}</span>
                        <span>{formatLargeNumber(item.valueKrw)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
              {data.sources.length === 0 && (
                <p className="py-2 text-sm text-muted-foreground">
                  아직 수집된 스냅샷이 없습니다. 갱신 버튼을 눌러 첫 수집을
                  실행하세요.
                </p>
              )}
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
