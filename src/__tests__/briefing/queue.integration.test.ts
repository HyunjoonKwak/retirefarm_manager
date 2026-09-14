// @vitest-environment node
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { Prisma, PrismaClient } from "@prisma/client";
import { mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFileSync } from "node:child_process";

const m = vi.hoisted(() => ({ db: null as unknown as PrismaClient, user: vi.fn() }));
vi.mock("@/lib/prisma", () => ({ default: new Proxy({}, { get: (_, key) => {
  const value = Reflect.get(m.db, key); return typeof value === "function" ? value.bind(m.db) : value;
} }) }));
vi.mock("@/lib/auth/guards", () => ({ getSessionUser: m.user }));
import { authenticateWorker, enqueueBriefing, handleWorker, hash, issueWorkerToken } from "@/lib/briefing/queue";
import { buildSnapshot, previousWeek } from "@/lib/briefing/snapshot";
import { resultSchema, type BriefingResult } from "@/lib/briefing/contracts";
import { POST as workerPost } from "@/app/api/briefing-worker/route";
import { GET, POST } from "@/app/api/briefings/route";
import { POST as tokenPost } from "@/app/api/briefings/worker-token/route";
import { snapshotSchema as workerSnapshotSchema } from "../../../scripts/briefing-worker.mjs";

let dir: string;
const now = new Date("2026-09-14T01:00:00Z");
const draft = (): BriefingResult => ({ schemaVersion: 1, summary: "수집 범위를 확인하고 판매 판단을 준비하세요.",
  sections: (["market", "cultivation", "commerce", "competitors"] as const).map(key => ({ key, body: "추가 자료 확인이 필요합니다.", sourceIds: [key], metricIds: [] })),
  actions: ["시세 조건 확인", "계약 배송비 확인", "경쟁점 자료 확인"].map(text => ({ text, sourceIds: [] })), limitations: ["일부 자료는 아직 미수집입니다."] });
