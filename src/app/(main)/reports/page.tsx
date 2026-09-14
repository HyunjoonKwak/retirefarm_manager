import { PageContainer } from "@/components/layout";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { MonthlyReport } from "@/components/reports/MonthlyReport";
import { AnnualReport } from "@/components/reports/AnnualReport";
import { WeeklyBriefing } from "@/components/reports/WeeklyBriefing";
import { Calendar, CalendarDays } from "lucide-react";

export default function ReportsPage() {
  return (
    <PageContainer
      title="리포트"
      description="주간 농가 브리핑과 월간·연간 운영 보고서"
    >
      <Tabs defaultValue="monthly" className="space-y-6">
        <TabsList className="grid w-full max-w-lg grid-cols-3">
          <TabsTrigger value="weekly">주간 브리핑</TabsTrigger>
          <TabsTrigger value="monthly" className="flex items-center gap-2">
            <Calendar className="h-4 w-4" />
            월간 보고서
          </TabsTrigger>
          <TabsTrigger value="annual" className="flex items-center gap-2">
            <CalendarDays className="h-4 w-4" />
            연간 보고서
          </TabsTrigger>
        </TabsList>

        <TabsContent value="weekly"><WeeklyBriefing /></TabsContent>

        <TabsContent value="monthly">
          <MonthlyReport />
        </TabsContent>

        <TabsContent value="annual">
          <AnnualReport />
        </TabsContent>
      </Tabs>
    </PageContainer>
  );
}
