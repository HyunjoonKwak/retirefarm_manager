import { PageContainer } from "@/components/layout";
import { FarmingLogManager } from "@/components/farm/FarmingLogManager";

export default function FarmLogsPage() {
  return (
    <PageContainer
      title="영농일지"
      description="매일의 영농 활동을 기록하고 관리합니다"
    >
      <FarmingLogManager />
    </PageContainer>
  );
}
