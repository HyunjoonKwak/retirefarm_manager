"use client";

import type { CompetitorGroup } from "@/lib/briefing/competitor-contracts";
import { won } from "./competitor-utils";

export const GROUP_MIN_STORES = 3;

const change = (pct: number | null, paired: number) =>
  pct === null ? `전주 비교 불가 (짝 ${paired}곳)` : `전주 대비 ${pct > 0 ? "+" : ""}${pct.toFixed(1)}% (짝 ${paired}곳)`;

/** Medians come from the server only; the browser never recomputes them from fewer stores. */
export function CompetitorGroupSummary({ groups }: { groups: CompetitorGroup[] }) {
  if (groups.length === 0) return <p className="text-sm text-muted-foreground">집계할 그룹이 아직 없습니다. 품종·품질·크기와 비교 기준이 확인된 패널만 집계합니다. 크기 미확인 자료는 패널의 관측 이력에서 볼 수 있습니다.</p>;
  return <ul className="grid gap-2 sm:grid-cols-2">
    {groups.map(group => <li key={group.key} className="rounded-md border p-3 text-sm space-y-1">
      <p className="font-medium break-words">{group.label} <span className="text-muted-foreground font-normal">· 유효 점포 {group.count}곳</span></p>
      {group.medianDeliveredPrice === null
        ? <p className="text-muted-foreground">{group.count < GROUP_MIN_STORES ? `대표 가격은 최근 7일 내 재고 있음·배송비 확인 관측이 있는 점포 ${GROUP_MIN_STORES}곳 이상일 때 표시합니다. (현재 ${group.count}곳)` : "최근 관측이 부족해 중앙값을 계산하지 못했습니다."}</p>
        : <>
          <p>배송 포함 중앙가격 <span className="font-medium">{won(group.medianDeliveredPrice)}</span> <span className="text-muted-foreground">/ 확인 옵션</span></p>
          <p className="text-muted-foreground">범위 {won(group.min)} ~ {won(group.max)} · {change(group.previousWeekChangePct, group.pairedCount)}</p>
        </>}
    </li>)}
  </ul>;
}
