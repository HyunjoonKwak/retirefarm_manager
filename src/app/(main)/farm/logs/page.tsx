import { PageContainer } from "@/components/layout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Calendar, Plus, Sun, Droplets } from "lucide-react";
import Link from "next/link";

export default function FarmLogsPage() {
  return (
    <PageContainer
      title="영농일지"
      description="일별 농업 활동 기록 및 관리"
    >
      <div className="flex justify-end mb-4">
        <Button asChild>
          <Link href="/farm/logs/new">
            <Plus className="mr-2 h-4 w-4" />
            일지 작성
          </Link>
        </Button>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">총 기록 수</CardTitle>
            <Calendar className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">0건</div>
            <p className="text-xs text-muted-foreground">작성된 영농일지</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">오늘 날씨</CardTitle>
            <Sun className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">-</div>
            <p className="text-xs text-muted-foreground">기상정보 연동 필요</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">최근 관수</CardTitle>
            <Droplets className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">-</div>
            <p className="text-xs text-muted-foreground">마지막 관수 기록</p>
          </CardContent>
        </Card>
      </div>

      <Card className="mt-6">
        <CardHeader>
          <CardTitle>영농일지 캘린더</CardTitle>
          <CardDescription>
            월별 농업 활동 기록을 캘린더에서 확인하세요.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col items-center justify-center py-8 text-center">
            <Calendar className="h-12 w-12 text-muted-foreground mb-4" />
            <p className="text-muted-foreground mb-4">
              작성된 영농일지가 없습니다.
            </p>
            <Button asChild>
              <Link href="/farm/logs/new">첫 번째 일지 작성하기</Link>
            </Button>
          </div>
        </CardContent>
      </Card>
    </PageContainer>
  );
}
