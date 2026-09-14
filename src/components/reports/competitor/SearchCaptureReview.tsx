"use client";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { discoveryRequestSchema, type DiscoveryRequest } from "@/lib/briefing/discovery-contracts";
import { dateTime, nativeSelectClass } from "./competitor-utils";
import { readSearchCapture, type SearchCapture } from "./search-capture";
import type { CollectionJob } from "@/lib/briefing/collection-contracts";

export function SearchCaptureReview({ capture, collectionJob, busy, onSave, onCancel }: { capture: SearchCapture; collectionJob?: CollectionJob; busy: boolean;
  onSave: (request: DiscoveryRequest) => Promise<boolean>; onCancel: () => void }) {
  const [rows, setRows] = useState(() => capture.items.map(item => ({ ...item, productUrl: item.productUrl || "", selected: false, adStatus: item.adStatus as "AD" | "ORGANIC" | "UNKNOWN", relevance: "UNKNOWN" })));
  const [confirmed, setConfirmed] = useState(false);
  const [error, setError] = useState("");
  const change = (index: number, patch: Partial<(typeof rows)[number]>) => { setRows(current => current.map((r, i) => i === index ? { ...r, ...patch } : r)); setConfirmed(false); setError(""); };
  const selected = rows.filter(row => row.selected);
  const save = async () => {
    if (!confirmed) return;
    try { readSearchCapture(capture); } catch (e) { setError(e instanceof Error ? e.message : "자료를 다시 수집해 주세요."); return; }
    const request = discoveryRequestSchema.safeParse({ action: "import", ...(collectionJob ? { collectionJobId: collectionJob.id, collectionJobVersion: collectionJob.version } : {}), evidence: selected.map(row => ({ productUrl: row.productUrl,
      storeName: row.storeName, title: row.title, query: capture.query, observedAt: capture.capturedAt, position: row.position,
      adStatus: row.adStatus, relevance: row.relevance, purchaseLabel: row.purchaseLabel, reviewCount: row.reviewCount, reviewBasis: row.reviewBasis,
      sourceUrl: capture.sourceUrl, searchSort: capture.searchSort, searchEnvironment: capture.searchEnvironment, collectionMethod: "EXTENSION" })) });
    if (!request.success) { setError("선택한 항목의 실제 상품 주소와 확인 값을 점검해 주세요."); return; }
    if (await onSave(request.data)) onCancel();
  };
  return <section className="rounded-md border p-3 space-y-3" aria-label="검색 수집 미리보기">
    <h4 className="font-medium">검색 수집 미리보기 — {rows.length}개 상품</h4>
    {collectionJob && <p className="text-xs">연결 작업: {collectionJob.query}. 선택한 근거를 저장하면 작업을 완료로 기록합니다.</p>}
    <p className="text-xs">{capture.query} · {capture.searchSort === "UNKNOWN" ? "정렬 미확인" : capture.searchSort} · {dateTime(capture.capturedAt)}</p>
    <a className="text-xs underline" href={capture.sourceUrl} target="_blank" rel="noopener noreferrer">원본 검색 화면 열기</a>
    <p className="text-xs text-muted-foreground">위치는 현재 페이지의 상품 목록 순서입니다. 조합한 주소는 실제 상품 페이지에서 확인하세요. 비광고 여부를 확인한 항목만 ‘비광고 확인’으로 변경하고 품목을 분류합니다. 검색 리뷰의 집계 기준은 미확인으로 보관합니다.</p>
    <ul className="space-y-3">{rows.map((row, index) => <li key={row.position} className="rounded border p-3 space-y-2">
      <label className="flex items-start gap-2 text-sm"><input type="checkbox" disabled={busy} checked={row.selected} onChange={e => change(index, { selected: e.target.checked })} />
        <span>목록 {row.position} · {row.storeName} · {row.title}</span></label>
      <p className="text-xs">{row.urlStatus === "COMPOSED" ? "판매처 링크와 상품 번호로 조합한 주소 — 확인 필요" : row.urlStatus === "UNRESOLVED" ? "광고 이동 주소 등으로 실제 상품 주소 확인 필요" : "검색 링크에서 읽은 상품 주소"}</p>
      <Input aria-label={`목록 ${row.position} 실제 상품 주소`} value={row.productUrl} maxLength={2000} disabled={busy} onChange={e => change(index, { productUrl: e.target.value })} placeholder="실제 스마트스토어·브랜드스토어 상품 URL" />
      <div className="grid gap-2 sm:grid-cols-2">
        <select aria-label={`목록 ${row.position} 광고 여부`} className={nativeSelectClass} value={row.adStatus} disabled={busy || capture.items[index].adStatus === "AD"} onChange={e => change(index, { adStatus: e.target.value as "ORGANIC" | "UNKNOWN" })}><option value="UNKNOWN">광고 여부 미확인</option><option value="AD">광고 확인</option><option value="ORGANIC">비광고 확인</option></select>
        <select aria-label={`목록 ${row.position} 품목 확인`} className={nativeSelectClass} value={row.relevance} disabled={busy} onChange={e => change(index, { relevance: e.target.value })}><option value="UNKNOWN">품목 미확인</option><option value="MATCH">품목 일치 확인</option><option value="MISMATCH">품목 불일치</option></select>
      </div>
      <p className="text-xs">구매 표기 {row.purchaseLabel || "미확인"} · 리뷰 {row.reviewCount ?? "미확인"}</p>
    </li>)}</ul>
    {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
    <label className="flex gap-2 text-sm"><input type="checkbox" disabled={busy || !selected.length} checked={confirmed} onChange={e => setConfirmed(e.target.checked)} />선택 항목의 상품 주소를 실제 페이지와 대조하고 광고·품목 확인 값을 검토했습니다.</label>
    <div className="flex gap-2"><Button type="button" disabled={busy || !confirmed || !selected.length} onClick={() => void save()}>선택 {selected.length}개 후보 저장</Button><Button type="button" variant="outline" disabled={busy} onClick={onCancel}>미리보기 닫기</Button></div>
  </section>;
}
