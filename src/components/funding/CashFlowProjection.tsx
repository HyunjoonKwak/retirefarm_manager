"use client";

import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Loader2,
  TrendingUp,
  TrendingDown,
  ArrowUpDown,
  Calculator,
  AlertTriangle,
  CheckCircle,
} from "lucide-react";
import { formatLargeNumber } from "@/lib/utils/format";
import { toast } from "sonner";

interface MonthlyProjection {
  month: string;
  year: number;
  monthNum: number;
  inflows: { type: string; amount: number }[];
  outflows: { type: string; amount: number }[];
  totalInflow: number;
  totalOutflow: number;
  netCashFlow: number;
  cumulativeCashFlow: number;
}

// 서버가 설립비/자금원을 어떻게 배치했는지 (리뷰 A2)
interface ProjectionAssumptions {
  projectionStartMonth: string;
  setupCosts: {
    fallbackMonth: string;
    fallbackReason: "farmStartDate" | "projectionStart";
    undatedCount: number;
    overdueCount: number;
    paidCount: number;
    paidAmount: number;
    scheduledAmount: number;
  };
  pastFunding: { count: number; amount: string };
}

interface ProjectionResult {
  projections: MonthlyProjection[];
  summary: {
    totalInflow: number;
    totalOutflow: number;
    netCashFlow: number;
    lowestPoint: { month: string; amount: number };
    highestPoint: { month: string; amount: number };
    breakEvenMonth?: string;
  };
}

