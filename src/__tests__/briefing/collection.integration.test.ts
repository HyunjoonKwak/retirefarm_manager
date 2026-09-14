// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
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
import { collectionOverview, collectionWeekStart, mutateCollection } from "@/lib/briefing/collection";
import { COLLECTION_MAX_ACTIVE, COLLECTION_MAX_DAILY, buildCollectionSearchUrl, collectionRequestSchema, type CollectionBlockReason, type CollectionRequest } from "@/lib/briefing/collection-contracts";
import { mutateDiscovery } from "@/lib/briefing/discovery";
import { discoveryRequestSchema, type DiscoveryEvidenceInput } from "@/lib/briefing/discovery-contracts";
import { BriefingError } from "@/lib/briefing/queue";
import { GET, POST } from "@/app/api/briefings/collection/route";

let dir: string;
// Monday 2026-09-14 12:00 KST; the KST week starts 2026-09-13T15:00:00Z.
const now = new Date("2026-09-14T03:00:00.000Z");
const HOUR = 3_600_000; const DAY = 24 * HOUR;
const after = (ms: number, from = now) => new Date(from.getTime() + ms);
const QUERY = "대추방울토마토 2kg";
const product = (store: string, id = 1) => `https://smartstore.naver.com/${store}/products/${id}`;
const searchUrl = (query = QUERY) => `https://search.shopping.naver.com/ns/search?${new URLSearchParams({ query }).toString()}`;
/** Extension-collected evidence observed 30 minutes after `now`, the default start instant. */
const evidence = (over: Partial<DiscoveryEvidenceInput> = {}): DiscoveryEvidenceInput => ({ productUrl: product("farm-a"), storeName: "farm-a 농장", title: "대추방울토마토 2kg",
  query: QUERY, observedAt: after(30 * 60_000).toISOString(), position: 3, adStatus: "ORGANIC", relevance: "MATCH", purchaseLabel: "", reviewCount: null,
  reviewBasis: "UNKNOWN", sourceUrl: searchUrl(over.query ?? QUERY), searchSort: "rel", searchEnvironment: "pc", collectionMethod: "EXTENSION", ...over });
type ImportResult = { ok: true; id: string; evidenceCount: number; duplicate?: boolean; collectionJob?: { id: string; status: string; version: number } };
const importAs = (userId: string, items: DiscoveryEvidenceInput[], job?: { id: string; version: number }, at = after(HOUR)) =>
  mutateDiscovery(userId, { action: "import", evidence: items, ...(job ? { collectionJobId: job.id, collectionJobVersion: job.version } : {}) }, at) as Promise<ImportResult>;
const mutate = (userId: string, request: CollectionRequest, at = now) => mutateCollection(userId, request, at);
const create = (userId: string, queries: string[], at = now) => mutate(userId, { action: "create", queries }, at);
const jobsOf = (userId: string) => m.db.competitorCollectionJob.findMany({ where: { userId }, orderBy: [{ createdAt: "asc" }, { query: "asc" }] });
const jobOf = async (userId: string, query = QUERY) => (await m.db.competitorCollectionJob.findFirstOrThrow({ where: { userId, query }, orderBy: { createdAt: "desc" } }));
const ref = (job: { id: string; version: number }) => ({ jobId: job.id, version: job.version });
const start = async (userId: string, query = QUERY, at = now) => { const job = await jobOf(userId, query); await mutate(userId, { action: "start", ...ref(job) }, at); return jobOf(userId, query); };
const block = async (userId: string, reason: CollectionBlockReason = "SECURITY_CHECK", query = QUERY, at = now) => {
  const job = await jobOf(userId, query); await mutate(userId, { action: "block", ...ref(job), reason }, at); return jobOf(userId, query); };
/** Creates and starts one RUNNING job for the query at `now`. */
const running = async (userId: string, query = QUERY) => { await create(userId, [query]); return start(userId, query); };
const counts = async () => ({ jobs: await m.db.competitorCollectionJob.count(), runs: await m.db.competitorDiscoveryRun.count(),
  candidates: await m.db.competitorDiscoveryCandidate.count(), evidence: await m.db.competitorDiscoveryEvidence.count(),
  panel: await m.db.competitorPanelEntry.count(), prices: await m.db.competitorPriceObservation.count() });
