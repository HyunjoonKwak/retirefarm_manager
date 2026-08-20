"use client";

/**
 * 매도 시뮬레이터 (Asset Hub Integration §1.5.3)
 *
 * 계산은 asset_manager 소유 — 이 컴포넌트는 원장(보유 물건)에서 대상을
 * 고르고 /api/assets/sale-simulator 프록시를 통해 결과만 표시한다.
 * 취득가·경비·보유기간·지분율은 asset_manager 원장에서 자동 반영된다.
 */

import { useState, useEffect, useCallback } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Switch } from "@/components/ui/switch";
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
import { Loader2, TrendingUp, Target, BarChart3, Building2 } from "lucide-react";
import { formatLargeNumber, formatPercent } from "@/lib/utils/format";
import { toast } from "sonner";

interface ExternalAsset {
  id: string;
  propertyType: string;
  propertyName: string;
  address: string;
  purchasePrice: string;
  currentPrice: string;
}

interface ScenarioAsset {
  id: string;
  name: string;
  salePrice: string;
  netProceeds: string;
  taxResult: {
    capitalGain: string;
    totalTax: string;
    effectiveTaxRate: number;
  };
}

interface SimulationResult {
  scenarios: Array<{
    order: number;
    asset: ScenarioAsset;
    cumulativeNetProceeds: string;
    cumulativeTax: string;
  }>;
  totalNetProceeds: string;
  totalTax: string;
  totalTaxRate: number;
  totalCapitalGain: string;
}

interface SimulationResponse {
  assumptions: { isOnlyHouse: boolean; hasResided: boolean; assetCount: number };
  preview: ScenarioAsset[];
  optimalOrder: {
    byNetProceeds: SimulationResult;
    byTaxEfficiency: SimulationResult;
    byTaxRate: SimulationResult;
    comparison: {
      maxNetProceeds: string;
      minNetProceeds: string;
      difference: string;
    };
  };
  minimumSalesForTarget: {
    assets: ScenarioAsset[];
    totalNetProceeds: string;
    shortfall: string;
  } | null;
}

type Strategy = "byNetProceeds" | "byTaxEfficiency" | "byTaxRate";

const STRATEGY_OPTIONS: Array<{ value: Strategy; label: string }> = [
  { value: "byNetProceeds", label: "순수익 최대화" },
  { value: "byTaxEfficiency", label: "세금 효율 우선" },
  { value: "byTaxRate", label: "낮은 세율 우선" },
];

