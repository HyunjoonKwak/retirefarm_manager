import { createHash } from "node:crypto";
import type { WorkImportNormalized, WorkImportStatus, WorkSeries, WorkSeriesKey } from "./work-import-contracts";
import { WORK_IMPORT_ADAPTER, WORK_IMPORT_STATISTICS_VERSION, WORK_SERIES_KEYS, workObservationsV1Schema } from "./work-import-contracts";
import { buildSeries } from "./work-import-stats";

export class WorkImportError extends Error {
  constructor(readonly code: "DUPLICATE" | "PARENT_NOT_FOUND" | "NOT_FOUND", readonly status: number, message: string) { super(message); }
}
/** Same Markdown + same JSON text means the same import for one user; whitespace differences are distinct on purpose. */
export function hashWorkImport(markdown: string, json: string | undefined): string {
  return createHash("sha256").update(JSON.stringify([markdown, json ?? null])).digest("hex");
}
/** Syntax errors are not fatal: the text is still archived, only labelled so nobody reads statistics into it. */
export function parseWorkJson(json: string): { ok: true; value: unknown } | { ok: false } {
  try { return { ok: true, value: JSON.parse(json) }; } catch { return { ok: false }; }
}
const base = (status: WorkImportStatus, reasons: string[]): WorkImportNormalized => ({
  schemaVersion: 1, adapter: WORK_IMPORT_ADAPTER, statisticsVersion: WORK_IMPORT_STATISTICS_VERSION, sourceType: "PUBLIC_DAILY_AVERAGE",
  status, reasons, gradeOrder: [], observationWindow: null, series: [], smartstore: null, correction: null, limits: null, sourceCount: 0,
});
type Row = [string, ...(number | null)[]];
/** Rows must match `gradeOrder` exactly and name each day once; anything else keeps the whole file raw-only. */
function rowProblems(key: WorkSeriesKey, gradeOrder: string[], rows: Row[]): string[] {
  const seen = new Set<string>();
  return rows.flatMap((row, index) => {
    const problems: string[] = [];
    if (row.length !== gradeOrder.length + 1) problems.push(`${key}[${index}] 값 개수 ${row.length - 1}개가 gradeOrder ${gradeOrder.length}개와 다릅니다.`);
    if (seen.has(row[0])) problems.push(`${key}[${index}] 날짜 ${row[0]}가 중복됩니다.`);
    seen.add(row[0]);
    return problems;
  });
}
/**
 * Validates the Work observation export documented in the plan (§4) and derives weekly simple means.
 * Unknown shapes are never guessed: the import is labelled UNSUPPORTED and only the raw file is kept.
 */
export function normalizeWorkJson(parsed: unknown): WorkImportNormalized {
  const result = workObservationsV1Schema.safeParse(parsed);
  if (!result.success) {
    const reasons = result.error.issues.slice(0, 10).map(issue => `${issue.path.join(".") || "(root)"}: ${issue.message}`);
    return base("UNSUPPORTED", ["work-observations-v1 구조와 다릅니다. 원문 JSON만 보관합니다.", ...reasons]);
  }
  const data = result.data;
  const sections = WORK_SERIES_KEYS.flatMap(key => {
    const rows = key === "rows" ? data.rows : data[key]?.rows;
    const packageKg = key === "rows" ? null : data[key]?.packageKg ?? null;
    return rows ? [{ key, rows: rows as Row[], packageKg }] : [];
  });
  const problems = sections.flatMap(section => rowProblems(section.key, data.gradeOrder, section.rows));
  const common = { gradeOrder: data.gradeOrder, observationWindow: data.observationWindow ?? null,
    smartstore: data.smartstore ? { observationCount: data.smartstore.observations.length, panelEstablished: data.smartstore.panelEstablished } : null,
    correction: data.correction ?? null, limits: data.limits ?? null,
    sourceCount: Array.isArray(data.sources) ? data.sources.length : Object.keys(data.sources ?? {}).length };
  if (problems.length) return { ...base("UNSUPPORTED", ["행 구조가 gradeOrder와 맞지 않아 통계를 계산하지 않았습니다.", ...problems.slice(0, 10)]), ...common };
  const series: WorkSeries[] = sections.map(section => buildSeries(section.key, data.gradeOrder, section.rows, section.packageKg));
  const reasons = series.length ? [] : ["가격 행이 없어 통계 없이 구조만 보관합니다."];
  return { ...base("SUPPORTED", reasons), ...common, series };
}
/** Markdown-only imports carry no observations; the table text is archived, never promoted to statistics. */
export function normalizeWorkImport(json: string | undefined): WorkImportNormalized {
  if (!json) return base("MARKDOWN_ONLY", ["JSON 없이 Markdown 원문만 보관합니다. 본문 표는 통계로 변환하지 않습니다."]);
  const parsed = parseWorkJson(json);
  if (!parsed.ok) return base("UNSUPPORTED", ["JSON 구문 오류로 통계를 계산하지 않았습니다. 입력한 텍스트를 원문 그대로 보관합니다."]);
  return normalizeWorkJson(parsed.value);
}
export function parseNormalized(value: string | null): WorkImportNormalized | null {
  if (!value) return null;
  try { return JSON.parse(value) as WorkImportNormalized; } catch { return null; }
}
