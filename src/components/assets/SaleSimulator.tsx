"use client";

import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
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
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Loader2,
  Plus,
  Trash2,
  TrendingUp,
  Wallet,
  Target,
  BarChart3,
  ArrowRight,
} from "lucide-react";
import { formatLargeNumber, formatPercent } from "@/lib/utils/format";
import { toast } from "sonner";

interface SaleAsset {
  id: string;
  name: string;
  propertyType: "HOUSE" | "COMMERCIAL" | "LAND" | "OFFICETEL_RESIDENTIAL";
  purchasePrice: number;
  currentPrice: number;
  acquisitionExpenses: number;
  holdingPeriodYears: number;
  isOnlyHouse: boolean;
  hasResided: boolean;
  ownershipShare: number;
}

interface SaleScenario {
  order: number;
  asset: {
    id: string;
    name: string;
    salePrice: number;
    netProceeds: number;
    taxResult: {
      capitalGain: number;
      totalTax: number;
      effectiveTaxRate: number;
    };
  };
  cumulativeNetProceeds: number;
  cumulativeTax: number;
}

interface SimulationResult {
  scenarios: SaleScenario[];
  totalNetProceeds: number;
  totalTax: number;
  totalTaxRate: number;
  totalCapitalGain: number;
}

interface OptimalResult {
  byNetProceeds: SimulationResult;
  byTaxEfficiency: SimulationResult;
  byTaxRate: SimulationResult;
  comparison: {
    maxNetProceeds: number;
    minNetProceeds: number;
    difference: number;
  };
}

const PROPERTY_TYPE_OPTIONS = [
  { value: "HOUSE", label: "주택" },
  { value: "OFFICETEL_RESIDENTIAL", label: "주거용 오피스텔" },
  { value: "COMMERCIAL", label: "상가" },
  { value: "LAND", label: "토지" },
];