const rejects = (promise: Promise<unknown>, status: number, pattern?: RegExp) =>
  promise.then(() => { throw new Error("expected rejection"); }, (error: unknown) => {
    expect(error).toBeInstanceOf(BriefingError); expect((error as BriefingError).status).toBe(status);
    if (pattern) expect((error as BriefingError).message).toMatch(pattern);
  });
const post = (body: unknown) => POST(new Request("http://localhost/api/briefings/collection", { method: "POST", body: typeof body === "string" ? body : JSON.stringify(body) }));

beforeEach(async () => {
  vi.clearAllMocks();
  dir = mkdtempSync(join(tmpdir(), "collection-")); const file = join(dir, "db.sqlite");
  execFileSync("sqlite3", [file], { input: readdirSync("prisma/migrations").filter(s => /^\d/.test(s)).sort()
    .map(s => readFileSync(`prisma/migrations/${s}/migration.sql`, "utf8")).join("\n") });
  m.db = new PrismaClient({ datasources: { db: { url: `file:${file}` } } });
  await m.db.user.createMany({ data: [{ id: "owner", email: "owner@test.invalid" }, { id: "other", email: "other@test.invalid" }] });
  m.user.mockResolvedValue({ id: "owner" });
});
afterEach(async () => { await m.db.$disconnect(); rmSync(dir, { recursive: true, force: true }); });

describe("contracts", () => {
  it("normalises, dedups and caps create queries and rejects oversized raw arrays before normalisation", () => {
    const parsed = collectionRequestSchema.safeParse({ action: "create", queries: [" 대추방울토마토   2KG ", "대추방울토마토 2kg", "방울토마토"] });
    expect(parsed.success && parsed.data).toEqual({ action: "create", queries: [QUERY, "방울토마토"] });
    expect(collectionRequestSchema.safeParse({ action: "create", queries: Array.from({ length: 4 }, () => QUERY) }).success).toBe(false);
    expect(collectionRequestSchema.safeParse({ action: "create", queries: ["   "] }).success).toBe(false);
    expect(collectionRequestSchema.safeParse({ action: "create", queries: ["x".repeat(101)] }).success).toBe(false);
    expect(collectionRequestSchema.safeParse({ action: "create", queries: [] }).success).toBe(false);
    expect(collectionRequestSchema.safeParse({ action: "block", jobId: "j", version: 1, reason: "TIRED" }).success).toBe(false);
    expect(collectionRequestSchema.safeParse({ action: "start", jobId: "j", version: 0 }).success).toBe(false);
    expect(collectionRequestSchema.safeParse({ action: "start", jobId: "j", version: 1, extra: true }).success).toBe(false);
    expect(buildCollectionSearchUrl(" 대추방울토마토   2KG ")).toBe(searchUrl());
  });
  it("requires collectionJobId and collectionJobVersion together on discovery imports and leaves legacy payloads untouched", () => {
    const legacy = { action: "import", evidence: [evidence()] };
    expect(discoveryRequestSchema.safeParse(legacy).success).toBe(true);
    expect(discoveryRequestSchema.safeParse({ ...legacy, collectionJobId: "j", collectionJobVersion: 1 }).success).toBe(true);
    expect(discoveryRequestSchema.safeParse({ ...legacy, collectionJobId: "j" }).success).toBe(false);
    expect(discoveryRequestSchema.safeParse({ ...legacy, collectionJobVersion: 1 }).success).toBe(false);
    expect(discoveryRequestSchema.safeParse({ ...legacy, collectionJobId: "j", collectionJobVersion: 1.5 }).success).toBe(false);
  });
  it("resolves the KST Monday week start", () => {
    expect(collectionWeekStart(now).toISOString()).toBe("2026-09-13T15:00:00.000Z");
    expect(collectionWeekStart(new Date("2026-09-13T14:59:59.000Z")).toISOString()).toBe("2026-09-06T15:00:00.000Z");
    expect(collectionWeekStart(new Date("2026-09-20T14:59:59.000Z")).toISOString()).toBe("2026-09-13T15:00:00.000Z");
  });
});

