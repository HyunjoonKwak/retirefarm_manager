// @vitest-environment node
import { describe, expect, it } from "vitest";
import { hashWorkImport, normalizeWorkImport, normalizeWorkJson } from "@/lib/briefing/work-import";
import { simpleMean, weekOfDay, weeklyMeans } from "@/lib/briefing/work-import-stats";
import { WORK_IMPORT_LIMITS, workImportInputSchema } from "@/lib/briefing/work-import-contracts";
import { summarizeWorkImportSource, WORK_IMPORT_METRIC_LIMIT } from "@/lib/briefing/work-import-summary";
import { snapshotSchema } from "@/lib/briefing/contracts";

/** Fixture shaped only by the keys the development plan §4 documents; values are invented test data. */
const sample = () => ({
  schemaVersion: 1, observationWindow: { start: "2026-09-01T10:00:00+09:00", end: "2026-09-07T10:00:00+09:00", precision: "hour" },
  sources: { jujube: "https://example.invalid/jujube", round: "https://example.invalid/round", hanjin: "https://example.invalid/hanjin" },
  method: "가락시장 전체 공개 일별 등급 평균", gradeOrder: ["특", "상", "중", "하"],
  jujube: { packageKg: 3, rows: [["2026-09-01", 30000, 25000, 20000, null], ["2026-09-02", 32000, 26000, 21000, 15000], ["2026-09-07", 40000, 30000, 0, -5]] },
  round: { packageKg: 5, rows: [["2026-09-01", 20000, 18000, null, null]] },
  smartstore: { observations: [], panelEstablished: false }, correction: { note: "5거래일→6거래일" }, limits: ["원인 미입증"],
});

