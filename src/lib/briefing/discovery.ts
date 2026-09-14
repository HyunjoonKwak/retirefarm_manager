import { createHash } from "node:crypto";
import prisma from "@/lib/prisma";
import { BriefingError } from "./queue";
import type { CompetitorCollectionJob, Prisma } from "@prisma/client";
import { discoveryRequestSchema, normalizeDiscoveryQuery, parseDiscoveryProductUrl, type DiscoveryCandidate, type DiscoveryEvidenceInput, type DiscoveryOverview, type DiscoveryRequest } from "./discovery-contracts";
import { DISCOVERY_POLICY_VERSION, rankDiscoveryCandidates } from "./discovery-ranking";
import { COLLECTION_EVIDENCE_WINDOW_MS } from "./collection-contracts";

const DAY = 86_400_000;
const hash = (text: string) => createHash("sha256").update(text).digest("hex");
const SEARCH_METADATA_KEYS = ["sourceUrl", "searchSort", "searchEnvironment", "collectionMethod"] as const;
/** Search-context keys are appended only when supplied, so legacy manual payloads keep their historical hash and stay idempotent. */
const searchMetadata = (e: DiscoveryEvidenceInput) => Object.fromEntries(SEARCH_METADATA_KEYS.flatMap(key => e[key] === undefined ? [] : [[key, e[key]]]));

type JobRef = { id: string; version: number };
type NormalizedEvidence = { query: string; observedAt: string; collectionMethod?: string };
const JOB_STATE_MESSAGE = "수집 중인 작업에만 자료를 저장할 수 있습니다. 작업 상태를 새로고침해 주세요.";
/**
 * Loads the caller's collection job for an import and checks its state. A SUCCEEDED job is returned as-is so the
 * duplicate path can recognise a retry; every other non-RUNNING state, or a stale version on a RUNNING job, is rejected.
 */
async function collectionJobForImport(tx: Prisma.TransactionClient, userId: string, ref: JobRef) {
  const job = await tx.competitorCollectionJob.findFirst({ where: { id: ref.id, userId } });
  if (!job) throw new BriefingError(404, "수집 작업을 찾지 못했습니다.");
  if (job.status !== "RUNNING" && job.status !== "SUCCEEDED") throw new BriefingError(409, JOB_STATE_MESSAGE);
  if (job.status === "RUNNING" && job.version !== ref.version) throw new BriefingError(409, "작업 상태가 바뀌었습니다. 새로고침 후 다시 확인해 주세요.");
  return job;
}
/**
 * Every evidence row must come from the job's own search, via the extension, between the user's start signal and the
 * import instant (≤24h). For a SUCCEEDED job the import instant is its completedAt, so an identical retry days later is
 * judged exactly as the original request was; the generic 30-day observation rule (checked before the transaction)
 * still bounds how late such a retry can be recognised.
 */
function assertEvidenceMatchesJob(items: NormalizedEvidence[], job: CompetitorCollectionJob, now: Date) {
  if (items.some(e => e.query !== job.query)) throw new BriefingError(400, "수집 작업의 검색어와 다른 검색어 자료가 섞여 있습니다.");
  if (items.some(e => e.collectionMethod !== "EXTENSION")) throw new BriefingError(400, "수집 작업에는 확장 프로그램으로 수집한 자료만 저장할 수 있습니다.");
  const startedAt = job.startedAt?.getTime();
  if (startedAt === undefined) throw new BriefingError(409, JOB_STATE_MESSAGE);
  const importedAt = (job.status === "SUCCEEDED" ? job.completedAt ?? now : now).getTime();
  const inWindow = (t: number) => t >= startedAt && t <= importedAt && importedAt - t <= COLLECTION_EVIDENCE_WINDOW_MS;
  if (items.some(e => !inWindow(new Date(e.observedAt).getTime())))
    throw new BriefingError(400, "수집 작업을 시작한 뒤 24시간 안에 관측한 자료만 저장할 수 있습니다.");
}
/** A retry after success carries the version the original request used (one below the current one) or the current one. */
const isCompletedRetry = (job: CompetitorCollectionJob, ref: JobRef, runId: string) =>
  job.status === "SUCCEEDED" && job.runId === runId && (ref.version === job.version || ref.version === job.version - 1);

