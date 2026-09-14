"use client";

import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { discoveryRequestSchema, normalizeDiscoveryQuery, type DiscoveryOverview, type DiscoveryRequest, type RankedDiscoveryCandidate } from "@/lib/briefing/discovery-contracts";
import type { CollectionJob } from "@/lib/briefing/collection-contracts";
import { CollectionQueue } from "./CollectionQueue";
import { dateTime, fromDatetimeLocal, nativeSelectClass, toDatetimeLocal } from "./competitor-utils";
import { emptyPanelDraft, type PanelDraft } from "./CompetitorPanelForm";
import { readSearchCapture, type SearchCapture } from "./search-capture";
import { SearchCaptureReview } from "./SearchCaptureReview";

const ENDPOINT = "/api/briefings/discovery";
const adLabels = { ORGANIC: "비광고 확인", AD: "광고", UNKNOWN: "광고 여부 미확인" };
const relevanceLabels = { MATCH: "품목 일치 확인", UNKNOWN: "품목 미확인", MISMATCH: "품목 불일치" };
async function readResponse(response: Response) {
  const body = await response.json();
  if (!response.ok) throw new Error(typeof body.error === "string" ? body.error : "후보 자료를 처리하지 못했습니다.");
  return body;
}
const MAX_CAPTURE_BYTES = 256 * 1024;
const isSearchCapture = (raw: unknown) => typeof raw === "object" && raw !== null && (raw as { schemaVersion?: unknown }).schemaVersion === "retirefarm-visible-search-v1";
// Shared by file import and pasted text: schema/freshness checks plus the selected-job query and start-time guard.
function readJobCapture(raw: unknown, job: CollectionJob | null): SearchCapture {
  const next = readSearchCapture(raw);
  if (job && (normalizeDiscoveryQuery(next.query) !== normalizeDiscoveryQuery(job.query) || !job.startedAt || new Date(next.capturedAt) < new Date(job.startedAt)))
    throw new Error("선택한 작업과 검색어가 같고 작업 시작·재개 후에 수집한 자료를 가져오세요.");
  return next;
}
function parsePastedCapture(text: string): unknown {
  if (!text.trim()) throw new Error("검색 화면 수집 JSON을 붙여넣어 주세요.");
  if (new TextEncoder().encode(text).length > MAX_CAPTURE_BYTES) throw new Error("붙여넣은 자료는 256KB 이하만 미리볼 수 있습니다. 검색 화면을 다시 수집해 주세요.");
  let raw: unknown;
  try { raw = JSON.parse(text); } catch { throw new Error("붙여넣은 내용이 올바른 JSON이 아닙니다."); }
  if (!isSearchCapture(raw)) throw new Error("붙여넣기는 검색 화면 수집 JSON(retirefarm-visible-search-v1)만 미리볼 수 있습니다. 다른 후보 파일은 파일 가져오기를 사용하세요.");
  return raw;
}

