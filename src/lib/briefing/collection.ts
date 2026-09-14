import type { CompetitorCollectionJob, Prisma } from "@prisma/client";
import prisma from "@/lib/prisma";
import { BriefingError } from "./queue";
import { COLLECTION_MAX_ACTIVE, COLLECTION_MAX_DAILY, COLLECTION_OVERVIEW_LIMIT, buildCollectionSearchUrl, collectionActiveStatuses,
  collectionRequestSchema, type CollectionJob, type CollectionJobStatus, type CollectionOverview, type CollectionRequest } from "./collection-contracts";

/**
 * User-driven competitor search collection jobs. Every transition is an explicit user signal recorded with an
 * ownership + version check inside one transaction; nothing here polls, times out, retries or runs a browser.
 * Completion (SUCCEEDED) is written by the discovery import that saves the reviewed evidence (discovery.ts).
 */
const DAY = 86_400_000;
const KST_OFFSET = 9 * 3_600_000;
const ACTIVE = [...collectionActiveStatuses];
type Tx = Prisma.TransactionClient;
type JobRef = { jobId: string; version: number };

/** KST Monday 00:00 of the week containing `now`, as a UTC instant (same week rule as snapshot.ts). */
export function collectionWeekStart(now: Date): Date {
  const kst = new Date(now.getTime() + KST_OFFSET);
  return new Date(Date.UTC(kst.getUTCFullYear(), kst.getUTCMonth(), kst.getUTCDate() - (kst.getUTCDay() + 6) % 7) - KST_OFFSET);
}

export const toCollectionJob = (row: CompetitorCollectionJob): CollectionJob => ({
  id: row.id, query: row.query, searchUrl: row.searchUrl, status: row.status as CollectionJobStatus, reason: row.reason,
  createdAt: row.createdAt.toISOString(), startedAt: row.startedAt?.toISOString() ?? null, completedAt: row.completedAt?.toISOString() ?? null,
  evidenceCount: row.evidenceCount, runId: row.runId, version: row.version,
});

const newestFirst = [{ createdAt: "desc" }, { id: "desc" }] satisfies Prisma.CompetitorCollectionJobOrderByWithRelationInput[];
export async function collectionOverview(userId: string): Promise<CollectionOverview> {
  const [latest, active, lastSuccess] = await Promise.all([
    prisma.competitorCollectionJob.findMany({ where: { userId }, orderBy: newestFirst, take: COLLECTION_OVERVIEW_LIMIT }),
    // Active jobs stay visible even when more than 60 newer finished jobs exist; the cap bounds this query.
    prisma.competitorCollectionJob.findMany({ where: { userId, status: { in: ACTIVE } }, orderBy: newestFirst, take: COLLECTION_MAX_ACTIVE }),
    // Last real success is looked up over the user's whole history, not only the 60 listed jobs.
    prisma.competitorCollectionJob.findFirst({ where: { userId, status: "SUCCEEDED", completedAt: { not: null } },
      orderBy: [{ completedAt: "desc" }, { id: "desc" }], select: { completedAt: true } }),
  ]);
  const rows = [...new Map([...latest, ...active].map(row => [row.id, row])).values()]
    .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime() || b.id.localeCompare(a.id));
  return { jobs: rows.map(toCollectionJob), lastSuccessAt: lastSuccess?.completedAt?.toISOString() ?? null };
}

