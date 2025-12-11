"use client";

import { useMemo } from "react";
import { formatLargeNumber, formatDate } from "@/lib/utils/format";
import { Badge } from "@/components/ui/badge";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

interface FundingItem {
  id: string;
  type: string;
  name: string;
  amount: string;
  expectedDate: string;
  status: string;
}

interface FundingTimelineVisualProps {
  fundingSources: FundingItem[];
  targetDate: string;
  totalRequired: number;
  totalPlanned: number;
}

const FUNDING_TYPE_COLORS: Record<string, string> = {
  REAL_ESTATE_SALE: "bg-blue-500",
  SAVINGS: "bg-green-500",
  LOAN: "bg-yellow-500",
  GOVERNMENT_SUBSIDY: "bg-purple-500",
  RETIREMENT_PAY: "bg-orange-500",
  SEVERANCE_PAY: "bg-orange-400",
  OTHER: "bg-gray-500",
};

const FUNDING_TYPE_LABELS: Record<string, string> = {
  REAL_ESTATE_SALE: "부동산 매도",
  SAVINGS: "저축",
  LOAN: "대출",
  GOVERNMENT_SUBSIDY: "정부 보조금",
  RETIREMENT_PAY: "퇴직금",
  SEVERANCE_PAY: "퇴직수당",
  OTHER: "기타",
};

