import type { WorkImportNormalized } from "./work-import-contracts";

/** Minimal record shape so callers can pass a Prisma row or an API item. */
export interface WorkImportSourceRecord { id: string; version: number; sourceUrl: string | null; createdAt: Date | string;
  periodStart: Date | string | null; periodEnd: Date | string | null; normalized: WorkImportNormalized | string | null }
export interface WorkImportSnapshotSource { id: string; title: string; url: string | null; status: "AVAILABLE" | "NOT_COLLECTED"; note: string }
export interface WorkImportSnapshotMetric { id: string; label: string; value: number; unit: string; sourceId: string }
export interface WorkImportSourceSummary { source: WorkImportSnapshotSource; metrics: WorkImportSnapshotMetric[]; limitations: string[] }
export const WORK_IMPORT_METRIC_LIMIT = 200;

const day = (value: Date | string | null) => value ? new Date(value).toISOString().slice(0, 10) : null;
const parse = (value: WorkImportNormalized | string | null): WorkImportNormalized | null => {
  if (!value) return null;
  if (typeof value !== "string") return value;
  try { return JSON.parse(value) as WorkImportNormalized; } catch { return null; }
};
/**
 * Provenance-only description of an archived Work report for the briefing snapshot.
 * Every string is templated here: the user's title, Markdown and JSON prose never reach the model as instructions.
 * Metrics are simple means of public daily averages and carry that definition in their unit so they cannot be
 * mistaken for `auction-unit-weighted-v1` values.
 */
export function summarizeWorkImportSource(record: WorkImportSourceRecord): WorkImportSourceSummary {
  const sourceId = `work-import:${record.id}`;
  const normalized = parse(record.normalized);
  const period = record.periodStart || record.periodEnd ? ` (${day(record.periodStart) ?? "?"}~${day(record.periodEnd) ?? "?"})` : "";
  const title = `사용자 가져온 Work 보고서 v${record.version}${period}`.slice(0, 200);
  const importedAt = day(record.createdAt);
  const status = normalized?.status ?? "MARKDOWN_ONLY";
  const statusNote = status === "SUPPORTED" ? "구조 검증됨(work-observations-v1)" : status === "UNSUPPORTED" ? "JSON 구조 미지원, 원문만 보관" : "Markdown 원문만 보관";
  const note = `${importedAt} 가져옴 · ${statusNote} · 공개 일별 평균 자료로 경매 원거래 가중평균과 별개 시계열 · 정정 버전 v${record.version}`.slice(0, 1000);
  const source: WorkImportSnapshotSource = { id: sourceId, title, url: record.sourceUrl, status: status === "SUPPORTED" ? "AVAILABLE" : "NOT_COLLECTED", note };
  const all = (normalized?.status === "SUPPORTED" ? normalized.series : []).flatMap(series => series.weekly.flatMap(week => week.grades.flatMap(grade =>
    grade.mean === null ? [] : [{ id: `${sourceId}:${series.key}:${week.weekStart}:${grade.grade}`, value: grade.mean, sourceId,
      unit: series.packageKg ? `원/${series.packageKg}kg(공개일별평균 단순평균)` : "원(공개일별평균 단순평균, 포장 미확인)",
      label: `가져온 Work 보고서 v${record.version} · ${series.label}${series.packageKg ? ` ${series.packageKg}kg` : ""} · ${grade.grade} · ${week.weekStart}~${week.weekEnd} 주 · 공개 일별 평균의 단순평균 (표본 ${grade.sampleCount}일)`.slice(0, 500) }])));
  const limitations = [
    "가져온 Work 보고서 수치는 시장 전체 공개 일별 평균의 단순평균이며 법인·산지별 경매 원거래 가중평균과 정의가 달라 같은 추세선으로 잇지 않습니다.",
    // Only the templated headline reason is forwarded; detail lines may echo row indexes and dates from the file.
    ...(normalized?.reasons[0] ? [`가져온 Work 보고서: ${normalized.reasons[0]}`.slice(0, 1000)] : []),
    ...(all.length > WORK_IMPORT_METRIC_LIMIT ? [`가져온 Work 보고서 지표 ${all.length}개 중 ${WORK_IMPORT_METRIC_LIMIT}개만 전달했습니다.`] : []),
  ];
  return { source, metrics: all.slice(0, WORK_IMPORT_METRIC_LIMIT), limitations };
}
