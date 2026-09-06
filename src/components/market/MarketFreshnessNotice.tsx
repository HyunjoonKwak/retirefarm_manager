"use client";
import { useState } from "react";

export function MarketFreshnessNotice({ latestDate }: { latestDate: string | null }) {
  const [now] = useState(() => Date.now());
  if (!latestDate) return null;
  const latest = new Date(latestDate);
  if (!Number.isFinite(latest.getTime())) return null;
  const daysOld = Math.floor((now - latest.getTime()) / 86400000);
  return <div role={daysOld >= 3 ? "status" : undefined} className={`rounded-md border p-3 text-sm ${daysOld >= 3 ? "border-amber-500 text-amber-700 dark:text-amber-300" : "text-muted-foreground"}`}>
    전체 저장 자료의 최신 거래일: {latest.toLocaleDateString("ko-KR", { timeZone: "Asia/Seoul" })}
    {daysOld >= 3 && <p className="mt-1">최근 {daysOld}일간 새 거래 자료가 없습니다. 현재 시세로 판단하기 전에 수집 탭에서 예약 상태와 수집 결과를 확인해 주세요. 거래가 없는 기간일 수도 있습니다.</p>}
  </div>;
}
