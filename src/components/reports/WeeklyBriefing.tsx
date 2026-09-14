"use client";

import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { BriefingResult, BriefingSnapshot } from "@/lib/briefing/contracts";
import { BriefingPriceAnalysis } from "./BriefingPriceAnalysis";

interface Run { id: string; status: string; attempts: number; lastError: string | null; leaseUntil: string | null;
  usage?: { inputTokens: number; outputTokens: number; cachedInputTokens: number } | null;
  snapshot: BriefingSnapshot; briefing: { body: BriefingResult; status: string } | null }
interface Data { runs: Run[]; worker: { configured: boolean; lastSeenAt: string | null } }
const statusNames: Record<string, string> = { PENDING: "워커 대기", RUNNING: "작성 중", SUCCEEDED: "초안 저장됨", BLOCKED: "연결 확인 필요", FAILED: "작성 실패" };
const errorNames: Record<string, string> = { AUTH_REQUIRED: "Mac의 ChatGPT 로그인 또는 워커 연결을 확인해 주세요.", RATE_LIMIT: "Codex 사용량 한도 회복 후 재시도해 주세요.",
  CODEX_FAILED: "Mac 워커 실행을 확인해 주세요.", INVALID_OUTPUT: "보고서 형식 검증을 통과하지 못했습니다.", TIMEOUT: "제한 시간 안에 작성하지 못했습니다." };