describe("create", () => {
  it("creates one PENDING job per normalised query with the Naver+ search url and is idempotent per user, KST week and query", async () => {
    expect(await create("owner", [QUERY, "방울토마토"])).toEqual({ ok: true });
    expect(await create("owner", [" 대추방울토마토   2KG ", "방울토마토", "완숙토마토"], after(HOUR))).toEqual({ ok: true });
    const jobs = await jobsOf("owner");
    expect(jobs.map(job => [job.query, job.status, job.version, job.evidenceCount, job.runId, job.startedAt, job.reason])).toEqual([
      [QUERY, "PENDING", 1, 0, null, null, null], ["방울토마토", "PENDING", 1, 0, null, null, null], ["완숙토마토", "PENDING", 1, 0, null, null, null]]);
    expect(jobs[0].searchUrl).toBe(searchUrl()); expect(jobs[0].weekStart.toISOString()).toBe("2026-09-13T15:00:00.000Z");
    await create("other", [QUERY]);
    expect(await counts()).toMatchObject({ jobs: 4 });
    // A cancelled job still owns its week+query slot; the next KST week gets a fresh job.
    const job = await jobOf("owner"); await mutate("owner", { action: "cancel", ...ref(job) });
    await create("owner", [QUERY]); expect((await jobsOf("owner")).filter(j => j.query === QUERY)).toHaveLength(1);
    await create("owner", [QUERY], after(7 * DAY)); expect((await jobsOf("owner")).filter(j => j.query === QUERY)).toHaveLength(2);
  });
  it("caps active jobs at 9 and creations at 30 per rolling day without partial writes", async () => {
    for (let n = 0; n < COLLECTION_MAX_ACTIVE - 1; n++) await create("owner", [`검색어 ${n}`]);
    await rejects(create("owner", ["추가 a", "추가 b"]), 409, /최대 9개/);
    expect(await counts()).toMatchObject({ jobs: 8 });
    await create("owner", ["추가 a"]); await rejects(create("owner", ["추가 b"]), 409);
    // Cancelling frees a slot; a repeated (idempotent) query never counts against the cap.
    const job = await jobOf("owner", "추가 a"); await mutate("owner", { action: "cancel", ...ref(job) });
    expect(await create("owner", ["검색어 0", "추가 b"])).toEqual({ ok: true });
    expect(await counts()).toMatchObject({ jobs: 10 });
    const other = Array.from({ length: COLLECTION_MAX_DAILY }, (_, n) => `남 ${n}`);
    for (const query of other.slice(0, COLLECTION_MAX_DAILY - 1)) { await create("other", [query], after(-HOUR)); const j = await jobOf("other", query); await mutate("other", { action: "cancel", ...ref(j) }); }
    await rejects(create("other", ["남 29", "남 30"]), 429, /30개/);
    expect(await m.db.competitorCollectionJob.count({ where: { userId: "other" } })).toBe(29);
    await create("other", ["남 29"]);
    await rejects(create("other", ["남 30"]), 429);
    await create("other", ["남 30"], after(DAY));
    expect(await m.db.competitorCollectionJob.count({ where: { userId: "other" } })).toBe(31);
  });
});

