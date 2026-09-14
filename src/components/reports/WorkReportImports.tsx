"use client";

import { useState } from "react";
import { emptyForm, toRequestInput, toKstDayInput, type WorkImportDetail as Detail, type WorkImportFormState } from "./work-imports/types";
import { useWorkImports } from "./work-imports/useWorkImports";
import { WorkImportForm } from "./work-imports/WorkImportForm";
import { WorkImportPreview } from "./work-imports/WorkImportPreview";
import { WorkImportList } from "./work-imports/WorkImportList";
import { WorkImportDetail } from "./work-imports/WorkImportDetail";

/** Archive of user-provided Work reports: preview → immutable import, with corrections as linked new versions. */
export function WorkReportImports() {
  const [form, setForm] = useState<WorkImportFormState>(emptyForm);
  const { items, detail, preview, error, busy, open, submit, clearPreview, close } = useWorkImports();
  const changeForm = (next: WorkImportFormState) => { setForm(next); if (preview) clearPreview(); };
  const startCorrection = (item: Detail) => {
    setForm({ ...emptyForm, title: item.title, sourceUrl: item.sourceUrl ?? "", periodStart: toKstDayInput(item.periodStart), periodEnd: toKstDayInput(item.periodEnd), parentId: item.id });
    clearPreview(); close();
  };
  const importNow = async () => { if (await submit("import", toRequestInput(form))) setForm(emptyForm); };
  return <div className="space-y-6">
    <div className="rounded-lg border p-4 space-y-3">
      <h2 className="font-semibold">Work 보고서 원문 보관</h2>
      <p className="text-sm text-muted-foreground">외부에서 작성된 주간 보고서의 Markdown과 관측 JSON을 원문 그대로 보관합니다. 보관본은 수정하지 않고, 정정은 원본에 연결된 새 버전으로 남깁니다.</p>
      <WorkImportForm form={form} items={items} busy={busy} onChange={changeForm} onPreview={() => void submit("preview", toRequestInput(form))} onReset={() => { setForm(emptyForm); clearPreview(); }} />
      {error && <p className="text-sm text-destructive" role="alert">{error}</p>}
    </div>
    {preview && <WorkImportPreview preview={preview} busy={busy} onConfirm={() => void importNow()} onCancel={clearPreview} />}
    {detail && <WorkImportDetail item={detail} busy={busy} onClose={close} onOpen={id => void open(id)} onCorrect={startCorrection} />}
    <div className="rounded-lg border p-4 space-y-3">
      <h2 className="font-semibold">보관된 보고서</h2>
      <WorkImportList items={items} busy={busy} onOpen={id => void open(id)} />
    </div>
  </div>;
}