export function SaleSimulator() {
  const [externalAssets, setExternalAssets] = useState<ExternalAsset[]>([]);
  const [loadingAssets, setLoadingAssets] = useState(true);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [priceOverrides, setPriceOverrides] = useState<Record<string, string>>({});
  const [targetAmount, setTargetAmount] = useState("");
  const [onlyHouseExemption, setOnlyHouseExemption] = useState(false);
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<SimulationResponse | null>(null);
  const [strategy, setStrategy] = useState<Strategy>("byNetProceeds");

  const fetchAssets = useCallback(async () => {
    setLoadingAssets(true);
    try {
      const response = await fetch("/api/assets/external?tradeType=OWNED");
      if (!response.ok) throw new Error("자산 목록 조회 실패");
      const data = await response.json();
      const assets: ExternalAsset[] = data.assets || [];
      setExternalAssets(assets);
      setSelectedIds(new Set(assets.map((a) => a.id)));
    } catch {
      toast.error("보유 물건을 불러오지 못했습니다.");
    } finally {
      setLoadingAssets(false);
    }
  }, []);

  useEffect(() => {
    fetchAssets();
  }, [fetchAssets]);

  function toggleAsset(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }

  function handleOverrideChange(id: string, value: string) {
    const digits = value.replace(/[^0-9]/g, "");
    setPriceOverrides((prev) => {
      if (!digits) {
        return Object.fromEntries(
          Object.entries(prev).filter(([key]) => key !== id)
        );
      }
      return { ...prev, [id]: digits };
    });
  }

  async function runSimulation() {
    if (selectedIds.size === 0) {
      toast.error("시뮬레이션할 물건을 선택하세요.");
      return;
    }

    setRunning(true);
    try {
      const overrides = Object.fromEntries(
        Object.entries(priceOverrides).filter(([id]) => selectedIds.has(id))
      );
      const response = await fetch("/api/assets/sale-simulator", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          portfolioIds: [...selectedIds],
          ...(targetAmount ? { targetAmount } : {}),
          ...(Object.keys(overrides).length > 0
            ? { salePriceOverrides: overrides }
            : {}),
          ...(onlyHouseExemption
            ? { assumptions: { isOnlyHouse: true, hasResided: true } }
            : {}),
        }),
      });
      const data = await response.json();
      if (!response.ok || !data.success) {
        throw new Error(data.error || "시뮬레이션 실패");
      }
      setResult(data.data as SimulationResponse);
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "시뮬레이션 중 오류가 발생했습니다."
      );
    } finally {
      setRunning(false);
    }
  }

  const activeResult = result?.optimalOrder[strategy];

  return (
    <div className="space-y-6">
      {/* 대상 선택 */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Building2 className="h-4 w-4" />
            시뮬레이션 대상 (asset_manager 보유 물건)
          </CardTitle>
          <CardDescription>
            취득가·필요경비·보유기간·지분율·임대사업자 정보는 asset_manager 원장에서
            자동 반영됩니다. 매도 희망가를 비우면 현재 시세로 계산합니다.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {loadingAssets ? (
            <div className="flex items-center gap-2 py-6 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> 보유 물건 불러오는 중...
            </div>
          ) : externalAssets.length === 0 ? (
            <p className="py-6 text-sm text-muted-foreground">
              연동된 보유 물건이 없습니다. asset_manager에서 물건을 등록하세요.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-10" />
                    <TableHead>물건</TableHead>
                    <TableHead className="text-right">현재 시세</TableHead>
                    <TableHead className="w-44 text-right">매도 희망가 (원)</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {externalAssets.map((asset) => (
                    <TableRow key={asset.id}>
                      <TableCell>
                        <Checkbox
                          checked={selectedIds.has(asset.id)}
                          onCheckedChange={() => toggleAsset(asset.id)}
                          aria-label={`${asset.propertyName} 선택`}
                        />
                      </TableCell>
                      <TableCell>
                        <div className="font-medium">{asset.propertyName}</div>
                        <div className="text-xs text-muted-foreground">
                          {asset.address}
                        </div>
                      </TableCell>
                      <TableCell className="text-right">
                        {formatLargeNumber(asset.currentPrice)}
                      </TableCell>
                      <TableCell>
                        <Input
                          inputMode="numeric"
                          placeholder="시세로 계산"
                          value={priceOverrides[asset.id] ?? ""}
                          onChange={(e) =>
                            handleOverrideChange(asset.id, e.target.value)
                          }
                          className="text-right"
                          disabled={!selectedIds.has(asset.id)}
                        />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}

          <div className="flex flex-col gap-4 sm:flex-row sm:items-end">
            <div className="flex-1 space-y-2">
              <Label htmlFor="target-amount">목표 금액 (원, 선택)</Label>
              <Input
                id="target-amount"
                inputMode="numeric"
                placeholder="예: 500000000"
                value={targetAmount}
                onChange={(e) => setTargetAmount(e.target.value.replace(/[^0-9]/g, ""))}
              />
            </div>
            <div className="flex items-center gap-2 pb-2">
              <Switch
                id="only-house"
                checked={onlyHouseExemption}
                onCheckedChange={setOnlyHouseExemption}
              />
              <Label htmlFor="only-house" className="text-sm">
                1세대 1주택 비과세 가정 (2년 거주 충족)
              </Label>
            </div>
            <Button onClick={runSimulation} disabled={running || loadingAssets}>
              {running ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <BarChart3 className="mr-2 h-4 w-4" />
              )}
              시뮬레이션 실행
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* 물건별 프리뷰 */}
      {result && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <TrendingUp className="h-4 w-4" />
              물건별 매도 프리뷰
            </CardTitle>
            <CardDescription>
              가정: {result.assumptions.isOnlyHouse ? "1세대 1주택" : "다주택/일반"} ·{" "}
              {result.assumptions.hasResided ? "거주 요건 충족" : "거주 요건 미충족"}
            </CardDescription>
          </CardHeader>
          <CardContent className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>물건</TableHead>
                  <TableHead className="text-right">매도가</TableHead>
                  <TableHead className="text-right">양도차익</TableHead>
                  <TableHead className="text-right">총 세액</TableHead>
                  <TableHead className="text-right">실효세율</TableHead>
                  <TableHead className="text-right">세후 순수익</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {result.preview.map((asset) => (
                  <TableRow key={asset.id}>
                    <TableCell className="font-medium">{asset.name}</TableCell>
                    <TableCell className="text-right">
                      {formatLargeNumber(asset.salePrice)}
                    </TableCell>
                    <TableCell className="text-right">
                      {formatLargeNumber(asset.taxResult.capitalGain)}
                    </TableCell>
                    <TableCell className="text-right text-red-500">
                      {formatLargeNumber(asset.taxResult.totalTax)}
                    </TableCell>
                    <TableCell className="text-right">
                      {formatPercent(asset.taxResult.effectiveTaxRate)}
                    </TableCell>
                    <TableCell className="text-right font-medium">
                      {formatLargeNumber(asset.netProceeds)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {/* 최적 매도 순서 */}
      {result && activeResult && (
        <Card>
          <CardHeader>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <CardTitle className="flex items-center gap-2 text-base">
                  <BarChart3 className="h-4 w-4" />
                  최적 매도 순서
                </CardTitle>
                <CardDescription>
                  전략 간 순수익 차이:{" "}
                  {formatLargeNumber(result.optimalOrder.comparison.difference)}
                </CardDescription>
              </div>
              <Select
                value={strategy}
                onValueChange={(v) => setStrategy(v as Strategy)}
              >
                <SelectTrigger className="w-44">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {STRATEGY_OPTIONS.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
              <div>
                <p className="text-xs text-muted-foreground">총 순수익</p>
                <p className="font-semibold">
                  {formatLargeNumber(activeResult.totalNetProceeds)}
                </p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">총 세액</p>
                <p className="font-semibold text-red-500">
                  {formatLargeNumber(activeResult.totalTax)}
                </p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">총 양도차익</p>
                <p className="font-semibold">
                  {formatLargeNumber(activeResult.totalCapitalGain)}
                </p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">총 세율</p>
                <p className="font-semibold">
                  {formatPercent(activeResult.totalTaxRate)}
                </p>
              </div>
            </div>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-14">순서</TableHead>
                    <TableHead>물건</TableHead>
                    <TableHead className="text-right">순수익</TableHead>
                    <TableHead className="text-right">누적 순수익</TableHead>
                    <TableHead className="text-right">누적 세액</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {activeResult.scenarios.map((scenario) => (
                    <TableRow key={scenario.asset.id}>
                      <TableCell>
                        <Badge variant="outline">{scenario.order}</Badge>
                      </TableCell>
                      <TableCell className="font-medium">
                        {scenario.asset.name}
                      </TableCell>
                      <TableCell className="text-right">
                        {formatLargeNumber(scenario.asset.netProceeds)}
                      </TableCell>
                      <TableCell className="text-right">
                        {formatLargeNumber(scenario.cumulativeNetProceeds)}
                      </TableCell>
                      <TableCell className="text-right text-red-500">
                        {formatLargeNumber(scenario.cumulativeTax)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      )}

      {/* 목표 금액 분석 */}
      {result?.minimumSalesForTarget && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Target className="h-4 w-4" />
              목표 금액 달성 분석
            </CardTitle>
            <CardDescription>
              {Number(result.minimumSalesForTarget.shortfall) > 0
                ? `전량 매도해도 ${formatLargeNumber(result.minimumSalesForTarget.shortfall)} 부족합니다.`
                : `${result.minimumSalesForTarget.assets.length}건 매도로 목표를 달성합니다.`}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="mb-3 text-sm">
              달성 순수익:{" "}
              <span className="font-semibold">
                {formatLargeNumber(result.minimumSalesForTarget.totalNetProceeds)}
              </span>
            </div>
            <ul className="space-y-1 text-sm">
              {result.minimumSalesForTarget.assets.map((asset, index) => (
                <li key={asset.id} className="flex justify-between">
                  <span>
                    {index + 1}. {asset.name}
                  </span>
                  <span>{formatLargeNumber(asset.netProceeds)}</span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