describe("transitions", () => {
  it("walks pending → running → blocked → running → cancelled with version increments and start-time resets", async () => {
    await create("owner", [QUERY]);
    const started = await start("owner", QUERY, after(HOUR));
    expect(started).toMatchObject({ status: "RUNNING", version: 2, reason: null, completedAt: null }); expect(started.startedAt?.toISOString()).toBe(after(HOUR).toISOString());
    const blocked = await block("owner", "LOGIN_REQUIRED", QUERY, after(2 * HOUR));
    expect(blocked).toMatchObject({ status: "BLOCKED", version: 3, reason: "LOGIN_REQUIRED" }); expect(blocked.startedAt?.toISOString()).toBe(after(HOUR).toISOString());
    await mutate("owner", { action: "resume", ...ref(blocked) }, after(3 * HOUR));
    const resumed = await jobOf("owner");
    expect(resumed).toMatchObject({ status: "RUNNING", version: 4, reason: null }); expect(resumed.startedAt?.toISOString()).toBe(after(3 * HOUR).toISOString());
    await mutate("owner", { action: "cancel", ...ref(resumed) }, after(4 * HOUR));
    const cancelled = await jobOf("owner");
    expect(cancelled).toMatchObject({ status: "CANCELLED", version: 5 }); expect(cancelled.completedAt?.toISOString()).toBe(after(4 * HOUR).toISOString());
    await rejects(mutate("owner", { action: "resume", ...ref(cancelled) }), 409, /취소된 작업은 다시 시작할 수 없습니다\. 같은 검색어는 다음 주에/);
    await rejects(mutate("owner", { action: "start", ...ref(cancelled) }), 409);
    await rejects(mutate("owner", { action: "cancel", ...ref(cancelled) }), 409);
    expect(await jobOf("owner")).toMatchObject({ status: "CANCELLED", version: 5 });
  });
  it("rejects illegal transitions and stale versions without writing", async () => {
    await create("owner", [QUERY]);
    const pending = await jobOf("owner");
    await rejects(mutate("owner", { action: "resume", ...ref(pending) }), 409, /중단된 작업만/);
    await rejects(mutate("owner", { action: "block", ...ref(pending), reason: "NETWORK_ERROR" }), 409, /수집 중인 작업만/);
    await rejects(mutate("owner", { action: "start", jobId: pending.id, version: 2 }), 409, /새로고침/);
    await rejects(mutate("owner", { action: "cancel", jobId: pending.id, version: 5 }), 409);
    expect(await jobOf("owner")).toMatchObject({ status: "PENDING", version: 1, startedAt: null });
    const running = await start("owner");
    await rejects(mutate("owner", { action: "start", ...ref(running) }), 409, /대기 중인 작업만/);
    await rejects(mutate("owner", { action: "block", jobId: running.id, version: 1, reason: "PAGE_CHANGED" }), 409);
    expect(await jobOf("owner")).toMatchObject({ status: "RUNNING", version: 2, reason: null });
    await rejects(mutate("owner", { action: "start", jobId: "missing", version: 1 }), 404);
  });
  it("allows one RUNNING job per user, frees the slot on block or cancel and serialises concurrent starts", async () => {
    await create("owner", [QUERY, "방울토마토", "완숙토마토"]); await create("other", [QUERY]);
    await start("owner");
    const second = await jobOf("owner", "방울토마토");
    await rejects(mutate("owner", { action: "start", ...ref(second) }), 409, /이미 수집 중/);
    expect(await jobOf("owner", "방울토마토")).toMatchObject({ status: "PENDING", version: 1 });
    await start("other"); // another user's runner does not occupy this user's slot
    await block("owner"); await start("owner", "방울토마토");
    await rejects(mutate("owner", { action: "resume", ...ref(await jobOf("owner")) }), 409, /이미 수집 중/);
    await mutate("owner", { action: "cancel", ...ref(await jobOf("owner", "방울토마토")) });
    await mutate("owner", { action: "resume", ...ref(await jobOf("owner")) });
    expect((await jobsOf("owner")).map(j => j.status)).toEqual(["RUNNING", "CANCELLED", "PENDING"]);
    await mutate("owner", { action: "cancel", ...ref(await jobOf("owner")) });
    const [a, b] = [await jobOf("owner", "완숙토마토"), await jobOf("owner")];
    await create("owner", ["대저토마토"]); const c = await jobOf("owner", "대저토마토");
    const results = await Promise.allSettled([a, c].map(job => mutate("owner", { action: "start", ...ref(job) })));
    expect(results.filter(r => r.status === "fulfilled")).toHaveLength(1);
    expect(await m.db.competitorCollectionJob.count({ where: { userId: "owner", status: "RUNNING" } })).toBe(1);
    expect(b.status).toBe("CANCELLED");
  });
});