export async function discoveryOverview(userId: string, now = new Date()): Promise<DiscoveryOverview> {
  const [rows, latestRun, fixed] = await Promise.all([
    prisma.competitorDiscoveryCandidate.findMany({ where: { userId }, orderBy: [{ lastSeenAt: "desc" }, { id: "asc" }], take: 500,
      include: { evidence: { where: { observedAt: { gte: new Date(now.getTime() - 15 * DAY), lte: now }, run: { userId } },
        orderBy: [{ observedAt: "desc" }, { id: "asc" }], take: 120 } } }),
    prisma.competitorDiscoveryRun.findFirst({ where: { userId }, orderBy: [{ createdAt: "desc" }, { id: "desc" }] }),
    prisma.competitorPanelEntry.findMany({ where: { userId, archivedAt: null }, select: { storeKey: true } }),
  ]);
  const candidates: DiscoveryCandidate[] = rows.map(row => ({ id: row.id, productUrl: row.productUrl, storeKey: row.storeKey,
    storeName: row.storeName, title: row.title, status: row.status, decisionReason: row.decisionReason,
    lastSeenAt: row.lastSeenAt.toISOString(), evidence: row.evidence.map(e => ({ ...JSON.parse(e.payload) as DiscoveryEvidenceInput, id: e.id })) }));
  const fixedKeys = new Set(fixed.map(entry => entry.storeKey));
  const ranked = [
    ...rankDiscoveryCandidates(candidates.filter(c => !fixedKeys.has(c.storeKey)), now),
    ...rankDiscoveryCandidates(candidates.filter(c => fixedKeys.has(c.storeKey)), now).map(c => ({ ...c, recommended: false,
      reasons: [...c.reasons, "이미 고정 비교 중인 판매처이므로 새 추천 자리를 사용하지 않음"] })),
  ];
  return { asOf: now.toISOString(), policyVersion: DISCOVERY_POLICY_VERSION, candidates: ranked,
    recommendedCount: ranked.filter(c => c.recommended).length,
    latestRun: latestRun ? { id: latestRun.id, createdAt: latestRun.createdAt.toISOString(), evidenceCount: latestRun.evidenceCount } : null };
}

