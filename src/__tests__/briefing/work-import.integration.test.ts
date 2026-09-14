// @vitest-environment node
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { PrismaClient } from "@prisma/client";
import { mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFileSync } from "node:child_process";

const m = vi.hoisted(() => ({ db: null as unknown as PrismaClient, user: vi.fn() }));
vi.mock("@/lib/prisma", () => ({ default: new Proxy({}, { get: (_, key) => {
  const value = Reflect.get(m.db, key); return typeof value === "function" ? value.bind(m.db) : value;
} }) }));
vi.mock("@/lib/auth/guards", () => ({ getSessionUser: m.user }));
import { GET, POST } from "@/app/api/briefings/imports/route";
import { GET as detailGet } from "@/app/api/briefings/imports/[id]/route";
import { createWorkImport } from "@/lib/briefing/work-import-service";
import { summarizeWorkImportSource } from "@/lib/briefing/work-import-summary";
import { WORK_IMPORT_LIMITS } from "@/lib/briefing/work-import-contracts";

let dir: string;
const sampleJson = () => JSON.stringify({ schemaVersion: 1, observationWindow: "2026-09-01/2026-09-07", gradeOrder: ["특", "상"],
  sources: { jujube: "https://example.invalid/jujube", round: "https://example.invalid/round", hanjin: "https://example.invalid/hanjin" }, method: "가락시장 전체 공개 일별 등급 평균",
  jujube: { packageKg: 3, rows: [["2026-09-01", 30000, 25000], ["2026-09-02", 32000, null]] }, smartstore: { observations: [], panelEstablished: false } });
const markdown = "# 9/14 주간 보고\n\n| 등급 | 평균 |\n| 특 | 31,000 |\n<script>alert('xss')</script>";
const input = (overrides: Record<string, unknown> = {}) => ({ title: "9/14 주간 보고", sourceUrl: "https://example.invalid/report",
  periodStart: "2026-09-07", periodEnd: "2026-09-13", markdown, json: sampleJson(), ...overrides });
const post = (body: unknown) => POST(new Request("http://localhost/api/briefings/imports", { method: "POST", body: typeof body === "string" ? body : JSON.stringify(body) }));
const detail = (id: string) => detailGet(new Request(`http://localhost/api/briefings/imports/${id}`) as never, { params: Promise.resolve({ id }) });
beforeEach(async () => {
  vi.clearAllMocks(); dir = mkdtempSync(join(tmpdir(), "work-import-")); const file = join(dir, "db.sqlite");
  execFileSync("sqlite3", [file], { input: readdirSync("prisma/migrations").filter(s => /^\d/.test(s)).sort()
    .map(s => readFileSync(`prisma/migrations/${s}/migration.sql`, "utf8")).join("\n") });
  m.db = new PrismaClient({ datasources: { db: { url: `file:${file}` } } });
  await m.db.user.createMany({ data: [{ id: "owner", email: "owner@test.invalid" }, { id: "other", email: "other@test.invalid" }] });
  m.user.mockResolvedValue({ id: "owner" });
});
afterEach(async () => { await m.db.$disconnect(); rmSync(dir, { recursive: true, force: true }); });

