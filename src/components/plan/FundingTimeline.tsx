"use client";

import { formatLargeNumber, formatDate } from "@/lib/utils/format";

interface FundingTimelineProps {
  fundingSources: Array<{
    id: string;
    type: string;
    name: string;
    amount: string;
    expectedDate: string;
    status: string;
  }>;
  expectedProceeds: Array<{
    id: string;
    propertyName: string;
    expectedSaleDate: string;
    estimatedNetProceeds: string;
  }>;
  targetDate: string;
}

const FUNDING_TYPE_LABELS: Record<string, string> = {
  REAL_ESTATE_SALE: "부동산 매도",
  SAVINGS: "저축",
  LOAN: "대출",
  GOVERNMENT_SUBSIDY: "정부 보조금",
  RETIREMENT_PAY: "퇴직금",
  SEVERANCE_PAY: "퇴직수당",
  OTHER: "기타",
};

const FUNDING_TYPE_COLORS: Record<string, string> = {
  REAL_ESTATE_SALE: "bg-blue-500",
  SAVINGS: "bg-green-500",
  LOAN: "bg-yellow-500",
  GOVERNMENT_SUBSIDY: "bg-purple-500",
  RETIREMENT_PAY: "bg-orange-500",
  SEVERANCE_PAY: "bg-orange-400",
  OTHER: "bg-gray-500",
};

interface TimelineItem {
  id: string;
  date: Date;
  type: string;
  label: string;
  description: string;
  amount: number;
  color: string;
  isRetirementDate?: boolean;
}

export function FundingTimeline({ fundingSources, expectedProceeds, targetDate }: FundingTimelineProps) {
  // 타임라인 아이템 생성
  const items: TimelineItem[] = [];

  // 자금 조달 항목 추가
  fundingSources.forEach((source) => {
    items.push({
      id: source.id,
      date: new Date(source.expectedDate),
      type: source.type,
      label: FUNDING_TYPE_LABELS[source.type] || source.type,
      description: source.name,
      amount: Number(source.amount),
      color: FUNDING_TYPE_COLORS[source.type] || "bg-gray-500",
    });
  });

  // 부동산 매도 예정 추가 (자금 조달에 없는 경우)
  expectedProceeds.forEach((asset) => {
    const existingSource = fundingSources.find(
      (s) => s.type === "REAL_ESTATE_SALE" && s.name.includes(asset.propertyName)
    );
    if (!existingSource) {
      items.push({
        id: `asset-${asset.id}`,
        date: new Date(asset.expectedSaleDate),
        type: "REAL_ESTATE_SALE",
        label: "부동산 매도",
        description: asset.propertyName,
        amount: Number(asset.estimatedNetProceeds),
        color: "bg-blue-400",
      });
    }
  });

  // 퇴직일 추가
  items.push({
    id: "retirement-date",
    date: new Date(targetDate),
    type: "RETIREMENT",
    label: "퇴직 예정일",
    description: "스마트팜 준비 시작",
    amount: 0,
    color: "bg-red-500",
    isRetirementDate: true,
  });

  // 날짜순 정렬
  items.sort((a, b) => a.date.getTime() - b.date.getTime());

  if (items.length <= 1) {
    return (
      <div className="text-center py-6">
        <p className="text-muted-foreground text-sm">
          자금 조달 계획을 등록하면 타임라인이 표시됩니다.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {items.map((item, index) => (
        <div key={item.id} className="flex gap-4">
          {/* 타임라인 도트 */}
          <div className="flex flex-col items-center">
            <div
              className={`w-3 h-3 rounded-full ${item.color} ${
                item.isRetirementDate ? "ring-2 ring-red-200" : ""
              }`}
            />
            {index < items.length - 1 && (
              <div className="w-0.5 h-full bg-gray-200 mt-1" />
            )}
          </div>

          {/* 내용 */}
          <div className={`flex-1 pb-4 ${item.isRetirementDate ? "bg-red-50 p-3 rounded-lg -mt-1" : ""}`}>
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">{formatDate(item.date.toISOString())}</p>
                <p className={`font-medium ${item.isRetirementDate ? "text-red-700" : ""}`}>
                  {item.label}
                </p>
                <p className="text-sm text-muted-foreground">{item.description}</p>
              </div>
              {item.amount > 0 && (
                <span className="font-bold text-green-600">
                  +{formatLargeNumber(item.amount)}
                </span>
              )}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