describe("work-observations-v1 adapter", () => {
  it("keeps the documented structure and derives per-series weekly simple means with sample and day counts", () => {
    const normalized = normalizeWorkJson(sample());
    expect(normalized.status).toBe("SUPPORTED");
    expect(normalized).toMatchObject({ adapter: "work-observations-v1", statisticsVersion: "public-daily-simple-mean-v1", sourceType: "PUBLIC_DAILY_AVERAGE",
      gradeOrder: ["특", "상", "중", "하"], observationWindow: { precision: "hour" }, smartstore: { observationCount: 0, panelEstablished: false },
      correction: { note: "5거래일→6거래일" }, limits: ["원인 미입증"], sourceCount: 3 });
    expect(normalizeWorkJson({ ...sample(), sources: [{ title: "a" }, { title: "b" }] }).sourceCount).toBe(2);
    expect(normalizeWorkJson({ ...sample(), sources: "text" }).status).toBe("UNSUPPORTED");
    const jujube = normalized.series.find(series => series.key === "jujube")!;
    expect(jujube).toMatchObject({ label: "대추방울", packageKg: 3, dayCount: 3 });
    expect(jujube.weekly).toHaveLength(2);
    expect(jujube.weekly[0]).toMatchObject({ weekStart: "2026-08-31", weekEnd: "2026-09-06", dayCount: 2 });
    expect(jujube.weekly[0].grades[0]).toEqual({ grade: "특", mean: 31000, sampleCount: 2, dayCount: 2 });
    expect(jujube.weekly[0].grades[3]).toEqual({ grade: "하", mean: 15000, sampleCount: 1, dayCount: 1 });
    expect(normalized.series.find(series => series.key === "round")).toMatchObject({ label: "원형 방울", packageKg: 5, dayCount: 1 });
    expect(normalized.series.map(series => series.key)).not.toContain("rows");
  });
  it("excludes non-positive daily values with a reason instead of averaging them", () => {
    const jujube = normalizeWorkJson(sample()).series.find(series => series.key === "jujube")!;
    const lastWeek = jujube.weekly.find(week => week.weekStart === "2026-09-07")!;
    expect(lastWeek.grades.map(grade => [grade.mean, grade.sampleCount])).toEqual([[40000, 1], [30000, 1], [null, 0], [null, 0]]);
    expect(jujube.excluded).toEqual([{ date: "2026-09-07", grade: "중", value: 0, reason: "NON_POSITIVE" }, { date: "2026-09-07", grade: "하", value: -5, reason: "NON_POSITIVE" }]);
  });
  it("splits weeks on KST Monday boundaries from the date string and treats the week as a separate series point", () => {
    expect(weekOfDay("2026-09-07")).toEqual({ weekStart: "2026-09-07", weekEnd: "2026-09-13" });
    expect(weekOfDay("2026-09-06")).toEqual({ weekStart: "2026-08-31", weekEnd: "2026-09-06" });
    const weeks = weeklyMeans(["특"], [["2026-09-06", 10], ["2026-09-07", 30], ["2026-09-08", 50]]);
    expect(weeks.map(week => [week.weekStart, week.grades[0].mean, week.dayCount])).toEqual([["2026-08-31", 10, 1], ["2026-09-07", 40, 2]]);
  });
  it("uses a simple mean of daily averages, which differs from the auction quantity-weighted mean on the same numbers", () => {
    const daily = [{ price: 10000, quantity: 1 }, { price: 20000, quantity: 3 }];
    const weighted = daily.reduce((sum, row) => sum + row.price * row.quantity, 0) / daily.reduce((sum, row) => sum + row.quantity, 0);
    expect(simpleMean(daily.map(row => row.price))).toBe(15000);
    expect(weighted).toBe(17500);
    expect(simpleMean([])).toBeNull();
  });
  it("labels JSON that is valid but not the known structure as unsupported and keeps no series", () => {
    const normalized = normalizeWorkJson({ schemaVersion: 2, rows: [["2026-09-01", 1]] });
    expect(normalized.status).toBe("UNSUPPORTED");
    expect(normalized.series).toEqual([]);
    expect(normalized.reasons[0]).toContain("work-observations-v1");
    expect(normalized.reasons.some(reason => reason.startsWith("schemaVersion"))).toBe(true);
    expect(normalizeWorkJson([1, 2, 3]).status).toBe("UNSUPPORTED");
    expect(normalizeWorkJson("text").status).toBe("UNSUPPORTED");
  });
  it("rejects malformed rows (length, date, type, duplicate day) for the whole file rather than guessing", () => {
    const short = normalizeWorkJson({ ...sample(), jujube: { packageKg: 3, rows: [["2026-09-01", 1, 2, 3]] } });
    expect(short.status).toBe("UNSUPPORTED");
    expect(short.reasons.some(reason => reason.includes("jujube[0]") && reason.includes("gradeOrder 4"))).toBe(true);
    expect(short.gradeOrder).toEqual(["특", "상", "중", "하"]);
    const duplicate = normalizeWorkJson({ ...sample(), round: { packageKg: 5, rows: [["2026-09-01", 1, 2, 3, 4], ["2026-09-01", 1, 2, 3, 4]] } });
    expect(duplicate.reasons.some(reason => reason.includes("중복"))).toBe(true);
    expect(normalizeWorkJson({ ...sample(), round: { packageKg: 5, rows: [["2026-02-30", 1, 2, 3, 4]] } }).status).toBe("UNSUPPORTED");
    expect(normalizeWorkJson({ ...sample(), round: { packageKg: 5, rows: [["2026-09-01", "30,000", 2, 3, 4]] } }).status).toBe("UNSUPPORTED");
    expect(normalizeWorkJson({ ...sample(), gradeOrder: ["특", "특"] }).status).toBe("UNSUPPORTED");
    expect(normalizeWorkJson({ ...sample(), smartstore: { observations: [], panelEstablished: "no" } }).status).toBe("UNSUPPORTED");
  });
  it("accepts a structurally valid file without any rows and says so", () => {
    const normalized = normalizeWorkJson({ schemaVersion: 1, gradeOrder: ["특"] });
    expect(normalized.status).toBe("SUPPORTED");
    expect(normalized.series).toEqual([]);
    expect(normalized.reasons[0]).toContain("가격 행이 없어");
  });
  it("keeps Markdown-only imports as archives and labels invalid JSON syntax raw-only instead of rejecting it", () => {
    expect(normalizeWorkImport(undefined)).toMatchObject({ status: "MARKDOWN_ONLY", series: [] });
    const broken = normalizeWorkImport("{ not json");
    expect(broken).toMatchObject({ status: "UNSUPPORTED", series: [], gradeOrder: [] });
    expect(broken.reasons[0]).toContain("JSON 구문 오류");
    expect(normalizeWorkImport(JSON.stringify(sample())).status).toBe("SUPPORTED");
  });
  it("hashes the exact Markdown and JSON text so a whitespace-only edit is a different version", () => {
    expect(hashWorkImport("# a", undefined)).toBe(hashWorkImport("# a", undefined));
    expect(hashWorkImport("# a", undefined)).not.toBe(hashWorkImport("# a ", undefined));
    expect(hashWorkImport("# a", "{}")).not.toBe(hashWorkImport("# a", undefined));
    expect(hashWorkImport("# a", "{}")).toMatch(/^[a-f0-9]{64}$/);
  });
});

