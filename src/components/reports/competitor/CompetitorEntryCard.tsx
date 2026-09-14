"use client";

import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { qualityLabels, varietyLabels, sizeLabels, colorLabels, mixtureLabels, processingLabels, type CompetitorEntry, type CompetitorRequest } from "@/lib/briefing/competitor-contracts";
import {
  availabilityLabels, dateTime, deliveredPrice, fromDatetimeLocal, isSafeHttpUrl, kg, latestObservation, nativeSelectClass,
  parseMoney, perKg, shippingLabel, sortedObservations, toDatetimeLocal, won, type Availability,
} from "./competitor-utils";

import { VisiblePriceImport } from "./VisiblePriceImport";

export type RecordRequest = Extract<CompetitorRequest, { action: "record" }>;
export type ArchiveRequest = Extract<CompetitorRequest, { action: "archive" }>;

interface Props { entry: CompetitorEntry; busy: boolean; onRecord: (request: RecordRequest) => Promise<boolean>; onArchive: (request: ArchiveRequest) => void }

const groupLabel = (key: string, labels: Record<string, string>) => labels[key] ?? key;

/** One fixed panel: latest manual observation, full history, and the record/archive forms. */
export function CompetitorEntryCard({ entry, busy, onRecord, onArchive }: Props) {
  const latest = latestObservation(entry);
  const archived = entry.archivedAt !== null;
  const delivered = latest ? deliveredPrice(latest) : null;
  return <li className="rounded-lg border p-4 space-y-3">
    <div className="flex flex-wrap items-start gap-2">
      <div className="flex-1 min-w-0 space-y-1">
        <p className="font-medium break-words">{entry.storeName} · {entry.productName}</p>
        <p className="text-sm text-muted-foreground break-words">{entry.optionLabel} · {kg(entry.packageKg)} · {groupLabel(entry.varietyGroup, varietyLabels)} · {groupLabel(entry.qualityGroup, qualityLabels)} · {groupLabel(entry.sizeGrade ?? "UNKNOWN", sizeLabels)} · {entry.sizeCriteria || "크기 기준 미확인"}</p>
        <p className="text-sm text-muted-foreground break-words">품종명 {entry.cultivarName || "미확인"} · 색상 {groupLabel(entry.color ?? "UNKNOWN", colorLabels)} · {groupLabel(entry.mixture ?? "UNKNOWN", mixtureLabels)} · 가공 {groupLabel(entry.processing ?? "UNKNOWN", processingLabels)}</p>
      </div>
      {archived ? <Badge variant="outline">보관됨</Badge> : <Badge variant="secondary">추적 중</Badge>}
    </div>
    {isSafeHttpUrl(entry.productUrl) ? <a href={entry.productUrl} target="_blank" rel="noopener noreferrer" className="text-sm text-primary underline underline-offset-4 break-all">상품 페이지 열기</a>
      : <span className="text-sm text-muted-foreground">상품 링크 사용 불가</span>}
    {archived && <p className="text-sm text-muted-foreground">보관 {entry.archivedAt ? dateTime(entry.archivedAt) : ""} · 사유: {entry.archiveReason ?? "기록 없음"}</p>}
    <div className="rounded-md bg-muted/40 p-3 text-sm space-y-1">
      {latest ? <>
        <p><span className="font-medium">최근 관측</span> {dateTime(latest.observedAt)} · {groupLabel(latest.availability, availabilityLabels)}</p>
        <p>판매가 {won(latest.price)} · {shippingLabel(latest.shippingFee)} · 배송 포함 {won(delivered)}{delivered !== null && ` (kg당 ${won(perKg(delivered, entry.packageKg))})`}</p>
        {latest.notes && <p className="text-muted-foreground break-words">메모: {latest.notes}</p>}
      </> : <p className="text-muted-foreground">아직 기록한 관측이 없습니다. 상품 페이지에서 확인한 가격을 아래에 기록하세요.</p>}
    </div>
    {entry.observations.length > 1 && <details className="text-sm">
      <summary className="cursor-pointer">관측 이력 {entry.observations.length}건</summary>
      <ul className="mt-2 space-y-1">
        {sortedObservations(entry).map(item => <li key={item.id} className="text-muted-foreground break-words">
          {dateTime(item.observedAt)} · {groupLabel(item.availability, availabilityLabels)} · 판매가 {won(item.price)} · {shippingLabel(item.shippingFee)}{item.notes ? ` · ${item.notes}` : ""}
        </li>)}
      </ul>
    </details>}
    {!archived && <>
      <RecordForm entry={entry} busy={busy} onRecord={onRecord} />
      <ArchiveForm entryId={entry.id} busy={busy} onArchive={onArchive} />
    </>}
  </li>;
}

interface RecordDraft { observedAt: string; sourceCapturedAt?: string; price: string; shippingFee: string; availability: Availability; notes: string }

