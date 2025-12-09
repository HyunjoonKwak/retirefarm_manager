import { PageContainer } from "@/components/layout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { TrendingUp, Search, Star, Bell } from "lucide-react";
import Link from "next/link";

export default function MarketPage() {
  return (
    <PageContainer
      title="농산물 시세"
      description="농수산물 경매 시세 조회 및 관심 품목 관리"
    >
      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">관심 품목</CardTitle>
            <Star className="h-4 w-4 text-yellow-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">0</div>
            <p className="text-xs text-muted-foreground">등록된 품목</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">가격 알림</CardTitle>
            <Bell className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">0</div>
            <p className="text-xs text-muted-foreground">활성 알림</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">오늘 시세</CardTitle>
            <TrendingUp className="h-4 w-4 text-green-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">-</div>
            <p className="text-xs text-muted-foreground">KAMIS 연동 필요</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">데이터 기준일</CardTitle>
            <Search className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">-</div>
            <p className="text-xs text-muted-foreground">최신 데이터</p>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 mt-6 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>시세 검색</CardTitle>
            <CardDescription>
              품목별, 시장별 시세를 검색하고 추이를 확인하세요.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex flex-col items-center justify-center py-8 text-center">
              <Search className="h-12 w-12 text-muted-foreground mb-4" />
              <p className="text-muted-foreground mb-4">
                농수산물 경매 시세를 검색해보세요.
              </p>
              <Button asChild>
                <Link href="/market/search">시세 검색하기</Link>
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>관심 품목</CardTitle>
            <CardDescription>
              자주 확인하는 품목을 등록하고 시세 알림을 받으세요.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex flex-col items-center justify-center py-8 text-center">
              <Star className="h-12 w-12 text-muted-foreground mb-4" />
              <p className="text-muted-foreground mb-4">
                관심 품목을 등록해보세요.
              </p>
              <Button variant="outline" asChild>
                <Link href="/market/watchlist">관심 품목 관리</Link>
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card className="mt-6">
        <CardHeader>
          <CardTitle>KAMIS API 안내</CardTitle>
          <CardDescription>
            농수산물유통정보(KAMIS) API를 사용하여 실시간 시세를 조회합니다.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            시세 정보를 사용하려면 KAMIS API 키가 필요합니다.
            환경 변수 KAMIS_API_KEY와 KAMIS_API_ID를 설정해주세요.
          </p>
          <p className="text-sm text-muted-foreground mt-2">
            API 신청: <a href="https://www.kamis.or.kr/customer/reference/openapi_list.do" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">KAMIS 오픈API</a>
          </p>
        </CardContent>
      </Card>
    </PageContainer>
  );
}