describe("overview", () => {
  it("lists the latest 60 jobs plus every active job, newest first, with the user's last real success", async () => {
    for (let n = 0; n < 62; n++) { await create("owner", [`오래된 ${n}`], after(-70 * DAY + n * HOUR)); const j = await jobOf("owner", `오래된 ${n}`); await mutate("owner", { action: "cancel", ...ref(j) }, after(-70 * DAY + n * HOUR)); }
    await create("owner", ["활성 오래된"], after(-60 * DAY)); await create("owner", ["활성 최근"], after(-HOUR));
    for (let n = 0; n < 61; n++) { await create("owner", [`최근 ${n}`], after(n * HOUR)); const j = await jobOf("owner", `최근 ${n}`); await mutate("owner", { action: "cancel", ...ref(j) }, after(n * HOUR)); }
    const overview = await collectionOverview("owner");
    expect(overview.jobs).toHaveLength(62);
    expect(overview.jobs.map(j => j.query)).toContain("활성 오래된");
    expect(overview.jobs.map(j => j.query)).not.toContain("오래된 61");
    expect(overview.jobs[0].query).toBe("최근 60");
    expect(overview.jobs.at(-1)?.query).toBe("활성 오래된");
    expect(overview.lastSuccessAt).toBeNull();
    const view = overview.jobs[0];
    expect(Object.keys(view).sort()).toEqual(["completedAt", "createdAt", "evidenceCount", "id", "query", "reason", "runId", "searchUrl", "startedAt", "status", "version"]);
    expect((await collectionOverview("other")).jobs).toEqual([]);
  });
  it("reports lastSuccessAt from the user's own history only, even when the job has left the listed window", async () => {
    const job = await running("owner"); await importAs("owner", [evidence()], job);
    expect((await collectionOverview("owner")).lastSuccessAt).toBe(after(HOUR).toISOString());
    expect((await collectionOverview("other")).lastSuccessAt).toBeNull();
    for (let n = 0; n < 60; n++) { await create("owner", [`후속 ${n}`], after((2 + n) * HOUR)); const j = await jobOf("owner", `후속 ${n}`); await mutate("owner", { action: "cancel", ...ref(j) }, after((2 + n) * HOUR)); }
    const overview = await collectionOverview("owner");
    expect(overview.jobs.map(j => j.id)).not.toContain(job.id);
    expect(overview.lastSuccessAt).toBe(after(HOUR).toISOString());
  });
});

