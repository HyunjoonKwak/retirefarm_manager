import { PageContainer } from "@/components/layout";
import { OnboardingWizard } from "@/components/setup/OnboardingWizard";

export default function OnboardingPage() {
  return (
    <PageContainer
      title="시작하기"
      description="농장 프로필과 재배 예정 작물을 설정하세요"
    >
      <OnboardingWizard />
    </PageContainer>
  );
}
