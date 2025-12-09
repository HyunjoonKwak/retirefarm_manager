"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Building2, Loader2, ExternalLink, TrendingUp, TrendingDown } from "lucide-react";
import { formatLargeNumber, formatPercent, formatDate } from "@/lib/utils/format";
import type { ExternalPortfolioAsset, ExternalPortfolioSummary } from "@/lib/api/external-portfolio";

const PROPERTY_TYPE_LABELS: Record<string, string> = {
  APARTMENT: "아파트",
  OFFICETEL: "오피스텔",
  VILLA: "빌라",
  BUILDING: "건물",
  COMMERCIAL: "상가",
  LAND: "토지",
  FACTORY: "공장",
  STUDIO: "원룸",
  OTHER: "기타",
};

const TRADE_TYPE_LABELS: Record<string, { label: string; variant: "default" | "secondary" | "outline" }> = {
  OWNED: { label: "보유중", variant: "default" },
  FOR_SALE: { label: "매물등록", variant: "secondary" },
  SOLD: { label: "매도완료", variant: "outline" },
};

interface AssetData {
  assets: ExternalPortfolioAsset[];
  summary: ExternalPortfolioSummary;
  error?: string;
}

export function AssetList() {
  const [data, setData] = useState<AssetData | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState("OWNED");

  useEffect(() => {
    async function fetchAssets() {
      try {
        const response = await fetch(`/api/assets/external?tradeType=${activeTab}`);
        const result = await response.json();
        setData(result);
      } catch (err) {
        setData({
          assets: [],
          summary: {
            totalAssets: 0,
            totalValue: "0",
            totalAcquisitionCost: "0",
            totalLoanAmount: "0",
            totalUnrealizedGain: "0",
            averageYieldRate: 0,
          },
          error: "데이터를 불러올 수 없습니다.",
        });
      } finally {
        setLoading(false);
      }
    }

    setLoading(true);
    fetchAssets();
  }, [activeTab]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const externalApiUrl = process.env.NEXT_PUBLIC_EXTERNAL_PORTFOLIO_URL || "http://localhost:3001";

  return (
    <div className="space-y-6">
      {/* 요약 카드 */}
      {data && (
        <div className="grid gap-4 md:grid-cols-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">총 보유 자산</CardTitle>
              <Building2 className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{data.summary.totalAssets}건</div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">총 자산 가치</CardTitle>
              <TrendingUp className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{formatLargeNumber(data.summary.totalValue)}</div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">총 대출금</CardTitle>
              <TrendingDown className="h-4 w-4 text-red-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-red-500">
                -{formatLargeNumber(data.summary.totalLoanAmount)}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">미실현 수익</CardTitle>
              <TrendingUp className="h-4 w-4 text-green-500" />
            </CardHeader>
            <CardContent>
              <div className={`text-2xl font-bold ${Number(data.summary.totalUnrealizedGain) >= 0 ? "text-green-500" : "text-red-500"}`}>
                {formatLargeNumber(data.summary.totalUnrealizedGain)}
              </div>
              <p className="text-xs text-muted-foreground">
                평균 수익률: {formatPercent(data.summary.averageYieldRate)}
              </p>
            </CardContent>
          </Card>
        </div>
      )}

      {/* 연동 안내 */}
      {data?.error && (
        <Card className="border-orange-200 bg-orange-50">
          <CardContent className="py-4">
            <p className="text-sm text-orange-800">
              {data.error} 외부 포트폴리오 서비스(nas_naver_crawler)가 실행 중인지 확인하세요.
            </p>
          </CardContent>
        </Card>
      )}

      {/* 탭 */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="OWNED">보유중</TabsTrigger>
          <TabsTrigger value="FOR_SALE">매물등록</TabsTrigger>
          <TabsTrigger value="SOLD">매도완료</TabsTrigger>
        </TabsList>

        <TabsContent value={activeTab} className="mt-4">
          {data?.assets && data.assets.length > 0 ? (
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {data.assets.map((asset) => (
                <Card key={asset.id} className="hover:shadow-md transition-shadow">
                  <CardHeader className="pb-2">
                    <div className="flex items-start justify-between">
                      <div>
                        <CardTitle className="text-lg">{asset.propertyName}</CardTitle>
                        <CardDescription className="text-xs mt-1">
                          {PROPERTY_TYPE_LABELS[asset.propertyType] || asset.propertyType}
                        </CardDescription>
                      </div>
                      <Badge variant={TRADE_TYPE_LABELS[asset.tradeType]?.variant || "default"}>
                        {TRADE_TYPE_LABELS[asset.tradeType]?.label || asset.tradeType}
                      </Badge>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <p className="text-sm text-muted-foreground truncate" title={asset.address}>
                      {asset.address}
                    </p>

                    <div className="grid grid-cols-2 gap-2 text-sm">
                      <div>
                        <p className="text-muted-foreground">취득가</p>
                        <p className="font-medium">{formatLargeNumber(asset.purchasePrice)}</p>
                      </div>
                      <div>
                        <p className="text-muted-foreground">현재가</p>
                        <p className="font-medium">{formatLargeNumber(asset.currentPrice)}</p>
                      </div>
                    </div>

                    <div className="flex items-center justify-between pt-2 border-t">
                      <div>
                        <p className="text-xs text-muted-foreground">수익률</p>
                        <p className={`font-bold ${asset.unrealizedGainRate >= 0 ? "text-green-600" : "text-red-600"}`}>
                          {asset.unrealizedGainRate >= 0 ? "+" : ""}{formatPercent(asset.unrealizedGainRate)}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="text-xs text-muted-foreground">미실현수익</p>
                        <p className={`font-bold ${Number(asset.unrealizedGain) >= 0 ? "text-green-600" : "text-red-600"}`}>
                          {formatLargeNumber(asset.unrealizedGain)}
                        </p>
                      </div>
                    </div>

                    {asset.hasLoan && asset.loanAmount && (
                      <div className="pt-2 border-t">
                        <p className="text-xs text-muted-foreground">대출 잔액</p>
                        <p className="font-medium text-red-600">-{formatLargeNumber(asset.loanAmount)}</p>
                      </div>
                    )}

                    {asset.expectedSaleDate && (
                      <div className="pt-2 border-t">
                        <p className="text-xs text-muted-foreground">예정 매도일</p>
                        <p className="font-medium">{formatDate(asset.expectedSaleDate)}</p>
                      </div>
                    )}
                  </CardContent>
                </Card>
              ))}
            </div>
          ) : (
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-12">
                <Building2 className="h-12 w-12 text-muted-foreground mb-4" />
                <p className="text-muted-foreground mb-4">
                  {activeTab === "OWNED" && "보유 중인 자산이 없습니다."}
                  {activeTab === "FOR_SALE" && "매물로 등록된 자산이 없습니다."}
                  {activeTab === "SOLD" && "매도 완료된 자산이 없습니다."}
                </p>
                <Button variant="outline" asChild>
                  <a href={externalApiUrl} target="_blank" rel="noopener noreferrer">
                    <ExternalLink className="mr-2 h-4 w-4" />
                    포트폴리오 서비스에서 등록
                  </a>
                </Button>
              </CardContent>
            </Card>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