function CandidateCard({ candidate: c, busy, fixed, onUse, onDecision }: { candidate: RankedDiscoveryCandidate; busy: boolean; fixed: boolean;
  onUse: (draft: PanelDraft) => void; onDecision: (request: DiscoveryRequest) => Promise<boolean> }) {
  const [reason, setReason] = useState("");
  return <li className="rounded-md border p-3 space-y-2">
    <div className="flex flex-wrap gap-2 items-center">
      <strong>{c.storeName}</strong>
      <span className="text-xs">{fixed ? "고정 비교 중" : c.status === "EXCLUDED" ? "사용자 제외" : c.recommended ? "추천 후보" : "검토 후보"}</span>
    </div>
    <a href={c.productUrl} target="_blank" rel="noopener noreferrer" className="text-sm underline">{c.title}</a>
    <p className="text-xs text-muted-foreground">마지막 확인 {dateTime(c.lastSeenAt)} · 확인된 검색어 {c.queryCount}개 · 관측 최상위 위치 {c.bestPosition ?? "미확인"} · 리뷰 증가 {c.reviewDelta === null ? "비교 자료 부족" : `+${c.reviewDelta}개`}</p>
    <ul className="list-disc pl-5 text-xs">{c.reasons.map((r, i) => <li key={`${i}-${r}`}>{r}</li>)}</ul>
    {c.decisionReason && <p className="text-xs">선정·제외 메모: {c.decisionReason}</p>}
    <details className="text-xs">
      <summary className="cursor-pointer">검색 근거 {c.evidence.length}건 보기</summary>
      <ul className="space-y-2 pt-2">{c.evidence.slice(0, 20).map(e => <li key={e.id}>
        {dateTime(e.observedAt)} · {e.query} · 위치 {e.position ?? "미확인"} · {adLabels[e.adStatus]} · {relevanceLabels[e.relevance]}
        <br />구매 표기: {e.purchaseLabel || "미확인"} · 리뷰: {e.reviewCount ?? "미확인"} ({e.reviewBasis === "CUMULATIVE" ? "누적" : e.reviewBasis === "ROLLING" ? "이동 기간" : "기준 미확인"})
        {e.sourceUrl && <><br /><a href={e.sourceUrl} target="_blank" rel="noopener noreferrer" className="underline">검색 출처</a> · 정렬 {e.searchSort && e.searchSort !== "UNKNOWN" ? e.searchSort : "미확인"} · 검색 환경 {e.searchEnvironment === "BROWSER_UNSPECIFIED" ? "필터·개인화·배송지 미확인" : e.searchEnvironment || "미확인"}</>}
      </li>)}</ul>
      {c.evidence.length > 20 && <p>화면에는 최근 20건을 표시합니다.</p>}
    </details>
    <div className="flex flex-wrap gap-2">
      <Button type="button" variant="outline" size="sm" disabled={busy || fixed || c.status === "EXCLUDED"} onClick={() => onUse({ ...emptyPanelDraft, storeName: c.storeName, productUrl: c.productUrl })}>비교 등록 양식 채우기</Button>
      <Input aria-label={`${c.storeName} 선정·제외 사유`} value={reason} maxLength={500} disabled={busy} onChange={e => setReason(e.target.value)} placeholder="선정·제외 사유" className="max-w-xs" />
      <Button type="button" variant="ghost" size="sm" disabled={busy || !reason.trim()} onClick={() => void onDecision({ action: "decision", candidateId: c.id,
        status: c.status === "EXCLUDED" ? "WATCH" : "EXCLUDED", reason: reason.trim() }).then(ok => { if (ok) setReason(""); })}>{c.status === "EXCLUDED" ? "판매처 다시 검토" : "판매처 추천 제외"}</Button>
    </div>
  </li>;
}

