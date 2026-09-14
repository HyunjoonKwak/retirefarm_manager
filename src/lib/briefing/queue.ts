import { createHash, randomBytes, randomUUID } from "node:crypto";
import { Prisma, type BriefingRun } from "@prisma/client";
import prisma from "@/lib/prisma";
import { snapshotSchema, validateReferences, type BriefingSnapshot, type workerRequestSchema } from "./contracts";
import type { z } from "zod";

export const hash = (value: string) => createHash("sha256").update(value).digest("hex");
export class BriefingError extends Error {
  constructor(public status: number, message: string) { super(message); }
}
const LEASE_MS = 10 * 60_000;
export async function issueWorkerToken(userId: string) {
  const token = `rfw_${randomBytes(32).toString("hex")}`;
  await prisma.$transaction(async tx => {
    // Rotation fences out already-running workers as well as future requests.
    await tx.briefingRun.updateMany({ where: { userId, status: "RUNNING" }, data: {
      status: "BLOCKED", lastError: "AUTH_REQUIRED", leaseToken: null, leaseUntil: null, credentialId: null,
    } });
    await tx.briefingWorkerCredential.upsert({ where: { userId }, create: { userId, tokenHash: hash(token) },
      update: { tokenHash: hash(token), lastSeenAt: null } });
  });
  return token;
}
export async function authenticateWorker(header: string | null) {
  const token = header?.match(/^Bearer (rfw_[a-f0-9]{64})$/)?.[1];
  if (!token) return null;
  return prisma.briefingWorkerCredential.findUnique({ where: { tokenHash: hash(token) } });
}
const MAX_ACTIVE_RUNS = 3;
const ENQUEUE_ATTEMPTS = 3;
type RunKey = { userId: string; weekStart: Date; inputHash: string };
// Prisma serializes SQLite transactions (in-process queue, cross-process file lock). These surface when that wait
// expires (P2028), a write conflicts (P2034), a lock wait times out, or a concurrent writer inserted the same key (P2002).
const TRANSIENT_CODES = new Set(["P2002", "P2028", "P2034"]);
const isTransientEnqueueError = (error: unknown) =>
  (error instanceof Prisma.PrismaClientKnownRequestError && TRANSIENT_CODES.has(error.code)) ||
  (error instanceof Error && /database is locked|SQLITE_BUSY/i.test(error.message));
