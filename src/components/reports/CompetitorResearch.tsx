"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import type { CompetitorOverview, CompetitorRequest } from "@/lib/briefing/competitor-contracts";
import type { ShoppingCandidate } from "@/lib/briefing/naver-shopping";
import { CompetitorCostScenario } from "./competitor/CompetitorCostScenario";
import { CompetitorEntryCard } from "./competitor/CompetitorEntryCard";
import { CompetitorGroupSummary } from "./competitor/CompetitorGroupSummary";
import { CompetitorPanelForm, emptyPanelDraft, type PanelDraft } from "./competitor/CompetitorPanelForm";
import { CaptureExtensionHelp } from "./competitor/CaptureExtensionHelp";
import { CompetitorDiscovery } from "./competitor/CompetitorDiscovery";
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

/** Competitor panel: browser discovery, confirmed fixed panel, assisted observations, server-side group medians. */
export function CompetitorResearch() {
  const [data, setData] = useState<CompetitorOverview | null>(null);
  const [loadError, setLoadError] = useState("");
  const [actionError, setActionError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState<FormState>({ key: 0, draft: emptyPanelDraft, fromCandidate: false });
  const [showArchived, setShowArchived] = useState(false);
  const panelFormRef = useRef<HTMLDivElement>(null);

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
      return true;
    } catch (error) { setActionError(error instanceof Error ? error.message : "요청을 처리하지 못했습니다."); return false; }
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
      <p className="text-sm text-muted-foreground">브라우저에서 찾은 스마트스토어·브랜드스토어 상품을 등록하고, 선택 옵션의 화면 텍스트로 가격 기록을 도와드립니다. 확인한 품종명·색상·가공·크기 기준·중량이 같은 단일 품종 상품끼리 비교합니다.</p>
      {data && <p className="text-sm">고정 패널 {data.activeCount}곳 / 목표 {data.target}곳 · 추적 옵션 {data.activeOptionCount ?? active.length}개 · 기준 시각 {dateTime(data.asOf)}</p>}
      {loadError && <p role="alert" className="text-sm text-destructive">{loadError}</p>}
      {actionError && <p role="alert" className="text-sm text-destructive">{actionError}</p>}
      {notice && <p role="status" className="text-sm text-muted-foreground">{notice}</p>}
    </section>

    <CompetitorSearchPanel latestSearch={data?.latestSearch ?? null} busy={busy || !data}
      onUseCandidate={useCandidate} />

    <CaptureExtensionHelp />

    <CompetitorDiscovery fixedStoreKeys={active.map(entry => entry.storeKey)} onUse={draft => {
      setForm(current => ({ key: current.key + 1, draft, fromCandidate: true }));
      setNotice("추천 후보의 판매처와 주소를 채웠습니다. 상품 페이지에서 옵션·중량·크기 기준을 확인하고 등록하세요.");
      panelFormRef.current?.scrollIntoView?.({ block: "start" });
    }} />

    <div ref={panelFormRef}><CompetitorPanelForm key={form.key} initial={form.draft} busy={busy || !data} fromCandidate={form.fromCandidate}
      onSubmit={request => void mutate(request, "고정 패널에 추가했습니다. 확인한 가격을 기록해 주세요.")} onReset={resetForm} /></div>

    <section className="rounded-lg border p-4 space-y-3">
      <h3 className="font-semibold">그룹별 대표 가격</h3>
      <CompetitorGroupSummary groups={data?.groups ?? []} />
    </section>

    <section className="space-y-3">
      <h3 className="font-semibold">추적 옵션 {active.length}개 · 점포 {new Set(active.map(entry => entry.storeKey)).size}곳</h3>
      {data && active.length === 0 && <p className="text-sm text-muted-foreground">아직 등록한 패널이 없습니다. 위 양식에서 확인한 상품을 추가하세요.</p>}
      {active.length > 0 && <ul className="space-y-3">
        {active.map(entry => <CompetitorEntryCard key={entry.id} entry={entry} busy={busy}
          onAddOption={() => {
            setForm(current => ({ key: current.key + 1, draft: { ...emptyPanelDraft, storeName: entry.storeName, productUrl: entry.productUrl, productName: entry.productName }, fromCandidate: false }));
            setNotice("같은 판매처의 다른 옵션을 등록할 준비가 됐습니다. 위 양식에서 새 옵션과 중량·비교 조건을 확인하세요.");
            panelFormRef.current?.scrollIntoView?.({ block: "start" });
          }}
          onRecord={request => mutate(request, "관측을 기록했습니다.")}
          onArchive={request => void mutate(request, "선택한 옵션을 보관했습니다. 다른 옵션과 관측 이력은 유지됩니다.")} />)}
      </ul>}
      {archived.length > 0 && <div className="space-y-3">
        <Button variant="ghost" size="sm" onClick={() => setShowArchived(current => !current)}>{showArchived ? "보관된 옵션 숨기기" : `보관된 옵션 ${archived.length}개 보기`}</Button>
        {showArchived && <ul className="space-y-3">
          {archived.map(entry => <CompetitorEntryCard key={entry.id} entry={entry} busy={busy}
            onRecord={request => mutate(request, "관측을 기록했습니다.")}
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