function DiscoveryContent({ onUse, fixedStoreKeys }: { onUse: (draft: PanelDraft) => void; fixedStoreKeys: string[] }) {
  const [data, setData] = useState<DiscoveryOverview | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [capture, setCapture] = useState<SearchCapture | null>(null);
  const [pasted, setPasted] = useState("");
  const [selectedJob, setSelectedJob] = useState<CollectionJob | null>(null);
  const [queueRefresh, setQueueRefresh] = useState(0);
  const selectJob = useCallback((job: CollectionJob | null) => { setSelectedJob(job); setCapture(null); }, []);
  const [filter, setFilter] = useState("RECOMMENDED");
  const [draft, setDraft] = useState({ storeName: "", productUrl: "", title: "", query: "대추방울토마토 2kg",
    observedAt: toDatetimeLocal(new Date()), position: "", adStatus: "UNKNOWN", relevance: "UNKNOWN", purchaseLabel: "", reviewCount: "", reviewBasis: "UNKNOWN" });
  const update = (field: keyof typeof draft, value: string) => setDraft(d => ({ ...d, [field]: value }));
  const load = useCallback(async () => {
    try { setData(await readResponse(await fetch(ENDPOINT, { cache: "no-store" }))); setError(""); }
    catch (e) { setError(e instanceof Error ? e.message : "후보를 불러오지 못했습니다."); }
  }, []);
  useEffect(() => { void load(); }, [load]);
  const mutate = async (request: DiscoveryRequest) => {
    setBusy(true); setError(""); setNotice("");
    try {
      const result = await readResponse(await fetch(ENDPOINT, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(request) }));
      if (request.action === "import" && request.collectionJobId) { setSelectedJob(null); setQueueRefresh(n => n + 1); }
      setNotice(request.action === "decision" ? "판매처의 추천 상태를 변경했습니다. 고정 비교 목록은 유지됩니다." : result.duplicate ? "이미 저장한 자료입니다." : `검색 근거 ${result.evidenceCount}건을 저장하고 추천을 갱신했습니다.`);
      await load(); return true;
    } catch (e) { setError(e instanceof Error ? e.message : "저장하지 못했습니다."); return false; }
    finally { setBusy(false); }
  };
  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    const parsed = discoveryRequestSchema.safeParse({ action: "import", evidence: [{ ...draft, observedAt: fromDatetimeLocal(draft.observedAt),
      position: draft.position.trim() ? Number(draft.position) : null, reviewCount: draft.reviewCount.trim() ? Number(draft.reviewCount) : null }] });
    if (!parsed.success) { setError("상품 주소·검색어·관측 시각·숫자 입력을 확인해 주세요."); return; }
    if (await mutate(parsed.data)) setDraft(d => ({ ...d, storeName: "", productUrl: "", title: "", position: "", purchaseLabel: "", reviewCount: "", adStatus: "UNKNOWN", relevance: "UNKNOWN", reviewBasis: "UNKNOWN" }));
  };
  const importFile = async (file: File | undefined) => {
    if (!file) return;
    setError("");
    try {
      if (file.size > MAX_CAPTURE_BYTES) throw new Error("후보 파일은 256KB 이하만 가져올 수 있습니다.");
      const raw = JSON.parse(await file.text());
      if (isSearchCapture(raw)) { setCapture(readJobCapture(raw, selectedJob)); return; }
      if (selectedJob) throw new Error("작업에 연결하려면 검색 화면 수집 파일을 가져오세요. 일반 입력은 작업 연결을 해제한 뒤 사용합니다.");
      const parsed = discoveryRequestSchema.safeParse(raw);
      if (!parsed.success || parsed.data.action !== "import") throw new Error("검색 후보 파일 형식이 다릅니다. 상품 가격 수집 파일은 고정 패널에서 가져오세요.");
      await mutate(parsed.data);
    } catch (e) { setError(e instanceof Error ? e.message : "파일을 읽지 못했습니다."); }
  };
  // Editing the pasted text drops any open preview so a stale capture can never be saved.
  const editPasted = (value: string) => { setPasted(value); setCapture(null); setError(""); };
  const previewPasted = () => {
    setError(""); setNotice(""); setCapture(null);
    try { setCapture(readJobCapture(parsePastedCapture(pasted), selectedJob)); setPasted(""); }
    catch (e) { setError(e instanceof Error ? e.message : "붙여넣은 자료를 읽지 못했습니다."); }
  };
  const candidates = data?.candidates ?? [];
  const visible = candidates.filter(c => filter === "ALL" || (filter === "EXCLUDED" ? c.status === "EXCLUDED" : c.recommended));
  return <div className="space-y-4 pt-3">
    <p className="text-sm">확인한 검색 근거를 저장하면 최근 7일 자료로 최대 10개 판매처를 추천합니다. 검색어별 반복 노출과 관측 위치를 사용하며, 판매량·검색량 순위는 아닙니다. 검색 화면 수집 파일을 검토해 가져올 수 있으며 자동 검색·주간 예약은 아직 준비 중입니다.</p>
    {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
    {notice && <p role="status" className="text-sm">{notice}</p>}
    <CollectionQueue selectedJobId={selectedJob?.id ?? null} onSelect={selectJob} refreshKey={queueRefresh} disabled={busy || !!capture} />
    {selectedJob && <div className="rounded border p-2 text-sm">파일 연결 작업: {selectedJob.query} · 시작 {selectedJob.startedAt ? dateTime(selectedJob.startedAt) : "미확인"}
      <Button type="button" size="sm" variant="ghost" disabled={busy} onClick={() => selectJob(null)}>작업 연결 해제</Button>
      <p className="text-xs">선택한 근거를 저장하면 이 작업이 완료됩니다. 아래 수동 입력은 작업 완료와 연결되지 않습니다.</p>
    </div>}
    <details>
      <summary className="cursor-pointer text-sm font-medium">검색 근거 추가</summary>
      <form onSubmit={event => void submit(event)} className="space-y-3 pt-3">
        <p className="text-xs text-muted-foreground">검색 화면에서 직접 확인한 내용을 입력하세요. 품목 일치는 후보 분류이며, 옵션·중량·크기 기준은 고정 비교 등록 전에 별도로 확인합니다.</p>
        <div className="grid gap-3 sm:grid-cols-2">
          {([
            ["query", "확인한 검색어", 100], ["storeName", "후보 판매처 이름", 100], ["productUrl", "후보 상품 URL", 2000], ["title", "후보 상품 제목", 300],
          ] as const).map(([field, label, max]) => <div key={field}><Label htmlFor={`discovery-${field}`}>{label}</Label><Input id={`discovery-${field}`} required maxLength={max} disabled={busy} value={draft[field]} onChange={e => update(field, e.target.value)} /></div>)}
          <div><Label htmlFor="discovery-time">검색 관측 시각</Label><Input id="discovery-time" type="datetime-local" required disabled={busy} value={draft.observedAt} onChange={e => update("observedAt", e.target.value)} /></div>
          <div><Label htmlFor="discovery-position">화면 결과 위치 (미확인은 빈칸)</Label><Input id="discovery-position" type="number" min={1} max={200} step={1} disabled={busy} value={draft.position} onChange={e => update("position", e.target.value)} /></div>
          <div><Label htmlFor="discovery-ad">광고 여부</Label><select id="discovery-ad" className={nativeSelectClass} disabled={busy} value={draft.adStatus} onChange={e => update("adStatus", e.target.value)}>{Object.entries(adLabels).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></div>
          <div><Label htmlFor="discovery-relevance">품목 확인</Label><select id="discovery-relevance" className={nativeSelectClass} disabled={busy} value={draft.relevance} onChange={e => update("relevance", e.target.value)}>{Object.entries(relevanceLabels).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></div>
          <div><Label htmlFor="discovery-purchase">공개 구매 표기 (기간 포함, 선택)</Label><Input id="discovery-purchase" maxLength={100} disabled={busy} value={draft.purchaseLabel} placeholder="예: 최근 1개월 100+명 구매" onChange={e => update("purchaseLabel", e.target.value)} /></div>
          <div><Label htmlFor="discovery-reviews">리뷰 수 (미확인은 빈칸)</Label><Input id="discovery-reviews" type="number" min={0} max={100000000} step={1} disabled={busy} value={draft.reviewCount} onChange={e => update("reviewCount", e.target.value)} /></div>
          <div><Label htmlFor="discovery-review-basis">리뷰 집계 기준</Label><select id="discovery-review-basis" className={nativeSelectClass} disabled={busy} value={draft.reviewBasis} onChange={e => update("reviewBasis", e.target.value)}><option value="UNKNOWN">미확인</option><option value="CUMULATIVE">누적 전체 리뷰</option><option value="ROLLING">최근 몇 개월 등 이동 기간</option></select></div>
        </div>
        <Button type="submit" disabled={busy}>근거 저장·추천 갱신</Button>
      </form>
      <div className="mt-4 space-y-2"><Label htmlFor="discovery-file">검색 후보 JSON 파일 가져오기</Label><Input id="discovery-file" type="file" accept=".json,application/json" disabled={busy} onChange={e => { const file = e.target.files?.[0]; e.target.value = ""; void importFile(file); }} />
        <p className="text-xs text-muted-foreground">네이버플러스 검색 화면에서 수집 도구를 실행해 저장한 JSON을 선택하세요. 상품 가격 수집 파일은 고정 패널에서 가져옵니다.</p></div>
      <div className="mt-4 space-y-2"><Label htmlFor="discovery-paste">검색 화면 수집 JSON 붙여넣기 (선택)</Label>
        <Textarea id="discovery-paste" rows={4} disabled={busy} value={pasted} spellCheck={false} placeholder='{"schemaVersion":"retirefarm-visible-search-v1", ...}' onChange={e => editPasted(e.target.value)} />
        <div className="flex flex-wrap items-center gap-2"><Button type="button" variant="outline" size="sm" disabled={busy || !pasted.trim()} onClick={previewPasted}>붙여넣은 자료 미리보기</Button>
          <p className="text-xs text-muted-foreground">수집 도구에서 복사한 검색 자료를 붙여넣으세요. 미리보기에서 검토 후 저장할 수 있습니다. 미리보기를 열면 입력란을 비웁니다.</p></div></div>
    </details>
    {capture && <SearchCaptureReview key={`${capture.sourceUrl}-${capture.capturedAt}-${selectedJob?.id ?? ""}-${selectedJob?.version ?? ""}`} capture={capture} collectionJob={selectedJob ?? undefined} busy={busy} onSave={mutate} onCancel={() => setCapture(null)} />}
    <div className="flex flex-wrap items-center gap-3">
      <Label htmlFor="discovery-filter">후보 보기</Label><select id="discovery-filter" className={`${nativeSelectClass} max-w-xs`} value={filter} onChange={e => setFilter(e.target.value)}><option value="RECOMMENDED">추천 후보 ({data?.recommendedCount ?? 0}곳)</option><option value="ALL">전체 후보 ({candidates.length}개 상품)</option><option value="EXCLUDED">사용자 제외</option></select>
      <Button type="button" variant="outline" size="sm" disabled={busy} onClick={() => void load()}>추천 다시 확인</Button>
    </div>
    {data?.latestRun && <p className="text-xs text-muted-foreground">마지막 자료 저장 {dateTime(data.latestRun.createdAt)} · 새 근거 {data.latestRun.evidenceCount}건</p>}
    {data && visible.length === 0 && <p className="text-sm">표시할 후보가 없습니다. 검색 근거를 추가하거나 전체 후보에서 미확인 조건을 확인하세요.</p>}
    <ul className="space-y-3">{visible.map(c => <CandidateCard key={c.id} candidate={c} busy={busy} fixed={fixedStoreKeys.includes(c.storeKey)} onUse={onUse} onDecision={mutate} />)}</ul>
    <p className="text-xs text-muted-foreground">추천 제외는 같은 판매처의 후보 상품에 적용됩니다. 고정 비교 목록과 가격 기록은 바뀌지 않습니다. 최근 15일 중 상품당 최대 120개 근거를 평가합니다. 다른 호스트의 동일 판매처는 아직 자동 통합하지 않습니다.</p>
  </div>;
}

export function CompetitorDiscovery(props: { onUse: (draft: PanelDraft) => void; fixedStoreKeys: string[] }) {
  const [opened, setOpened] = useState(false);
  return <details className="rounded-lg border p-4" onToggle={event => { if (event.currentTarget.open) setOpened(true); }}>
    <summary className="cursor-pointer font-semibold">경쟁 판매처 추천 후보</summary>
    {opened && <DiscoveryContent {...props} />}
  </details>;
}
