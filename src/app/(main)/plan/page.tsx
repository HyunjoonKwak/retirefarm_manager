import { PageContainer } from "@/components/layout";
import { SmartFarmPlanDashboard } from "@/components/plan/SmartFarmPlanDashboard";

export default function PlanPage() {
  return (
    <PageContainer
      title="스마트팜 준비 플래너"
      description="퇴직 후 스마트팜 창업을 위한 종합 준비 현황"
    >
      <SmartFarmPlanDashboard />
    </PageContainer>
  );
}
