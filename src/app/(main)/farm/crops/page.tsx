import { PageContainer } from "@/components/layout";
import { CropManager } from "@/components/farm/CropManager";

export default function CropsPage() {
  return (
    <PageContainer
      title="작물 관리"
      description="재배 중인 작물 현황 및 생육 단계 관리"
    >
      <CropManager />
    </PageContainer>
  );
}