export async function mutateDiscovery(userId: string, request: DiscoveryRequest, now = new Date()) {
  // Parse at the service boundary as well: workers must obey the same contract as browser input.
  const parsed = discoveryRequestSchema.safeParse(request);
  if (!parsed.success) throw new BriefingError(400, "후보 자료 형식을 확인해 주세요.");
  const input = parsed.data;
  if (input.action === "decision") return prisma.$transaction(async tx => {
    const candidate = await tx.competitorDiscoveryCandidate.findFirst({ where: { id: input.candidateId, userId } });
    if (!candidate) throw new BriefingError(404, "후보를 찾지 못했습니다.");
    // Exclusion applies to this seller's products, including future discoveries of another product.
    const siblings = await tx.competitorDiscoveryCandidate.findMany({ where: { userId, storeKey: candidate.storeKey }, select: { id: true } });
    for (const sibling of siblings) {
      await tx.competitorDiscoveryCandidate.update({ where: { id: sibling.id }, data: { status: input.status, decisionReason: input.reason } });
      await tx.competitorDiscoveryDecision.create({ data: { candidateId: sibling.id, status: input.status, reason: input.reason, createdAt: now } });
    }
    return { ok: true };
  });

  const evidence = input.evidence.map(e => ({ ...e, ...parseDiscoveryProductUrl(e.productUrl)!,
    query: normalizeDiscoveryQuery(e.query), observedAt: new Date(e.observedAt).toISOString() }));
  if (evidence.some(e => new Date(e.observedAt).getTime() > now.getTime() || new Date(e.observedAt).getTime() < now.getTime() - 30 * DAY))
    throw new BriefingError(400, "최근 30일 안에 실제 확인한 시각을 입력해 주세요. 미래 시각은 사용할 수 없습니다.");
  // Stable key order and canonical dates/URLs make retries independent of input order and tracking parameters.
  const normalized = evidence.map(({ storeKey, ...e }) => ({ storeKey, e, payload: JSON.stringify({ productUrl: e.productUrl,
    storeName: e.storeName, title: e.title, query: e.query, observedAt: e.observedAt, position: e.position,
    adStatus: e.adStatus, relevance: e.relevance, purchaseLabel: e.purchaseLabel, reviewCount: e.reviewCount, reviewBasis: e.reviewBasis,
    ...searchMetadata(e) }) }));
  const unique = [...new Map(normalized.map(e => [e.payload, e])).values()].sort((a, b) => a.payload.localeCompare(b.payload));
  const contentHash = hash(unique.map(e => e.payload).join("\n"));
  const jobRef: JobRef | null = input.collectionJobId !== undefined && input.collectionJobVersion !== undefined
    ? { id: input.collectionJobId, version: input.collectionJobVersion } : null;
  return prisma.$transaction(async tx => {
    // Job checks run before the duplicate lookup so an old identical run can never bypass query/time validation.
    const job = jobRef ? await collectionJobForImport(tx, userId, jobRef) : null;
    if (job) assertEvidenceMatchesJob(unique.map(item => item.e), job, now);
    const existingRun = await tx.competitorDiscoveryRun.findUnique({ where: { userId_contentHash: { userId, contentHash } } });
    if (existingRun) {
      const duplicate = { ok: true, id: existingRun.id, duplicate: true, evidenceCount: existingRun.evidenceCount };
      if (!job || !jobRef) return duplicate;
      if (isCompletedRetry(job, jobRef, existingRun.id)) return { ...duplicate, collectionJob: { id: job.id, status: job.status, version: job.version } };
      // The same evidence already belongs to another run (legacy import or another job); linking would misattribute it.
      throw new BriefingError(409, "같은 자료가 이미 다른 저장 기록에 있습니다. 작업 상태를 새로고침해 주세요.");
    }
    if (job && job.status !== "RUNNING") throw new BriefingError(409, "이미 완료된 수집 작업에는 다른 자료를 저장할 수 없습니다.");
    if (await tx.competitorDiscoveryRun.count({ where: { userId, createdAt: { gte: new Date(now.getTime() - DAY) } } }) >= 60)
      throw new BriefingError(429, "하루 자료 저장 한도에 도달했습니다. 다음 날 다시 진행해 주세요.");
    const extensionCount = unique.filter(item => item.e.collectionMethod === "EXTENSION").length;
    const source = extensionCount === unique.length ? "EXTENSION_PUBLIC_SEARCH" : extensionCount ? "MIXED_PUBLIC_SEARCH" : "MANUAL_PUBLIC_SEARCH";
    const run = await tx.competitorDiscoveryRun.create({ data: { userId, contentHash, evidenceCount: 0, source, policyVersion: DISCOVERY_POLICY_VERSION, createdAt: now } });
    let added = 0;
    for (const { e, payload, storeKey } of unique) {
      let candidate = await tx.competitorDiscoveryCandidate.findUnique({ where: { userId_productUrl: { userId, productUrl: e.productUrl } } });
      const observedAt = new Date(e.observedAt);
      if (!candidate) {
        if (await tx.competitorDiscoveryCandidate.count({ where: { userId } }) >= 500)
          throw new BriefingError(409, "후보 보관 한도 500개에 도달했습니다. 기존 후보의 자료만 갱신할 수 있습니다.");
        const excluded = await tx.competitorDiscoveryCandidate.findFirst({ where: { userId, storeKey, status: "EXCLUDED" } });
        candidate = await tx.competitorDiscoveryCandidate.create({ data: { userId, productUrl: e.productUrl, storeKey,
          storeName: e.storeName, title: e.title, lastSeenAt: observedAt,
          ...(excluded ? { status: "EXCLUDED", decisionReason: excluded.decisionReason } : {}) } });
      } else if (observedAt > candidate.lastSeenAt) {
        candidate = await tx.competitorDiscoveryCandidate.update({ where: { id: candidate.id }, data: { lastSeenAt: observedAt, storeName: e.storeName, title: e.title } });
      }
      const key = { candidateId: candidate.id, query: e.query, observedAt };
      const existing = await tx.competitorDiscoveryEvidence.findUnique({ where: { candidateId_query_observedAt: key } });
      if (existing) {
        if (existing.contentHash !== hash(payload)) throw new BriefingError(409, "같은 상품·검색어·시각에 서로 다른 자료가 있습니다. 실제 관측 시각과 내용을 확인해 주세요.");
        continue;
      }
      await tx.competitorDiscoveryEvidence.create({ data: { ...key, runId: run.id, payload, contentHash: hash(payload) } });
      added++;
    }
    await tx.competitorDiscoveryRun.update({ where: { id: run.id }, data: { evidenceCount: added } });
    if (!job || !jobRef) return { ok: true, id: run.id, evidenceCount: added };
    // A subset of an earlier run adds nothing: throwing here rolls back the empty run instead of completing the job with it.
    if (added === 0) throw new BriefingError(409, "선택한 자료가 모두 이미 저장되어 있어 이 작업으로 새로 저장할 자료가 없습니다. 자료를 확인해 주세요.");
    // Completion means the reviewed evidence is saved, not that every search card was processed.
    const completed = await tx.competitorCollectionJob.updateMany({ where: { id: job.id, userId, status: "RUNNING", version: jobRef.version },
      data: { status: "SUCCEEDED", runId: run.id, evidenceCount: added, completedAt: now, updatedAt: now, version: { increment: 1 } } });
    if (completed.count !== 1) throw new BriefingError(409, "작업 상태가 바뀌었습니다. 새로고침 후 다시 확인해 주세요.");
    return { ok: true, id: run.id, evidenceCount: added, collectionJob: { id: job.id, status: "SUCCEEDED", version: job.version + 1 } };
  }, { timeout: 15_000 });
}