function RecordForm({ entry, busy, onRecord }: { entry: CompetitorEntry; busy: boolean; onRecord: (request: RecordRequest) => Promise<boolean> }) {
  const entryId = entry.id;
  const [importKey, setImportKey] = useState(0);
  const [draft, setDraft] = useState<RecordDraft>(() => ({ observedAt: toDatetimeLocal(new Date()), price: "", shippingFee: "", availability: "IN_STOCK", notes: "" }));
  const [error, setError] = useState("");
  const update = (patch: Partial<RecordDraft>) => { setDraft(current => ({ ...current, ...(patch.observedAt !== undefined ? { sourceCapturedAt: undefined } : {}), ...patch })); setError(""); };
  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    const observedAt = draft.sourceCapturedAt ?? fromDatetimeLocal(draft.observedAt);
    if (!observedAt) { setError("관측 시각을 확인해 주세요."); return; }
    if (Date.parse(observedAt) > Date.now() + 60_000) { setError("관측 시각은 실제 확인한 과거 또는 현재 시각이어야 합니다."); return; }
    const price = parseMoney(draft.price); if (!price.ok) { setError(`판매가: ${price.error}`); return; }
    if (draft.availability === "IN_STOCK" && (price.value === null || price.value <= 0)) { setError("판매 중인 상품은 확인한 양수 판매가를 입력해 주세요."); return; }
    const shippingFee = parseMoney(draft.shippingFee); if (!shippingFee.ok) { setError(`배송비: ${shippingFee.error}`); return; }
    const notes = draft.notes.trim();
    if (notes.length > 1000) { setError("메모는 1,000자까지 입력할 수 있습니다."); return; }
    const saved = await onRecord({ action: "record", entryId, observedAt, price: price.value, shippingFee: shippingFee.value, availability: draft.availability, ...(notes ? { notes } : {}) });
    if (!saved) return;
    setImportKey(current => current + 1);
    setDraft(current => ({ ...current, sourceCapturedAt: undefined, price: "", shippingFee: "", notes: "", observedAt: toDatetimeLocal(new Date()) }));
  };
  const id = (name: string) => `record-${entryId}-${name}`;
  return <form className="space-y-2" onSubmit={submit}>
    <p className="text-sm font-medium">가격 관측 기록</p>
    <VisiblePriceImport key={importKey} entryId={entryId} optionLabel={entry.optionLabel} productUrl={entry.productUrl} busy={busy}
      onApply={({ capturedAt, ...values }) => update({ ...values, observedAt: toDatetimeLocal(capturedAt ? new Date(capturedAt) : new Date()), sourceCapturedAt: capturedAt })} />
    <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
      <div><Label htmlFor={id("at")}>관측 시각</Label>
        <Input id={id("at")} type="datetime-local" value={draft.observedAt} max={toDatetimeLocal(new Date())} disabled={busy} onChange={e => update({ observedAt: e.target.value })} /></div>
      <div><Label htmlFor={id("price")}>판매가 (원, 비우면 미확인)</Label>
        <Input id={id("price")} inputMode="numeric" value={draft.price} disabled={busy} placeholder="미확인" onChange={e => update({ price: e.target.value })} /></div>
      <div><Label htmlFor={id("ship")}>배송비 (원, 0은 무료)</Label>
        <Input id={id("ship")} inputMode="numeric" value={draft.shippingFee} disabled={busy} placeholder="미확인" onChange={e => update({ shippingFee: e.target.value })} /></div>
      <div><Label htmlFor={id("avail")}>재고 상태</Label>
        <select id={id("avail")} className={nativeSelectClass} value={draft.availability} disabled={busy} onChange={e => update({ availability: e.target.value as Availability })}>
          {(Object.keys(availabilityLabels) as Availability[]).map(key => <option key={key} value={key}>{availabilityLabels[key]}</option>)}
        </select></div>
    </div>
    <div><Label htmlFor={id("notes")}>메모 (선택)</Label>
      <Textarea id={id("notes")} value={draft.notes} maxLength={1000} disabled={busy} rows={2} placeholder="예: 옵션 변경, 쿠폰 적용가 등" onChange={e => update({ notes: e.target.value })} /></div>
    {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
    <Button type="submit" size="sm" disabled={busy}>관측 기록</Button>
  </form>;
}

function ArchiveForm({ entryId, busy, onArchive }: { entryId: string; busy: boolean; onArchive: (request: ArchiveRequest) => void }) {
  const [reason, setReason] = useState("");
  const trimmed = reason.trim();
  return <details className="text-sm">
    <summary className="cursor-pointer text-muted-foreground">패널에서 보관 (이력 유지)</summary>
    <form className="mt-2 flex flex-col gap-2 sm:flex-row sm:items-end" onSubmit={event => { event.preventDefault(); if (trimmed) onArchive({ action: "archive", entryId, reason: trimmed }); }}>
      <div className="flex-1"><Label htmlFor={`archive-${entryId}`}>보관 사유</Label>
        <Input id={`archive-${entryId}`} value={reason} maxLength={500} disabled={busy} placeholder="예: 판매 종료, 옵션 변경" onChange={e => setReason(e.target.value)} /></div>
      <Button type="submit" size="sm" variant="outline" disabled={busy || !trimmed}>보관</Button>
    </form>
  </details>;
}
