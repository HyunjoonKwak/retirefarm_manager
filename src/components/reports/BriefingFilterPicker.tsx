"use client";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import type { BriefingFacets } from "@/lib/briefing/facets";

export interface BriefingFilters { productName: string; origin: string; variety: string }
interface Props { disabled: boolean; filters: BriefingFilters; facets: BriefingFacets | null; loading: boolean; error: string;
  onChange: (filters: BriefingFilters) => void }

const selectClass = "border-input dark:bg-input/30 h-9 w-full min-w-0 rounded-md border bg-transparent px-3 py-1 text-base shadow-xs outline-none md:text-sm disabled:cursor-not-allowed disabled:opacity-50 focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px]";
const period = (facets: BriefingFacets) => [facets.periodStart, new Date(new Date(facets.periodEnd).getTime() - 86400_000).toISOString()]
  .map(value => new Date(value).toLocaleDateString("ko-KR", { timeZone: "Asia/Seoul", month: "numeric", day: "numeric" })).join("~");

/** Product is typed; origin and variety are chosen from records observed for the last completed week. */
export function BriefingFilterPicker({ disabled, filters, facets, loading, error, onChange }: Props) {
  const originSelected = filters.origin !== "";
  const unobserved = (variety: string) => !!variety && originSelected && !facets?.varieties.find(item => item.variety === variety)?.observedForOrigin;
  // Keep the current choice visible even when the loaded list lacks it, so the screen never differs from the request.
  const originMissing = originSelected && !facets?.origins.some(item => item.origin === filters.origin);
  const varietyMissing = !!filters.variety && !facets?.varieties.some(item => item.variety === filters.variety);
  const hint = !filters.productName.trim() ? "품목을 입력하면 지난주 기록에 있는 산지·품종을 보여 줍니다."
    : loading ? "지난주 기록을 확인하는 중입니다." : error ? "" : facets && !facets.origins.length && !facets.varieties.length
      ? `지난주(${period(facets)}) 저장 기록에서 이 품목의 유효 거래를 찾지 못했습니다. 전체 조건으로 미리보기는 가능합니다.`
      : facets ? `지난주(${period(facets)}) 저장 기록 · 산지 ${facets.origins.length}곳 · 품종 ${facets.varieties.length}종 · 법인 ${facets.corporations.length}곳` : "";
  return <div className="space-y-2">
    <div className="grid gap-3 sm:grid-cols-3">
      <div><Label htmlFor="brief-product">품목</Label>
        <Input disabled={disabled} id="brief-product" value={filters.productName} maxLength={50}
          onChange={e => onChange({ productName: e.target.value, origin: "", variety: "" })} /></div>
      <div><Label htmlFor="brief-origin">산지 (선택)</Label>
        <select id="brief-origin" className={cn(selectClass, originMissing && !loading && "border-destructive")} disabled={disabled || loading} value={filters.origin}
          onChange={e => onChange({ ...filters, origin: e.target.value, variety: "" })}>
          <option value="">전체 산지</option>
          {originMissing && <option value={filters.origin}>{filters.origin} · {loading ? "확인 중" : "기록 확인 안 됨"}</option>}
          {facets?.origins.map(item => <option key={item.origin} value={item.origin}>{item.origin} · {item.tradeCount}건</option>)}
        </select></div>
      <div><Label htmlFor="brief-variety">품종 (선택)</Label>
        <select id="brief-variety" className={cn(selectClass, (unobserved(filters.variety) || varietyMissing) && !loading && "border-destructive")} disabled={disabled || loading} value={filters.variety}
          onChange={e => onChange({ ...filters, variety: e.target.value })}>
          <option value="">전체 품종</option>
          {varietyMissing && <option value={filters.variety}>{filters.variety} · {loading ? "확인 중" : "기록 확인 안 됨"}</option>}
          {facets?.varieties.map(item => <option key={item.variety} value={item.variety} disabled={!item.observedForOrigin}>
            {item.variety}{item.observedForOrigin ? ` · ${item.tradeCount}건` : " · 선택 산지 기록 없음"}</option>)}
        </select></div>
    </div>
    {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    {error && <p role="alert" className="text-xs text-destructive">{error} 전체 산지·전체 품종으로는 계속 진행할 수 있습니다.</p>}
    <p className="text-xs text-muted-foreground">선택지는 선택한 법인의 저장된 경매 기록에서 관측된 이름이며 품목·산지는 정확히 일치하는 기록만 셉니다. 기록이 있다고 실제 출하가 있었다는 증명은 아니고, 없다고 출하가 없었다는 뜻도 아닙니다.</p>
  </div>;
}
