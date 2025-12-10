import { PageContainer } from "@/components/layout";
import { FinanceManager } from "@/components/farm/FinanceManager";

export default function FinancePage() {
  return (
    <PageContainer
      title="재무 관리"
      description="농장 수입/지출 기록 및 손익 분석"
    >
      <FinanceManager />
    </PageContainer>
  );
}
