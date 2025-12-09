import { PageContainer } from "@/components/layout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Wallet, TrendingUp, TrendingDown, DollarSign, Plus } from "lucide-react";
import Link from "next/link";

export default function FinancePage() {
  return (
    <PageContainer
      title="재무 관리"
      description="농장 수입/지출 기록 및 손익 분석"
    >
      <div className="flex justify-end mb-4">
        <Button asChild>
          <Link href="/farm/finance/transactions/new">
            <Plus className="mr-2 h-4 w-4" />
            거래 등록
          </Link>
        </Button>
      </div>

      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">이번 달 수입</CardTitle>
            <TrendingUp className="h-4 w-4 text-green-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">0원</div>
            <p className="text-xs text-muted-foreground">전월 대비 -</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">이번 달 지출</CardTitle>
            <TrendingDown className="h-4 w-4 text-red-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-red-600">0원</div>
            <p className="text-xs text-muted-foreground">전월 대비 -</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">이번 달 순이익</CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">0원</div>
            <p className="text-xs text-muted-foreground">수입 - 지출</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">연간 누계</CardTitle>
            <Wallet className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">0원</div>
            <p className="text-xs text-muted-foreground">올해 총 순이익</p>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 mt-6 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>최근 거래 내역</CardTitle>
            <CardDescription>
              최근 등록된 수입/지출 내역입니다.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex flex-col items-center justify-center py-8 text-center">
              <Wallet className="h-12 w-12 text-muted-foreground mb-4" />
              <p className="text-muted-foreground mb-4">
                등록된 거래 내역이 없습니다.
              </p>
              <Button asChild>
                <Link href="/farm/finance/transactions/new">거래 등록하기</Link>
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>손익계산서</CardTitle>
            <CardDescription>
              월별/분기별 손익 현황을 확인하세요.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex flex-col items-center justify-center py-8 text-center">
              <TrendingUp className="h-12 w-12 text-muted-foreground mb-4" />
              <p className="text-muted-foreground mb-4">
                거래 내역을 등록하면 손익계산서가 생성됩니다.
              </p>
              <Button variant="outline" asChild>
                <Link href="/farm/finance/reports">보고서 보기</Link>
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </PageContainer>
  );
}