export function CashFlowProjection() {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<ProjectionResult | null>(null);
  const [assumptions, setAssumptions] = useState<ProjectionAssumptions | null>(null);

  // 입력값
  const [monthlyOperatingCosts, setMonthlyOperatingCosts] = useState("");
  const [monthlyFarmIncome, setMonthlyFarmIncome] = useState("");
  const [farmStartDate, setFarmStartDate] = useState("");
  const [monthlyLivingExpense, setMonthlyLivingExpense] = useState("");
  const [initialCash, setInitialCash] = useState("");
  const [projectionMonths, setProjectionMonths] = useState("24");

  async function handleGenerate() {
    setLoading(true);
    setResult(null);
    setAssumptions(null);

    try {
      const response = await fetch("/api/funding/cash-flow", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          monthlyOperatingCosts: Number(monthlyOperatingCosts) || 0,
          monthlyFarmIncome: Number(monthlyFarmIncome) || 0,
          farmStartDate: farmStartDate || undefined,
          monthlyLivingExpense: Number(monthlyLivingExpense) || 0,
          initialCash: Number(initialCash) || 0,
          projectionMonths: Number(projectionMonths) || 24,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        toast.error(data.error || "예측 생성 중 오류가 발생했습니다.");
        return;
      }

      setResult(data.result);
      setAssumptions(data.assumptions ?? null);
    } catch {
      toast.error("예측 생성 중 오류가 발생했습니다.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-6">
      {/* 입력 폼 */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Calculator className="h-5 w-5" />
            현금흐름 예측
          </CardTitle>
          <CardDescription>
            자금 조달 계획과 설립 비용을 기반으로 현금흐름을 예측합니다.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <div className="space-y-2">
              <Label htmlFor="initialCash">현재 보유 현금 (원)</Label>
              <Input
                id="initialCash"
                type="number"
                placeholder="0"
                value={initialCash}
                onChange={(e) => setInitialCash(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="monthlyLivingExpense">월 생활비 (원)</Label>
              <Input
                id="monthlyLivingExpense"
                type="number"
                placeholder="3000000"
                value={monthlyLivingExpense}
                onChange={(e) => setMonthlyLivingExpense(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="monthlyOperatingCosts">월 운영비 (원)</Label>
              <Input
                id="monthlyOperatingCosts"
                type="number"
                placeholder="영농 시작 후 매월 비용"
                value={monthlyOperatingCosts}
                onChange={(e) => setMonthlyOperatingCosts(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="farmStartDate">영농 시작 예정일</Label>
              <Input
                id="farmStartDate"
                type="date"
                value={farmStartDate}
                onChange={(e) => setFarmStartDate(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="monthlyFarmIncome">월 예상 영농 수입 (원)</Label>
              <Input
                id="monthlyFarmIncome"
                type="number"
                placeholder="영농 시작 후 예상 수입"
                value={monthlyFarmIncome}
                onChange={(e) => setMonthlyFarmIncome(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="projectionMonths">예측 기간 (개월)</Label>
              <Input
                id="projectionMonths"
                type="number"
                placeholder="24"
                value={projectionMonths}
                onChange={(e) => setProjectionMonths(e.target.value)}
              />
            </div>
          </div>

          <Button onClick={handleGenerate} disabled={loading} className="w-full sm:w-auto">
            {loading ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <ArrowUpDown className="mr-2 h-4 w-4" />
            )}
            예측 생성
          </Button>
        </CardContent>
      </Card>

      {/* 결과 표시 */}
      {result && (
        <>
          {/* 요약 카드 */}
          <div className="grid gap-4 md:grid-cols-4">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium flex items-center gap-2">
                  <TrendingUp className="h-4 w-4 text-green-500" />
                  총 자금 유입
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-green-600">
                  {formatLargeNumber(result.summary.totalInflow)}
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium flex items-center gap-2">
                  <TrendingDown className="h-4 w-4 text-red-500" />
                  총 자금 유출
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-red-600">
                  {formatLargeNumber(result.summary.totalOutflow)}
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium flex items-center gap-2">
                  <AlertTriangle className="h-4 w-4 text-orange-500" />
                  최저점
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className={`text-2xl font-bold ${result.summary.lowestPoint.amount < 0 ? "text-red-600" : "text-gray-600"}`}>
                  {formatLargeNumber(result.summary.lowestPoint.amount)}
                </div>
                <p className="text-xs text-muted-foreground">
                  {result.summary.lowestPoint.month}
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium flex items-center gap-2">
                  {result.summary.breakEvenMonth ? (
                    <CheckCircle className="h-4 w-4 text-green-500" />
                  ) : (
                    <AlertTriangle className="h-4 w-4 text-orange-500" />
                  )}
                  손익분기점
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">
                  {result.summary.breakEvenMonth || "-"}
                </div>
                {!result.summary.breakEvenMonth && (
                  <p className="text-xs text-muted-foreground">
                    예측 기간 내 도달 불가
                  </p>
                )}
              </CardContent>
            </Card>
          </div>

          {/* 배치 가정 안내 */}
          {assumptions && (
            <Card className="border-blue-200 bg-blue-50/50">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">예측에 적용한 가정</CardTitle>
              </CardHeader>
              <CardContent className="text-sm text-muted-foreground space-y-1">
                <p>
                  설립비 유출 {formatLargeNumber(assumptions.setupCosts.scheduledAmount)}은 각 항목의
                  지출 예정일 기준입니다.
                  {assumptions.setupCosts.undatedCount > 0 && (
                    <>
                      {" "}예정일이 없는 {assumptions.setupCosts.undatedCount}건은{" "}
                      {assumptions.setupCosts.fallbackMonth}
                      {assumptions.setupCosts.fallbackReason === "farmStartDate"
                        ? " (영농 시작 달)"
                        : " (예측 첫 달)"}
                      에 계상했습니다.
                    </>
                  )}
                  {assumptions.setupCosts.overdueCount > 0 && (
                    <>
                      {" "}예정일이 지났지만 미지출인 {assumptions.setupCosts.overdueCount}건은 예측 첫 달(
                      {assumptions.projectionStartMonth})에 계상했습니다.
                    </>
                  )}
                  {assumptions.setupCosts.paidCount > 0 && (
                    <>
                      {" "}지출 완료 {assumptions.setupCosts.paidCount}건(
                      {formatLargeNumber(assumptions.setupCosts.paidAmount)})은 제외했습니다.
                    </>
                  )}
                </p>
                {assumptions.pastFunding.count > 0 && (
                  <p>
                    예정일이 예측 시작 이전인 자금원 {assumptions.pastFunding.count}건(
                    {formatLargeNumber(assumptions.pastFunding.amount)})은 포함하지 않았습니다.
                    이미 받은 돈이라면 &quot;현재 보유 현금&quot;에 반영해 주세요.
                  </p>
                )}
              </CardContent>
            </Card>
          )}

          {/* 월별 상세 테이블 */}
          <Card>
            <CardHeader>
              <CardTitle>월별 현금흐름</CardTitle>
              <CardDescription>
                {projectionMonths}개월간 예상 현금흐름입니다.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>월</TableHead>
                      <TableHead className="text-right">유입</TableHead>
                      <TableHead className="text-right">유출</TableHead>
                      <TableHead className="text-right">순현금흐름</TableHead>
                      <TableHead className="text-right">누적</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {result.projections.map((projection) => (
                      <TableRow
                        key={projection.month}
                        className={projection.cumulativeCashFlow < 0 ? "bg-red-50" : ""}
                      >
                        <TableCell className="font-medium">
                          {projection.year}년 {projection.monthNum}월
                        </TableCell>
                        <TableCell className="text-right text-green-600">
                          {projection.totalInflow > 0 ? formatLargeNumber(projection.totalInflow) : "-"}
                        </TableCell>
                        <TableCell className="text-right text-red-600">
                          {projection.totalOutflow > 0 ? formatLargeNumber(projection.totalOutflow) : "-"}
                        </TableCell>
                        <TableCell className={`text-right ${projection.netCashFlow >= 0 ? "text-green-600" : "text-red-600"}`}>
                          {formatLargeNumber(projection.netCashFlow)}
                        </TableCell>
                        <TableCell className={`text-right font-medium ${projection.cumulativeCashFlow >= 0 ? "text-blue-600" : "text-red-600"}`}>
                          {formatLargeNumber(projection.cumulativeCashFlow)}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>

          {/* 경고 메시지 */}
          {result.summary.lowestPoint.amount < 0 && (
            <Card className="border-orange-200 bg-orange-50">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center gap-2 text-orange-800">
                  <AlertTriangle className="h-4 w-4" />
                  자금 부족 경고
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-orange-700">
                  {result.summary.lowestPoint.month}에 현금 잔고가{" "}
                  <strong>{formatLargeNumber(Math.abs(result.summary.lowestPoint.amount))}</strong> 부족할 것으로 예상됩니다.
                  추가 자금 조달 또는 지출 조정이 필요합니다.
                </p>
              </CardContent>
            </Card>
          )}
        </>
      )}
    </div>
  );
}
