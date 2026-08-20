import { PageContainer } from "@/components/layout";
import { AssetList } from "@/components/assets/AssetList";
import { SaleSimulator } from "@/components/assets/SaleSimulator";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ExternalLink, Building2, BarChart3 } from "lucide-react";

const ASSET_MANAGER_URL =
  process.env.NEXT_PUBLIC_ASSET_MANAGER_URL || "https://assets.specialrisk.me";

export default function AssetsPage() {
  return (
    <PageContainer
      title="부동산 자산"
      description="보유 부동산 현황 조회 및 매도 시뮬레이션"
    >
      <Tabs defaultValue="assets" className="space-y-6">
        <TabsList>
          <TabsTrigger value="assets" className="gap-2">
            <Building2 className="h-4 w-4" />
            자산 현황
          </TabsTrigger>
          <TabsTrigger value="sale-simulator" className="gap-2">
            <BarChart3 className="h-4 w-4" />
            매도 시뮬레이터
          </TabsTrigger>
        </TabsList>

        <TabsContent value="assets" className="space-y-6">
          {/* 소유권 안내 — 원장은 asset_manager, 여기는 읽기 전용 (Asset Hub §1.5) */}
          <Card className="border-blue-200 bg-blue-50 dark:border-blue-900 dark:bg-blue-950">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2">
                <ExternalLink className="h-4 w-4" />
                asset_manager 연동 (읽기 전용)
              </CardTitle>
            </CardHeader>
            <CardContent>
              <CardDescription>
                부동산 원장은 asset_manager가 소유합니다. 물건 등록·수정·삭제와
                양도세 상세 계산은{" "}
                <a
                  href={ASSET_MANAGER_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="underline underline-offset-2"
                >
                  asset_manager
                </a>
                에서 진행하세요. 값이 틀렸다면 소유 서비스에서 고치면 이곳에
                자동 반영됩니다.
              </CardDescription>
            </CardContent>
          </Card>

          <AssetList />
        </TabsContent>

        <TabsContent value="sale-simulator">
          <SaleSimulator />
        </TabsContent>
      </Tabs>
    </PageContainer>
  );
}