const stale = () => new BriefingError(409, "작업 상태가 바뀌었습니다. 새로고침 후 다시 확인해 주세요.");
const transitionMessages: Record<string, string> = {
  start: "대기 중인 작업만 시작할 수 있습니다.", resume: "중단된 작업만 다시 시작할 수 있습니다.",
  block: "수집 중인 작업만 중단으로 표시할 수 있습니다.", cancel: "이미 끝난 작업은 취소할 수 없습니다.",
};
/** Loads the caller's job and enforces the optimistic version; every mutation routes through here. */
async function ownedJob(tx: Tx, userId: string, ref: JobRef) {
  const job = await tx.competitorCollectionJob.findFirst({ where: { id: ref.jobId, userId } });
  if (!job) throw new BriefingError(404, "수집 작업을 찾지 못했습니다.");
  if (job.version !== ref.version) throw stale();
  return job;
}
async function transition(tx: Tx, userId: string, ref: JobRef, action: keyof typeof transitionMessages, from: readonly CollectionJobStatus[],
  data: Prisma.CompetitorCollectionJobUpdateManyMutationInput, now: Date) {
  const job = await ownedJob(tx, userId, ref);
  if (job.status === "CANCELLED" && action === "resume") throw new BriefingError(409, "취소된 작업은 다시 시작할 수 없습니다. 같은 검색어는 다음 주에 다시 만들 수 있습니다.");
  if (!from.includes(job.status as CollectionJobStatus)) throw new BriefingError(409, transitionMessages[action]);
  if (data.status === "RUNNING" && await tx.competitorCollectionJob.count({ where: { userId, status: "RUNNING", id: { not: job.id } } }) > 0)
    throw new BriefingError(409, "이미 수집 중인 작업이 있습니다. 먼저 그 작업을 마치거나 중단·취소해 주세요.");
  // The where clause repeats status and version so a concurrent transition can never be overwritten.
  const updated = await tx.competitorCollectionJob.updateMany({ where: { id: job.id, userId, status: job.status, version: job.version },
    data: { ...data, updatedAt: now, version: { increment: 1 } } });
  if (updated.count !== 1) throw stale();
  return { ok: true as const };
}

async function createJobs(tx: Tx, userId: string, queries: string[], now: Date) {
  const weekStart = collectionWeekStart(now);
  const existing = await tx.competitorCollectionJob.findMany({ where: { userId, weekStart, query: { in: queries } }, select: { query: true } });
  const known = new Set(existing.map(row => row.query));
  const missing = queries.filter(query => !known.has(query));
  if (missing.length === 0) return { ok: true as const };
  if (await tx.competitorCollectionJob.count({ where: { userId, status: { in: ACTIVE } } }) + missing.length > COLLECTION_MAX_ACTIVE)
    throw new BriefingError(409, `진행 중인 수집 작업은 최대 ${COLLECTION_MAX_ACTIVE}개입니다. 기존 작업을 마치거나 취소해 주세요.`);
  if (await tx.competitorCollectionJob.count({ where: { userId, createdAt: { gt: new Date(now.getTime() - DAY) } } }) + missing.length > COLLECTION_MAX_DAILY)
    throw new BriefingError(429, `하루에 만들 수 있는 수집 작업은 ${COLLECTION_MAX_DAILY}개입니다. 다음 날 다시 진행해 주세요.`);
  await tx.competitorCollectionJob.createMany({ data: missing.map(query => ({ userId, weekStart, query, searchUrl: buildCollectionSearchUrl(query), createdAt: now, updatedAt: now })) });
  return { ok: true as const };
}

export async function mutateCollection(userId: string, request: CollectionRequest, now = new Date()) {
  // Parse at the service boundary as well so every caller obeys the same contract as browser input.
  const parsed = collectionRequestSchema.safeParse(request);
  if (!parsed.success) throw new BriefingError(400, "수집 작업 요청 형식을 확인해 주세요.");
  const input = parsed.data;
  return prisma.$transaction(async tx => {
    switch (input.action) {
      case "create": return createJobs(tx, userId, input.queries, now);
      case "start": return transition(tx, userId, input, "start", ["PENDING"], { status: "RUNNING", startedAt: now, reason: null }, now);
      case "resume": return transition(tx, userId, input, "resume", ["BLOCKED"], { status: "RUNNING", startedAt: now, reason: null }, now);
      case "block": return transition(tx, userId, input, "block", ["RUNNING"], { status: "BLOCKED", reason: input.reason }, now);
      case "cancel": return transition(tx, userId, input, "cancel", ACTIVE, { status: "CANCELLED", completedAt: now }, now);
    }
  });
}
