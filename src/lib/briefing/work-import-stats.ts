import type { WorkExcludedValue, WorkGradeMean, WorkSeries, WorkSeriesKey, WorkWeeklyMean } from "./work-import-contracts";
import { WORK_SERIES_LABELS } from "./work-import-contracts";

type Row = [string, ...(number | null)[]];
const DAY_MS = 86400_000;
const isoDay = (ms: number) => new Date(ms).toISOString().slice(0, 10);
/** Calendar dates in the export are already local (KST) days, so the week is derived from the date string alone. */
export function weekOfDay(date: string) {
  const ms = Date.parse(`${date}T00:00:00Z`);
  const offset = (new Date(ms).getUTCDay() + 6) % 7;
  const start = ms - offset * DAY_MS;
  return { weekStart: isoDay(start), weekEnd: isoDay(start + 6 * DAY_MS) };
}
/** Simple mean of the valid values; null when nothing valid was observed. */
export function simpleMean(values: number[]): number | null {
  if (!values.length) return null;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}
function gradeMeans(gradeOrder: string[], rows: Row[]): WorkGradeMean[] {
  return gradeOrder.map((grade, index) => {
    const values = rows.map(row => row[index + 1]).filter((value): value is number => typeof value === "number" && value > 0);
    return { grade, mean: simpleMean(values), sampleCount: values.length, dayCount: values.length };
  });
}
/** Weekly means per grade: one public daily average per day counts once, unweighted by volume. */
export function weeklyMeans(gradeOrder: string[], rows: Row[]): WorkWeeklyMean[] {
  const buckets = rows.reduce<Record<string, Row[]>>((acc, row) => {
    const { weekStart } = weekOfDay(row[0]);
    return { ...acc, [weekStart]: [...(acc[weekStart] ?? []), row] };
  }, {});
  return Object.keys(buckets).sort().map(weekStart => {
    const weekRows = buckets[weekStart];
    return { weekStart, weekEnd: weekOfDay(weekStart).weekEnd, dayCount: new Set(weekRows.map(row => row[0])).size, grades: gradeMeans(gradeOrder, weekRows) };
  });
}
function excludedValues(gradeOrder: string[], rows: Row[]): WorkExcludedValue[] {
  return rows.flatMap(row => gradeOrder.flatMap((grade, index) => {
    const value = row[index + 1];
    return typeof value === "number" && value <= 0 ? [{ date: row[0], grade, value, reason: "NON_POSITIVE" as const }] : [];
  }));
}
export function buildSeries(key: WorkSeriesKey, gradeOrder: string[], rows: Row[], packageKg: number | null): WorkSeries {
  const sorted = [...rows].sort((a, b) => a[0].localeCompare(b[0]));
  return { key, label: WORK_SERIES_LABELS[key], packageKg, dayCount: new Set(sorted.map(row => row[0])).size,
    rows: sorted.map(row => ({ date: row[0], values: row.slice(1) as (number | null)[] })),
    excluded: excludedValues(gradeOrder, sorted), weekly: weeklyMeans(gradeOrder, sorted) };
}
