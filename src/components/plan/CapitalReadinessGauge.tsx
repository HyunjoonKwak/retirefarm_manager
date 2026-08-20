"use client";

/**
 * 자본 준비 게이지 (Asset Hub Integration §2.4, §6)
 *
 * my_portal 허브 순자산(현금 + 투자 + 부동산 − 부채)을 목표 자본 대비 게이지로
 * 보여준다. 순자산은 허브가 계산한 `net_worth_krw`를 그대로 쓴다 — 여기서
 * 재합산하지 않는다 (§1.5 지배 원칙의 연장, 합산 로직도 SSOT는 my_portal).
 *
 * 스테일 판정도 허브 소관이라 `sources[].stale`을 그대로 표시만 한다.
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

interface AssetItem {
  category: string;
  label: string;
  value_krw: number;
  origin: string;
}

interface LiabilityItem {
  category: string;
  label: string;
  value_krw: number;
}

interface SourceStatus {
  source: string;
  as_of: string;
  stale: boolean;
  last_error?: string;
}

export interface CapitalReadinessData {
  netWorthKrw: number;
  asOf: string;
  collectedAt: string;
  assets: AssetItem[];
  liabilities: LiabilityItem[];
  sources: SourceStatus[];
  configured: boolean;
  errors: string[];
  targetCapital: number;
  targetDate: string;
}

const ORIGIN_LABELS: Record<string, string> = {
  my_portal: "포탈",
  portfolio_manager: "포트폴리오",
  asset_manager: "자산",
};

interface Props {
  data: CapitalReadinessData;
  onRefreshed: () => void;
}

export function CapitalReadinessGauge({ data, onRefreshed }: Props) {
  const [refreshing, setRefreshing] = useState(false);

  const coverage =
    data.targetCapital > 0
      ? Math.min(100, Math.round((data.netWorthKrw / data.targetCapital) * 100))
      : 0;
  const remainingMonths = Math.max(
    0,
    Math.ceil(
      (new Date(data.targetDate).getTime() - Date.now()) /
        (30.44 * 24 * 60 * 60 * 1000)
    )
  );

  const totalLiabilities = data.liabilities.reduce(
    (sum, l) => sum + l.value_krw,
    0
  );
  const staleSources = data.sources.filter((s) => s.stale);

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
        toast.warning(`순자산 갱신 실패: ${errors.join(" / ")}`);
      } else {
        toast.success("순자산을 갱신했습니다.");
      }
      onRefreshed();
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "갱신 중 오류가 발생했습니다."
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
            포탈 순자산(현금 + 투자 + 부동산 − 부채) 대비 목표 자본 (읽기 전용 —
            값 수정은 각 소유 서비스에서)
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
        {!data.configured ? (
          <p className="py-2 text-sm text-muted-foreground">
            포탈 순자산 연동이 설정되지 않았습니다. 서버 환경변수에 MY_PORTAL_URL과
            소비자 토큰을 설정하세요.
          </p>
        ) : !data.collectedAt ? (
          <p className="py-2 text-sm text-muted-foreground">
            아직 수집된 순자산이 없습니다. 갱신 버튼을 눌러 첫 수집을 실행하세요.
          </p>
        ) : (
          <>
            <div className="space-y-2">
              <div className="flex items-end justify-between">
                <div>
                  <p className="text-xs text-muted-foreground">현재 순자산</p>
                  <p className="text-2xl font-bold">
                    {formatLargeNumber(data.netWorthKrw)}
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
                <span>수집 실패 — 마지막 성공값으로 표시 중입니다.</span>
              </div>
            )}

            {staleSources.length > 0 && (
              <div className="flex flex-wrap items-center gap-1.5 text-xs">
                <span className="text-muted-foreground">오래된 소스:</span>
                {staleSources.map((source) => (
                  <Badge
                    key={source.source}
                    variant="outline"
                    className="text-yellow-600"
                    title={source.last_error ?? undefined}
                  >
                    {ORIGIN_LABELS[source.source] ?? source.source} ·{" "}
                    {source.as_of.slice(0, 10)} 기준
                  </Badge>
                ))}
              </div>
            )}

            {/* 자산 구성 */}
            <div className="space-y-2">
              <p className="text-sm font-medium">자산</p>
              <div className="grid gap-1 text-sm sm:grid-cols-2">
                {data.assets.map((asset) => (
                  <div
                    key={`${asset.origin}-${asset.category}`}
                    className="flex items-center justify-between gap-2"
                  >
                    <span className="flex items-center gap-1.5 text-muted-foreground">
                      {asset.label}
                      <Badge variant="secondary" className="text-[10px]">
                        {ORIGIN_LABELS[asset.origin] ?? asset.origin}
                      </Badge>
                    </span>
                    <span>{formatLargeNumber(asset.value_krw)}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* 부채 */}
            {data.liabilities.length > 0 && (
              <div className="space-y-2 border-t pt-3">
                <div className="flex justify-between text-sm font-medium">
                  <span>부채</span>
                  <span className="text-red-500">
                    −{formatLargeNumber(totalLiabilities)}
                  </span>
                </div>
                <div className="grid gap-1 text-sm sm:grid-cols-2">
                  {data.liabilities.map((liability) => (
                    <div
                      key={liability.category}
                      className="flex justify-between gap-2"
                    >
                      <span className="text-muted-foreground">
                        {liability.label}
                      </span>
                      <span className="text-red-500">
                        −{formatLargeNumber(liability.value_krw)}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
