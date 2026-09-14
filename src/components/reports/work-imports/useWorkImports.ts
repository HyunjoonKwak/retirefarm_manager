"use client";

import { useCallback, useEffect, useState } from "react";
import type { WorkImportDetail, WorkImportListItem, WorkImportPreview } from "./types";

const readError = async (response: Response, fallback: string) => {
  const body = await response.json().catch(() => null);
  return body?.error ? String(body.error) : fallback;
};
/** List/detail/preview/import against /api/briefings/imports; every call is authenticated by the session cookie. */
export function useWorkImports() {
  const [items, setItems] = useState<WorkImportListItem[] | null>(null);
  const [detail, setDetail] = useState<WorkImportDetail | null>(null);
  const [preview, setPreview] = useState<WorkImportPreview | null>(null);
  const [error, setError] = useState(""); const [busy, setBusy] = useState(false);
  const load = useCallback(async () => {
    try {
      const response = await fetch("/api/briefings/imports", { cache: "no-store" });
      if (!response.ok) throw new Error(await readError(response, "목록을 불러오지 못했습니다."));
      setItems((await response.json()).items); setError("");
    } catch (error) { setError(error instanceof Error ? error.message : "목록을 불러오지 못했습니다."); }
  }, []);
  useEffect(() => { void load(); }, [load]);
  const open = useCallback(async (id: string) => {
    setBusy(true); setError("");
    try {
      const response = await fetch(`/api/briefings/imports/${encodeURIComponent(id)}`, { cache: "no-store" });
      if (!response.ok) throw new Error(await readError(response, "보고서를 불러오지 못했습니다."));
      setDetail((await response.json()).item);
    } catch (error) { setError(error instanceof Error ? error.message : "보고서를 불러오지 못했습니다."); }
    finally { setBusy(false); }
  }, []);
  const submit = useCallback(async (action: "preview" | "import", input: object): Promise<WorkImportListItem | null> => {
    setBusy(true); setError("");
    try {
      const response = await fetch("/api/briefings/imports", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action, input }) });
      if (!response.ok) throw new Error(await readError(response, "요청을 처리하지 못했습니다."));
      const body = await response.json();
      if (action === "preview") { setPreview(body.preview); return null; }
      setPreview(null); await load(); return body.item as WorkImportListItem;
    } catch (error) { setError(error instanceof Error ? error.message : "요청을 처리하지 못했습니다."); return null; }
    finally { setBusy(false); }
  }, [load]);
  const clearPreview = useCallback(() => setPreview(null), []);
  const close = useCallback(() => setDetail(null), []);
  return { items, detail, preview, error, busy, load, open, submit, clearPreview, close };
}
