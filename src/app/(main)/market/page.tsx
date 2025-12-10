import { PageContainer } from "@/components/layout";
import { MarketPriceManager } from "@/components/market/MarketPriceManager";

export default function MarketPage() {
  return (
    <PageContainer
      title="농산물 시세"
      description="농수산물 경매 시세 조회 및 관심 품목 관리"
    >
      <MarketPriceManager />
    </PageContainer>
  );
}
