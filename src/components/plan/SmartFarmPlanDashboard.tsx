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
} from "lucide-react";
import { formatLargeNumber, formatDate, calculateDDay } from "@/lib/utils/format";
import { RetirementGoalForm } from "./RetirementGoalForm";
import { FundingTimeline } from "./FundingTimeline";

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
}

export function SmartFarmPlanDashboard() {
  const [data, setData] = useState<PlanData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showGoalForm, setShowGoalForm] = useState(false);

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

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">예상 퇴직금</CardTitle>
            <PiggyBank className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {summary.totalRetirementFunds > 0
                ? formatLargeNumber(summary.totalRetirementFunds)
                : "-"}
            </div>
            <p className="text-xs text-muted-foreground">
              {summary.estimatedRetirementPay > 0 && `DC 퇴직금 ${formatLargeNumber(summary.estimatedRetirementPay)}`}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">필요 설립비용</CardTitle>
            <Calculator className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {summary.netSetupCost > 0 ? formatLargeNumber(summary.netSetupCost) : "-"}
            </div>
            {summary.totalSubsidyAmount > 0 && (
              <p className="text-xs text-green-600">
                보조금 {formatLargeNumber(summary.totalSubsidyAmount)} 차감
              </p>
            )}
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

      {/* 자금 조달 현황 */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Wallet className="h-5 w-5" />
              자금 조달 현황
            </CardTitle>
            <CardDescription>
              총 필요 자금 {formatLargeNumber(summary.totalRequiredFunds)} 중{" "}
              {formatLargeNumber(summary.totalFundingPlanned)} 확보 계획
            </CardDescription>
          </div>
          <Button variant="outline" size="sm" asChild>
            <Link href="/setup?tab=funding">
              자세히 보기 <ChevronRight className="ml-1 h-4 w-4" />
            </Link>
          </Button>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <div className="flex justify-between text-sm">
              <span>자금 조달 진행률</span>
              <span className="font-medium">{summary.fundingProgress}%</span>
            </div>
            <Progress value={summary.fundingProgress} />
          </div>

          {summary.fundingGap > 0 && (
            <div className="flex items-center gap-2 p-3 bg-yellow-50 rounded-lg">
              <AlertCircle className="h-5 w-5 text-yellow-600" />
              <p className="text-sm text-yellow-800">
                <span className="font-medium">{formatLargeNumber(summary.fundingGap)}</span>의 추가 자금 확보가 필요합니다.
              </p>
            </div>
          )}

          <div className="grid gap-3 md:grid-cols-3">
            <div className="p-3 bg-muted rounded-lg">
              <p className="text-xs text-muted-foreground">설립 비용</p>
              <p className="font-semibold">{formatLargeNumber(summary.netSetupCost)}</p>
            </div>
            <div className="p-3 bg-muted rounded-lg">
              <p className="text-xs text-muted-foreground">초기 생활비 버퍼 ({summary.bufferMonths}개월)</p>
              <p className="font-semibold">{formatLargeNumber(summary.initialLivingBuffer)}</p>
            </div>
            <div className="p-3 bg-muted rounded-lg">
              <p className="text-xs text-muted-foreground">확보 계획 자금</p>
              <p className="font-semibold text-green-600">
                {formatLargeNumber(summary.totalFundingPlanned)}
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* 자금 조달 타임라인 & 외부 자산 */}
      <div className="grid gap-4 md:grid-cols-2">
        {/* 타임라인 */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <TrendingUp className="h-5 w-5" />
              자금 유입 타임라인
            </CardTitle>
          </CardHeader>
          <CardContent>
            <FundingTimeline
              fundingSources={fundingSources.items}
              expectedProceeds={expectedProceeds?.assets || []}
              targetDate={summary.targetDate}
            />
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
    </div>
  );
}