beforeEach(async () => {
  vi.clearAllMocks(); dir = mkdtempSync(join(tmpdir(), "briefing-queue-")); const file = join(dir, "db.sqlite");
  execFileSync("sqlite3", [file], { input: readdirSync("prisma/migrations").filter(s => /^\d/.test(s)).sort()
    .map(s => readFileSync(`prisma/migrations/${s}/migration.sql`, "utf8")).join("\n") });
  m.db = new PrismaClient({ datasources: { db: { url: `file:${file}` } } });
  await m.db.user.createMany({ data: [{ id: "owner", email: "owner@test.invalid" }, { id: "other", email: "other@test.invalid" }] });
  m.user.mockResolvedValue({ id: "owner" });
});
afterEach(async () => { await m.db.$disconnect(); rmSync(dir, { recursive: true, force: true }); });
async function setup() {
  await m.db.auctionResult.create({ data: { productName: "토마토", variety: "대추", origin: "평택", grade: "특", unit: "3kg",
    corporation: "서울청과", corporationCode: "11000101", price: 10000, quantity: 1, auctionDate: new Date("2026-09-08T00:00:00+09:00") } });
  const token = await issueWorkerToken("owner"); const credential = (await authenticateWorker(`Bearer ${token}`))!;
  const snapshot = await buildSnapshot("owner", { productName: "토마토" }, now);
  const run = await enqueueBriefing("owner", snapshot);
  return { credential, snapshot, run, token };
}
async function claim(credential: NonNullable<Awaited<ReturnType<typeof authenticateWorker>>>, at = now) {
  const result = await handleWorker(credential, { action: "claim" }, at);
  if (!("job" in result) || !result.job) throw new Error("No job"); return result.job;
}
it("uses the previous completed KST week including Sunday night at the UTC boundary", () => {
  expect(previousWeek(now)).toEqual({ start: new Date("2026-09-06T15:00:00Z"), end: new Date("2026-09-13T15:00:00Z") });
  expect(previousWeek(new Date("2026-09-13T14:59:59Z")).end.toISOString()).toBe("2026-09-06T15:00:00.000Z");
});
it("previews collection coverage without creating a run or draft and requires login", async () => {
  const request = () => new Request("http://localhost/api/briefings", { method: "POST", body: JSON.stringify({ action: "preview", productName: "토마토" }) });
  const response = await POST(request());
  expect(response.status).toBe(200);
  expect(response.headers.get("cache-control")).toBe("no-store");
  const body = await response.json();
  expect(body.snapshot.analysis.coverage.current.unknownSlots).toBe(14);
  expect(await m.db.briefingRun.count()).toBe(0);
  expect(await m.db.weeklyBriefing.count()).toBe(0);
  m.user.mockResolvedValue(null);
  expect((await POST(request())).status).toBe(401);
});
it("keeps empty result requests distinct by filter while deduplicating equivalent empty filters", async () => {
  const first = await buildSnapshot("owner", { productName: "토마토", origin: "평택" }, now);
  const second = await buildSnapshot("owner", { productName: "토마토", origin: "장수" }, now);
  const equivalent = await buildSnapshot("owner", { productName: "토마토", origin: "평택", variety: "" }, now);
  expect(first.metrics).toHaveLength(0); expect(second.metrics).toHaveLength(0);
  const a = await enqueueBriefing("owner", first);
  const b = await enqueueBriefing("owner", second);
  const c = await enqueueBriefing("owner", equivalent);
  expect(a.id).not.toBe(b.id); expect(c.id).toBe(a.id);
  expect(await m.db.briefingRun.count()).toBe(2);
});
it("migrates all tables and weights full transactions only inside identical groups", async () => {
  const base = { productName: "토마토", variety: "대추", origin: "평택", grade: "특", unit: "3kg", corporation: "서울청과", corporationCode: "11000101", auctionDate: new Date("2026-09-07T15:00:00Z") };
  await m.db.auctionResult.createMany({ data: [
    { ...base, price: 10000, quantity: 1 }, { ...base, price: 20000, quantity: 3 },
    { ...base, price: 99999, quantity: 10, unit: "5kg" },
    { ...base, price: 999999, quantity: 99, auctionDate: new Date("2026-09-13T15:00:00Z") },
    { ...base, price: 88888, quantity: 0 },
  ] });
  const snapshot = await buildSnapshot("owner", { productName: "토마토" }, now);
  expect(snapshot.metrics.find(metric => metric.unit === "원/3kg")?.value).toBe(17500);
  expect(snapshot.metrics.filter(metric => metric.unit.startsWith("원/"))).toHaveLength(2);
  expect(snapshot.limitations.some(text => text.includes("1건"))).toBe(true);
  expect(snapshot.sources.find(source => source.id === "competitors")?.status).toBe("NOT_COLLECTED");
});
it("compares exact groups against disjoint prior periods and withholds rates after a failed collection", async () => {
  const base = { productName: "토마토", variety: "대추", origin: "평택", grade: "특", unit: "3kg", corporation: "서울청과", corporationCode: "11000101" };
  const records = (first: string, second: string, price: number) => [
    { ...base, auctionDate: new Date(`${first}T00:00:00+09:00`), price, quantity: 1 },
    { ...base, auctionDate: new Date(`${first}T00:00:00+09:00`), price, quantity: 2 },
    { ...base, auctionDate: new Date(`${second}T00:00:00+09:00`), price, quantity: 1 },
  ];
  await m.db.auctionResult.createMany({ data: [
    ...records("2026-09-07", "2026-09-08", 20000), ...records("2026-08-31", "2026-09-01", 10000),
    ...records("2026-08-17", "2026-08-18", 5000),
    { ...base, variety: "다른품종", auctionDate: new Date("2026-09-01T00:00:00+09:00"), price: 999999, quantity: 1000 },
    { ...base, auctionDate: new Date("2026-08-09T00:00:00+09:00"), price: 999999, quantity: 1000 },
    { ...base, auctionDate: new Date("2026-09-14T00:00:00+09:00"), price: 999999, quantity: 1000 },
  ] });
  const start = new Date("2026-08-10T00:00:00+09:00").getTime();
  await m.db.dataCollectionLog.createMany({ data: Array.from({ length: 35 }, (_, i) => ({
    targetDate: new Date(start + i * 86400_000), corporation: base.corporationCode, targetProducts: "토마토,포도",
    status: "SUCCESS", totalCount: 3, newCount: 3, startedAt: new Date(now.getTime() - 1000), completedAt: new Date(now.getTime() - 500),
  })) });
  const snapshot = await buildSnapshot("owner", { productName: "토마토" }, now);
  expect(snapshot.analysis?.comparisons).toHaveLength(1);
  expect(workerSnapshotSchema.parse(snapshot)).toEqual(snapshot);
  const row = snapshot.analysis!.comparisons[0];
  expect(row).toMatchObject({ currentDays: 2, currentTrades: 3, previous: { price: 10000, changePct: 100, status: "COMPARABLE" },
    fourWeeks: { price: 7500, observedDays: 4, tradeCount: 6, status: "COMPARABLE" } });
  expect(row.fourWeeks.changePct).toBeCloseTo(166.6666667);
  // The second configured corporation lacks logs, but cannot veto this corporation's comparison.
  expect(snapshot.analysis!.coverage.current.unknownSlots).toBe(7);
  await m.db.dataCollectionLog.create({ data: { targetDate: new Date("2026-09-01T00:00:00+09:00"), corporation: base.corporationCode,
    targetProducts: "토마토", status: "FAILED", totalCount: 0, newCount: 0, startedAt: now, completedAt: now } });
  const uncertain = await buildSnapshot("owner", { productName: "토마토" }, now);
  expect(uncertain.analysis!.comparisons[0].previous).toMatchObject({ price: 10000, changePct: null, status: "UNVERIFIED_COLLECTION" });
  expect(uncertain.analysis!.comparisons[0].fourWeeks.changePct).toBeNull();
  expect(uncertain.analysis!.coverage.previous.failedSlots).toBe(1);
});
it("does not invent a baseline or infer trends from a one-day sample", async () => {
  const base = { productName: "토마토", variety: "대추", origin: "평택", grade: "특", unit: "3kg", corporation: "서울청과", corporationCode: "11000101", price: 10000, quantity: 1 };
  await m.db.auctionResult.create({ data: { ...base, auctionDate: new Date("2026-09-07T00:00:00+09:00") } });
  const missing = await buildSnapshot("owner", { productName: "토마토" }, now);
  expect(missing.analysis!.comparisons[0].previous).toMatchObject({ price: null, changePct: null, status: "NO_BASELINE" });
  await m.db.auctionResult.create({ data: { ...base, auctionDate: new Date("2026-09-01T00:00:00+09:00") } });
  const sparse = await buildSnapshot("owner", { productName: "토마토" }, now);
  expect(sparse.analysis!.comparisons[0].previous).toMatchObject({ price: 10000, changePct: null, status: "LOW_SAMPLE" });
});
it("deduplicates unchanged snapshots despite new observation time and allows only one active worker", async () => {
  const { credential, snapshot, run } = await setup();
  expect((await enqueueBriefing("owner", { ...snapshot, generatedAt: new Date().toISOString() })).id).toBe(run.id);
  await claim(credential);
  expect(await handleWorker(credential, { action: "claim" }, now)).toEqual({ job: null });
  expect((await m.db.briefingRun.findUniqueOrThrow({ where: { id: run.id } })).attempts).toBe(1);
});
it("fences a stale lease after expiry and stores completion exactly once", async () => {
  const { credential } = await setup(); const old = await claim(credential);
  const later = new Date(now.getTime() + 11 * 60_000); const job = await claim(credential, later);
  await expect(handleWorker(credential, { action: "heartbeat", jobId: old.id, leaseToken: old.leaseToken }, later)).rejects.toMatchObject({ status: 409 });
  const input = { action: "complete" as const, jobId: job.id, leaseToken: job.leaseToken, inputHash: job.inputHash, result: draft() };
  await handleWorker(credential, input, later); await handleWorker(credential, input, later);
  expect(await m.db.weeklyBriefing.count()).toBe(1);
  await expect(handleWorker(credential, { ...input, result: { ...draft(), summary: "다른 결과" } }, later)).rejects.toMatchObject({ status: 409 });
});
it("rejects foreign users, unknown references and mismatched snapshot versions", async () => {
  const { credential } = await setup(); const job = await claim(credential);
  const otherToken = await issueWorkerToken("other"); const other = (await authenticateWorker(`Bearer ${otherToken}`))!;
  const input = { action: "complete" as const, jobId: job.id, leaseToken: job.leaseToken, inputHash: job.inputHash, result: draft() };
  await expect(handleWorker(other, input, now)).rejects.toMatchObject({ status: 409 });
  await expect(handleWorker(credential, { ...input, inputHash: "0".repeat(64) }, now)).rejects.toMatchObject({ status: 400 });
  const result = draft(); result.sections[0].sourceIds = ["invented-source"];
  await expect(handleWorker(credential, { ...input, result }, now)).rejects.toMatchObject({ status: 400 });
  expect(await m.db.weeklyBriefing.count()).toBe(0);
});
it("revokes active leases and old bearer tokens on rotation, without persisting token plaintext", async () => {
  const { credential, token } = await setup(); await claim(credential);
  expect(credential.tokenHash).not.toContain(token);
  await issueWorkerToken("owner"); expect(await authenticateWorker(`Bearer ${token}`)).toBeNull();
  await expect(handleWorker(credential, { action: "claim" }, now)).rejects.toMatchObject({ status: 401 });
  expect(await m.db.briefingRun.findFirst()).toMatchObject({ status: "BLOCKED", leaseToken: null });
});
it("caps automatic lease recovery at three attempts and blocks auth/rate-limit failures until manual retry", async () => {
  const { credential } = await setup();
  for (let n = 0; n < 3; n++) await claim(credential, new Date(now.getTime() + n * 11 * 60_000));
  expect(await handleWorker(credential, { action: "claim" }, new Date(now.getTime() + 33 * 60_000))).toEqual({ job: null });
  expect(await m.db.briefingRun.findFirst()).toMatchObject({ status: "FAILED", attempts: 3 });
  const run = (await m.db.briefingRun.findFirst())!;
  const retry = await POST(new Request("http://localhost/api/briefings", { method: "POST", body: JSON.stringify({ action: "retry", jobId: run.id }) }));
  expect(retry.status).toBe(200); const job = await claim(credential);
  await handleWorker(credential, { action: "fail", jobId: job.id, leaseToken: job.leaseToken, code: "RATE_LIMIT" }, now);
  expect(await handleWorker(credential, { action: "claim" }, now)).toEqual({ job: null });
  expect(await m.db.briefingRun.findFirst()).toMatchObject({ status: "BLOCKED", lastError: "RATE_LIMIT" });
});
it("HTTP endpoints isolate sessions and tokens and reject unbounded or invalid output", async () => {
  const { token } = await setup();
  expect((await workerPost(new Request("http://localhost/api/briefing-worker", { method: "POST", body: '{}' }))).status).toBe(401);
  const send = (body: string) => workerPost(new Request("http://localhost/api/briefing-worker", { method: "POST", headers: { Authorization: `Bearer ${token}` }, body }));
  expect((await send(JSON.stringify({ action: "claim", extra: true }))).status).toBe(400);
  expect((await send(" ".repeat(256 * 1024 + 1))).status).toBe(400);
  m.user.mockResolvedValue({ id: "other" }); expect((await (await GET()).json()).runs).toEqual([]);
  m.user.mockResolvedValue(null); expect((await GET()).status).toBe(401);
  expect((await tokenPost(new Request("http://localhost/api/briefings/worker-token", { method: "POST", body: '{"action":"issue"}' }))).status).toBe(401);
  expect(resultSchema.safeParse({ ...draft(), summary: "가격이 50% 올랐습니다" }).success).toBe(false);
  expect(resultSchema.safeParse({ ...draft(), sections: Array(4).fill(draft().sections[0]) }).success).toBe(false);
});
it("does not silently truncate over two hundred comparison groups", async () => {
  await m.db.auctionResult.createMany({ data: Array.from({ length: 201 }, (_, n) => ({
    productName: "토마토", variety: `품종${n}`, price: 1000, quantity: 1, unit: "3kg",
    corporation: "서울청과", corporationCode: "11000101", auctionDate: new Date("2026-09-07T15:00:00Z"),
  })) });
  await expect(buildSnapshot("owner", { productName: "토마토" }, now)).rejects.toThrow("TOO_MANY_GROUPS");
});
it("aggregates more than twenty thousand trades without a row cap", async () => {
  await m.db.$executeRaw`WITH RECURSIVE numbers(n) AS (SELECT 1 UNION ALL SELECT n+1 FROM numbers WHERE n < 20001)
    INSERT INTO "AuctionResult" (id, productName, variety, origin, unit, grade, price, quantity, corporation, corporationCode, auctionDate, createdAt)
    SELECT 'trade-' || n, '토마토', '대추', '평택', '3kg', '특', n, 1, '서울청과', '11000101', ${new Date("2026-09-07T15:00:00Z")}, ${now} FROM numbers`;
  const snapshot = await buildSnapshot("owner", { productName: "토마토" }, now);
  expect(snapshot.metrics.find(metric => metric.id === "price-0")?.value).toBe(10001);
  expect(snapshot.metrics.find(metric => metric.id === "trades-0")?.value).toBe(20001);
});
it("completes the HTTP claim-to-draft flow and never returns bearer or lease tokens in the user's list", async () => {
  const { token } = await setup();
  const send = (body: object) => workerPost(new Request("http://localhost/api/briefing-worker", { method: "POST",
    headers: { Authorization: `Bearer ${token}` }, body: JSON.stringify(body) }));
  const claimed = await (await send({ action: "claim" })).json();
  const job = claimed.job;
  expect(job.snapshot.rulesVersion).toBe("briefing-v1");
  expect((await send({ action: "complete", jobId: job.id, leaseToken: job.leaseToken, inputHash: job.inputHash, result: draft() })).status).toBe(200);
  const listed = await (await GET()).json();
  expect(listed.runs[0].briefing).toMatchObject({ status: "DRAFT", body: draft() });
  expect(listed.scheduleEnabled).toBe(false);
  expect(JSON.stringify(listed)).not.toContain(token); expect(JSON.stringify(listed)).not.toContain(job.leaseToken);
});
it("returns the same job to simultaneous identical enqueue requests instead of failing", async () => {
  const snapshot = await buildSnapshot("owner", { productName: "토마토" }, now);
  const runs = await Promise.all(Array.from({ length: 6 }, (_, n) =>
    enqueueBriefing("owner", { ...snapshot, generatedAt: new Date(now.getTime() + n).toISOString() })));
  expect(new Set(runs.map(run => run.id)).size).toBe(1);
  expect(await m.db.briefingRun.count()).toBe(1);
});
// Distinct inputs: without collected trades the filters do not reach the snapshot, so vary the limitations instead.
const variants = (snapshot: Awaited<ReturnType<typeof buildSnapshot>>, count: number) =>
  Array.from({ length: count }, (_, n) => ({ ...snapshot, limitations: [...snapshot.limitations, `변형 ${n}`] }));