it("previews without writing, then imports one immutable version with raw text preserved byte for byte", async () => {
  const preview = await post({ action: "preview", input: input() });
  expect(preview.status).toBe(200);
  expect(preview.headers.get("cache-control")).toBe("no-store");
  const previewBody = await preview.json();
  expect(previewBody.preview).toMatchObject({ title: "9/14 주간 보고", duplicateOf: null, parent: null, jsonChars: sampleJson().length });
  expect(previewBody.preview.normalized.status).toBe("SUPPORTED");
  expect(previewBody.preview.normalized.series[0].weekly[0].grades[0]).toEqual({ grade: "특", mean: 31000, sampleCount: 2, dayCount: 2 });
  expect(await m.db.workReportImport.count()).toBe(0);
  const created = await post({ action: "import", input: input() });
  expect(created.status).toBe(201);
  const { item } = await created.json();
  expect(item).toMatchObject({ version: 1, parentId: null, status: "SUPPORTED", hasJson: true, seriesCount: 1, sourceUrl: "https://example.invalid/report",
    periodStart: "2026-09-06T15:00:00.000Z", periodEnd: "2026-09-12T15:00:00.000Z", contentHash: previewBody.preview.contentHash });
  expect(item.rawMarkdown).toBeUndefined();
  const stored = await m.db.workReportImport.findUniqueOrThrow({ where: { id: item.id } });
  expect(stored.rawMarkdown).toBe(markdown);
  expect(stored.rawJson).toBe(sampleJson());
  const shown = await (await detail(item.id)).json();
  expect(shown.item.rawMarkdown).toBe(markdown);
  expect(shown.item.normalized.observationWindow).toBe("2026-09-01/2026-09-07");
  expect(shown.item.normalized.sourceCount).toBe(3);
  expect(shown.item.corrections).toEqual([]);
});
it("deduplicates identical content per user while different users may archive the same report", async () => {
  const first = await (await post({ action: "import", input: input() })).json();
  const preview = await (await post({ action: "preview", input: input({ title: "다른 제목" }) })).json();
  expect(preview.preview.duplicateOf.id).toBe(first.item.id);
  const duplicate = await post({ action: "import", input: input({ title: "다른 제목" }) });
  expect(duplicate.status).toBe(409);
  expect((await duplicate.json()).code).toBe("DUPLICATE");
  expect(await m.db.workReportImport.count()).toBe(1);
  expect((await m.db.workReportImport.findUniqueOrThrow({ where: { id: first.item.id } })).title).toBe("9/14 주간 보고");
  expect((await post({ action: "import", input: input({ markdown: markdown + " " }) })).status).toBe(201);
  m.user.mockResolvedValue({ id: "other" });
  expect((await post({ action: "import", input: input() })).status).toBe(201);
  expect(await m.db.workReportImport.count()).toBe(3);
});
it("isolates owners: lists, details and correction parents never cross users", async () => {
  const mine = await createWorkImport("owner", { title: "내 보고서", markdown: "# mine" });
  const theirs = await createWorkImport("other", { title: "남의 보고서", markdown: "# theirs" });
  const list = await (await GET()).json();
  expect(list.items.map((item: { id: string }) => item.id)).toEqual([mine.id]);
  expect((await detail(theirs.id)).status).toBe(404);
  expect((await detail("missing")).status).toBe(404);
  const correction = await post({ action: "import", input: input({ parentId: theirs.id, correctionReason: "남의 것 정정 시도" }) });
  expect(correction.status).toBe(404);
  expect((await correction.json()).code).toBe("PARENT_NOT_FOUND");
  expect((await post({ action: "preview", input: input({ parentId: theirs.id, correctionReason: "x" }) })).status).toBe(404);
  m.user.mockResolvedValue(null);
  expect((await GET()).status).toBe(401);
  expect((await post({ action: "import", input: input() })).status).toBe(401);
  expect((await detail(mine.id)).status).toBe(401);
});
it("records corrections as new versions that keep the original untouched and require a reason", async () => {
  const original = await (await post({ action: "import", input: input() })).json();
  const missingReason = await post({ action: "import", input: input({ parentId: original.item.id, markdown: "# v2" }) });
  expect(missingReason.status).toBe(400);
  expect((await missingReason.json()).error).toContain("정정 사유");
  const preview = await (await post({ action: "preview", input: input({ parentId: original.item.id, correctionReason: "5거래일 → 6거래일 평균으로 정정", markdown: "# v2" }) })).json();
  expect(preview.preview.parent).toEqual({ id: original.item.id, title: "9/14 주간 보고", version: 1 });
  const corrected = await (await post({ action: "import", input: input({ parentId: original.item.id, correctionReason: "5거래일 → 6거래일 평균으로 정정", markdown: "# v2" }) })).json();
  expect(corrected.item).toMatchObject({ version: 2, parentId: original.item.id, correctionReason: "5거래일 → 6거래일 평균으로 정정" });
  const third = await (await post({ action: "import", input: input({ parentId: corrected.item.id, correctionReason: "재정정", markdown: "# v3" }) })).json();
  expect(third.item.version).toBe(3);
  const before = await m.db.workReportImport.findUniqueOrThrow({ where: { id: original.item.id } });
  expect(before).toMatchObject({ version: 1, parentId: null, correctionReason: null, rawMarkdown: markdown });
  const shown = await (await detail(original.item.id)).json();
  expect(shown.item.corrections.map((item: { id: string; version: number }) => [item.id, item.version])).toEqual([[corrected.item.id, 2]]);
  expect((await (await detail(corrected.item.id)).json()).item.parent).toMatchObject({ id: original.item.id, version: 1 });
  await expect(m.db.workReportImport.delete({ where: { id: original.item.id } })).rejects.toThrow();
  expect(await m.db.workReportImport.count()).toBe(3);
});
it("rejects oversized, malformed and unknown-shaped requests before touching the database", async () => {
  const big = await post({ action: "import", input: input({ markdown: "x".repeat(WORK_IMPORT_LIMITS.markdownChars + 1), json: undefined }) });
  expect(big.status).toBe(400);
  const huge = await post({ action: "import", input: input({ json: "[" + "1,".repeat(WORK_IMPORT_LIMITS.requestBytes / 2) + "1]" }) });
  expect(huge.status).toBe(413);
  expect((await post("{ nope")).status).toBe(400);
  expect((await post({ action: "delete", id: "x" })).status).toBe(400);
  expect((await post({ action: "import", input: input({ sourceUrl: "javascript:alert(1)" }) })).status).toBe(400);
  expect(await m.db.workReportImport.count()).toBe(0);
});
it("archives syntactically broken JSON verbatim as raw-only rather than rejecting the file", async () => {
  const created = await post({ action: "import", input: input({ json: "{ broken" }) });
  expect(created.status).toBe(201);
  const { item } = await created.json();
  expect(item).toMatchObject({ status: "UNSUPPORTED", hasJson: true, seriesCount: 0 });
  const shown = await (await detail(item.id)).json();
  expect(shown.item.rawJson).toBe("{ broken");
  expect(shown.item.normalized.reasons[0]).toContain("JSON 구문 오류");
  expect(summarizeWorkImportSource(shown.item)).toMatchObject({ metrics: [], source: { status: "NOT_COLLECTED" } });
});
it("archives unsupported JSON raw-only and malformed rows without statistics, and Markdown alone as MARKDOWN_ONLY", async () => {
  const unsupported = await (await post({ action: "import", input: input({ json: JSON.stringify({ schemaVersion: 7, foo: [1] }) }) })).json();
  expect(unsupported.item).toMatchObject({ status: "UNSUPPORTED", hasJson: true, seriesCount: 0 });
  const shown = await (await detail(unsupported.item.id)).json();
  expect(shown.item.rawJson).toBe(JSON.stringify({ schemaVersion: 7, foo: [1] }));
  expect(shown.item.normalized.reasons[0]).toContain("원문 JSON만 보관");
  const malformed = await (await post({ action: "import", input: input({ json: JSON.stringify({ schemaVersion: 1, gradeOrder: ["특", "상"], rows: [["2026-09-01", 1]] }) }) })).json();
  expect(malformed.item).toMatchObject({ status: "UNSUPPORTED", seriesCount: 0 });
  const markdownOnly = await (await post({ action: "import", input: input({ json: undefined, markdown: "# only" }) })).json();
  expect(markdownOnly.item).toMatchObject({ status: "MARKDOWN_ONLY", hasJson: false });
  expect(summarizeWorkImportSource({ ...markdownOnly.item, normalized: (await (await detail(markdownOnly.item.id)).json()).item.normalized }).metrics).toEqual([]);
});
it("stores hostile text verbatim and returns it as JSON data, never as executable markup", async () => {
  const hostile = "<img src=x onerror=alert(1)>\n[link](javascript:alert(2))";
  const created = await (await post({ action: "import", input: input({ title: "<b>제목</b>", markdown: hostile, json: undefined }) })).json();
  const response = await detail(created.item.id);
  expect(response.headers.get("content-type")).toContain("application/json");
  const shown = await response.json();
  expect(shown.item.rawMarkdown).toBe(hostile);
  expect(shown.item.title).toBe("<b>제목</b>");
  const summary = summarizeWorkImportSource({ ...shown.item, normalized: shown.item.normalized });
  expect(JSON.stringify(summary)).not.toContain("onerror");
  expect(JSON.stringify(summary)).not.toContain("<b>");
});
it("keeps imported simple means distinct from the auction weighted statistics version", async () => {
  const created = await (await post({ action: "import", input: input() })).json();
  const shown = await (await detail(created.item.id)).json();
  const summary = summarizeWorkImportSource(shown.item);
  expect(shown.item.normalized.statisticsVersion).toBe("public-daily-simple-mean-v1");
  expect(summary.metrics[0].unit).toBe("원/3kg(공개일별평균 단순평균)");
  expect(summary.source.note).toContain("경매 원거래 가중평균과 별개");
  expect(summary.limitations[0]).toContain("같은 추세선으로 잇지 않습니다");
});