export function FundingTimelineVisual({
  fundingSources,
  targetDate,
  totalRequired,
  totalPlanned,
}: FundingTimelineVisualProps) {
  const today = new Date();
  const target = new Date(targetDate);
  const totalDays = Math.max(1, Math.ceil((target.getTime() - today.getTime()) / (1000 * 60 * 60 * 24)));

  // 타임라인 아이템 계산
  const timelineItems = useMemo(() => {
    return fundingSources
      .map((item) => {
        const itemDate = new Date(item.expectedDate);
        const daysFromToday = Math.ceil((itemDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
        const position = Math.max(0, Math.min(100, (daysFromToday / totalDays) * 100));

        return {
          ...item,
          date: itemDate,
          daysFromToday,
          position,
          amount: Number(item.amount),
        };
      })
      .sort((a, b) => a.daysFromToday - b.daysFromToday);
  }, [fundingSources, today, totalDays]);

  // 누적 금액 계산 (시간순)
  const cumulativeData = useMemo(() => {
    let cumulative = 0;
    return timelineItems.map((item) => {
      cumulative += item.amount;
      return {
        ...item,
        cumulative,
        coveragePercent: totalRequired > 0 ? (cumulative / totalRequired) * 100 : 0,
      };
    });
  }, [timelineItems, totalRequired]);

  // 부족/초과 금액 계산
  const fundingDifference = totalPlanned - totalRequired;
  const isShortfall = fundingDifference < 0;
  const isSurplus = fundingDifference > 0;

  if (fundingSources.length === 0) {
    return (
      <div className="text-center py-8 text-muted-foreground">
        <p>등록된 자금 조달 계획이 없습니다.</p>
        <p className="text-sm mt-1">자금 조달 계획을 추가해주세요.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* 자금 비교 요약 */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="p-3 bg-muted rounded-lg">
          <p className="text-xs text-muted-foreground">필요 자금</p>
          <p className="text-lg font-bold">{formatLargeNumber(totalRequired)}</p>
        </div>
        <div className="p-3 bg-muted rounded-lg">
          <p className="text-xs text-muted-foreground">확보 계획</p>
          <p className="text-lg font-bold text-blue-600">{formatLargeNumber(totalPlanned)}</p>
        </div>
        <div className={`p-3 rounded-lg ${isShortfall ? "bg-red-50" : isSurplus ? "bg-green-50" : "bg-muted"}`}>
          <p className="text-xs text-muted-foreground">
            {isShortfall ? "부족 금액" : isSurplus ? "초과 예정" : "차액"}
          </p>
          <p className={`text-lg font-bold ${isShortfall ? "text-red-600" : isSurplus ? "text-green-600" : ""}`}>
            {isShortfall ? "-" : isSurplus ? "+" : ""}{formatLargeNumber(Math.abs(fundingDifference))}
          </p>
        </div>
        <div className="p-3 bg-muted rounded-lg">
          <p className="text-xs text-muted-foreground">달성률</p>
          <p className={`text-lg font-bold ${totalPlanned >= totalRequired ? "text-green-600" : "text-orange-600"}`}>
            {totalRequired > 0 ? Math.round((totalPlanned / totalRequired) * 100) : 0}%
          </p>
        </div>
      </div>

      {/* 시각적 타임라인 */}
      <div className="space-y-4">
        <div className="flex justify-between text-sm text-muted-foreground">
          <span>오늘</span>
          <span>퇴직 목표일 ({formatDate(targetDate)})</span>
        </div>

        {/* 타임라인 바 */}
        <div className="relative">
          {/* 배경 바 */}
          <div className="h-3 bg-muted rounded-full relative overflow-hidden">
            {/* 진행률 표시 (필요 자금 대비 누적 확보 계획) */}
            <div
              className="absolute h-full bg-gradient-to-r from-green-400 to-green-500 rounded-full transition-all duration-500"
              style={{ width: `${Math.min(100, (totalPlanned / totalRequired) * 100)}%` }}
            />
          </div>

          {/* 마커들 */}
          <TooltipProvider>
            {cumulativeData.map((item, index) => (
              <Tooltip key={item.id}>
                <TooltipTrigger asChild>
                  <div
                    className={`absolute -top-1 w-5 h-5 rounded-full border-2 border-white shadow-md cursor-pointer transform -translate-x-1/2 transition-transform hover:scale-125 ${FUNDING_TYPE_COLORS[item.type] || "bg-gray-500"}`}
                    style={{ left: `${item.position}%` }}
                  >
                    <span className="sr-only">{item.name}</span>
                  </div>
                </TooltipTrigger>
                <TooltipContent side="top" className="max-w-xs">
                  <div className="space-y-1">
                    <p className="font-medium">{item.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {FUNDING_TYPE_LABELS[item.type] || item.type}
                    </p>
                    <p className="font-bold text-green-600">+{formatLargeNumber(item.amount)}</p>
                    <p className="text-xs">{formatDate(item.expectedDate)}</p>
                    <div className="pt-1 border-t">
                      <p className="text-xs">
                        누적: {formatLargeNumber(item.cumulative)} ({Math.round(item.coveragePercent)}%)
                      </p>
                    </div>
                  </div>
                </TooltipContent>
              </Tooltip>
            ))}
          </TooltipProvider>

          {/* 오늘 마커 */}
          <div className="absolute -top-1 left-0 w-1 h-5 bg-red-500 rounded-full" />

          {/* 목표일 마커 */}
          <div className="absolute -top-1 right-0 w-1 h-5 bg-primary rounded-full" />
        </div>

        {/* 범례 */}
        <div className="flex flex-wrap gap-2 pt-2">
          {Object.entries(FUNDING_TYPE_LABELS).map(([type, label]) => {
            const hasItems = fundingSources.some((item) => item.type === type);
            if (!hasItems) return null;
            return (
              <div key={type} className="flex items-center gap-1.5">
                <div className={`w-3 h-3 rounded-full ${FUNDING_TYPE_COLORS[type]}`} />
                <span className="text-xs text-muted-foreground">{label}</span>
              </div>
            );
          })}
        </div>
      </div>

      {/* 자금 유입 목록 */}
      <div className="space-y-2">
        <p className="text-sm font-medium">자금 유입 순서</p>
        <div className="space-y-2 max-h-60 overflow-y-auto">
          {cumulativeData.map((item, index) => (
            <div
              key={item.id}
              className="flex items-center justify-between p-3 border rounded-lg hover:bg-muted/50 transition-colors"
            >
              <div className="flex items-center gap-3">
                <div className="flex items-center justify-center w-6 h-6 rounded-full bg-muted text-xs font-medium">
                  {index + 1}
                </div>
                <div className={`w-2 h-2 rounded-full ${FUNDING_TYPE_COLORS[item.type]}`} />
                <div>
                  <p className="font-medium text-sm">{item.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {formatDate(item.expectedDate)}
                    {item.daysFromToday > 0 ? ` (${item.daysFromToday}일 후)` : item.daysFromToday === 0 ? " (오늘)" : ` (${Math.abs(item.daysFromToday)}일 전)`}
                  </p>
                </div>
              </div>
              <div className="text-right">
                <p className="font-bold text-green-600">+{formatLargeNumber(item.amount)}</p>
                <p className="text-xs text-muted-foreground">
                  누적 {Math.round(item.coveragePercent)}%
                </p>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* 상태 메시지 */}
      {isShortfall && (
        <div className="p-4 bg-red-50 border border-red-200 rounded-lg">
          <p className="text-sm text-red-800">
            <span className="font-bold">{formatLargeNumber(Math.abs(fundingDifference))}</span>의 추가 자금 확보가 필요합니다.
            현재 확보 계획은 필요 자금의 <span className="font-bold">{Math.round((totalPlanned / totalRequired) * 100)}%</span>입니다.
          </p>
        </div>
      )}
      {isSurplus && (
        <div className="p-4 bg-green-50 border border-green-200 rounded-lg">
          <p className="text-sm text-green-800">
            필요 자금 대비 <span className="font-bold">{formatLargeNumber(fundingDifference)}</span>의 여유 자금이 예상됩니다.
            예비비 또는 추가 투자에 활용할 수 있습니다.
          </p>
        </div>
      )}
    </div>
  );
}