it("keeps at most three active jobs per user under simultaneous distinct enqueue requests", async () => {
  const snapshots = variants(await buildSnapshot("owner", { productName: "토마토" }, now), 6);
  const results = await Promise.allSettled(snapshots.map(snapshot => enqueueBriefing("owner", snapshot)));
  const fulfilled = results.filter(result => result.status === "fulfilled");
  const rejected = results.filter((result): result is PromiseRejectedResult => result.status === "rejected");
  expect(fulfilled).toHaveLength(3); expect(rejected).toHaveLength(3);
  for (const result of rejected) expect(result.reason).toMatchObject({ status: 409 });
  expect(await m.db.briefingRun.count({ where: { userId: "owner", status: { in: ["PENDING", "RUNNING"] } } })).toBe(3);
});
it("returns the existing job for an identical request even when the user is at the active-job cap", async () => {
  const snapshots = variants(await buildSnapshot("owner", { productName: "토마토" }, now), 4);
  const [first] = await Promise.all(snapshots.slice(0, 3).map(snapshot => enqueueBriefing("owner", snapshot)));
  await expect(enqueueBriefing("owner", snapshots[3])).rejects.toMatchObject({ status: 409 });
  expect((await enqueueBriefing("owner", { ...snapshots[0], generatedAt: new Date().toISOString() })).id).toBe(first.id);
  expect(await m.db.briefingRun.count()).toBe(3);
});
const prismaError = (code: string) => new Prisma.PrismaClientKnownRequestError(`simulated ${code}`, { code, clientVersion: "test" });
it("returns the concurrent winner's job when the unique key race is lost inside the transaction", async () => {
  const snapshot = await buildSnapshot("owner", { productName: "토마토" }, now);
  const tx = vi.spyOn(m.db, "$transaction").mockImplementationOnce(async () => {
    // Another process commits the same key between this request's read and its insert.
    await m.db.briefingRun.create({ data: { userId: "owner", weekStart: new Date(snapshot.periodStart),
      inputHash: hash(JSON.stringify({ ...snapshot, generatedAt: undefined })), snapshot: JSON.stringify(snapshot) } });
    throw prismaError("P2002");
  });
  const run = await enqueueBriefing("owner", snapshot);
  expect(tx).toHaveBeenCalledTimes(1);
  expect(await m.db.briefingRun.findMany()).toEqual([run]);
});
it("retries a timed-out transaction, still enforces the cap, and reports exhaustion as 503", async () => {
  const [first, ...rest] = variants(await buildSnapshot("owner", { productName: "토마토" }, now), 5);
  const tx = vi.spyOn(m.db, "$transaction");
  tx.mockRejectedValueOnce(prismaError("P2028"));
  expect((await enqueueBriefing("owner", first)).status).toBe("PENDING");
  expect(tx).toHaveBeenCalledTimes(2);
  await Promise.all(rest.slice(0, 2).map(snapshot => enqueueBriefing("owner", snapshot)));
  await expect(enqueueBriefing("owner", rest[2])).rejects.toMatchObject({ status: 409 });
  tx.mockClear(); tx.mockRejectedValue(prismaError("P2028"));
  await expect(enqueueBriefing("owner", rest[3])).rejects.toMatchObject({ status: 503 });
  expect(tx).toHaveBeenCalledTimes(3);
  tx.mockRestore();
  expect(await m.db.briefingRun.count()).toBe(3);
});
it("does not retry non-transient database errors", async () => {
  const snapshot = await buildSnapshot("owner", { productName: "토마토" }, now);
  const tx = vi.spyOn(m.db, "$transaction").mockRejectedValueOnce(prismaError("P2003"));
  await expect(enqueueBriefing("owner", snapshot)).rejects.toMatchObject({ code: "P2003" });
  expect(tx).toHaveBeenCalledTimes(1);
  expect(await m.db.briefingRun.count()).toBe(0);
});
it("accepts a late completion from the original lease holder after expiry without another attempt", async () => {
  const { credential } = await setup(); const job = await claim(credential);
  const later = new Date(now.getTime() + 11 * 60_000); const lease = { jobId: job.id, leaseToken: job.leaseToken };
  await expect(handleWorker(credential, { action: "heartbeat", ...lease }, later)).rejects.toMatchObject({ status: 409 });
  await expect(handleWorker(credential, { action: "fail", ...lease, code: "CODEX_FAILED" }, later)).rejects.toMatchObject({ status: 409 });
  const input = { action: "complete" as const, ...lease, inputHash: job.inputHash, result: draft() };
  expect(await handleWorker(credential, input, later)).toEqual({ ok: true });
  expect(await handleWorker(credential, input, later)).toEqual({ ok: true });
  expect(await m.db.briefingRun.findUniqueOrThrow({ where: { id: job.id } })).toMatchObject({ status: "SUCCEEDED", attempts: 1 });
  expect(await m.db.weeklyBriefing.count()).toBe(1);
  expect(await handleWorker(credential, { action: "claim" }, later)).toEqual({ job: null });
});
it("rejects a late completion once the job was re-claimed, retried, or rotated away from the old lease", async () => {
  const { credential, token } = await setup(); const old = await claim(credential);
  const later = new Date(now.getTime() + 11 * 60_000);
  const complete = (job: typeof old, at: Date, cred = credential) =>
    handleWorker(cred, { action: "complete", jobId: job.id, leaseToken: job.leaseToken, inputHash: job.inputHash, result: draft() }, at);
  const fresh = await claim(credential, later);
  await expect(complete(old, later)).rejects.toMatchObject({ status: 409 });
  await handleWorker(credential, { action: "fail", jobId: fresh.id, leaseToken: fresh.leaseToken, code: "RATE_LIMIT" }, later);
  const retry = await POST(new Request("http://localhost/api/briefings", { method: "POST", body: JSON.stringify({ action: "retry", jobId: old.id }) }));
  expect(retry.status).toBe(200);
  await expect(complete(fresh, later)).rejects.toMatchObject({ status: 409 });
  const third = await claim(credential, later);
  await issueWorkerToken("owner"); expect(await authenticateWorker(`Bearer ${token}`)).toBeNull();
  await expect(complete(third, later)).rejects.toMatchObject({ status: 401 });
  expect(await m.db.weeklyBriefing.count()).toBe(0);
  expect(await m.db.briefingRun.findUniqueOrThrow({ where: { id: old.id } })).toMatchObject({ status: "BLOCKED", leaseToken: null });
});