describe("import completion", () => {
  it("saves the reviewed evidence and marks the job SUCCEEDED in one transaction, then treats an identical retry as a duplicate", async () => {
    const job = await running("owner");
    const result = await importAs("owner", [evidence(), evidence({ productUrl: product("farm-b"), storeName: "farm-b" })], job);
    expect(result).toMatchObject({ ok: true, evidenceCount: 2, collectionJob: { id: job.id, status: "SUCCEEDED", version: 3 } });
    const done = await jobOf("owner");
    expect(done).toMatchObject({ status: "SUCCEEDED", version: 3, evidenceCount: 2, runId: result.id, reason: null });
    expect(done.completedAt?.toISOString()).toBe(after(HOUR).toISOString());
    expect(done.startedAt?.toISOString()).toBe(now.toISOString());
    expect(await counts()).toMatchObject({ jobs: 1, runs: 1, candidates: 2, evidence: 2, panel: 0, prices: 0 });
    expect((await m.db.competitorDiscoveryRun.findUniqueOrThrow({ where: { id: result.id } })).source).toBe("EXTENSION_PUBLIC_SEARCH");
    // Retry with the version the original request carried, and again with the current one.
    const retry = await importAs("owner", [evidence({ productUrl: product("farm-b"), storeName: "farm-b" }), evidence()], job, after(2 * HOUR));
    expect(retry).toMatchObject({ id: result.id, duplicate: true, evidenceCount: 2, collectionJob: { id: job.id, status: "SUCCEEDED", version: 3 } });
    expect(await importAs("owner", [evidence(), evidence({ productUrl: product("farm-b"), storeName: "farm-b" })], { id: job.id, version: 3 })).toMatchObject({ duplicate: true });
    expect(await counts()).toMatchObject({ runs: 1, evidence: 2 }); expect(await jobOf("owner")).toMatchObject({ version: 3, evidenceCount: 2 });
    await rejects(importAs("owner", [evidence()], { id: job.id, version: 1 }), 409);
    await rejects(importAs("owner", [evidence()], { id: job.id, version: 4 }), 409);
    expect(await counts()).toMatchObject({ runs: 1, evidence: 2 });
  });
  it("rejects a different payload, a wrong version or a job that is not running with no writes at all", async () => {
    const job = await running("owner");
    await rejects(importAs("owner", [evidence()], { id: job.id, version: 1 }), 409, /새로고침/);
    await rejects(importAs("owner", [evidence()], { id: job.id, version: 3 }), 409);
    await rejects(importAs("other", [evidence()], job), 404);
    expect(await counts()).toMatchObject({ runs: 0, candidates: 0, evidence: 0 }); expect(await jobOf("owner")).toMatchObject({ status: "RUNNING", version: 2 });
    await importAs("owner", [evidence()], job);
    await rejects(importAs("owner", [evidence({ position: 4 })], { id: job.id, version: 3 }), 409, /완료된 수집 작업/);
    await rejects(importAs("owner", [evidence({ position: 4 })], job), 409, /완료된 수집 작업/);
    expect(await counts()).toMatchObject({ runs: 1, evidence: 1 }); expect(await jobOf("owner")).toMatchObject({ status: "SUCCEEDED", version: 3, evidenceCount: 1 });
    await create("owner", ["방울토마토"]); const pending = await jobOf("owner", "방울토마토");
    await rejects(importAs("owner", [evidence({ query: "방울토마토" })], pending), 409, /수집 중인 작업에만/);
    await mutate("owner", { action: "cancel", ...ref(pending) });
    await rejects(importAs("owner", [evidence({ query: "방울토마토" })], { id: pending.id, version: 2 }), 409, /수집 중인 작업에만/);
    expect(await counts()).toMatchObject({ runs: 1, evidence: 1 });
  });
  it("validates query, collection method and the observation window against the job before anything is written", async () => {
    const job = await running("owner");
    await rejects(importAs("owner", [evidence(), evidence({ query: "방울토마토" })], job), 400, /검색어/);
    await rejects(importAs("owner", [evidence({ collectionMethod: undefined, sourceUrl: undefined, searchSort: undefined, searchEnvironment: undefined })], job), 400, /확장 프로그램/);
    await rejects(importAs("owner", [evidence({ observedAt: after(-60_000).toISOString() })], job), 400, /24시간/);
    await rejects(importAs("owner", [evidence({ observedAt: after(HOUR + 60_000).toISOString() })], job), 400);
    await rejects(importAs("owner", [evidence({ observedAt: after(30 * 60_000).toISOString() })], job, after(25 * HOUR)), 400, /24시간/);
    expect(await counts()).toMatchObject({ runs: 0, candidates: 0, evidence: 0 }); expect(await jobOf("owner")).toMatchObject({ status: "RUNNING", version: 2 });
    // Exactly startedAt and exactly now are inside the window.
    const edge = await importAs("owner", [evidence({ observedAt: now.toISOString() }), evidence({ productUrl: product("farm-b"), storeName: "b", observedAt: after(HOUR).toISOString() })], job);
    expect(edge.evidenceCount).toBe(2); expect(await jobOf("owner")).toMatchObject({ status: "SUCCEEDED" });
  });
  it("never lets an older identical run bypass job validation or complete a job it did not produce", async () => {
    // Legacy import (no job) of the same payload before the job even starts.
    const legacy = await importAs("owner", [evidence({ observedAt: after(-2 * HOUR).toISOString() })], undefined, after(-HOUR));
    expect(legacy.evidenceCount).toBe(1);
    const job = await running("owner");
    await rejects(importAs("owner", [evidence({ observedAt: after(-2 * HOUR).toISOString() })], job), 400, /24시간/);
    expect(await jobOf("owner")).toMatchObject({ status: "RUNNING", version: 2, runId: null });
    // A legacy import that happens to land inside the window still cannot be re-attributed to the job.
    const inWindow = await importAs("owner", [evidence()], undefined, after(HOUR));
    await rejects(importAs("owner", [evidence()], job), 409, /다른 저장 기록/);
    expect(await jobOf("owner")).toMatchObject({ status: "RUNNING", version: 2, runId: null });
    expect(await counts()).toMatchObject({ runs: 2 });
    // Legacy clients keep their historical hash and duplicate answer.
    expect(await importAs("owner", [evidence()], undefined, after(2 * HOUR))).toMatchObject({ id: inWindow.id, duplicate: true });
    // The job can still finish with fresh evidence.
    const done = await importAs("owner", [evidence({ productUrl: product("farm-c"), storeName: "c" })], job);
    expect(done.collectionJob).toMatchObject({ status: "SUCCEEDED" }); expect(await jobOf("owner")).toMatchObject({ runId: done.id, evidenceCount: 1 });
  });
  it("recognises an identical same-job retry days later by the original completion instant and still rejects changed payloads", async () => {
    const job = await running("owner");
    const done = await importAs("owner", [evidence()], job);
    const late = await importAs("owner", [evidence()], job, after(48 * HOUR));
    expect(late).toMatchObject({ id: done.id, duplicate: true, evidenceCount: 1, collectionJob: { id: job.id, status: "SUCCEEDED", version: 3 } });
    expect(await importAs("owner", [evidence()], { id: job.id, version: 3 }, after(48 * HOUR))).toMatchObject({ id: done.id, duplicate: true });
    await rejects(importAs("owner", [evidence({ position: 4 })], job, after(48 * HOUR)), 409, /완료된 수집 작업/);
    await rejects(importAs("owner", [evidence(), evidence({ productUrl: product("farm-b"), storeName: "b" })], { id: job.id, version: 3 }, after(48 * HOUR)), 409);
    await rejects(importAs("owner", [evidence()], { id: job.id, version: 1 }, after(48 * HOUR)), 409);
    // Beyond the generic 30-day observation rule even an identical retry is refused before any job logic runs.
    await rejects(importAs("owner", [evidence()], job, after(31 * DAY)), 400, /30일/);
    expect(await counts()).toMatchObject({ runs: 1, candidates: 1, evidence: 1 });
    expect(await jobOf("owner")).toMatchObject({ status: "SUCCEEDED", version: 3, evidenceCount: 1, runId: done.id });
    expect((await jobOf("owner")).completedAt?.toISOString()).toBe(after(HOUR).toISOString());
  });
  it("refuses to complete a job with a subset of an earlier run and rolls back the empty run, while an exact same-job retry stays allowed", async () => {
    const a = evidence(); const b = evidence({ productUrl: product("farm-b"), storeName: "b" });
    const legacy = await importAs("owner", [a, b], undefined, after(HOUR));
    expect(legacy.evidenceCount).toBe(2);
    const job = await running("owner");
    await rejects(importAs("owner", [a], job), 409, /새로 저장할 자료가 없습니다/);
    await rejects(importAs("owner", [b, a, evidence({ productUrl: product("farm-b") , storeName: "b" })], job), 409, /다른 저장 기록/);
    expect(await counts()).toMatchObject({ runs: 1, candidates: 2, evidence: 2 });
    expect(await jobOf("owner")).toMatchObject({ status: "RUNNING", version: 2, runId: null, evidenceCount: 0, completedAt: null });
    const c = evidence({ productUrl: product("farm-c"), storeName: "c" });
    const done = await importAs("owner", [a, c], job);
    expect(done).toMatchObject({ evidenceCount: 1, collectionJob: { status: "SUCCEEDED", version: 3 } });
    expect(await importAs("owner", [c, a], job, after(2 * HOUR))).toMatchObject({ id: done.id, duplicate: true, evidenceCount: 1 });
    expect(await counts()).toMatchObject({ runs: 2, candidates: 3, evidence: 3 });
    expect(await jobOf("owner")).toMatchObject({ status: "SUCCEEDED", version: 3, runId: done.id, evidenceCount: 1 });
  });
  it("rolls back the run and candidates when the import fails after the job passed its checks", async () => {
    const job = await running("owner");
    await importAs("owner", [evidence()], undefined, after(HOUR));
    // Same product/query/observedAt with different content conflicts inside the evidence loop, after the run row was created.
    await rejects(importAs("owner", [evidence({ position: 9 }), evidence({ productUrl: product("farm-z"), storeName: "z" })], job), 409, /서로 다른 자료/);
    expect(await counts()).toMatchObject({ runs: 1, candidates: 1, evidence: 1 });
    expect(await jobOf("owner")).toMatchObject({ status: "RUNNING", version: 2, runId: null, evidenceCount: 0, completedAt: null });
  });
  it("keeps job isolation per user: the same query and evidence complete only the caller's job", async () => {
    const mine = await running("owner"); const theirs = await running("other");
    await rejects(importAs("owner", [evidence()], theirs), 404);
    await importAs("owner", [evidence()], mine);
    expect(await jobOf("owner")).toMatchObject({ status: "SUCCEEDED" }); expect(await jobOf("other")).toMatchObject({ status: "RUNNING", runId: null });
    await importAs("other", [evidence()], theirs);
    expect(await jobOf("other")).toMatchObject({ status: "SUCCEEDED", evidenceCount: 1 });
    expect(await counts()).toMatchObject({ runs: 2, candidates: 2, evidence: 2 });
  });
});