const findRun = (key: RunKey) => prisma.briefingRun.findUnique({ where: { userId_weekStart_inputHash: key } });
function createUnlessCapped(key: RunKey, serialized: string) {
  return prisma.$transaction(async tx => {
    // Re-check inside the transaction: an identical request may have committed while this one waited in the queue.
    const existing = await tx.briefingRun.findUnique({ where: { userId_weekStart_inputHash: key } });
    if (existing) return existing;
    if (await tx.briefingRun.count({ where: { userId: key.userId, status: { in: ["PENDING", "RUNNING"] } } }) >= MAX_ACTIVE_RUNS)
      throw new BriefingError(409, "진행 중인 작업을 마친 후 다시 요청해 주세요.");
    return tx.briefingRun.create({ data: { ...key, snapshot: serialized } });
  });
}
async function enqueueWithRetry(key: RunKey, serialized: string, attempt = 1): Promise<BriefingRun> {
  // Fast path outside the transaction: duplicates return immediately without waiting on the writer queue.
  const existing = await findRun(key);
  if (existing) return existing;
  try {
    return await createUnlessCapped(key, serialized);
  } catch (error) {
    if (!isTransientEnqueueError(error)) throw error;
    if (attempt < ENQUEUE_ATTEMPTS) return enqueueWithRetry(key, serialized, attempt + 1);
    const winner = await findRun(key);
    if (winner) return winner;
    throw new BriefingError(503, "브리핑 대기열이 혼잡합니다. 잠시 후 다시 요청해 주세요.");
  }
}
export async function enqueueBriefing(userId: string, snapshot: BriefingSnapshot) {
  const stable = { ...snapshot, generatedAt: undefined };
  const inputHash = hash(JSON.stringify(stable));
  const serialized = JSON.stringify(snapshot);
  if (Buffer.byteLength(serialized) > 128 * 1024) throw new BriefingError(400, "조건을 좁혀 입력 자료 크기를 줄여 주세요.");
  return enqueueWithRetry({ userId, weekStart: new Date(snapshot.periodStart), inputHash }, serialized);
}
export async function handleWorker(credential: { id: string; userId: string; tokenHash: string }, input: z.infer<typeof workerRequestSchema>, now = new Date()) {
  return prisma.$transaction(async tx => {
    // Revalidate inside the transaction so token rotation cannot race an authorized request.
    const seen = await tx.briefingWorkerCredential.updateMany({
      where: { id: credential.id, tokenHash: credential.tokenHash }, data: { lastSeenAt: now },
    });
    if (!seen.count) throw new BriefingError(401, "워커 인증이 만료되었습니다.");
    const userId = credential.userId;
    if (input.action === "claim") {
      await tx.briefingRun.updateMany({ where: { userId, status: "RUNNING", leaseUntil: { lte: now }, attempts: { gte: 3 } },
        data: { status: "FAILED", lastError: "TIMEOUT", leaseToken: null, leaseUntil: null } });
      if (await tx.briefingRun.count({ where: { userId, status: "RUNNING", leaseUntil: { gt: now } } })) return { job: null };
      const where = { userId, attempts: { lt: 3 }, OR: [{ status: "PENDING" }, { status: "RUNNING", leaseUntil: { lte: now } }] };
      const job = await tx.briefingRun.findFirst({ where, orderBy: [{ createdAt: "asc" }, { id: "asc" }] });
      if (!job) return { job: null };
      const leaseToken = randomUUID(), leaseUntil = new Date(now.getTime() + LEASE_MS);
      const claimed = await tx.briefingRun.updateMany({ where: { ...where, id: job.id }, data: {
        status: "RUNNING", leaseToken, leaseUntil, credentialId: credential.id, attempts: { increment: 1 }, lastError: null,
      } });
      if (!claimed.count) return { job: null };
      return { job: { id: job.id, leaseToken, leaseUntil, inputHash: job.inputHash, snapshot: snapshotSchema.parse(JSON.parse(job.snapshot)) } };
    }
    const job = await tx.briefingRun.findFirst({ where: { id: input.jobId, userId, credentialId: credential.id, leaseToken: input.leaseToken } });
    if (!job) throw new BriefingError(409, "작업 소유권을 확인할 수 없습니다.");
    const resultHash = input.action === "complete" ? hash(JSON.stringify(input.result)) : null;
    if (input.action === "complete" && job.status === "SUCCEEDED" && job.inputHash === input.inputHash && job.resultHash === resultHash)
      return { ok: true };
    // A late "complete" from the original lease holder is still accepted: ownership is proven by the unchanged
    // leaseToken, which every re-claim, rotation, retry and timeout fence clears or replaces. Heartbeat/fail stay strict.
    const leaseAlive = !!job.leaseUntil && job.leaseUntil > now;
    if (job.status !== "RUNNING" || (input.action !== "complete" && !leaseAlive)) throw new BriefingError(409, "작업 실행 기간이 만료되었습니다.");
    const where = { id: job.id, userId, status: "RUNNING", leaseToken: input.leaseToken, ...(input.action === "complete" ? {} : { leaseUntil: { gt: now } }) };
    if (input.action === "heartbeat") {
      await tx.briefingRun.updateMany({ where, data: { leaseUntil: new Date(now.getTime() + LEASE_MS) } });
    } else if (input.action === "fail") {
      await tx.briefingRun.updateMany({ where, data: { status: ["AUTH_REQUIRED", "RATE_LIMIT"].includes(input.code) ? "BLOCKED" : "FAILED",
        lastError: input.code, leaseToken: null, leaseUntil: null } });
    } else {
      if (job.inputHash !== input.inputHash || !validateReferences(input.result, snapshotSchema.parse(JSON.parse(job.snapshot))))
        throw new BriefingError(400, "입력 버전 또는 보고서 근거가 일치하지 않습니다.");
      const updated = await tx.briefingRun.updateMany({ where, data: { status: "SUCCEEDED", resultHash,
        usage: input.usage ? JSON.stringify(input.usage) : null } });
      if (!updated.count) throw new BriefingError(409, "작업 소유권이 변경되었습니다.");
      await tx.weeklyBriefing.create({ data: { userId, runId: job.id, body: JSON.stringify(input.result) } });
    }
    return { ok: true };
  });
}