it("rejects empty-data generation but preserves preview, and blocks legacy empty jobs without an AI attempt", async () => {
  const response = await POST(new Request("http://localhost/api/briefings", { method: "POST", body: JSON.stringify({ action: "enqueue", productName: "토마토", variety: "없는 이름" }) }));
  expect(response.status).toBe(400);
  expect(await m.db.briefingRun.count()).toBe(0);
  const token = await issueWorkerToken("owner");
  const credential = (await authenticateWorker(`Bearer ${token}`))!;
  const snapshot = await buildSnapshot("owner", { productName: "토마토" }, now);
  const legacy = await enqueueBriefing("owner", snapshot);
  expect(await handleWorker(credential, { action: "claim" }, now)).toEqual({ job: null });
  expect(await m.db.briefingRun.findUniqueOrThrow({ where: { id: legacy.id } })).toMatchObject({
    status: "BLOCKED", lastError: "NO_MARKET_DATA", attempts: 0, leaseToken: null, credentialId: null, snapshot: JSON.stringify(snapshot),
  });
  expect((await POST(new Request("http://localhost/api/briefings", { method: "POST", body: JSON.stringify({ action: "retry", jobId: legacy.id }) }))).status).toBe(409);
  expect(await m.db.weeklyBriefing.count()).toBe(0);
  const valid = await setup();
  expect((await claim(valid.credential)).id).toBe(valid.run.id);
});
