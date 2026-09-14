"use client";

import { useState, type ChangeEvent } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { WORK_IMPORT_LIMITS } from "@/lib/briefing/work-import-contracts";
import type { WorkImportFormState, WorkImportListItem } from "./types";

interface Props { form: WorkImportFormState; items: WorkImportListItem[] | null; busy: boolean;
  onChange: (next: WorkImportFormState) => void; onPreview: () => void; onReset: () => void }
const MAX_FILE_BYTES = WORK_IMPORT_LIMITS.jsonChars;
/** Text fields and file pickers for the same two payloads; a picked file only fills the textarea, it is not uploaded. */
export function WorkImportForm({ form, items, busy, onChange, onPreview, onReset }: Props) {
  const [fileError, setFileError] = useState("");
  const set = (key: keyof WorkImportFormState) => (event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
    onChange({ ...form, [key]: event.target.value });
  const readFile = (key: "markdown" | "json") => async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]; if (!file) return;
    if (file.size > MAX_FILE_BYTES) { setFileError(`${file.name}은 ${Math.round(MAX_FILE_BYTES / 1024)}KB를 넘어 읽지 않았습니다.`); return; }
    try { onChange({ ...form, [key]: await file.text() }); setFileError(""); }
    catch { setFileError(`${file.name}을 읽지 못했습니다.`); }
  };
  const canPreview = !busy && !!form.title.trim() && !!form.markdown.trim() && (!form.parentId || !!form.correctionReason.trim());
  return <form className="space-y-3" onSubmit={event => { event.preventDefault(); if (canPreview) onPreview(); }}>
    <div className="grid gap-3 sm:grid-cols-2">
      <div className="space-y-1"><Label htmlFor="wi-title">제목</Label><Input id="wi-title" maxLength={WORK_IMPORT_LIMITS.titleChars} value={form.title} onChange={set("title")} disabled={busy} /></div>
      <div className="space-y-1"><Label htmlFor="wi-url">출처 링크 (선택)</Label><Input id="wi-url" type="url" inputMode="url" maxLength={WORK_IMPORT_LIMITS.urlChars} placeholder="https://" value={form.sourceUrl} onChange={set("sourceUrl")} disabled={busy} /></div>
      <div className="space-y-1"><Label htmlFor="wi-start">보고 기간 시작 (선택)</Label><Input id="wi-start" type="date" value={form.periodStart} onChange={set("periodStart")} disabled={busy} /></div>
      <div className="space-y-1"><Label htmlFor="wi-end">보고 기간 종료 (선택)</Label><Input id="wi-end" type="date" value={form.periodEnd} onChange={set("periodEnd")} disabled={busy} /></div>
    </div>
    <div className="space-y-1">
      <Label htmlFor="wi-markdown">Markdown 본문</Label>
      <Textarea id="wi-markdown" rows={8} value={form.markdown} onChange={set("markdown")} disabled={busy} placeholder="보고서 원문을 붙여 넣거나 파일을 선택하세요." />
      <Input aria-label="Markdown 파일" type="file" accept=".md,.markdown,.txt,text/markdown,text/plain" disabled={busy} onChange={readFile("markdown")} />
    </div>
    <div className="space-y-1">
      <Label htmlFor="wi-json">관측 JSON (선택)</Label>
      <Textarea id="wi-json" rows={6} value={form.json} onChange={set("json")} disabled={busy} placeholder="work-observations-v1 JSON. 구조가 다르거나 구문 오류가 있으면 통계 없이 원문만 보관됩니다." />
      <Input aria-label="JSON 파일" type="file" accept=".json,application/json" disabled={busy} onChange={readFile("json")} />
    </div>
    <div className="grid gap-3 sm:grid-cols-2">
      <div className="space-y-1"><Label htmlFor="wi-parent">정정할 원본 (선택)</Label>
        <select id="wi-parent" className="border-input h-9 w-full rounded-md border bg-transparent px-3 text-sm" value={form.parentId} onChange={set("parentId")} disabled={busy}>
          <option value="">새 보고서로 보관</option>
          {(items ?? []).map(item => <option key={item.id} value={item.id}>{item.title} v{item.version}</option>)}
        </select></div>
      <div className="space-y-1"><Label htmlFor="wi-reason">정정 사유{form.parentId ? "" : " (원본 선택 시)"}</Label>
        <Input id="wi-reason" maxLength={WORK_IMPORT_LIMITS.reasonChars} value={form.correctionReason} onChange={set("correctionReason")} disabled={busy || !form.parentId} /></div>
    </div>
    {fileError && <p className="text-sm text-destructive" role="alert">{fileError}</p>}
    <div className="flex flex-wrap gap-2">
      <Button type="submit" disabled={!canPreview}>미리보기</Button>
      <Button type="button" variant="outline" disabled={busy} onClick={onReset}>입력 지우기</Button>
    </div>
    <p className="text-xs text-muted-foreground">저장 전 미리보기를 거칩니다. 링크는 저장만 하고 서버가 방문하지 않습니다. 본문의 표는 통계로 변환하지 않으며 JSON은 알려진 구조일 때만 주간 단순평균을 계산합니다.</p>
  </form>;
}
