import { PageContainer } from "@/components/layout";
import { RetirementDashboard } from "@/components/retirement/RetirementDashboard";

export default function RetirementPage() {
  return (
    <PageContainer
      title="은퇴 플래너"
      description="은퇴 목표 설정 및 자금 시뮬레이션"
    >
      <RetirementDashboard />
    </PageContainer>
  );
}
