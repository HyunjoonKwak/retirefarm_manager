import { PageContainer } from "@/components/layout";
import { DashboardOverview } from "@/components/dashboard/DashboardOverview";

export default function DashboardPage() {
  return (
    <PageContainer
      title="대시보드"
      description="은퇴 자금 마련부터 스마트팜 운영까지 한눈에 관리하세요"
    >
      <DashboardOverview />
    </PageContainer>
  );
}
