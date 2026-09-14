"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { qualityLabels, varietyLabels, sizeLabels, colorLabels, mixtureLabels, processingLabels, type CompetitorRequest } from "@/lib/briefing/competitor-contracts";
import { isSafeHttpUrl, isSmartstoreProductUrl, nativeSelectClass, parseKg } from "./competitor-utils";

export type AddPanelRequest = Extract<CompetitorRequest, { action: "addPanel" }>;
type Variety = AddPanelRequest["varietyGroup"];
type Quality = AddPanelRequest["qualityGroup"];

export interface PanelDraft {
  storeName: string; productUrl: string; productName: string; varietyGroup: Variety; qualityGroup: Quality;
  optionLabel: string; sizeGrade: AddPanelRequest["sizeGrade"]; sizeCriteria: string; packageKg: string; confirmed: boolean;
  cultivarName: string; color: AddPanelRequest["color"]; mixture: AddPanelRequest["mixture"]; processing: AddPanelRequest["processing"];
}

/** productName is the comparison commodity label shared across stores, so it defaults to the farm's crop. */
export const DEFAULT_PRODUCT_NAME = "토마토";

export const emptyPanelDraft: PanelDraft = {
  storeName: "", productUrl: "", productName: DEFAULT_PRODUCT_NAME, varietyGroup: "UNKNOWN", qualityGroup: "REGULAR", optionLabel: "", sizeGrade: "UNKNOWN", sizeCriteria: "", packageKg: "", confirmed: false,
  cultivarName: "", color: "UNKNOWN", mixture: "UNKNOWN", processing: "UNKNOWN",
};

interface Props { initial: PanelDraft; busy: boolean; fromCandidate: boolean; onSubmit: (request: AddPanelRequest) => void; onReset: () => void }

function validate(draft: PanelDraft): { ok: true; request: AddPanelRequest } | { ok: false; error: string } {
  const storeName = draft.storeName.trim(); const productUrl = draft.productUrl.trim();
  const productName = draft.productName.trim(); const optionLabel = draft.optionLabel.trim();
  if (!storeName || storeName.length > 100) return { ok: false, error: "판매처 이름을 1~100자로 입력해 주세요." };
  if (!isSafeHttpUrl(productUrl) || productUrl.length > 2000 || !isSmartstoreProductUrl(productUrl))
    return { ok: false, error: "smartstore.naver.com 또는 brand.naver.com의 /<store>/products/<id> 상품 주소를 입력해 주세요." };
  if (!productName || productName.length > 100) return { ok: false, error: "비교 품목을 1~100자로 입력해 주세요." };
  if (!optionLabel || optionLabel.length > 200) return { ok: false, error: "상품 페이지에서 확인한 상품·옵션명을 1~200자로 입력해 주세요." };
  if (draft.cultivarName.trim().length > 100) return { ok: false, error: "품종명은 100자 이내로 입력해 주세요." };
  const weight = parseKg(draft.packageKg);
  if (!weight.ok) return { ok: false, error: weight.error };
  if (!draft.confirmed) return { ok: false, error: "상품 페이지에서 직접 확인했다는 체크가 필요합니다." };
  return { ok: true, request: { action: "addPanel", storeName, productUrl, productName, varietyGroup: draft.varietyGroup,
    qualityGroup: draft.qualityGroup, sizeGrade: draft.sizeGrade, sizeCriteria: draft.sizeCriteria.trim(), optionLabel, packageKg: weight.value,
    cultivarName: draft.cultivarName.trim(), color: draft.color, mixture: draft.mixture, processing: draft.processing, confirmed: true } };
}

