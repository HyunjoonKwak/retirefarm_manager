"use client";

import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { collectionRequestSchema, type CollectionJob, type CollectionOverview, type CollectionRequest } from "@/lib/briefing/collection-contracts";
import { dateTime, nativeSelectClass } from "./competitor-utils";

const endpoint = "/api/briefings/collection";
const statusLabels = { PENDING: "대기", RUNNING: "수집·검토 중", BLOCKED: "확인 후 재개 필요", SUCCEEDED: "검토한 근거 저장 완료", CANCELLED: "취소" };
const reasons = { SECURITY_CHECK: "네이버 보안 확인", LOGIN_REQUIRED: "로그인 필요", PAGE_CHANGED: "화면 구조 변경", NETWORK_ERROR: "연결 오류", BROWSER_UNAVAILABLE: "브라우저 사용 불가" };
type Reason = keyof typeof reasons;

async function responseBody(response: Response) {
  const body = await response.json();
  if (!response.ok) throw new Error(body.error || "수집 작업을 처리하지 못했습니다.");
  return body;
}

function JobRow({ job, disabled, selected, hasRunning, onAction, onSelect }: { job: CollectionJob; disabled: boolean; selected: boolean; hasRunning: boolean;
  onAction: (request: CollectionRequest) => Promise<void>; onSelect: (job: CollectionJob) => void }) {
  const [reason, setReason] = useState<Reason>("SECURITY_CHECK");
  return <li className="rounded border p-3 space-y-2">
    <p className="text-sm font-medium">{job.query} · {statusLabels[job.status]}{selected ? " · 파일 연결 대상으로 선택됨" : ""}</p>
    <p className="text-xs text-muted-foreground">등록 {dateTime(job.createdAt)}{job.startedAt && ` · 시작 ${dateTime(job.startedAt)}`}{job.completedAt && ` · ${job.status === "CANCELLED" ? "취소" : "완료"} ${dateTime(job.completedAt)}`}</p>
    {job.reason && <p className="text-xs">중단 사유: {reasons[job.reason as Reason] || job.reason}</p>}
    {job.status === "SUCCEEDED" && <p className="text-xs">검토 후 저장한 근거 {job.evidenceCount}건입니다. 검색 전체 결과나 가격 수집 완료를 뜻하지 않습니다.</p>}
    <div className="flex flex-wrap items-center gap-2">
      {job.status === "PENDING" && <Button type="button" size="sm" disabled={disabled || hasRunning} onClick={() => void onAction({ action: "start", jobId: job.id, version: job.version })}>수집 시작</Button>}
      {job.status === "BLOCKED" && <Button type="button" size="sm" disabled={disabled || hasRunning} onClick={() => void onAction({ action: "resume", jobId: job.id, version: job.version })}>확인 후 재개</Button>}
      {job.status === "RUNNING" && <>
        <Button type="button" size="sm" variant="outline" disabled={disabled || selected} onClick={() => onSelect(job)}>이 작업에 파일 연결</Button>
        <a className="text-xs underline" href={job.searchUrl}>검색 열기 (현재 탭)</a>
        <select aria-label={`${job.query} 중단 사유`} className={`${nativeSelectClass} max-w-48`} value={reason} disabled={disabled} onChange={e => setReason(e.target.value as Reason)}>{Object.entries(reasons).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select>
        <Button type="button" size="sm" variant="outline" disabled={disabled} onClick={() => void onAction({ action: "block", jobId: job.id, version: job.version, reason })}>중단 기록</Button>
      </>}
      {["PENDING", "RUNNING", "BLOCKED"].includes(job.status) && <Button type="button" size="sm" variant="ghost" disabled={disabled} onClick={() => void onAction({ action: "cancel", jobId: job.id, version: job.version })}>작업 취소</Button>}
    </div>
  </li>;
}

export function CollectionQueue({ selectedJobId, onSelect, refreshKey, disabled }: { selectedJobId: string | null; onSelect: (job: CollectionJob | null) => void; refreshKey: number; disabled: boolean }) {
  const [opened, setOpened] = useState(false);
  const [data, setData] = useState<CollectionOverview | null>(null);
  const [queries, setQueries] = useState("대추방울토마토 2kg\n대추방울토마토 3kg");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const load = useCallback(async () => {
    const next = await responseBody(await fetch(endpoint, { cache: "no-store" })) as CollectionOverview;
    setData(next); return next;
  }, []);
  useEffect(() => { if (opened) void load().catch(e => setError(e instanceof Error ? e.message : "수집 상태를 불러오지 못했습니다.")); }, [opened, refreshKey, load]);
  const action = async (request: CollectionRequest) => {
    if (busy || disabled) return;
    setBusy(true); setError(""); setNotice("");
    try {
      await responseBody(await fetch(endpoint, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(request) }));
      // State changes clear a potentially stale capture link even if the subsequent refresh fails.
      if (request.action !== "create") onSelect(null);
      const next = await load();
      if (request.action === "start" || request.action === "resume") onSelect(next.jobs.find(j => j.id === request.jobId && j.status === "RUNNING") || null);
      setNotice(request.action === "create" ? "이번 주 검색 작업을 준비했습니다. 같은 검색어는 중복 등록하지 않습니다." : "작업 상태를 반영했습니다.");
    } catch (e) { setError(e instanceof Error ? e.message : "작업 상태를 변경하지 못했습니다."); }
    finally { setBusy(false); }
  };
  const create = () => {
    const parsed = collectionRequestSchema.safeParse({ action: "create", queries: queries.split("\n").map(q => q.trim()).filter(Boolean) });
    if (!parsed.success) { setError("중복 없이 검색어 1~3개를 한 줄에 하나씩 입력하세요. 검색어는 100자 이내입니다."); return; }
    void action(parsed.data);
  };
  return <details className="rounded border p-3" onToggle={e => { if (e.currentTarget.open) setOpened(true); }}>
    <summary className="text-sm font-medium cursor-pointer">검색 수집 작업 관리</summary>
    {opened && <div className="space-y-3 pt-3">
      <p className="text-xs">사용자가 브라우저에서 진행하는 수집의 상태를 기록합니다. 자동 방문·주간 예약은 아직 실행하지 않습니다. 한 번에 한 작업을 시작하고 검색 화면에서 정렬을 선택해 확장으로 수집하세요.</p>
      <p className="text-xs">‘검색 열기’는 현재 탭을 이동합니다. 수집 후 뒤로 돌아와 ‘이 작업에 파일 연결’을 누르고 아래에서 JSON을 가져오세요. 보안 확인이 나오면 중단을 기록하고 같은 검색 탭에서 확인한 뒤 재개합니다.</p>
      <p className="text-xs">중단한 작업은 재개할 수 있습니다. 완료·취소한 같은 검색어 작업은 이번 주에 다시 만들지 않습니다.</p>
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      {notice && <p role="status" className="text-sm">{notice}</p>}
      <Label htmlFor="collection-queries">이번 주 수집 검색어 (최대 3개)</Label>
      <textarea id="collection-queries" className="w-full rounded border p-2 text-sm" rows={3} maxLength={302} disabled={busy || disabled} value={queries} onChange={e => setQueries(e.target.value)} />
      <div className="flex gap-2"><Button type="button" size="sm" disabled={busy || disabled} onClick={create}>이번 주 작업 준비</Button><Button type="button" size="sm" variant="outline" disabled={busy || disabled} onClick={() => { setError(""); void load().catch(e => setError(e instanceof Error ? e.message : "조회 실패")); }}>수집 상태 새로고침</Button></div>
      {data && <>
        <p className="text-xs">마지막 작업 완료: {data.lastSuccessAt ? dateTime(data.lastSuccessAt) : "완료 기록 없음"}</p>
        {!data.jobs.length && <p className="text-sm">등록된 수집 작업이 없습니다.</p>}
        <ul className="space-y-2">{data.jobs.map(job => <JobRow key={job.id} job={job} selected={job.id === selectedJobId} disabled={busy || disabled} hasRunning={data.jobs.some(j => j.status === "RUNNING")} onAction={action} onSelect={onSelect} />)}</ul>
      </>}
    </div>}
  </details>;
}
