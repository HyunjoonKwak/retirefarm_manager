"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import {
  Target,
  Building2,
  Leaf,
  TrendingUp,
  Wallet,
  Calendar,
  AlertTriangle,
  Loader2,
  ArrowRight,
  Sprout,
  Package,
} from "lucide-react";
import Link from "next/link";
import { formatLargeNumber, formatDate } from "@/lib/utils/format";

interface DashboardData {
  retirement: {
    targetDate: string;
    targetAmount: string;
    daysRemaining: number;
    monthsRemaining: number;
    yearsRemaining: number;
  } | null;
  assets: {
    totalValue: string;
    totalMortgage: string;
    netValue: string;
    holdingCount: number;
    soldCount: number;
    totalCount: number;
  };
  finance: {
    monthlyIncome: string;
    monthlyExpense: string;
    monthlyProfit: string;
    transactionCount: number;
  };
  recentLogs: Array<{
    id: string;
    date: string;
    weather: string | null;
    activityCount: number;
    activities: Array<{
      type: string;
      description: string;
    }>;
  }>;
  watchlist: Array<{
    id: string;
    itemCode: string;
    itemName: string;
  }>;
  crops: Array<{
    id: string;
    name: string;
    variety: string | null;
    growthStage: string;
    daysToHarvest: number;
    expectedHarvestDate: string;
  }>;
  lowStockAlerts: Array<{
    id: string;
    name: string;
    category: string;
    currentQuantity: string;
    minimumQuantity: string;
    unit: string;
  }>;
}

const dashboardCards = [
  {
    title: "은퇴 플래너",
    description: "은퇴 목표 설정 및 자금 시뮬레이션",
    href: "/retirement",
    icon: Target,
    color: "text-blue-500",
    bgColor: "bg-blue-500/10",
  },
  {
    title: "부동산 자산",
    description: "부동산 자산 관리 및 양도세 계산",
    href: "/assets",
    icon: Building2,
    color: "text-green-500",
    bgColor: "bg-green-500/10",
  },
  {
    title: "농장 운영",
    description: "영농일지, 작물관리, 재무/재고 관리",
    href: "/farm/logs",
    icon: Leaf,
    color: "text-orange-500",
    bgColor: "bg-orange-500/10",
  },
  {
    title: "시세 정보",
    description: "농산물 경매 시세 조회",
    href: "/market",
    icon: TrendingUp,
    color: "text-purple-500",
    bgColor: "bg-purple-500/10",
  },
];

const ACTIVITY_LABELS: Record<string, string> = {
  SEEDING: "파종",
  TRANSPLANTING: "정식",
  WATERING: "관수",
  FERTILIZING: "시비",
  PEST_CONTROL: "방제",
  PRUNING: "전지",
  HARVESTING: "수확",
  PACKING: "포장",
  SHIPPING: "출하",
  MAINTENANCE: "시설관리",
  OTHER: "기타",
};

const GROWTH_STAGE_LABELS: Record<string, string> = {
  SEEDING: "파종",
  GERMINATION: "발아",
  SEEDLING: "육묘",
  VEGETATIVE: "영양생장",
  FLOWERING: "개화",
  FRUITING: "결실",
  HARVEST: "수확",
};

