"use client";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { formatLargeNumber, formatDate } from "@/lib/utils/format";

interface FundingSource {
  id: string;
  type: "REAL_ESTATE_SALE" | "SAVINGS" | "LOAN" | "GOVERNMENT_SUBSIDY" | "RETIREMENT_PAY" | "SEVERANCE_PAY" | "OTHER";
  name: string;
  amount: string;
  expectedDate: string;
  status: "PLANNED" | "IN_PROGRESS" | "COMPLETED";
  notes?: string;
}

interface FundingSummary {
  totalAmount: string;
  completedAmount: string;
  totalSources: number;
  requiredAmount: string;
  fundingGap: string;
  fundingRatio: number;
}

const FUNDING_TYPE_CONFIG = {
  REAL_ESTATE_SALE: { label: "부동산 매각" },
  SAVINGS: { label: "저축" },
  LOAN: { label: "대출" },
  GOVERNMENT_SUBSIDY: { label: "정부지원" },
  RETIREMENT_PAY: { label: "퇴직금" },
  SEVERANCE_PAY: { label: "위로금" },
  OTHER: { label: "기타" },
};

const FUNDING_TYPE_BAR_COLORS: Record<string, string> = {
  REAL_ESTATE_SALE: "bg-blue-500",
  SAVINGS: "bg-green-500",
  LOAN: "bg-yellow-500",
  GOVERNMENT_SUBSIDY: "bg-purple-500",
  RETIREMENT_PAY: "bg-orange-500",
  SEVERANCE_PAY: "bg-teal-500",
  OTHER: "bg-gray-500",
};

interface CumulativeItem extends FundingSource {
  amountNum: number;
  cumulative: number;
  coveragePercent: number;
  daysFromToday: number;
}

interface FundingTimelineProps {
  fundingSources: FundingSource[];
  summary: FundingSummary;
  fundingGap: number;
  isOverfunded: boolean;
}