const sections: Record<string, string> = { market: "도매 시세", cultivation: "재배·기상", commerce: "판매·물류", competitors: "경쟁점" };
const date = (value: string) => new Date(value).toLocaleString("ko-KR", { timeZone: "Asia/Seoul" });
export function WeeklyBriefing() {
  const [data, setData] = useState<Data | null>(null);
  const [error, setError] = useState(""); const [busy, setBusy] = useState(false);
  const [token, setToken] = useState("");
  const [productName, setProductName] = useState("토마토");
  const [preview, setPreview] = useState<BriefingSnapshot | null>(null);
  const [variety, setVariety] = useState(""); const [origin, setOrigin] = useState("");
  const load = useCallback(async () => {
    try {
      const response = await fetch("/api/briefings", { cache: "no-store" });
      const body = await response.json(); if (!response.ok) throw new Error(body.error);
      setData(body); setError("");
    } catch (error) { setError(error instanceof Error ? error.message : "목록을 불러오지 못했습니다."); }
  }, []);
  useEffect(() => { void load(); }, [load]);
  async function post(path: string, body: object) {
    setBusy(true); setError("");
    try {
      const response = await fetch(path, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const result = await response.json(); if (!response.ok) throw new Error(result.error);
      if (path.endsWith("worker-token")) setToken(result.token ?? "");
      if (result.snapshot) setPreview(result.snapshot);
      await load();
    } catch (error) { setError(error instanceof Error ? error.message : "요청을 처리하지 못했습니다."); }
    finally { setBusy(false); }
  }
  return <div className="space-y-6">
    <div className="rounded-lg border p-4 space-y-3">
      <h2 className="font-semibold">주간 농가 브리핑 초안</h2>
      <p className="text-sm text-muted-foreground">지난주 월요일부터 일요일까지의 시세로 초안을 만듭니다. 재배·물류·경쟁점 자료 연결과 자동 예약·알림은 준비 중입니다.</p>
      <div className="grid gap-3 sm:grid-cols-3">
        <div><Label htmlFor="brief-product">품목</Label><Input disabled={busy} id="brief-product" value={productName} maxLength={50} onChange={e => { setProductName(e.target.value); setPreview(null); }} /></div>
        <div><Label htmlFor="brief-variety">품종 (선택)</Label><Input disabled={busy} id="brief-variety" value={variety} maxLength={50} onChange={e => { setVariety(e.target.value); setPreview(null); }} placeholder="시세에 표시된 정확한 이름" /></div>
        <div><Label htmlFor="brief-origin">산지 (선택)</Label><Input disabled={busy} id="brief-origin" value={origin} maxLength={50} onChange={e => { setOrigin(e.target.value); setPreview(null); }} placeholder="시세에 표시된 정확한 이름" /></div>
      </div>
      <div className="flex flex-wrap gap-2">
        <Button variant="outline" disabled={busy || !productName.trim()} onClick={() => void post("/api/briefings", { action: "preview", productName, variety, origin })}>시세 분석 미리보기</Button>
        <Button disabled={busy || !productName.trim()} onClick={() => void post("/api/briefings", { action: "enqueue", productName, variety, origin })}>초안 생성 요청</Button>
        <Button variant="outline" disabled={busy} onClick={() => void load()}>상태 새로고침</Button>
      </div>
      <p className="text-sm text-muted-foreground">동일한 입력은 기존 작업을 표시합니다. 요청 후 Mac 워커가 실행되면 작성이 시작됩니다.</p>
      <p className="text-xs text-muted-foreground">미리보기는 AI를 호출하거나 보고서 작업을 등록하지 않습니다.</p>
    </div>
    {preview && <div className="rounded-lg border p-4 space-y-3"><h3 className="font-semibold">시세 분석 미리보기</h3><BriefingPriceAnalysis snapshot={preview} /></div>}
    <details className="rounded-lg border p-4">
      <summary className="cursor-pointer font-medium">Mac 워커 연결 {data?.worker.configured ? "· 등록됨" : "· 미등록"}</summary>
      <div className="mt-3 space-y-3">
        <p className="text-sm">마지막 연결: {data?.worker.lastSeenAt ? date(data.worker.lastSeenAt) : "연결 기록 없음"}</p>
        <p className="text-sm text-muted-foreground">이 토큰은 Mac이 내 브리핑 작업만 처리하도록 연결합니다. 재발급하면 기존 연결과 진행 중인 작업이 중단됩니다.</p>
        <div className="flex gap-2"><Button variant="outline" disabled={busy} onClick={() => void post("/api/briefings/worker-token", { action: "issue" })}>연결 토큰 {data?.worker.configured ? "재발급" : "발급"}</Button>
          {data?.worker.configured && <Button variant="outline" disabled={busy} onClick={() => void post("/api/briefings/worker-token", { action: "revoke" })}>연결 해제</Button>}</div>
        {token && <div className="space-y-2"><Label htmlFor="brief-token">한 번만 표시되는 연결 토큰</Label><Input id="brief-token" readOnly type="password" value={token} onFocus={e => e.target.select()} />
          <Button variant="outline" onClick={() => { const blob = new Blob([token + "\n"], { type: "text/plain" }); const url = URL.createObjectURL(blob);
            const link = document.createElement("a"); link.href = url; link.download = "retirefarm-worker-token.txt"; link.click(); URL.revokeObjectURL(url); setToken(""); }}>토큰 파일 저장 후 숨기기</Button>
          <p className="text-sm text-muted-foreground">내 Mac의 비공개 위치에 보관하고 워커 설정에서 파일을 지정하세요. 내려받은 파일의 접근 권한은 설치 안내에 따라 제한하세요.</p>
        </div>}
      </div>
    </details>
    {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
    {data?.runs.length === 0 && <p className="text-sm text-muted-foreground">아직 요청한 브리핑이 없습니다.</p>}
    {data?.runs.map(run => <article key={run.id} className="rounded-lg border p-4 space-y-3">
      <h3 className="font-semibold">{new Date(run.snapshot.periodStart).toLocaleDateString("ko-KR", { timeZone: "Asia/Seoul" })} 시작 주 · {statusNames[run.status] ?? run.status}</h3>
      {run.usage && <p className="text-xs text-muted-foreground">AI 사용량 · 입력 {run.usage.inputTokens.toLocaleString("ko-KR")} / 출력 {run.usage.outputTokens.toLocaleString("ko-KR")} 토큰 · 캐시 재사용 {run.usage.cachedInputTokens.toLocaleString("ko-KR")} 토큰</p>}
      {run.status === "PENDING" && <p className="text-sm">Mac 워커가 작업을 가져오기를 기다리고 있습니다.</p>}
      {run.status === "RUNNING" && run.leaseUntil && new Date(run.leaseUntil) < new Date() && <p className="text-sm">워커 응답이 늦어지고 있습니다. 다음 연결에서 복구를 시도합니다.</p>}
      {run.lastError && <p className="text-sm">{errorNames[run.lastError] ?? "워커 상태를 확인해 주세요."}</p>}
      {["FAILED", "BLOCKED"].includes(run.status) && <Button variant="outline" disabled={busy} onClick={() => void post("/api/briefings", { action: "retry", jobId: run.id })}>연결 확인 후 재시도</Button>}
      <BriefingPriceAnalysis snapshot={run.snapshot} />
      {run.briefing && <><p className="font-medium">{run.briefing.body.summary}</p>
        {run.briefing.body.sections.map(section => <section key={section.key} className="space-y-1">
          <h4 className="font-medium">{sections[section.key]}</h4><p className="whitespace-pre-wrap text-sm">{section.body}</p>
          <p className="text-xs text-muted-foreground">근거: {section.sourceIds.map(id => run.snapshot.sources.find(source => source.id === id)?.title).join(", ") || "연결된 근거 없음"}</p>
        </section>)}
        <h4 className="font-medium">우선 행동</h4><ol className="list-decimal pl-5 text-sm space-y-1">{run.briefing.body.actions.map((action, i) => <li key={i}>{action.text}</li>)}</ol>
        <ul className="list-disc pl-5 text-sm text-muted-foreground">{run.briefing.body.limitations.map((text, i) => <li key={i}>{text}</li>)}</ul>
      </>}
      <details><summary className="cursor-pointer text-sm">집계 자료와 한계 확인</summary>
        <ul className="mt-2 list-disc pl-5 text-sm text-muted-foreground">{run.snapshot.limitations.map((text, i) => <li key={i}>{text}</li>)}</ul>
        <div className="max-h-80 overflow-auto mt-3"><table className="w-full text-sm"><caption className="text-left pb-2">동일 조건별 원자료 집계 · 표시 시 소수 둘째 자리 반올림</caption>
          <thead><tr><th className="text-left">비교 조건</th><th className="text-right">값</th><th className="text-right">단위</th></tr></thead>
          <tbody>{run.snapshot.metrics.map(metric => <tr key={metric.id} className="border-t"><td className="py-2">{metric.label}</td><td className="text-right tabular-nums">{metric.value.toLocaleString("ko-KR", { maximumFractionDigits: 2 })}</td><td className="text-right">{metric.unit}</td></tr>)}</tbody>
        </table></div>
      </details>
    </article>)}
  </div>;
}
