import { createHash } from "node:crypto";
import prisma from "@/lib/prisma";
import { BriefingError } from "./queue";
import { discoveryRequestSchema, parseDiscoveryProductUrl, type DiscoveryCandidate, type DiscoveryEvidenceInput, type DiscoveryOverview, type DiscoveryRequest } from "./discovery-contracts";
import { DISCOVERY_POLICY_VERSION, rankDiscoveryCandidates } from "./discovery-ranking";

const DAY = 86_400_000;
const hash = (text: string) => createHash("sha256").update(text).digest("hex");

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
    query: e.query.replace(/\s+/g, " ").trim().toLowerCase(), observedAt: new Date(e.observedAt).toISOString() }));
  if (evidence.some(e => new Date(e.observedAt).getTime() > now.getTime() || new Date(e.observedAt).getTime() < now.getTime() - 30 * DAY))
    throw new BriefingError(400, "최근 30일 안에 실제 확인한 시각을 입력해 주세요. 미래 시각은 사용할 수 없습니다.");
  // Stable key order and canonical dates/URLs make retries independent of input order and tracking parameters.
  const normalized = evidence.map(({ storeKey, ...e }) => ({ storeKey, e, payload: JSON.stringify({ productUrl: e.productUrl,
    storeName: e.storeName, title: e.title, query: e.query, observedAt: e.observedAt, position: e.position,
    adStatus: e.adStatus, relevance: e.relevance, purchaseLabel: e.purchaseLabel, reviewCount: e.reviewCount, reviewBasis: e.reviewBasis }) }));
  const unique = [...new Map(normalized.map(e => [e.payload, e])).values()].sort((a, b) => a.payload.localeCompare(b.payload));
  const contentHash = hash(unique.map(e => e.payload).join("\n"));
  return prisma.$transaction(async tx => {
    const existingRun = await tx.competitorDiscoveryRun.findUnique({ where: { userId_contentHash: { userId, contentHash } } });
    if (existingRun) return { ok: true, id: existingRun.id, duplicate: true, evidenceCount: existingRun.evidenceCount };
    if (await tx.competitorDiscoveryRun.count({ where: { userId, createdAt: { gte: new Date(now.getTime() - DAY) } } }) >= 60)
      throw new BriefingError(429, "하루 자료 저장 한도에 도달했습니다. 다음 날 다시 진행해 주세요.");
    const run = await tx.competitorDiscoveryRun.create({ data: { userId, contentHash, evidenceCount: 0, policyVersion: DISCOVERY_POLICY_VERSION, createdAt: now } });
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
    return { ok: true, id: run.id, evidenceCount: added };
  }, { timeout: 15_000 });
}