export function SaleSimulator() {
  const [assets, setAssets] = useState<SaleAsset[]>([]);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<OptimalResult | null>(null);
  const [selectedStrategy, setSelectedStrategy] = useState<"byNetProceeds" | "byTaxEfficiency" | "byTaxRate">("byNetProceeds");

  // 자산 추가 다이얼로그
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [newAsset, setNewAsset] = useState<Partial<SaleAsset>>({
    propertyType: "HOUSE",
    ownershipShare: 100,
    isOnlyHouse: false,
    hasResided: false,
  });

  function handleAddAsset() {
    if (!newAsset.name || !newAsset.purchasePrice || !newAsset.currentPrice) {
      toast.error("필수 항목을 입력해주세요.");
      return;
    }

    const asset: SaleAsset = {
      id: crypto.randomUUID(),
      name: newAsset.name,
      propertyType: newAsset.propertyType as SaleAsset["propertyType"],
      purchasePrice: Number(newAsset.purchasePrice),
      currentPrice: Number(newAsset.currentPrice),
      acquisitionExpenses: Number(newAsset.acquisitionExpenses) || 0,
      holdingPeriodYears: Number(newAsset.holdingPeriodYears) || 0,
      isOnlyHouse: newAsset.isOnlyHouse || false,
      hasResided: newAsset.hasResided || false,
      ownershipShare: Number(newAsset.ownershipShare) || 100,
    };

    setAssets((prev) => [...prev, asset]);
    setNewAsset({
      propertyType: "HOUSE",
      ownershipShare: 100,
      isOnlyHouse: false,
      hasResided: false,
    });
    setIsAddDialogOpen(false);
    setResult(null);
    toast.success("자산이 추가되었습니다.");
  }

  function handleRemoveAsset(id: string) {
    setAssets((prev) => prev.filter((a) => a.id !== id));
    setResult(null);
  }

  async function handleSimulate() {
    if (assets.length === 0) {
      toast.error("최소 1개 이상의 자산을 추가해주세요.");
      return;
    }

    setLoading(true);
    setResult(null);

    try {
      const response = await fetch("/api/assets/sale-simulator", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          assets,
          mode: "optimal",
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        toast.error(data.error || "시뮬레이션 중 오류가 발생했습니다.");
        return;
      }

      setResult(data.result);
    } catch {
      toast.error("시뮬레이션 중 오류가 발생했습니다.");
    } finally {
      setLoading(false);
    }
  }

  const currentResult = result?.[selectedStrategy];

  return (
    <div className="space-y-6">
      {/* 자산 목록 */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <BarChart3 className="h-5 w-5" />
                매도 시뮬레이터
              </CardTitle>
              <CardDescription>
                보유 자산의 최적 매도 순서를 분석합니다.
              </CardDescription>
            </div>
            <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
              <DialogTrigger asChild>
                <Button>
                  <Plus className="mr-2 h-4 w-4" />
                  자산 추가
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-lg">
                <DialogHeader>
                  <DialogTitle>자산 추가</DialogTitle>
                  <DialogDescription>
                    시뮬레이션할 부동산 자산 정보를 입력하세요.
                  </DialogDescription>
                </DialogHeader>
                <div className="space-y-4 py-4">
                  <div className="space-y-2">
                    <Label>자산명</Label>
                    <Input
                      placeholder="예: 강남 아파트"
                      value={newAsset.name || ""}
                      onChange={(e) => setNewAsset((p) => ({ ...p, name: e.target.value }))}
                    />
                  </div>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="space-y-2">
                      <Label>취득가 (원)</Label>
                      <Input
                        type="number"
                        placeholder="500000000"
                        value={newAsset.purchasePrice || ""}
                        onChange={(e) => setNewAsset((p) => ({ ...p, purchasePrice: Number(e.target.value) }))}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>현재 시세 (원)</Label>
                      <Input
                        type="number"
                        placeholder="700000000"
                        value={newAsset.currentPrice || ""}
                        onChange={(e) => setNewAsset((p) => ({ ...p, currentPrice: Number(e.target.value) }))}
                      />
                    </div>
                  </div>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="space-y-2">
                      <Label>부동산 유형</Label>
                      <Select
                        value={newAsset.propertyType}
                        onValueChange={(v) => setNewAsset((p) => ({ ...p, propertyType: v as SaleAsset["propertyType"] }))}
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {PROPERTY_TYPE_OPTIONS.map((opt) => (
                            <SelectItem key={opt.value} value={opt.value}>
                              {opt.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label>보유기간 (년)</Label>
                      <Input
                        type="number"
                        placeholder="5"
                        value={newAsset.holdingPeriodYears || ""}
                        onChange={(e) => setNewAsset((p) => ({ ...p, holdingPeriodYears: Number(e.target.value) }))}
                      />
                    </div>
                  </div>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="space-y-2">
                      <Label>취득비용 (원)</Label>
                      <Input
                        type="number"
                        placeholder="취득세, 중개비 등"
                        value={newAsset.acquisitionExpenses || ""}
                        onChange={(e) => setNewAsset((p) => ({ ...p, acquisitionExpenses: Number(e.target.value) }))}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>지분율 (%)</Label>
                      <Input
                        type="number"
                        placeholder="100"
                        value={newAsset.ownershipShare || ""}
                        onChange={(e) => setNewAsset((p) => ({ ...p, ownershipShare: Number(e.target.value) }))}
                      />
                    </div>
                  </div>
                  {(newAsset.propertyType === "HOUSE" || newAsset.propertyType === "OFFICETEL_RESIDENTIAL") && (
                    <div className="space-y-3 p-3 bg-muted/50 rounded-lg">
                      <p className="text-sm font-medium">1주택 비과세 조건</p>
                      <div className="flex items-center gap-4">
                        <label className="flex items-center gap-2">
                          <input
                            type="checkbox"
                            checked={newAsset.isOnlyHouse || false}
                            onChange={(e) => setNewAsset((p) => ({ ...p, isOnlyHouse: e.target.checked }))}
                            className="rounded"
                          />
                          <span className="text-sm">1세대 1주택</span>
                        </label>
                        <label className="flex items-center gap-2">
                          <input
                            type="checkbox"
                            checked={newAsset.hasResided || false}
                            onChange={(e) => setNewAsset((p) => ({ ...p, hasResided: e.target.checked }))}
                            className="rounded"
                          />
                          <span className="text-sm">2년 이상 거주</span>
                        </label>
                      </div>
                    </div>
                  )}
                </div>
                <DialogFooter>
                  <Button variant="outline" onClick={() => setIsAddDialogOpen(false)}>
                    취소
                  </Button>
                  <Button onClick={handleAddAsset}>추가</Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </div>
        </CardHeader>
        <CardContent>
          {assets.length > 0 ? (
            <div className="space-y-4">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>자산명</TableHead>
                    <TableHead>유형</TableHead>
                    <TableHead className="text-right">취득가</TableHead>
                    <TableHead className="text-right">현재시세</TableHead>
                    <TableHead className="text-right">예상차익</TableHead>
                    <TableHead className="text-right">보유기간</TableHead>
                    <TableHead></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {assets.map((asset) => (
                    <TableRow key={asset.id}>
                      <TableCell className="font-medium">{asset.name}</TableCell>
                      <TableCell>
                        <Badge variant="outline">
                          {PROPERTY_TYPE_OPTIONS.find((o) => o.value === asset.propertyType)?.label}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        {formatLargeNumber(asset.purchasePrice)}
                      </TableCell>
                      <TableCell className="text-right">
                        {formatLargeNumber(asset.currentPrice)}
                      </TableCell>
                      <TableCell className="text-right text-green-600">
                        {formatLargeNumber(asset.currentPrice - asset.purchasePrice)}
                      </TableCell>
                      <TableCell className="text-right">{asset.holdingPeriodYears}년</TableCell>
                      <TableCell>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-red-500 hover:text-red-700"
                          onClick={() => handleRemoveAsset(asset.id)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>

              <div className="flex justify-end">
                <Button onClick={handleSimulate} disabled={loading} size="lg">
                  {loading ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <BarChart3 className="mr-2 h-4 w-4" />
                  )}
                  시뮬레이션 실행
                </Button>
              </div>
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <BarChart3 className="h-12 w-12 text-muted-foreground mb-4" />
              <p className="text-muted-foreground mb-4">
                시뮬레이션할 자산을 추가해주세요.
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* 시뮬레이션 결과 */}
      {result && (
        <>
          {/* 요약 비교 */}
          <div className="grid gap-4 md:grid-cols-4">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium flex items-center gap-2">
                  <TrendingUp className="h-4 w-4 text-green-500" />
                  최대 순수익
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-green-600">
                  {formatLargeNumber(result.comparison.maxNetProceeds)}
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium flex items-center gap-2">
                  <Wallet className="h-4 w-4 text-blue-500" />
                  최소 세금
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-blue-600">
                  {formatLargeNumber(result.byTaxEfficiency.totalTax)}
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium flex items-center gap-2">
                  <Target className="h-4 w-4 text-orange-500" />
                  최저 실효세율
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-orange-600">
                  {formatPercent(result.byTaxRate.totalTaxRate, 2)}
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium">순서별 차이</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">
                  {formatLargeNumber(result.comparison.difference)}
                </div>
              </CardContent>
            </Card>
          </div>

          {/* 전략 선택 및 상세 결과 */}
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle>최적 매도 순서</CardTitle>
                <Select
                  value={selectedStrategy}
                  onValueChange={(v) => setSelectedStrategy(v as typeof selectedStrategy)}
                >
                  <SelectTrigger className="w-[180px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="byNetProceeds">순수익 최대화</SelectItem>
                    <SelectItem value="byTaxEfficiency">세금 최소화</SelectItem>
                    <SelectItem value="byTaxRate">세율 최소화</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <CardDescription>
                {selectedStrategy === "byNetProceeds" && "세후 순수익이 가장 높은 매도 순서입니다."}
                {selectedStrategy === "byTaxEfficiency" && "총 납부 세금이 가장 낮은 매도 순서입니다."}
                {selectedStrategy === "byTaxRate" && "실효세율이 가장 낮은 매도 순서입니다."}
              </CardDescription>
            </CardHeader>
            <CardContent>
              {currentResult && (
                <div className="space-y-4">
                  <div className="flex items-center gap-2 flex-wrap">
                    {currentResult.scenarios.map((scenario, idx) => (
                      <div key={scenario.asset.id} className="flex items-center gap-2">
                        <Badge variant="secondary" className="text-sm py-1 px-3">
                          {scenario.order}. {scenario.asset.name}
                        </Badge>
                        {idx < currentResult.scenarios.length - 1 && (
                          <ArrowRight className="h-4 w-4 text-muted-foreground" />
                        )}
                      </div>
                    ))}
                  </div>

                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>순서</TableHead>
                        <TableHead>자산명</TableHead>
                        <TableHead className="text-right">매도가</TableHead>
                        <TableHead className="text-right">양도차익</TableHead>
                        <TableHead className="text-right">세금</TableHead>
                        <TableHead className="text-right">순수익</TableHead>
                        <TableHead className="text-right">누적 순수익</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {currentResult.scenarios.map((scenario) => (
                        <TableRow key={scenario.asset.id}>
                          <TableCell>
                            <Badge variant="outline">{scenario.order}</Badge>
                          </TableCell>
                          <TableCell className="font-medium">{scenario.asset.name}</TableCell>
                          <TableCell className="text-right">
                            {formatLargeNumber(scenario.asset.salePrice)}
                          </TableCell>
                          <TableCell className="text-right text-green-600">
                            {formatLargeNumber(scenario.asset.taxResult.capitalGain)}
                          </TableCell>
                          <TableCell className="text-right text-red-600">
                            {formatLargeNumber(scenario.asset.taxResult.totalTax)}
                          </TableCell>
                          <TableCell className="text-right text-blue-600">
                            {formatLargeNumber(scenario.asset.netProceeds)}
                          </TableCell>
                          <TableCell className="text-right font-medium">
                            {formatLargeNumber(scenario.cumulativeNetProceeds)}
                          </TableCell>
                        </TableRow>
                      ))}
                      <TableRow className="bg-muted/50 font-bold">
                        <TableCell colSpan={4}>합계</TableCell>
                        <TableCell className="text-right text-red-600">
                          {formatLargeNumber(currentResult.totalTax)}
                        </TableCell>
                        <TableCell className="text-right text-blue-600">
                          {formatLargeNumber(currentResult.totalNetProceeds)}
                        </TableCell>
                        <TableCell></TableCell>
                      </TableRow>
                    </TableBody>
                  </Table>

                  <div className="flex justify-end gap-4 text-sm text-muted-foreground">
                    <span>총 양도차익: {formatLargeNumber(currentResult.totalCapitalGain)}</span>
                    <span>실효세율: {formatPercent(currentResult.totalTaxRate, 2)}</span>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