describe("work import input schema", () => {
  const valid = { title: "9/14 주간 보고", markdown: "# 보고서" };
  it("bounds every field and requires the reason and parent together", () => {
    expect(workImportInputSchema.safeParse(valid).success).toBe(true);
    expect(workImportInputSchema.safeParse({ ...valid, markdown: "x".repeat(WORK_IMPORT_LIMITS.markdownChars + 1) }).success).toBe(false);
    expect(workImportInputSchema.safeParse({ ...valid, json: "x".repeat(WORK_IMPORT_LIMITS.jsonChars + 1) }).success).toBe(false);
    expect(workImportInputSchema.safeParse({ ...valid, title: "x".repeat(201) }).success).toBe(false);
    expect(workImportInputSchema.safeParse({ ...valid, markdown: "   \n" }).success).toBe(false);
    expect(workImportInputSchema.safeParse({ ...valid, parentId: "p1" }).success).toBe(false);
    expect(workImportInputSchema.safeParse({ ...valid, correctionReason: "이유" }).success).toBe(false);
    expect(workImportInputSchema.safeParse({ ...valid, parentId: "p1", correctionReason: "이유" }).success).toBe(true);
    expect(workImportInputSchema.safeParse({ ...valid, extra: 1 }).success).toBe(false);
  });
  it("accepts only http(s) links, real dates and an ordered period", () => {
    expect(workImportInputSchema.safeParse({ ...valid, sourceUrl: "javascript:alert(1)" }).success).toBe(false);
    expect(workImportInputSchema.safeParse({ ...valid, sourceUrl: "ftp://example.invalid/a" }).success).toBe(false);
    expect(workImportInputSchema.safeParse({ ...valid, sourceUrl: "https://example.invalid/report" }).success).toBe(true);
    expect(workImportInputSchema.parse({ ...valid, sourceUrl: "  " }).sourceUrl).toBeUndefined();
    expect(workImportInputSchema.safeParse({ ...valid, periodStart: "2026-09-31" }).success).toBe(false);
    expect(workImportInputSchema.safeParse({ ...valid, periodStart: "2026-09-08", periodEnd: "2026-09-07" }).success).toBe(false);
    expect(workImportInputSchema.safeParse({ ...valid, periodStart: "2026-09-07", periodEnd: "2026-09-13" }).success).toBe(true);
  });
  it("strips control characters from the title but preserves the Markdown body byte for byte", () => {
    const parsed = workImportInputSchema.parse({ ...valid, title: "제목  A", markdown: "<script>alert(1)</script>" });
    expect(parsed.title).toBe("제목 A");
    expect(parsed.markdown).toBe("<script>alert(1)</script>");
    expect(workImportInputSchema.parse({ ...valid, json: "  " }).json).toBeUndefined();
  });
});

