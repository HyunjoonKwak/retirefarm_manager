"use client";

import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import type { CompetitorOverview, CompetitorRequest } from "@/lib/briefing/competitor-contracts";
import type { ShoppingCandidate } from "@/lib/briefing/naver-shopping";
import { CompetitorCostScenario } from "./competitor/CompetitorCostScenario";
import { CompetitorEntryCard } from "./competitor/CompetitorEntryCard";
import { CompetitorGroupSummary } from "./competitor/CompetitorGroupSummary";
import { CompetitorPanelForm, emptyPanelDraft, type PanelDraft } from "./competitor/CompetitorPanelForm";
import { CompetitorSearchPanel } from "./competitor/CompetitorSearchPanel";
import { dateTime } from "./competitor/competitor-utils";

const ENDPOINT = "/api/briefings/competitors";

interface FormState { key: number; draft: PanelDraft; fromCandidate: boolean }

/**
 * Prefill only: the listing title lands in optionLabel (not productName, which is the comparison commodity label),
 * and every value stays editable and must be confirmed against the product page before submit.
 */
const draftFromCandidate = (candidate: ShoppingCandidate): PanelDraft => ({
  ...emptyPanelDraft,
  storeName: candidate.mallName,
  productUrl: candidate.url,
  optionLabel: candidate.title.slice(0, 200),
  varietyGroup: candidate.varietyGroup,
  packageKg: candidate.proposedPackageKg === null ? "" : String(candidate.proposedPackageKg),
});

const readError = async (response: Response, fallback: string) => {
  try { const body = await response.json(); return typeof body?.error === "string" ? body.error : fallback; }
  catch { return fallback; }
};

/** Competitor panel: bounded official search, manually confirmed fixed panel, manual observations, server-side group medians. */
export function CompetitorResearch() {
  const [data, setData] = useState<CompetitorOverview | null>(null);
  const [loadError, setLoadError] = useState("");
  const [actionError, setActionError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState<FormState>({ key: 0, draft: emptyPanelDraft, fromCandidate: false });
  const [showArchived, setShowArchived] = useState(false);

  const load = useCallback(async () => {
    try {
      const response = await fetch(ENDPOINT, { cache: "no-store" });
      if (!response.ok) throw new Error(await readError(response, "경쟁점 자료를 불러오지 못했습니다."));
      setData(await response.json() as CompetitorOverview); setLoadError("");
    } catch (error) { setLoadError(error instanceof Error ? error.message : "경쟁점 자료를 불러오지 못했습니다."); }
  }, []);
  useEffect(() => { void load(); }, [load]);

  const mutate = async (request: CompetitorRequest, successNotice: string) => {
    setBusy(true); setActionError(""); setNotice("");
    try {
      const response = await fetch(ENDPOINT, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(request) });
      if (!response.ok) throw new Error(await readError(response, "요청을 처리하지 못했습니다."));
      setNotice(successNotice);
      if (request.action === "addPanel") setForm(current => ({ key: current.key + 1, draft: emptyPanelDraft, fromCandidate: false }));
      await load();
    } catch (error) { setActionError(error instanceof Error ? error.message : "요청을 처리하지 못했습니다."); }
    finally { setBusy(false); }
  };

  const useCandidate = (candidate: ShoppingCandidate) => {
    setForm(current => ({ key: current.key + 1, draft: draftFromCandidate(candidate), fromCandidate: true }));
    setNotice("검색 후보 값을 양식에 채웠습니다. 상품 페이지에서 옵션·중량을 확인한 뒤 체크하고 추가하세요.");
  };
  const resetForm = () => setForm(current => ({ key: current.key + 1, draft: emptyPanelDraft, fromCandidate: false }));

  const active = data?.entries.filter(entry => entry.archivedAt === null) ?? [];
  const archived = data?.entries.filter(entry => entry.archivedAt !== null) ?? [];

  return <div className="space-y-6">
    <section className="rounded-lg border p-4 space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-semibold">경쟁점 가격 조사</h2>
        <Button variant="outline" size="sm" disabled={busy} onClick={() => void load()}>새로고침</Button>
      </div>
      <p className="text-sm text-muted-foreground">네이버 공식 쇼핑검색 API로 후보를 찾고, 스마트스토어 상품 페이지에서 직접 확인한 옵션만 고정 패널에 등록해 가격을 손으로 기록합니다. 자동 수집·AI 요약은 하지 않습니다.</p>
      {data && <p className="text-sm">고정 패널 {data.activeCount}곳 / 목표 {data.target}곳 · 기준 시각 {dateTime(data.asOf)}</p>}
      {loadError && <p role="alert" className="text-sm text-destructive">{loadError}</p>}
      {actionError && <p role="alert" className="text-sm text-destructive">{actionError}</p>}
      {notice && <p role="status" className="text-sm text-muted-foreground">{notice}</p>}
    </section>

    <CompetitorSearchPanel configured={data?.configured ?? false} latestSearch={data?.latestSearch ?? null} busy={busy || !data}
      onSearch={query => void mutate({ action: "search", query }, "검색을 실행했습니다. 아래 후보는 검토용이며 패널에 자동 추가되지 않습니다.")}
      onUseCandidate={useCandidate} />

    <CompetitorPanelForm key={form.key} initial={form.draft} busy={busy || !data} fromCandidate={form.fromCandidate}
      onSubmit={request => void mutate(request, "고정 패널에 추가했습니다. 확인한 가격을 기록해 주세요.")} onReset={resetForm} />

    <section className="rounded-lg border p-4 space-y-3">
      <h3 className="font-semibold">그룹별 대표 가격</h3>
      <CompetitorGroupSummary groups={data?.groups ?? []} />
    </section>

    <section className="space-y-3">
      <h3 className="font-semibold">고정 패널 {active.length}곳</h3>
      {data && active.length === 0 && <p className="text-sm text-muted-foreground">아직 등록한 패널이 없습니다. 위 양식에서 확인한 상품을 추가하세요.</p>}
      {active.length > 0 && <ul className="space-y-3">
        {active.map(entry => <CompetitorEntryCard key={entry.id} entry={entry} busy={busy}
          onRecord={request => void mutate(request, "관측을 기록했습니다.")}
          onArchive={request => void mutate(request, "패널에서 보관했습니다. 이력은 그대로 남습니다.")} />)}
      </ul>}
      {archived.length > 0 && <div className="space-y-3">
        <Button variant="ghost" size="sm" onClick={() => setShowArchived(current => !current)}>{showArchived ? "보관된 패널 숨기기" : `보관된 패널 ${archived.length}곳 보기`}</Button>
        {showArchived && <ul className="space-y-3">
          {archived.map(entry => <CompetitorEntryCard key={entry.id} entry={entry} busy={busy}
            onRecord={request => void mutate(request, "관측을 기록했습니다.")}
            onArchive={request => void mutate(request, "패널에서 보관했습니다.")} />)}
        </ul>}
      </div>}
    </section>

    <CompetitorCostScenario groups={data?.groups ?? []} />

    {data && data.limitations.length > 0 && <section className="rounded-lg border p-4 space-y-2">
      <h3 className="text-sm font-semibold">해석 시 유의</h3>
      <ul className="list-disc space-y-1 pl-5 text-xs text-muted-foreground">{data.limitations.map(item => <li key={item}>{item}</li>)}</ul>
    </section>}
  </div>;
}
