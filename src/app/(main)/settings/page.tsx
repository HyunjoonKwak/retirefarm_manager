import { PageContainer } from "@/components/layout";
import { SettingsManager } from "@/components/settings/SettingsManager";

export default function SettingsPage() {
  return (
    <PageContainer
      title="설정"
      description="계정 및 앱 설정 관리"
    >
      <SettingsManager />
    </PageContainer>
  );
}
