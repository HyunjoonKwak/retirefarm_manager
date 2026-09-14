"use client";

import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { varietyLabels, type CompetitorOverview } from "@/lib/briefing/competitor-contracts";
import type { ShoppingCandidate } from "@/lib/briefing/naver-shopping";
import { dateTime, describeSearchError, isSafeHttpUrl, kg, reviewReasonLabels, won } from "./competitor-utils";

interface Props {
  configured: boolean;
  latestSearch: CompetitorOverview["latestSearch"];
  busy: boolean;
  onSearch: (query: string) => void;
  onUseCandidate: (candidate: ShoppingCandidate) => void;
}

const MAX_QUERY = 100;
const searchStatusNames: Record<string, string> = { SUCCEEDED: "완료", FAILED: "실패", PENDING: "대기", RUNNING: "검색 중" };

/** One bounded official-API search per explicit click; results are review candidates, never facts. */
export function CompetitorSearchPanel({ configured, latestSearch, busy, onSearch, onUseCandidate }: Props) {
  const [query, setQuery] = useState("");
  const [showExcluded, setShowExcluded] = useState(false);
  const trimmed = query.trim();
  const canSearch = configured && !busy && trimmed.length > 0 && trimmed.length <= MAX_QUERY;
  const result = latestSearch?.result ?? null;
  const visible = result ? result.items.filter(item => showExcluded || !item.excluded) : [];
  return <section className="rounded-lg border p-4 space-y-3">
    <div className="flex flex-wrap items-center gap-2">
      <h3 className="font-semibold">네이버 쇼핑 검색 (공식 API)</h3>
      <Badge variant={configured ? "secondary" : "outline"}>{configured ? "서버 자격증명 설정됨" : "서버 자격증명 없음"}</Badge>
    </div>
    {!configured && <p role="status" className="text-sm text-muted-foreground">네이버 개발자센터 Client ID·Secret은 서버 환경변수로만 설정합니다. 브라우저에서는 키를 입력하거나 저장하지 않습니다.</p>}
    <form className="flex flex-col gap-2 sm:flex-row sm:items-end" onSubmit={event => { event.preventDefault(); if (canSearch) onSearch(trimmed); }}>
      <div className="flex-1">
        <Label htmlFor="competitor-query">검색어</Label>
        <Input id="competitor-query" value={query} maxLength={MAX_QUERY} disabled={!configured || busy} placeholder="예: 대추방울토마토 2kg"
          onChange={event => setQuery(event.target.value)} />
      </div>
      <Button type="submit" disabled={!canSearch}>검색 1회 실행</Button>
    </form>
    <p className="text-xs text-muted-foreground">버튼을 누를 때만 검색하며 한 번에 최대 100건(유사도순 1페이지)만 가져옵니다. 자동 검색·재시도·상품 페이지 수집은 하지 않습니다.</p>
    {latestSearch && <div className="space-y-2">
      <p className="text-sm">최근 검색: {searchStatusNames[latestSearch.status] ?? latestSearch.status} · {dateTime(latestSearch.createdAt)}
        {result && ` · "${result.query}" · 응답 ${result.items.length}건 (전체 ${result.total.toLocaleString("ko-KR")}건) · 제외 추정 ${result.excludedCount}건`}</p>
      {latestSearch.status === "FAILED" && <p role="alert" className="text-sm text-destructive">{describeSearchError(latestSearch.errorCode)}</p>}
      {result && result.excludedCount > 0 && <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={showExcluded} onChange={event => setShowExcluded(event.target.checked)} />제외 추정 후보도 표시
      </label>}
      {result && visible.length === 0 && <p className="text-sm text-muted-foreground">표시할 후보가 없습니다.</p>}
      {visible.length > 0 && <ul className="divide-y rounded-md border">
        {visible.map(candidate => <CandidateRow key={candidate.productId} candidate={candidate} busy={busy} onUse={onUseCandidate} />)}
      </ul>}
      {result && <p className="text-xs text-muted-foreground">순위는 API 응답 순서(유사도순)일 뿐 소비자가 보는 노출 순위나 광고 제외 순위가 아닙니다. 최저가·중량·품종은 제목에서 추정한 미검증 값이므로 상품 페이지에서 직접 확인한 뒤 패널에 추가하세요.</p>}
    </div>}
  </section>;
}

function CandidateRow({ candidate, busy, onUse }: { candidate: ShoppingCandidate; busy: boolean; onUse: (candidate: ShoppingCandidate) => void }) {
  const linkable = isSafeHttpUrl(candidate.url);
  const reasons = candidate.reviewReasons.filter(reason => reason !== "VERIFY_PRICE_OPTION_SHIPPING");
  return <li className="p-3 space-y-1.5">
    <div className="flex flex-wrap items-start gap-2">
      <span className="text-xs text-muted-foreground shrink-0">API #{candidate.rank}</span>
      <span className="flex-1 min-w-0 text-sm font-medium break-words">{candidate.title}</span>
      {candidate.excluded && <Badge variant="destructive">제외 추정</Badge>}
    </div>
    <p className="text-sm text-muted-foreground break-words">
      {candidate.mallName || "판매처 미확인"} · 미검증 최저가 {won(candidate.listedPrice)} · 추정 중량 {candidate.proposedPackageKg === null ? "미확인" : kg(candidate.proposedPackageKg)} · 품종 추정 {varietyLabels[candidate.varietyGroup]}
      {candidate.storeKey ? ` · 스마트스토어 ${candidate.storeKey}` : ""}
    </p>
    {reasons.length > 0 && <div className="flex flex-wrap gap-1">
      {reasons.map(reason => <Badge key={reason} variant="outline">{reviewReasonLabels[reason]}</Badge>)}
    </div>}
    <div className="flex flex-wrap gap-2">
      {linkable ? <a href={candidate.url} target="_blank" rel="noopener noreferrer" className="text-sm text-primary underline underline-offset-4">상품 페이지 열기</a>
        : <span className="text-sm text-muted-foreground">링크 사용 불가</span>}
      <Button type="button" size="sm" variant="outline" disabled={busy || !linkable} onClick={() => onUse(candidate)}>패널 추가 양식에 채우기</Button>
    </div>
  </li>;
}
