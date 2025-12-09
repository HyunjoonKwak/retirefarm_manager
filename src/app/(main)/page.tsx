import { PageContainer } from "@/components/layout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Target, Building2, Leaf, TrendingUp } from "lucide-react";
import Link from "next/link";

const dashboardCards = [
  {
    title: "은퇴 플래너",
    description: "은퇴 목표 설정 및 자금 시뮬레이션",
    href: "/retirement",
    icon: Target,
    color: "text-blue-500",
  },
  {
    title: "부동산 자산",
    description: "부동산 자산 관리 및 양도세 계산",
    href: "/assets",
    icon: Building2,
    color: "text-green-500",
  },
  {
    title: "농장 운영",
    description: "영농일지, 작물관리, 재무/재고 관리",
    href: "/farm/logs",
    icon: Leaf,
    color: "text-orange-500",
  },
  {
    title: "시세 정보",
    description: "농산물 경매 시세 조회",
    href: "/market",
    icon: TrendingUp,
    color: "text-purple-500",
  },
];

export default function DashboardPage() {
  return (
    <PageContainer
      title="대시보드"
      description="은퇴 자금 마련부터 스마트팜 운영까지 한눈에 관리하세요"
    >
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {dashboardCards.map((card) => (
          <Link key={card.href} href={card.href}>
            <Card className="transition-colors hover:bg-muted/50">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">
                  {card.title}
                </CardTitle>
                <card.icon className={`h-5 w-5 ${card.color}`} />
              </CardHeader>
              <CardContent>
                <CardDescription>{card.description}</CardDescription>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>

      <div className="mt-8 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        <Card className="col-span-full lg:col-span-2">
          <CardHeader>
            <CardTitle>은퇴까지 남은 시간</CardTitle>
            <CardDescription>목표 달성까지의 진행 상황</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex items-center justify-center py-8 text-muted-foreground">
              은퇴 목표를 설정하면 카운트다운이 표시됩니다.
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>자산 현황</CardTitle>
            <CardDescription>총 보유 자산</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex items-center justify-center py-8 text-muted-foreground">
              자산을 등록하면 현황이 표시됩니다.
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>최근 영농일지</CardTitle>
            <CardDescription>최근 작업 기록</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex items-center justify-center py-8 text-muted-foreground">
              영농일지가 없습니다.
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>재무 현황</CardTitle>
            <CardDescription>이번 달 수입/지출</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex items-center justify-center py-8 text-muted-foreground">
              거래 내역이 없습니다.
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>시세 알림</CardTitle>
            <CardDescription>관심 품목 시세</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex items-center justify-center py-8 text-muted-foreground">
              관심 품목을 등록해주세요.
            </div>
          </CardContent>
        </Card>
      </div>
    </PageContainer>
  );
}
