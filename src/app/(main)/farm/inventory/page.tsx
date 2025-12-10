import { PageContainer } from "@/components/layout";
import { InventoryManager } from "@/components/farm/InventoryManager";

export default function InventoryPage() {
  return (
    <PageContainer
      title="재고 관리"
      description="농자재, 비료, 농약 등 재고 현황 관리"
    >
      <InventoryManager />
    </PageContainer>
  );
}
