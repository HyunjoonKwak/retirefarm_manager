import { PageContainer } from "@/components/layout";
import { MarketCollect } from "@/components/market/MarketCollect";

export default function MarketCollectPage() {
  return (
    <PageContainer
      title="데이터 수집"
      description="가락시장 경매 데이터 수집 및 관리"
    >
      <MarketCollect />
    </PageContainer>
  );
}
