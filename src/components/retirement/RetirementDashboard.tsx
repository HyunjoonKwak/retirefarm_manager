"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Target, Calendar, TrendingUp, AlertCircle, Loader2, PiggyBank, Building2 } from "lucide-react";
import { formatLargeNumber, formatPercent, formatDate, calculateDDay } from "@/lib/utils/format";

interface SimulationData {
  simulation: {
    targetDate: string;
    targetAmount: number;
    monthlyLivingExpense: number;
    lifeExpectancy: number;
    inflationRate: number;
    daysRemaining: number;
    monthsRemaining: number;
    yearsRemaining: number;
    retirementDuration: number;
    totalRequiredFunds: number;
    inflationAdjustedMonthlyExpense: number;
    currentAssets: number;
    gap: number;
    achievementRate: number;
    monthlyRequiredSavings: number;
  };
  externalAssets?: {
    totalAssets: number;
    totalValue: string;
    totalLoanAmount: string;
    netValue: string;
  } | null;
  expectedProceeds?: {
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

export function RetirementDashboard() {
  const [data, setData] = useState<SimulationData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchSimulation() {
      try {
        const response = await fetch("/api/retirement/simulation");
        if (response.status === 404) {
          setError("not_set");
          return;
        }
        if (!response.ok) {
          throw new Error("Failed to fetch simulation");
        }
        const result = await response.json();
        setData(result);
      } catch (err) {
        setError("error");
      } finally {
        setLoading(false);
      }
    }

    fetchSimulation();
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (error === "not_set") {
    return (
      <Card>
        <CardHeader>
          <CardTitle>은퇴 목표 설정</CardTitle>
          <CardDescription>
            은퇴 목표일, 목표 자금, 월 생활비 등을 설정하고 시뮬레이션해보세요.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col items-center justify-center py-8 text-center">
            <Target className="h-12 w-12 text-muted-foreground mb-4" />
            <p className="text-muted-foreground mb-4">
              아직 은퇴 목표가 설정되지 않았습니다.
            </p>
            <Button asChild>
              <Link href="/retirement/goal">목표 설정하기</Link>
            </Button>
          </div>
        </CardContent>
      </Card>
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

  const { simulation, externalAssets, expectedProceeds } = data;
  const dDay = calculateDDay(simulation.targetDate);

  return (
    <div className="space-y-6">
      {/* 요약 카드 */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">목표 은퇴일</CardTitle>
            <Calendar className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatDate(simulation.targetDate)}</div>
            <p className={`text-xs ${dDay.isOverdue ? "text-red-500" : "text-muted-foreground"}`}>
              {dDay.text} ({simulation.yearsRemaining}년 {simulation.monthsRemaining % 12}개월 남음)
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">목표 자금</CardTitle>
            <Target className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatLargeNumber(simulation.targetAmount)}</div>
            <p className="text-xs text-muted-foreground">
              필요 자금: {formatLargeNumber(simulation.totalRequiredFunds)}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">현재 자산</CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatLargeNumber(simulation.currentAssets)}</div>
            <p className="text-xs text-muted-foreground">
              {externalAssets
                ? `부동산 ${externalAssets.totalAssets}건 (대출 차감)`
                : "외부 자산 연동 필요"}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">달성률</CardTitle>
            <AlertCircle className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatPercent(simulation.achievementRate, 0)}</div>
            <Progress value={simulation.achievementRate} className="mt-2" />
          </CardContent>
        </Card>
      </div>

      {/* 갭 분석 */}
      <Card>
        <CardHeader>
          <CardTitle>갭 분석</CardTitle>
          <CardDescription>
            목표 달성을 위해 필요한 추가 자금입니다.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 md:grid-cols-3">
            <div className="space-y-2">
              <p className="text-sm text-muted-foreground">부족 금액</p>
              <p className={`text-2xl font-bold ${simulation.gap > 0 ? "text-red-500" : "text-green-500"}`}>
                {simulation.gap > 0 ? formatLargeNumber(simulation.gap) : "목표 달성!"}
              </p>
            </div>
            <div className="space-y-2">
              <p className="text-sm text-muted-foreground">월 필요 저축액</p>
              <p className="text-2xl font-bold">
                {formatLargeNumber(simulation.monthlyRequiredSavings)}
              </p>
            </div>
            <div className="space-y-2">
              <p className="text-sm text-muted-foreground">은퇴 후 월 생활비 (물가상승 반영)</p>
              <p className="text-2xl font-bold">
                {formatLargeNumber(simulation.inflationAdjustedMonthlyExpense)}
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* 자산 연동 정보 */}
      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Building2 className="h-5 w-5" />
              외부 포트폴리오 연동
            </CardTitle>
            <CardDescription>
              nas_naver_crawler 서비스의 부동산 자산 정보입니다.
            </CardDescription>
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
                  <span className="font-medium text-red-500">-{formatLargeNumber(externalAssets.totalLoanAmount)}</span>
                </div>
                <div className="flex justify-between border-t pt-3">
                  <span className="font-medium">순자산</span>
                  <span className="font-bold text-primary">{formatLargeNumber(externalAssets.netValue)}</span>
                </div>
              </div>
            ) : (
              <div className="text-center py-4">
                <p className="text-muted-foreground">
                  외부 포트폴리오 서비스에 연결할 수 없습니다.
                </p>
                <p className="text-xs text-muted-foreground mt-2">
                  환경변수 EXTERNAL_PORTFOLIO_API_URL을 설정하세요.
                </p>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <PiggyBank className="h-5 w-5" />
              매도 예정 자금
            </CardTitle>
            <CardDescription>
              매물로 등록된 자산의 예상 순수익입니다.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {expectedProceeds && expectedProceeds.assets.length > 0 ? (
              <div className="space-y-3">
                {expectedProceeds.assets.slice(0, 3).map((asset) => (
                  <div key={asset.id} className="flex justify-between text-sm">
                    <span className="text-muted-foreground truncate max-w-[150px]">
                      {asset.propertyName}
                    </span>
                    <span className="font-medium">
                      {formatLargeNumber(asset.estimatedNetProceeds)}
                    </span>
                  </div>
                ))}
                {expectedProceeds.assets.length > 3 && (
                  <p className="text-xs text-muted-foreground">
                    외 {expectedProceeds.assets.length - 3}건
                  </p>
                )}
                <div className="flex justify-between border-t pt-3">
                  <span className="font-medium">총 예상 순수익</span>
                  <span className="font-bold text-green-600">
                    {formatLargeNumber(expectedProceeds.totalExpectedProceeds)}
                  </span>
                </div>
              </div>
            ) : (
              <div className="text-center py-4">
                <p className="text-muted-foreground">
                  매물로 등록된 자산이 없습니다.
                </p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* 목표 수정 버튼 */}
      <div className="flex justify-end">
        <Button variant="outline" asChild>
          <Link href="/retirement/goal">목표 수정</Link>
        </Button>
      </div>
    </div>
  );
}
