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
  latestSearch: CompetitorOverview["latestSearch"];
  busy: boolean;
  onUseCandidate: (candidate: ShoppingCandidate) => void;
}

const MAX_QUERY = 100;
const searchStatusNames: Record<string, string> = { SUCCEEDED: "완료", FAILED: "실패", PENDING: "대기", RUNNING: "검색 중" };

/** Browser search discovers candidates; stored API snapshots remain historical evidence only. */
export function CompetitorSearchPanel({ latestSearch, busy, onUseCandidate }: Props) {
  const [query, setQuery] = useState("");
  const [showExcluded, setShowExcluded] = useState(false);
  const trimmed = query.trim();
  const searchUrl = `https://search.shopping.naver.com/search/all?query=${encodeURIComponent(trimmed || "대추방울토마토")}`;
  const result = latestSearch?.result ?? null;
  const visible = result ? result.items.filter(item => showExcluded || !item.excluded) : [];
  return <section className="rounded-lg border p-4 space-y-3">
    <h3 className="font-semibold">브라우저에서 판매처 찾기</h3>
    <p className="text-sm text-muted-foreground">공식 쇼핑검색 API는 2026년 7월 31일 종료됐습니다. 키를 추가할 필요 없이 네이버 검색 화면에서 상품을 찾아 등록하세요.</p>
    <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
      <div className="flex-1">
        <Label htmlFor="competitor-query">검색어</Label>
        <Input id="competitor-query" value={query} maxLength={MAX_QUERY} placeholder="예: 대추방울토마토 2kg"
          onChange={event => setQuery(event.target.value)} />
      </div>
      <a href={searchUrl} target="_blank" rel="noopener noreferrer" className="text-sm text-primary underline underline-offset-4">네이버 쇼핑에서 찾기</a>
    </div>
    <p className="text-xs text-muted-foreground">상품 페이지에서 옵션을 하나 선택하고 수량을 1로 맞추세요. 패널 등록 후 선택 옵션·총 금액·배송비 영역을 복사하면 기록 양식을 채울 수 있습니다.</p>
    {latestSearch && <div className="space-y-2">
      <p className="text-sm">이전 API 검색 기록 (현재 가격 아님): {searchStatusNames[latestSearch.status] ?? latestSearch.status} · {dateTime(latestSearch.createdAt)}
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