export function FundingTimeline({
  fundingSources,
  summary,
  fundingGap,
  isOverfunded,
}: FundingTimelineProps) {
  const totalPlanned = Number(summary.totalAmount);
  const totalRequired = Number(summary.requiredAmount);

  const sortedFundingSources = [...fundingSources].sort((a, b) => {
    return new Date(a.expectedDate).getTime() - new Date(b.expectedDate).getTime();
  });

  const today = new Date();
  const cumulativeData: CumulativeItem[] = [];

  sortedFundingSources.forEach((source, index) => {
    const prevCumulative = index > 0 ? cumulativeData[index - 1].cumulative : 0;
    const amountNum = Number(source.amount);
    const cumulative = prevCumulative + amountNum;
    const coveragePercent = totalRequired > 0 ? (cumulative / totalRequired) * 100 : 0;
    const expectedDate = new Date(source.expectedDate);
    const daysFromToday = Math.ceil(
      (expectedDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24)
    );
    cumulativeData.push({ ...source, amountNum, cumulative, coveragePercent, daysFromToday });
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle>자금 유입 계획</CardTitle>
        <CardDescription>예상 조달일 순서로 정렬된 자금 유입 계획입니다.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Stacked bar chart */}
        <div className="space-y-3">
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">자금 구성</span>
            <span className="font-medium">
              {formatLargeNumber(totalPlanned)} / {formatLargeNumber(totalRequired)}
              <span className="text-muted-foreground ml-1">
                ({totalRequired > 0 ? Math.round((totalPlanned / totalRequired) * 100) : 0}%)
              </span>
            </span>
          </div>

          <div className="relative h-8 bg-muted rounded-full overflow-hidden">
            {cumulativeData.map((item, index) => {
              const widthPercent = totalRequired > 0 ? (item.amountNum / totalRequired) * 100 : 0;
              const leftPercent = index > 0 ? cumulativeData[index - 1].coveragePercent : 0;

              return (
                <Popover key={item.id}>
                  <PopoverTrigger asChild>
                    <div
                      className={`absolute h-full cursor-pointer transition-opacity hover:opacity-80 ${FUNDING_TYPE_BAR_COLORS[item.type]}`}
                      style={{
                        left: `${Math.min(leftPercent, 100)}%`,
                        width: `${Math.min(widthPercent, 100 - leftPercent)}%`,
                      }}
                    />
                  </PopoverTrigger>
                  <PopoverContent side="top" className="w-56 p-3">
                    <div className="space-y-2">
                      <div className="flex items-center gap-2">
                        <div
                          className={`w-3 h-3 rounded-full ${FUNDING_TYPE_BAR_COLORS[item.type]}`}
                        />
                        <span className="font-medium text-sm">{item.name}</span>
                      </div>
                      <p className="text-xs text-muted-foreground">
                        {FUNDING_TYPE_CONFIG[item.type].label}
                      </p>
                      <p className="font-bold text-green-600">{formatLargeNumber(item.amountNum)}</p>
                      <p className="text-xs text-muted-foreground">{formatDate(item.expectedDate)}</p>
                    </div>
                  </PopoverContent>
                </Popover>
              );
            })}

            {totalPlanned < totalRequired && (
              <div
                className="absolute h-full w-0.5 bg-red-400"
                style={{ left: `${Math.min((totalPlanned / totalRequired) * 100, 100)}%` }}
              />
            )}
          </div>

          {/* Legend */}
          <div className="flex flex-wrap gap-3 pt-1">
            {Object.entries(FUNDING_TYPE_CONFIG).map(([type, config]) => {
              const hasItems = fundingSources.some((item) => item.type === type);
              if (!hasItems) return null;
              const typeTotal = fundingSources
                .filter((item) => item.type === type)
                .reduce((sum, item) => sum + Number(item.amount), 0);
              return (
                <div key={type} className="flex items-center gap-1.5">
                  <div className={`w-3 h-3 rounded-full ${FUNDING_TYPE_BAR_COLORS[type]}`} />
                  <span className="text-xs text-muted-foreground">
                    {config.label} ({formatLargeNumber(typeTotal)})
                  </span>
                </div>
              );
            })}
          </div>
        </div>

        {/* Inflow order list */}
        <div className="space-y-2">
          <p className="text-sm font-medium">유입 순서</p>
          <div className="space-y-2 max-h-[400px] overflow-y-auto">
            {cumulativeData.map((item, index) => {
              const typeConfig = FUNDING_TYPE_CONFIG[item.type];
              return (
                <div
                  key={item.id}
                  className="flex items-center justify-between p-3 border rounded-lg hover:bg-muted/50 transition-colors"
                >
                  <div className="flex items-center gap-3">
                    <div className="flex items-center justify-center w-6 h-6 rounded-full bg-muted text-xs font-medium">
                      {index + 1}
                    </div>
                    <div className={`w-2.5 h-2.5 rounded-full ${FUNDING_TYPE_BAR_COLORS[item.type]}`} />
                    <div>
                      <p className="font-medium text-sm">{item.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {typeConfig.label} · {formatDate(item.expectedDate)}
                        {item.daysFromToday > 0
                          ? ` (${item.daysFromToday}일 후)`
                          : item.daysFromToday === 0
                          ? " (오늘)"
                          : ` (${Math.abs(item.daysFromToday)}일 전)`}
                      </p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="font-bold text-green-600">+{formatLargeNumber(item.amountNum)}</p>
                    <p className="text-sm font-medium">{formatLargeNumber(item.cumulative)}</p>
                    <p className="text-xs text-muted-foreground">
                      ({Math.round(item.coveragePercent)}%)
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Status messages */}
        {fundingGap > 0 && (
          <div className="p-4 bg-red-50 border border-red-200 rounded-lg">
            <p className="text-sm text-red-800">
              <span className="font-bold">{formatLargeNumber(fundingGap)}</span>의 추가 자금 확보가
              필요합니다. 현재 확보 계획은 필요 자금의{" "}
              <span className="font-bold">
                {Math.round((totalPlanned / totalRequired) * 100)}%
              </span>
              입니다.
            </p>
          </div>
        )}
        {isOverfunded && (
          <div className="p-4 bg-green-50 border border-green-200 rounded-lg">
            <p className="text-sm text-green-800">
              필요 자금 대비{" "}
              <span className="font-bold">{formatLargeNumber(Math.abs(fundingGap))}</span>의 여유
              자금이 예상됩니다. 예비비 또는 추가 투자에 활용할 수 있습니다.
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
