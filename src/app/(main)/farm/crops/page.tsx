import { PageContainer } from "@/components/layout";
import { CropManager } from "@/components/farm/CropManager";
import { CropCalendar } from "@/components/farm/CropCalendar";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { CalendarDays, List } from "lucide-react";

export default function CropsPage() {
  return (
    <PageContainer
      title="작물 관리"
      description="작기 캘린더와 재배 작물 현황·생육 단계 관리"
    >
      <Tabs defaultValue="calendar" className="space-y-6">
        <TabsList>
          <TabsTrigger value="calendar" className="gap-2">
            <CalendarDays className="h-4 w-4" />
            작기 캘린더
          </TabsTrigger>
          <TabsTrigger value="list" className="gap-2">
            <List className="h-4 w-4" />
            작물 목록
          </TabsTrigger>
        </TabsList>

        <TabsContent value="calendar">
          <CropCalendar />
        </TabsContent>

        <TabsContent value="list">
          <CropManager />
        </TabsContent>
      </Tabs>
    </PageContainer>
  );
}
