"use client";

import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { CompetitorGroup } from "@/lib/briefing/competitor-contracts";
import { nativeSelectClass, won } from "./competitor-utils";
import { computeScenario, defaultAssumptions, type CostAssumptions } from "./cost-scenario";

type Field = keyof CostAssumptions;
const fields: ReadonlyArray<{ key: Field; label: string; step: string }> = [
  { key: "packageKg", label: "내 포장 중량 (kg)", step: "0.1" },
  { key: "produceCostPerKg", label: "생산 원가 (원/kg)", step: "100" },
  { key: "packagingCost", label: "포장·자재비 (원/박스)", step: "100" },
  { key: "shippingCost", label: "내 배송비 부담 (원/박스)", step: "100" },
  { key: "platformFeePct", label: "플랫폼 수수료 (%)", step: "0.5" },
  { key: "targetMarginPct", label: "목표 마진 (% of 판매가)", step: "1" },
];
type DraftText = Record<Field, string>;
const toText = (values: CostAssumptions): DraftText => ({
  packageKg: String(values.packageKg), produceCostPerKg: String(values.produceCostPerKg), packagingCost: String(values.packagingCost),
  shippingCost: String(values.shippingCost), platformFeePct: String(values.platformFeePct), targetMarginPct: String(values.targetMarginPct),
});
const num = (value: string) => value.trim() === "" ? Number.NaN : Number(value);
const toNumbers = (text: DraftText): CostAssumptions => ({
  packageKg: num(text.packageKg), produceCostPerKg: num(text.produceCostPerKg), packagingCost: num(text.packagingCost),
  shippingCost: num(text.shippingCost), platformFeePct: num(text.platformFeePct), targetMarginPct: num(text.targetMarginPct),
});

/** Local what-if only: assumptions live in component state and never post to the server. */
export function CompetitorCostScenario({ groups }: { groups: CompetitorGroup[] }) {
  const [text, setText] = useState<DraftText>(() => ({ ...toText(defaultAssumptions), produceCostPerKg: "", packagingCost: "", platformFeePct: "" }));
  const [groupKey, setGroupKey] = useState("");
  const comparable = groups.filter(group => group.medianDeliveredPrice !== null);
  const selected = comparable.find(group => group.key === groupKey) ?? null;
  const sameWeight = selected?.packageKg === num(text.packageKg);
  const scenario = computeScenario(toNumbers(text), sameWeight ? selected?.medianDeliveredPrice ?? null : null);
  return <details className="rounded-lg border p-4">
    <summary className="cursor-pointer font-medium">원가 시나리오 계산기 (선택, 저장 안 됨)</summary>
    <div className="mt-3 space-y-3">
      <p className="text-sm text-muted-foreground">배송비 3,500원·목표마진 15%는 기존 Work의 가정이며 수정할 수 있습니다. 생산원가·포장비·수수료를 입력해야 계산합니다. 값은 서버에 저장되거나 관측 가격에 반영되지 않습니다. 배송 포함 판매가 기준으로 손익분기와 목표가를 계산합니다.</p>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {fields.map(field => <div key={field.key}><Label htmlFor={`scenario-${field.key}`}>{field.label}</Label>
          <Input id={`scenario-${field.key}`} type="number" inputMode="decimal" min="0" step={field.step} value={text[field.key]}
            onChange={event => setText(current => ({ ...current, [field.key]: event.target.value }))} /></div>)}
        <div><Label htmlFor="scenario-group">비교 그룹 (대표 가격 있는 그룹만)</Label>
          <select id="scenario-group" className={nativeSelectClass} value={groupKey} onChange={event => setGroupKey(event.target.value)}>
            <option value="">비교 안 함</option>
            {comparable.map(group => <option key={group.key} value={group.key}>{group.label} · 중앙 {won(group.medianDeliveredPrice)}</option>)}
          </select></div>
      </div>
      {scenario ? <dl className="grid gap-2 rounded-md bg-muted/40 p-3 text-sm sm:grid-cols-2">
        <div><dt className="text-muted-foreground">수수료 전 원가 (박스)</dt><dd className="font-medium">{won(scenario.costBeforeFee)}</dd></div>
        <div><dt className="text-muted-foreground">손익분기 판매가 (배송 포함)</dt><dd className="font-medium">{won(scenario.breakEvenPrice)}</dd></div>
        <div><dt className="text-muted-foreground">목표 마진 판매가 (배송 포함)</dt><dd className="font-medium">{won(scenario.targetPrice)} <span className="text-muted-foreground font-normal">(kg당 {won(scenario.targetPerKg)})</span></dd></div>
        <div><dt className="text-muted-foreground">선택 그룹 중앙가격 대비</dt>
          <dd className="font-medium">{scenario.medianGapPct === null ? "비교 그룹 없음" : `${scenario.medianGapPct > 0 ? "+" : ""}${scenario.medianGapPct.toFixed(1)}%`}</dd></div>
      </dl> : <p role="status" className="text-sm text-muted-foreground">미입력 항목과 가정을 확인해 주세요. 모든 값은 0 이상이어야 하고 수수료와 마진의 합은 100% 미만이어야 합니다.</p>}
      {selected && !sameWeight && <p className="text-xs text-muted-foreground">비교 그룹과 내 포장 중량이 다르거나 확인되지 않아 가격 차이 계산을 보류했습니다.</p>}
    </div>
  </details>;
}
