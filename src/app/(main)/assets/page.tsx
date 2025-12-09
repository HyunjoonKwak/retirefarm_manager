import { PageContainer } from "@/components/layout";
import { AssetList } from "@/components/assets/AssetList";
import { TaxCalculator } from "@/components/assets/TaxCalculator";
import { SaleSimulator } from "@/components/assets/SaleSimulator";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ExternalLink, Building2, Calculator, BarChart3 } from "lucide-react";

export default function AssetsPage() {
  return (
    <PageContainer
      title="부동산 자산"
      description="보유 부동산 자산 관리 및 양도세 계산"
    >
      <Tabs defaultValue="assets" className="space-y-6">
        <TabsList>
          <TabsTrigger value="assets" className="gap-2">
            <Building2 className="h-4 w-4" />
            자산 현황
          </TabsTrigger>
          <TabsTrigger value="tax-calculator" className="gap-2">
            <Calculator className="h-4 w-4" />
            양도세 계산기
          </TabsTrigger>
          <TabsTrigger value="sale-simulator" className="gap-2">
            <BarChart3 className="h-4 w-4" />
            매도 시뮬레이터
          </TabsTrigger>
        </TabsList>

        <TabsContent value="assets" className="space-y-6">
          {/* 연동 안내 */}
          <Card className="border-blue-200 bg-blue-50">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2">
                <ExternalLink className="h-4 w-4" />
                외부 포트폴리오 연동
              </CardTitle>
            </CardHeader>
            <CardContent>
              <CardDescription>
                부동산 자산은 nas_naver_crawler 서비스에서 관리됩니다.
                자산 등록/수정/삭제는 해당 서비스에서 진행하시고, 이 페이지에서는 자산 현황을 조회할 수 있습니다.
              </CardDescription>
            </CardContent>
          </Card>

          <AssetList />
        </TabsContent>

        <TabsContent value="tax-calculator">
          <TaxCalculator />
        </TabsContent>

        <TabsContent value="sale-simulator">
          <SaleSimulator />
        </TabsContent>
      </Tabs>
    </PageContainer>
  );
}
