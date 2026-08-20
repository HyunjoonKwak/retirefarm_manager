"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import {
  Calendar,
  Wallet,
  Calculator,
  TrendingUp,
  Building2,
  Loader2,
  ChevronRight,
  Target,
  PiggyBank,
  AlertCircle,
  X,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { formatLargeNumber, formatDate, calculateDDay } from "@/lib/utils/format";
import { RetirementGoalForm } from "./RetirementGoalForm";
import { FundingTimeline } from "./FundingTimeline";
import { FundingTimelineVisual } from "./FundingTimelineVisual";
import {
  CapitalReadinessGauge,
  type CapitalReadinessData,
} from "./CapitalReadinessGauge";

interface PlanData {
  goal: {
    id: string;
    targetDate: string;
    estimatedRetirementPay: string | null;
    estimatedSeverancePay: string | null;
    monthlyLivingExpense: string | null;
    bufferMonths: number | null;
  };
  summary: {
    targetDate: string;
    daysRemaining: number;
    monthsRemaining: number;
    yearsRemaining: number;
    estimatedRetirementPay: number;
    estimatedSeverancePay: number;
    totalRetirementFunds: number;
    totalSetupCost: number;
    totalSubsidyAmount: number;
    netSetupCost: number;
    totalFundingPlanned: number;
    totalFundingSecured: number;
    fundingGap: number;
    fundingProgress: number;
    bufferMonths: number;
    monthlyLivingExpense: number;
    initialLivingBuffer: number;
    totalRequiredFunds: number;
    readinessScore: number;
  };
  setupCosts: {
    total: number;
    totalAmount: number;
    totalSubsidy: number;
    items: Array<{
      id: string;
      category: string;
      subcategory: string;
      name: string;
      estimatedCost: string;
      subsidyAmount: string | null;
      notes: string | null;
    }>;
  };
  fundingSources: {
    total: number;
    totalAmount: number;
    items: Array<{
      id: string;
      type: string;
      name: string;
      amount: string;
      expectedDate: string;
      status: string;
    }>;
  };
  externalAssets: {
    totalAssets: number;
    totalValue: string;
    totalLoanAmount: string;
    netValue: string;
  } | null;
  expectedProceeds: {
    assets: Array<{
      id: string;
      propertyName: string;
      expectedSaleDate: string;
      expectedSalePrice: string;
      estimatedTax: string;
      estimatedNetProceeds: string;
      loanPayoff: string;
    }>;
    totalExpectedProceeds: string;
  } | null;
  capitalReadiness: CapitalReadinessData | null;
}