export function DashboardOverview() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchData() {
      try {
        const response = await fetch("/api/dashboard");
        const result = await response.json();
        if (response.ok) {
          setData(result);
        }
      } catch (error) {
        console.error("Failed to fetch dashboard:", error);
      } finally {
        setLoading(false);
      }
    }
    fetchData();
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const hasAlerts = data && data.lowStockAlerts.length > 0;

  return (
    <div className="space-y-6">
      {/* 알림 배너 */}
      {hasAlerts && (
        <Card className="border-yellow-500/50 bg-yellow-500/5">
          <CardContent className="py-4">
            <div className="flex items-center gap-3">
              <AlertTriangle className="h-5 w-5 text-yellow-500" />
              <div className="flex-1">
                <p className="font-medium text-yellow-700 dark:text-yellow-400">
                  재고 부족 알림: {data.lowStockAlerts.length}개 품목
                </p>
                <p className="text-sm text-muted-foreground">
                  {data.lowStockAlerts.map((item) => item.name).join(", ")}
                </p>
              </div>
              <Link href="/farm/inventory" className="text-sm text-primary hover:underline flex items-center gap-1">
                재고 확인 <ArrowRight className="h-4 w-4" />
              </Link>
            </div>
          </CardContent>
        </Card>
      )}

      {/* 빠른 메뉴 */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {dashboardCards.map((card) => (
          <Link key={card.href} href={card.href}>
            <Card className="transition-all hover:shadow-md hover:border-primary/50">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">{card.title}</CardTitle>
                <div className={`p-2 rounded-lg ${card.bgColor}`}>
                  <card.icon className={`h-5 w-5 ${card.color}`} />
                </div>
              </CardHeader>
              <CardContent>
                <CardDescription>{card.description}</CardDescription>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>

      {/* 메인 대시보드 */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {/* 은퇴 카운트다운 */}
        <Card className="col-span-full lg:col-span-2">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Target className="h-5 w-5 text-blue-500" />
              은퇴까지 남은 시간
            </CardTitle>
            <CardDescription>목표 달성까지의 진행 상황</CardDescription>
          </CardHeader>
          <CardContent>
            {data?.retirement ? (
              <div className="space-y-4">
                <div className="grid grid-cols-3 gap-4 text-center">
                  <div className="p-4 rounded-lg bg-muted">
                    <p className="text-3xl font-bold text-primary">{data.retirement.yearsRemaining}</p>
                    <p className="text-sm text-muted-foreground">년</p>
                  </div>
                  <div className="p-4 rounded-lg bg-muted">
                    <p className="text-3xl font-bold text-primary">
                      {data.retirement.monthsRemaining % 12}
                    </p>
                    <p className="text-sm text-muted-foreground">개월</p>
                  </div>
                  <div className="p-4 rounded-lg bg-muted">
                    <p className="text-3xl font-bold text-primary">
                      {data.retirement.daysRemaining % 30}
                    </p>
                    <p className="text-sm text-muted-foreground">일</p>
                  </div>
                </div>
                <div className="space-y-2">
                  <div className="flex justify-between text-sm">
                    <span>목표일: {formatDate(data.retirement.targetDate)}</span>
                    <span>목표 금액: {formatLargeNumber(data.retirement.targetAmount)}</span>
                  </div>
                  <Progress value={Math.min(100, 100 - (data.retirement.daysRemaining / 3650) * 100)} />
                </div>
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center py-8 text-center">
                <Target className="h-12 w-12 text-muted-foreground mb-4" />
                <p className="text-muted-foreground mb-2">은퇴 목표를 설정하면 카운트다운이 표시됩니다.</p>
                <Link href="/retirement/goal" className="text-sm text-primary hover:underline">
                  은퇴 목표 설정하기 →
                </Link>
              </div>
            )}
          </CardContent>
        </Card>

        {/* 자산 현황 */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Building2 className="h-5 w-5 text-green-500" />
              자산 현황
            </CardTitle>
            <CardDescription>총 보유 자산</CardDescription>
          </CardHeader>
          <CardContent>
            {data && data.assets.totalCount > 0 ? (
              <div className="space-y-4">
                <div>
                  <p className="text-2xl font-bold text-green-600">{formatLargeNumber(data.assets.netValue)}</p>
                  <p className="text-xs text-muted-foreground">순자산 (시가 - 대출)</p>
                </div>
                <div className="grid grid-cols-2 gap-2 text-sm">
                  <div className="p-2 rounded bg-muted">
                    <p className="text-muted-foreground">시가총액</p>
                    <p className="font-medium">{formatLargeNumber(data.assets.totalValue)}</p>
                  </div>
                  <div className="p-2 rounded bg-muted">
                    <p className="text-muted-foreground">대출잔액</p>
                    <p className="font-medium text-red-600">{formatLargeNumber(data.assets.totalMortgage)}</p>
                  </div>
                </div>
                <div className="flex gap-2">
                  <Badge variant="outline">{data.assets.holdingCount}개 보유</Badge>
                  {data.assets.soldCount > 0 && (
                    <Badge variant="secondary">{data.assets.soldCount}개 매각</Badge>
                  )}
                </div>
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center py-8 text-center">
                <Building2 className="h-12 w-12 text-muted-foreground mb-4" />
                <p className="text-muted-foreground mb-2">자산을 등록하면 현황이 표시됩니다.</p>
                <Link href="/assets" className="text-sm text-primary hover:underline">
                  자산 등록하기 →
                </Link>
              </div>
            )}
          </CardContent>
        </Card>

        {/* 이번 달 재무 */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Wallet className="h-5 w-5 text-blue-500" />
              이번 달 재무
            </CardTitle>
            <CardDescription>수입/지출 현황</CardDescription>
          </CardHeader>
          <CardContent>
            {data && data.finance.transactionCount > 0 ? (
              <div className="space-y-4">
                <div>
                  <p
                    className={`text-2xl font-bold ${
                      Number(data.finance.monthlyProfit) >= 0 ? "text-blue-600" : "text-red-600"
                    }`}
                  >
                    {Number(data.finance.monthlyProfit) >= 0 ? "+" : ""}
                    {formatLargeNumber(data.finance.monthlyProfit)}
                  </p>
                  <p className="text-xs text-muted-foreground">순이익</p>
                </div>
                <div className="space-y-2">
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">수입</span>
                    <span className="text-green-600">+{formatLargeNumber(data.finance.monthlyIncome)}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">지출</span>
                    <span className="text-red-600">-{formatLargeNumber(data.finance.monthlyExpense)}</span>
                  </div>
                </div>
                <Badge variant="outline">{data.finance.transactionCount}건 거래</Badge>
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center py-8 text-center">
                <Wallet className="h-12 w-12 text-muted-foreground mb-4" />
                <p className="text-muted-foreground mb-2">거래 내역이 없습니다.</p>
                <Link href="/farm/finance" className="text-sm text-primary hover:underline">
                  거래 등록하기 →
                </Link>
              </div>
            )}
          </CardContent>
        </Card>

        {/* 최근 영농일지 */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Calendar className="h-5 w-5 text-orange-500" />
              최근 영농일지
            </CardTitle>
            <CardDescription>최근 7일 기록</CardDescription>
          </CardHeader>
          <CardContent>
            {data && data.recentLogs.length > 0 ? (
              <div className="space-y-3">
                {data.recentLogs.slice(0, 3).map((log) => (
                  <div key={log.id} className="p-2 rounded-lg border">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-sm font-medium">{formatDate(log.date)}</span>
                      {log.weather && <span className="text-xs text-muted-foreground">{log.weather}</span>}
                    </div>
                    {log.activities.length > 0 && (
                      <div className="flex flex-wrap gap-1">
                        {log.activities.map((activity, idx) => (
                          <Badge key={idx} variant="secondary" className="text-xs">
                            {ACTIVITY_LABELS[activity.type] || activity.type}
                          </Badge>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
                <Link href="/farm/logs" className="text-sm text-primary hover:underline flex items-center gap-1">
                  모든 일지 보기 <ArrowRight className="h-4 w-4" />
                </Link>
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center py-8 text-center">
                <Calendar className="h-12 w-12 text-muted-foreground mb-4" />
                <p className="text-muted-foreground mb-2">영농일지가 없습니다.</p>
                <Link href="/farm/logs" className="text-sm text-primary hover:underline">
                  영농일지 작성하기 →
                </Link>
              </div>
            )}
          </CardContent>
        </Card>

        {/* 재배 중인 작물 */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Sprout className="h-5 w-5 text-green-500" />
              재배 중인 작물
            </CardTitle>
            <CardDescription>수확 예정일 기준</CardDescription>
          </CardHeader>
          <CardContent>
            {data && data.crops.length > 0 ? (
              <div className="space-y-3">
                {data.crops.slice(0, 3).map((crop) => (
                  <div key={crop.id} className="p-2 rounded-lg border">
                    <div className="flex items-center justify-between mb-1">
                      <span className="font-medium">{crop.name}</span>
                      <Badge variant="outline" className="text-xs">
                        {GROWTH_STAGE_LABELS[crop.growthStage] || crop.growthStage}
                      </Badge>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {crop.daysToHarvest > 0 ? `수확까지 ${crop.daysToHarvest}일` : "수확 가능"}
                    </p>
                  </div>
                ))}
                <Link href="/farm/crops" className="text-sm text-primary hover:underline flex items-center gap-1">
                  모든 작물 보기 <ArrowRight className="h-4 w-4" />
                </Link>
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center py-8 text-center">
                <Sprout className="h-12 w-12 text-muted-foreground mb-4" />
                <p className="text-muted-foreground mb-2">재배 중인 작물이 없습니다.</p>
                <Link href="/farm/crops" className="text-sm text-primary hover:underline">
                  작물 등록하기 →
                </Link>
              </div>
            )}
          </CardContent>
        </Card>

        {/* 관심 품목 */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <TrendingUp className="h-5 w-5 text-purple-500" />
              관심 품목
            </CardTitle>
            <CardDescription>등록된 시세 관심 품목</CardDescription>
          </CardHeader>
          <CardContent>
            {data && data.watchlist.length > 0 ? (
              <div className="space-y-3">
                <div className="flex flex-wrap gap-2">
                  {data.watchlist.map((item) => (
                    <Badge key={item.id} variant="secondary">
                      {item.itemName}
                    </Badge>
                  ))}
                </div>
                <Link href="/market" className="text-sm text-primary hover:underline flex items-center gap-1">
                  시세 확인하기 <ArrowRight className="h-4 w-4" />
                </Link>
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center py-8 text-center">
                <TrendingUp className="h-12 w-12 text-muted-foreground mb-4" />
                <p className="text-muted-foreground mb-2">관심 품목을 등록해주세요.</p>
                <Link href="/market" className="text-sm text-primary hover:underline">
                  품목 등록하기 →
                </Link>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
