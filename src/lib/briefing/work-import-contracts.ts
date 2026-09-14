import { z } from "zod";

/** Hard bounds for one import. Markdown and JSON are stored verbatim, so bytes matter. */
export const WORK_IMPORT_LIMITS = {
  markdownChars: 512 * 1024, jsonChars: 1024 * 1024, requestBytes: 2 * 1024 * 1024,
  titleChars: 200, urlChars: 2000, reasonChars: 1000, listSize: 100,
} as const;
export const WORK_IMPORT_ADAPTER = "work-observations-v1" as const;
/** Simple mean of public daily averages. Never comparable with `auction-unit-weighted-v1`. */
export const WORK_IMPORT_STATISTICS_VERSION = "public-daily-simple-mean-v1" as const;

const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "YYYY-MM-DD");
const isRealDay = (value: string) => {
  const parsed = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().startsWith(value);
};
const httpUrl = z.string().trim().max(WORK_IMPORT_LIMITS.urlChars)
  .refine(value => { try { return ["http:", "https:"].includes(new URL(value).protocol); } catch { return false; } }, "http/https URL만 저장합니다.");
/** Drops C0/DEL control characters (tab and newline stay) so titles and reasons render predictably. */
const withoutControls = (value: string) => Array.from(value).filter(ch => { const code = ch.charCodeAt(0); return code === 9 || code === 10 || code === 13 || (code > 31 && code !== 127); }).join("");

/** Preview and import share one payload; a correction adds the parent and its reason. */
export const workImportInputSchema = z.object({
  title: z.string().transform(withoutControls).pipe(z.string().trim().min(1).max(WORK_IMPORT_LIMITS.titleChars)),
  sourceUrl: z.string().trim().transform(value => value || undefined).pipe(httpUrl.optional()).optional(),
  periodStart: day.refine(isRealDay).optional(), periodEnd: day.refine(isRealDay).optional(),
  markdown: z.string().min(1).max(WORK_IMPORT_LIMITS.markdownChars).refine(value => value.trim().length > 0, "본문이 비어 있습니다."),
  json: z.string().max(WORK_IMPORT_LIMITS.jsonChars).transform(value => value.trim() ? value : undefined).optional(),
  parentId: z.string().trim().min(1).max(100).optional(),
  correctionReason: z.string().transform(withoutControls).pipe(z.string().trim().min(1).max(WORK_IMPORT_LIMITS.reasonChars)).optional(),
}).strict()
  .refine(input => !input.periodStart || !input.periodEnd || input.periodStart <= input.periodEnd, { message: "기간 종료일이 시작일보다 빠릅니다.", path: ["periodEnd"] })
  .refine(input => !input.parentId || !!input.correctionReason, { message: "정정 사유를 입력해 주세요.", path: ["correctionReason"] })
  .refine(input => !input.correctionReason || !!input.parentId, { message: "정정할 원본을 선택해 주세요.", path: ["parentId"] });
export type WorkImportInput = z.infer<typeof workImportInputSchema>;

export const workImportRequestSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("preview"), input: workImportInputSchema }).strict(),
  z.object({ action: z.literal("import"), input: workImportInputSchema }).strict(),
]);

/**
 * Structure documented in the development plan §4 for the attached Work export.
 * Only the fields a statistic depends on are typed; everything else is preserved untouched.
 */
const price = z.number().finite().min(-1_000_000_000).max(1_000_000_000).nullable();
export const workRowSchema = z.tuple([day.refine(isRealDay, "실제 날짜가 아닙니다.")]).rest(price);
const seriesSchema = z.looseObject({ packageKg: z.number().finite().min(0.001).max(1000).optional(), rows: z.array(workRowSchema).max(5000).optional() });
export const workObservationsV1Schema = z.looseObject({
  schemaVersion: z.literal(1),
  observationWindow: z.unknown().optional(),
  sources: z.union([z.array(z.unknown()).max(100), z.record(z.string().max(50), z.unknown())]).optional(),
  method: z.unknown().optional(),
  gradeOrder: z.array(z.string().trim().min(1).max(20)).min(1).max(10).refine(list => new Set(list).size === list.length, "등급이 중복됩니다."),
  jujube: seriesSchema.optional(), round: seriesSchema.optional(), rows: z.array(workRowSchema).max(5000).optional(),
  smartstore: z.looseObject({ observations: z.array(z.unknown()).max(1000), panelEstablished: z.boolean() }).optional(),
  correction: z.unknown().optional(),
  limits: z.unknown().optional(),
});
export type WorkObservationsV1 = z.infer<typeof workObservationsV1Schema>;
export const WORK_SERIES_KEYS = ["jujube", "round", "rows"] as const;
export type WorkSeriesKey = (typeof WORK_SERIES_KEYS)[number];
export const WORK_SERIES_LABELS: Record<WorkSeriesKey, string> = { jujube: "대추방울", round: "원형 방울", rows: "품종 미구분" };

export interface WorkGradeMean { grade: string; mean: number | null; sampleCount: number; dayCount: number }
export interface WorkWeeklyMean { weekStart: string; weekEnd: string; dayCount: number; grades: WorkGradeMean[] }
export interface WorkExcludedValue { date: string; grade: string; value: number; reason: "NON_POSITIVE" }
export interface WorkSeries { key: WorkSeriesKey; label: string; packageKg: number | null; dayCount: number;
  rows: { date: string; values: (number | null)[] }[]; excluded: WorkExcludedValue[]; weekly: WorkWeeklyMean[] }
export type WorkImportStatus = "SUPPORTED" | "UNSUPPORTED" | "MARKDOWN_ONLY";
/** Stored in `WorkReportImport.normalized`; derived, so it can be recomputed from the raw columns. */
export interface WorkImportNormalized {
  schemaVersion: 1; adapter: typeof WORK_IMPORT_ADAPTER; statisticsVersion: typeof WORK_IMPORT_STATISTICS_VERSION;
  sourceType: "PUBLIC_DAILY_AVERAGE"; status: WorkImportStatus; reasons: string[];
  gradeOrder: string[]; observationWindow: unknown; series: WorkSeries[];
  smartstore: { observationCount: number; panelEstablished: boolean } | null;
  correction: unknown; limits: unknown; sourceCount: number;
}