export function SmartFarmPlanDashboard() {
  const [data, setData] = useState<PlanData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showGoalForm, setShowGoalForm] = useState(false);
  const [showFundingDialog, setShowFundingDialog] = useState(false);
  const [showSetupCostDialog, setShowSetupCostDialog] = useState(false);

  const fetchData = async () => {
    try {
      setLoading(true);
      const response = await fetch("/api/plan");
      if (response.status === 404) {
        setError("not_set");
        return;
      }
      if (!response.ok) {
        throw new Error("Failed to fetch plan");
      }
      const result = await response.json();
      setData(result);
      setError(null);
    } catch (err) {
      console.error(err);
      setError("error");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const handleGoalSaved = () => {
    setShowGoalForm(false);
    fetchData();
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (error === "not_set" || showGoalForm) {
    return (
      <RetirementGoalForm
        initialData={data?.goal}
        onSave={handleGoalSaved}
        onCancel={data ? () => setShowGoalForm(false) : undefined}
      />
    );
  }

  if (error || !data) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-12">
          <p className="text-muted-foreground">데이터를 불러올 수 없습니다.</p>
        </CardContent>
      </Card>
    );
  }

  const { summary, setupCosts, fundingSources, externalAssets, expectedProceeds } = data;
  const dDay = calculateDDay(summary.targetDate);

  // 준비도 점수에 따른 색상
  const getScoreColor = (score: number) => {
    if (score >= 80) return "text-green-600";
    if (score >= 50) return "text-yellow-600";
    return "text-red-600";
  };

  const getScoreBadge = (score: number) => {
    if (score >= 80) return { label: "준비 완료", variant: "default" as const };
    if (score >= 50) return { label: "진행 중", variant: "secondary" as const };
    return { label: "준비 필요", variant: "destructive" as const };
  };

  const scoreBadge = getScoreBadge(summary.readinessScore);

  return (
    <div className="space-y-6">
      {/* 요약 카드 */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">퇴직 목표일</CardTitle>
            <Calendar className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatDate(summary.targetDate)}</div>
            <p className={`text-xs ${dDay.isOverdue ? "text-red-500" : "text-muted-foreground"}`}>
              {dDay.text}
            </p>
          </CardContent>
        </Card>

        <Card
          className="cursor-pointer hover:shadow-md transition-shadow"
          onClick={() => setShowFundingDialog(true)}
        >
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">확보계획자금</CardTitle>
            <PiggyBank className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {summary.totalFundingPlanned > 0
                ? formatLargeNumber(summary.totalFundingPlanned)
                : "-"}
            </div>
            <p className="text-xs text-muted-foreground">
              {fundingSources.total}개 항목 · 클릭하여 상세보기
            </p>
          </CardContent>
        </Card>

        <Card
          className="cursor-pointer hover:shadow-md transition-shadow"
          onClick={() => setShowSetupCostDialog(true)}
        >
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">필요 설립비용</CardTitle>
            <Calculator className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {summary.netSetupCost > 0 ? formatLargeNumber(summary.netSetupCost) : "-"}
            </div>
            <p className="text-xs text-muted-foreground">
              {setupCosts.total}개 항목 · 클릭하여 상세보기
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">준비 점수</CardTitle>
            <Target className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-2">
              <span className={`text-2xl font-bold ${getScoreColor(summary.readinessScore)}`}>
                {summary.readinessScore}점
              </span>
              <Badge variant={scoreBadge.variant}>{scoreBadge.label}</Badge>
            </div>
            <Progress value={summary.readinessScore} className="mt-2" />
          </CardContent>
        </Card>
      </div>

      {/* 자본 준비 게이지 — 스냅샷 합산 vs 목표 자본 (Asset Hub §6) */}
      {data.capitalReadiness && (
        <CapitalReadinessGauge
          data={data.capitalReadiness}
          onRefreshed={fetchData}
        />
      )}

      {/* 자금 조달 현황 - 시각적 타임라인 */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Wallet className="h-5 w-5" />
              자금 조달 현황
            </CardTitle>
            <CardDescription>
              오늘부터 퇴직 목표일까지의 자금 유입 계획
            </CardDescription>
          </div>
          <Button variant="outline" size="sm" asChild>
            <Link href="/setup?tab=funding">
              자금 조달 관리 <ChevronRight className="ml-1 h-4 w-4" />
            </Link>
          </Button>
        </CardHeader>
        <CardContent>
          <FundingTimelineVisual
            fundingSources={fundingSources.items}
            targetDate={summary.targetDate}
            totalRequired={summary.totalRequiredFunds}
            totalPlanned={summary.totalFundingPlanned}
          />
        </CardContent>
      </Card>

      {/* 필요 자금 상세 & 외부 자산 */}
      <div className="grid gap-4 md:grid-cols-2">
        {/* 필요 자금 상세 */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Calculator className="h-5 w-5" />
              필요 자금 상세
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-3">
              <div className="flex justify-between items-center p-3 bg-muted rounded-lg">
                <div>
                  <p className="text-sm font-medium">설립 비용</p>
                  <p className="text-xs text-muted-foreground">보조금 차감 후</p>
                </div>
                <p className="font-bold">{formatLargeNumber(summary.netSetupCost)}</p>
              </div>
              <div className="flex justify-between items-center p-3 bg-muted rounded-lg">
                <div>
                  <p className="text-sm font-medium">초기 생활비 버퍼</p>
                  <p className="text-xs text-muted-foreground">{summary.bufferMonths}개월 × {formatLargeNumber(summary.monthlyLivingExpense)}</p>
                </div>
                <p className="font-bold">{formatLargeNumber(summary.initialLivingBuffer)}</p>
              </div>
              <div className="flex justify-between items-center p-3 bg-primary/10 rounded-lg border-2 border-primary/20">
                <p className="font-medium">총 필요 자금</p>
                <p className="text-xl font-bold text-primary">{formatLargeNumber(summary.totalRequiredFunds)}</p>
              </div>
            </div>

            {/* 진행률 바 */}
            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span>확보 진행률</span>
                <span className="font-medium">{summary.fundingProgress}%</span>
              </div>
              <Progress value={summary.fundingProgress} className="h-2" />
            </div>
          </CardContent>
        </Card>

        {/* 외부 포트폴리오 */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Building2 className="h-5 w-5" />
                부동산 자산 현황
              </CardTitle>
              <CardDescription>외부 포트폴리오 연동</CardDescription>
            </div>
            <Button variant="outline" size="sm" asChild>
              <Link href="/assets">
                자세히 보기 <ChevronRight className="ml-1 h-4 w-4" />
              </Link>
            </Button>
          </CardHeader>
          <CardContent>
            {externalAssets ? (
              <div className="space-y-3">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">보유 자산</span>
                  <span className="font-medium">{externalAssets.totalAssets}건</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">총 자산 가치</span>
                  <span className="font-medium">{formatLargeNumber(externalAssets.totalValue)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">총 대출금</span>
                  <span className="font-medium text-red-500">
                    -{formatLargeNumber(externalAssets.totalLoanAmount)}
                  </span>
                </div>
                <div className="flex justify-between border-t pt-3">
                  <span className="font-medium">순자산</span>
                  <span className="font-bold text-primary">
                    {formatLargeNumber(externalAssets.netValue)}
                  </span>
                </div>
                {expectedProceeds && expectedProceeds.assets.length > 0 && (
                  <div className="mt-3 p-3 bg-blue-50 rounded-lg">
                    <p className="text-xs text-blue-600 mb-1">매도 예정 순수익</p>
                    <p className="font-bold text-blue-700">
                      {formatLargeNumber(expectedProceeds.totalExpectedProceeds)}
                    </p>
                  </div>
                )}
              </div>
            ) : (
              <div className="text-center py-4">
                <p className="text-muted-foreground text-sm">
                  외부 포트폴리오에 연결되어 있지 않습니다.
                </p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* 빠른 링크 */}
      <div className="grid gap-4 md:grid-cols-3">
        <Card className="hover:shadow-md transition-shadow">
          <Link href="/setup">
            <CardContent className="flex items-center gap-4 py-6">
              <Calculator className="h-8 w-8 text-primary" />
              <div>
                <p className="font-medium">설립 비용 관리</p>
                <p className="text-sm text-muted-foreground">
                  {setupCosts.total}개 항목, {formatLargeNumber(setupCosts.totalAmount)}
                </p>
              </div>
              <ChevronRight className="ml-auto h-5 w-5 text-muted-foreground" />
            </CardContent>
          </Link>
        </Card>

        <Card className="hover:shadow-md transition-shadow">
          <Link href="/setup?tab=funding">
            <CardContent className="flex items-center gap-4 py-6">
              <Wallet className="h-8 w-8 text-primary" />
              <div>
                <p className="font-medium">자금 조달 관리</p>
                <p className="text-sm text-muted-foreground">
                  {fundingSources.total}개 항목, {formatLargeNumber(fundingSources.totalAmount)}
                </p>
              </div>
              <ChevronRight className="ml-auto h-5 w-5 text-muted-foreground" />
            </CardContent>
          </Link>
        </Card>

        <Card className="hover:shadow-md transition-shadow">
          <Link href="/setup?tab=cash-flow">
            <CardContent className="flex items-center gap-4 py-6">
              <TrendingUp className="h-8 w-8 text-primary" />
              <div>
                <p className="font-medium">현금흐름 예측</p>
                <p className="text-sm text-muted-foreground">자금 흐름 시뮬레이션</p>
              </div>
              <ChevronRight className="ml-auto h-5 w-5 text-muted-foreground" />
            </CardContent>
          </Link>
        </Card>
      </div>

      {/* 목표 수정 버튼 */}
      <div className="flex justify-end">
        <Button variant="outline" onClick={() => setShowGoalForm(true)}>
          퇴직 목표 수정
        </Button>
      </div>

      {/* 확보계획자금 상세 Dialog */}
      <Dialog open={showFundingDialog} onOpenChange={setShowFundingDialog}>
        <DialogContent className="max-w-lg max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <PiggyBank className="h-5 w-5" />
              확보계획자금 상세내역
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            {/* 요약 */}
            <div className="grid grid-cols-2 gap-3">
              <div className="p-3 bg-muted rounded-lg">
                <p className="text-xs text-muted-foreground">총 계획 자금</p>
                <p className="text-lg font-bold">{formatLargeNumber(summary.totalFundingPlanned)}</p>
              </div>
              <div className="p-3 bg-muted rounded-lg">
                <p className="text-xs text-muted-foreground">확보 완료</p>
                <p className="text-lg font-bold text-green-600">{formatLargeNumber(summary.totalFundingSecured)}</p>
              </div>
            </div>

            {/* 항목 목록 */}
            <div className="space-y-2">
              <p className="text-sm font-medium text-muted-foreground">항목별 내역</p>
              {fundingSources.items.length > 0 ? (
                <div className="space-y-2">
                  {fundingSources.items.map((item) => (
                    <div
                      key={item.id}
                      className="flex items-center justify-between p-3 border rounded-lg"
                    >
                      <div>
                        <p className="font-medium">{item.name}</p>
                        <p className="text-xs text-muted-foreground">
                          {getFundingTypeLabel(item.type)} · {formatDate(item.expectedDate)}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="font-bold">{formatLargeNumber(item.amount)}</p>
                        <Badge variant={item.status === "SECURED" ? "default" : "secondary"}>
                          {item.status === "SECURED" ? "확보완료" : "계획중"}
                        </Badge>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-center text-muted-foreground py-4">등록된 자금 조달 계획이 없습니다.</p>
              )}
            </div>

            {/* 바로가기 버튼 */}
            <Button asChild className="w-full">
              <Link href="/setup?tab=funding">자금 조달 관리 바로가기</Link>
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* 필요 설립비용 상세 Dialog */}
      <Dialog open={showSetupCostDialog} onOpenChange={setShowSetupCostDialog}>
        <DialogContent className="max-w-lg max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Calculator className="h-5 w-5" />
              필요 설립비용 상세내역
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            {/* 요약 */}
            <div className="grid grid-cols-3 gap-3">
              <div className="p-3 bg-muted rounded-lg">
                <p className="text-xs text-muted-foreground">총 비용</p>
                <p className="text-lg font-bold">{formatLargeNumber(summary.totalSetupCost)}</p>
              </div>
              <div className="p-3 bg-muted rounded-lg">
                <p className="text-xs text-muted-foreground">보조금</p>
                <p className="text-lg font-bold text-green-600">-{formatLargeNumber(summary.totalSubsidyAmount)}</p>
              </div>
              <div className="p-3 bg-muted rounded-lg">
                <p className="text-xs text-muted-foreground">순 필요</p>
                <p className="text-lg font-bold text-primary">{formatLargeNumber(summary.netSetupCost)}</p>
              </div>
            </div>

            {/* 항목 목록 */}
            <div className="space-y-2">
              <p className="text-sm font-medium text-muted-foreground">항목별 내역</p>
              {setupCosts.items.length > 0 ? (
                <div className="space-y-2">
                  {setupCosts.items.map((item) => (
                    <div
                      key={item.id}
                      className="flex items-center justify-between p-3 border rounded-lg"
                    >
                      <div>
                        <p className="font-medium">{item.name}</p>
                        <p className="text-xs text-muted-foreground">
                          {item.category} {item.subcategory && `> ${item.subcategory}`}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="font-bold">{formatLargeNumber(item.estimatedCost)}</p>
                        {item.subsidyAmount && Number(item.subsidyAmount) > 0 && (
                          <p className="text-xs text-green-600">
                            보조금 -{formatLargeNumber(item.subsidyAmount)}
                          </p>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-center text-muted-foreground py-4">등록된 설립비용 항목이 없습니다.</p>
              )}
            </div>

            {/* 바로가기 버튼 */}
            <Button asChild className="w-full">
              <Link href="/setup">설립비용 관리 바로가기</Link>
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// 자금 조달 유형 라벨
function getFundingTypeLabel(type: string): string {
  const labels: Record<string, string> = {
    REAL_ESTATE_SALE: "부동산 매도",
    SAVINGS: "저축",
    LOAN: "대출",
    GOVERNMENT_SUBSIDY: "정부 보조금",
    RETIREMENT_PAY: "퇴직금",
    SEVERANCE_PAY: "퇴직수당",
    OTHER: "기타",
  };
  return labels[type] || type;
}