/** Every field is typed or confirmed by the user; search candidates only prefill, never submit. */
export function CompetitorPanelForm({ initial, busy, fromCandidate, onSubmit, onReset }: Props) {
  const [draft, setDraft] = useState<PanelDraft>(initial);
  const [error, setError] = useState("");
  const update = (patch: Partial<PanelDraft>) => { setDraft(current => ({ ...current, ...patch, confirmed: false })); setError(""); };
  const urlTyped = draft.productUrl.trim().length > 0;
  const smartstore = urlTyped && isSmartstoreProductUrl(draft.productUrl.trim());
  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    const checked = validate(draft);
    if (!checked.ok) { setError(checked.error); return; }
    onSubmit(checked.request);
  };
  return <form className="rounded-lg border p-4 space-y-3" onSubmit={submit} aria-labelledby="competitor-panel-heading">
    <div className="flex flex-wrap items-center justify-between gap-2">
      <h3 id="competitor-panel-heading" className="font-semibold">고정 패널 추가 (수동 확인)</h3>
      {fromCandidate && <span className="text-xs text-muted-foreground">검색 후보에서 채운 값입니다. 상품 페이지와 대조해 수정하세요.</span>}
    </div>
    <p className="text-xs text-muted-foreground">판매처 30곳, 판매처마다 최대 10개 옵션을 추적합니다. 같은 상품 주소·옵션명·중량은 중복 등록할 수 없습니다. 기존 옵션의 비교 조건을 정정하려면 해당 옵션을 보관하고 다시 등록하세요.</p>
    <div className="grid gap-3 sm:grid-cols-2">
      <div><Label htmlFor="panel-store">판매처 이름</Label>
        <Input id="panel-store" value={draft.storeName} maxLength={100} disabled={busy} onChange={e => update({ storeName: e.target.value })} /></div>
      <div><Label htmlFor="panel-url">스마트스토어 상품 URL</Label>
        <Input id="panel-url" type="url" inputMode="url" value={draft.productUrl} maxLength={2000} disabled={busy} placeholder="https://smartstore.naver.com/<store>/products/<id>"
          onChange={e => update({ productUrl: e.target.value })} />
        {urlTyped && !smartstore && <p className="text-xs text-destructive">smartstore.naver.com 또는 brand.naver.com의 실제 상품 주소만 등록할 수 있습니다.</p>}</div>
      <div className="sm:col-span-2"><Label htmlFor="panel-name">비교 품목 (그룹 기준 라벨)</Label>
        <Input id="panel-name" value={draft.productName} maxLength={100} disabled={busy} placeholder={DEFAULT_PRODUCT_NAME} onChange={e => update({ productName: e.target.value })} />
        <p className="text-xs text-muted-foreground">점포별 상품 제목이 아니라 비교 묶음 이름입니다. 품목·품종명·색상·가공·품질·크기 기준·중량이 정확히 같은 단일 품종 상품끼리 집계됩니다.</p></div>
      <div className="sm:col-span-2"><Label htmlFor="panel-option">상품·옵션명 (상품 페이지 표기 그대로)</Label>
        <Input id="panel-option" value={draft.optionLabel} maxLength={200} disabled={busy} placeholder="예: 대추방울토마토 2kg 로얄과" onChange={e => update({ optionLabel: e.target.value })} /></div>
      <div><Label htmlFor="panel-kg">포장 중량 (kg)</Label>
        <Input id="panel-kg" inputMode="decimal" value={draft.packageKg} disabled={busy} placeholder="예: 2" onChange={e => update({ packageKg: e.target.value })} /></div>
      <div><Label htmlFor="panel-variety">품종 그룹</Label>
        <select id="panel-variety" className={nativeSelectClass} value={draft.varietyGroup} disabled={busy} onChange={e => update({ varietyGroup: e.target.value as Variety })}>
          {(Object.keys(varietyLabels) as Variety[]).map(key => <option key={key} value={key}>{varietyLabels[key]}</option>)}
        </select></div>
      <div><Label htmlFor="panel-cultivar">확인한 품종명</Label>
        <Input id="panel-cultivar" value={draft.cultivarName} maxLength={100} disabled={busy} placeholder="판매자가 확인한 품종명, 미확인은 빈칸" onChange={e => update({ cultivarName: e.target.value })} /></div>
      <div><Label htmlFor="panel-color">과실 색상</Label>
        <select id="panel-color" className={nativeSelectClass} value={draft.color} disabled={busy} onChange={e => update({ color: e.target.value as AddPanelRequest["color"] })}>
          {Object.entries(colorLabels).map(([key, label]) => <option key={key} value={key}>{label}</option>)}
        </select></div>
      <div><Label htmlFor="panel-mixture">품종 혼합 여부</Label>
        <select id="panel-mixture" className={nativeSelectClass} value={draft.mixture} disabled={busy} onChange={e => update({ mixture: e.target.value as AddPanelRequest["mixture"] })}>
          {Object.entries(mixtureLabels).map(([key, label]) => <option key={key} value={key}>{label}</option>)}
        </select></div>
      <div><Label htmlFor="panel-processing">가공 여부</Label>
        <select id="panel-processing" className={nativeSelectClass} value={draft.processing} disabled={busy} onChange={e => update({ processing: e.target.value as AddPanelRequest["processing"] })}>
          {Object.entries(processingLabels).map(([key, label]) => <option key={key} value={key}>{label}</option>)}
        </select></div>
      <p className="sm:col-span-2 text-xs text-muted-foreground">품종·색상·가공이 미확인이거나 기타인 상품과 혼합 상품은 기록만 보관합니다. 제목·사진만 보고 품종이나 무가공 여부를 추정하지 마세요. 혼합 상품은 구성 비율까지 비교할 수 있도록 개선할 예정입니다.</p>
      <div><Label htmlFor="panel-size">크기 구분</Label>
        <select id="panel-size" className={nativeSelectClass} value={draft.sizeGrade} disabled={busy} onChange={e => update({ sizeGrade: e.target.value as AddPanelRequest["sizeGrade"] })}>
          {Object.entries(sizeLabels).map(([key, label]) => <option key={key} value={key}>{label}</option>)}
        </select></div>
      <div className="sm:col-span-2"><Label htmlFor="panel-size-criteria">크기 비교 기준 (판매자 표기 확인)</Label>
        <Input id="panel-size-criteria" value={draft.sizeCriteria} maxLength={100} disabled={busy} placeholder="예: 지름 25~30mm / 개당 20~25g" onChange={e => update({ sizeCriteria: e.target.value })} />
        <p className="text-xs text-muted-foreground">같은 ‘중과’라도 판매자 기준이 다를 수 있습니다. 확인한 수치·범위가 같은 상품에 동일하게 입력하세요. 크기 또는 기준 미확인 상품은 기록만 보관하고 대표 가격에서 제외합니다.</p></div>
      <div><Label htmlFor="panel-quality">품질 그룹</Label>
        <select id="panel-quality" className={nativeSelectClass} value={draft.qualityGroup} disabled={busy} onChange={e => update({ qualityGroup: e.target.value as Quality })}>
          {(Object.keys(qualityLabels) as Quality[]).map(key => <option key={key} value={key}>{qualityLabels[key]}</option>)}
        </select></div>
    </div>
    <label className="flex items-start gap-2 text-sm">
      <Checkbox checked={draft.confirmed} disabled={busy} onCheckedChange={value => { setDraft(current => ({ ...current, confirmed: value === true })); setError(""); }} aria-label="상품 페이지에서 직접 확인함" />
      <span>상품 페이지에서 선택 옵션·중량과 입력한 비교 조건을 직접 확인했고, 확인되지 않은 값은 미확인으로 남겼습니다. 입력을 바꾸면 다시 확인해야 합니다.</span>
    </label>
    {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
    <div className="flex flex-wrap gap-2">
      <Button type="submit" disabled={busy || !draft.confirmed}>패널에 추가</Button>
      <Button type="button" variant="outline" disabled={busy} onClick={onReset}>양식 비우기</Button>
    </div>
    <p className="text-xs text-muted-foreground">추가 시 가격 관측은 만들어지지 않습니다. 추가 후 아래 패널에서 직접 확인한 가격·배송비를 기록하세요.</p>
  </form>;
}
