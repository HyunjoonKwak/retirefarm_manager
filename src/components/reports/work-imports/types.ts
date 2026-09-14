import type { WorkImportDetail, WorkImportListItem, WorkImportPreview } from "@/lib/briefing/work-import-service";

export type { WorkImportDetail, WorkImportListItem, WorkImportPreview };
export interface WorkImportFormState { title: string; sourceUrl: string; periodStart: string; periodEnd: string; markdown: string; json: string;
  parentId: string; correctionReason: string }
export const emptyForm: WorkImportFormState = { title: "", sourceUrl: "", periodStart: "", periodEnd: "", markdown: "", json: "", parentId: "", correctionReason: "" };
export const statusNames: Record<string, string> = { SUPPORTED: "구조 검증됨", UNSUPPORTED: "JSON 구조 미지원 · 원문만 보관", MARKDOWN_ONLY: "Markdown 원문만 보관" };
export const formatDateTime = (value: string) => new Date(value).toLocaleString("ko-KR", { timeZone: "Asia/Seoul" });
export const formatDay = (value: string | null) => value ? new Date(value).toLocaleDateString("ko-KR", { timeZone: "Asia/Seoul" }) : null;
export const formatWon = (value: number) => `${Math.round(value).toLocaleString("ko-KR")}원`;
/** Builds the request payload; empty optional fields are omitted so the server treats them as absent. */
export function toRequestInput(form: WorkImportFormState) {
  const optional = (value: string) => value.trim() ? value.trim() : undefined;
  return { title: form.title, markdown: form.markdown, json: form.json.trim() ? form.json : undefined, sourceUrl: optional(form.sourceUrl),
    periodStart: optional(form.periodStart), periodEnd: optional(form.periodEnd), parentId: optional(form.parentId), correctionReason: optional(form.correctionReason) };
}

export const toKstDayInput = (value: string | null) => value ? new Date(Date.parse(value) + 9 * 3600000).toISOString().slice(0, 10) : "";