describe("HTTP route", () => {
  it("requires a session for both verbs", async () => {
    m.user.mockResolvedValue(null);
    expect((await GET()).status).toBe(401);
    expect((await post({ action: "create", queries: [QUERY] })).status).toBe(401);
    expect(await counts()).toMatchObject({ jobs: 0 });
  });
  it("answers 400 for malformed, unknown-action, oversized and empty bodies without writing", async () => {
    const malformed = await post("{not json"); expect(malformed.status).toBe(400);
    expect(await malformed.json()).toEqual({ error: "수집 작업의 검색어와 요청 형식을 확인해 주세요." });
    expect((await post({ action: "schedule", queries: [QUERY] })).status).toBe(400);
    expect((await post({ action: "create", queries: Array.from({ length: 4 }, () => QUERY) })).status).toBe(400);
    expect((await post({ action: "create", queries: [QUERY], pad: "x".repeat(20 * 1024) })).status).toBe(400);
    expect((await post({ action: "block", jobId: "j", version: 1, reason: "OTHER" })).status).toBe(400);
    expect((await POST(new Request("http://localhost/api/briefings/collection", { method: "POST" }))).status).toBe(400);
    expect(await counts()).toMatchObject({ jobs: 0 });
  });
  it("creates, lists, transitions and maps service errors to their status for the signed-in user only", async () => {
    const created = await post({ action: "create", queries: [QUERY, " 방울토마토 "] });
    expect(created.status).toBe(200); expect(await created.json()).toEqual({ ok: true });
    const list = await GET(); const body = await list.json();
    expect(list.status).toBe(200); expect(list.headers.get("cache-control")).toBe("no-store");
    expect(body.lastSuccessAt).toBeNull(); expect(body.jobs).toHaveLength(2);
    expect(body.jobs.map((j: { query: string }) => j.query).sort()).toEqual([QUERY, "방울토마토"]);
    const [job] = body.jobs.filter((j: { query: string }) => j.query === QUERY);
    expect(job).toMatchObject({ status: "PENDING", version: 1, reason: null, startedAt: null, completedAt: null, evidenceCount: 0, runId: null, searchUrl: searchUrl() });
    expect((await post({ action: "start", jobId: job.id, version: 1 })).status).toBe(200);
    expect((await post({ action: "start", jobId: job.id, version: 1 })).status).toBe(409);
    expect((await post({ action: "block", jobId: job.id, version: 2, reason: "BROWSER_UNAVAILABLE" })).status).toBe(200);
    expect((await post({ action: "start", jobId: "missing", version: 1 })).status).toBe(404);
    m.user.mockResolvedValue({ id: "other" });
    expect((await post({ action: "cancel", jobId: job.id, version: 3 })).status).toBe(404);
    expect(await (await GET()).json()).toEqual({ jobs: [], lastSuccessAt: null });
    m.user.mockResolvedValue({ id: "owner" });
    expect((await post({ action: "resume", jobId: job.id, version: 3 })).status).toBe(200);
    const resumed = (await (await GET()).json()).jobs.find((j: { id: string }) => j.id === job.id);
    expect(resumed).toMatchObject({ status: "RUNNING", version: 4, reason: null });
    expect(typeof resumed.startedAt).toBe("string");
  });
});