describe("summarizeWorkImportSource", () => {
  const record = (normalized: unknown) => ({ id: "imp1", version: 2, sourceUrl: "https://example.invalid/r", createdAt: "2026-09-14T01:00:00Z",
    periodStart: "2026-09-06T15:00:00Z", periodEnd: "2026-09-13T15:00:00Z", normalized: JSON.stringify(normalized) });
  it("produces templated provenance and metrics that fit the briefing snapshot contract", () => {
    const summary = summarizeWorkImportSource(record(normalizeWorkJson(sample())));
    expect(summary.source).toMatchObject({ id: "work-import:imp1", url: "https://example.invalid/r", status: "AVAILABLE" });
    expect(summary.source.title).toBe("사용자 가져온 Work 보고서 v2 (2026-09-06~2026-09-13)");
    expect(summary.source.note).toContain("정정 버전 v2");
    expect(summary.metrics.every(metric => metric.sourceId === "work-import:imp1" && metric.unit.includes("공개일별평균"))).toBe(true);
    expect(summary.metrics.find(metric => metric.id === "work-import:imp1:jujube:2026-08-31:특")).toMatchObject({ value: 31000, unit: "원/3kg(공개일별평균 단순평균)" });
    expect(summary.metrics.some(metric => metric.id.endsWith(":round:2026-08-31:중"))).toBe(false);
    expect(summary.limitations[0]).toContain("가중평균과 정의가 달라");
    const snapshot = snapshotSchema.parse({ schemaVersion: 1, rulesVersion: "briefing-v1", statisticsVersion: "auction-unit-weighted-v1",
      periodStart: "2026-09-06T15:00:00Z", periodEnd: "2026-09-13T15:00:00Z", generatedAt: "2026-09-14T01:00:00Z",
      sources: [summary.source], metrics: summary.metrics, limitations: summary.limitations });
    expect(snapshot.metrics).toHaveLength(summary.metrics.length);
  });
  it("marks unsupported and Markdown-only archives as not collected without inventing metrics", () => {
    const unsupported = summarizeWorkImportSource(record(normalizeWorkJson({ schemaVersion: 9 })));
    expect(unsupported.source.status).toBe("NOT_COLLECTED");
    expect(unsupported.metrics).toEqual([]);
    expect(unsupported.limitations.some(text => text.includes("work-observations-v1"))).toBe(true);
    const markdownOnly = summarizeWorkImportSource({ ...record(null), normalized: null, periodStart: null, periodEnd: null, sourceUrl: null });
    expect(markdownOnly.source).toMatchObject({ status: "NOT_COLLECTED", url: null, title: "사용자 가져온 Work 보고서 v2" });
  });
  it("never forwards user prose and caps the metric count", () => {
    const rows = Array.from({ length: 260 }, (_, i) => [new Date(Date.UTC(2020, 0, 1) + i * 7 * 86400_000).toISOString().slice(0, 10), 100]);
    const normalized = normalizeWorkJson({ schemaVersion: 1, gradeOrder: ["특"], rows, limits: ["<img onerror=alert(1)>"] });
    const summary = summarizeWorkImportSource({ ...record(normalized), normalized });
    expect(summary.metrics).toHaveLength(WORK_IMPORT_METRIC_LIMIT);
    expect(JSON.stringify(summary)).not.toContain("onerror");
    expect(summary.limitations.some(text => text.includes("260개 중 200개"))).toBe(true);
  });
});

it("preserves JSON whitespace through form and request schema and keeps KST correction dates", async () => {
  const { workImportInputSchema } = await import("@/lib/briefing/work-import-contracts");
  const { emptyForm, toRequestInput, toKstDayInput } = await import("@/components/reports/work-imports/types");
  const json = ' \n {"schemaVersion":1} \n';
  const input = toRequestInput({ ...emptyForm, title: "원본", markdown: "원문", json });
  expect(workImportInputSchema.parse(input).json).toBe(json);
  expect(toKstDayInput("2026-09-06T15:00:00.000Z")).toBe("2026-09-07");
});
