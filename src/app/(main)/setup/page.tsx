import { PageContainer } from "@/components/layout";
import { SetupCostManager } from "@/components/setup/SetupCostManager";
import { FundingPlanManager } from "@/components/funding/FundingPlanManager";
import { CashFlowProjection } from "@/components/funding/CashFlowProjection";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Calculator, Wallet, TrendingUp } from "lucide-react";

export default function SetupPage() {
  return (
    <PageContainer
      title="스마트팜 설립 계획"
      description="설립 비용 계획 및 자금 조달 관리"
    >
      <Tabs defaultValue="costs" className="space-y-6">
        <TabsList>
          <TabsTrigger value="costs" className="gap-2">
            <Calculator className="h-4 w-4" />
            설립 비용
          </TabsTrigger>
          <TabsTrigger value="funding" className="gap-2">
            <Wallet className="h-4 w-4" />
            자금 조달
          </TabsTrigger>
          <TabsTrigger value="cash-flow" className="gap-2">
            <TrendingUp className="h-4 w-4" />
            현금흐름 예측
          </TabsTrigger>
        </TabsList>

        <TabsContent value="costs">
          <SetupCostManager />
        </TabsContent>

        <TabsContent value="funding">
          <FundingPlanManager />
        </TabsContent>

        <TabsContent value="cash-flow">
          <CashFlowProjection />
        </TabsContent>
      </Tabs>
    </PageContainer>
  );
}
