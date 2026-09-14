import { z } from "zod";
/**
 * Client-safe contracts for competitor discovery. Evidence is entered manually from public search results;
 * nothing here claims an autonomous browser search. Persistence, owner isolation and dedup live in the service.
 */
export const discoveryAdStatuses = ["ORGANIC", "AD", "UNKNOWN"] as const;
export const discoveryRelevances = ["MATCH", "UNKNOWN", "MISMATCH"] as const;
export const discoveryReviewBases = ["CUMULATIVE", "ROLLING", "UNKNOWN"] as const;
export const discoveryDecisionStatuses = ["WATCH", "EXCLUDED"] as const;
export const adStatusLabels = { ORGANIC: "비광고", AD: "광고", UNKNOWN: "광고 여부 미확인" } as const;
export const relevanceLabels = { MATCH: "비교 조건 일치", UNKNOWN: "조건 미확인", MISMATCH: "조건 불일치" } as const;
export const reviewBasisLabels = { CUMULATIVE: "누적", ROLLING: "이동 기간", UNKNOWN: "집계 기준 미확인" } as const;
export const DISCOVERY_IMPORT_MAX = 60;
export const DISCOVERY_URL_MESSAGE = "스마트스토어 또는 브랜드스토어의 실제 상품 주소(https)만 입력할 수 있습니다.";

const PRODUCT_PATH = /^\/([a-z0-9_-]{2,64})\/products\/(\d+)\/?$/i;
const RESERVED_SLUGS = ["products", "main", "inflow", "category", "search", "api"];
/** Exact hosts only; brand stores get a prefixed key so they never alias a smartstore slug (mirrors competitors.ts without Prisma). */
const HOSTS = new Map<string, (slug: string) => string>([["smartstore.naver.com", slug => slug], ["brand.naver.com", slug => `brand:${slug}`]]);

/** Returns the canonical product URL and store key, or null when the value is not an exact https Naver store product URL. */
export function parseDiscoveryProductUrl(value: string): { storeKey: string; productUrl: string } | null {
  let url: URL;
  try { url = new URL(value); } catch { return null; }
  const match = PRODUCT_PATH.exec(url.pathname);
  const keyFor = HOSTS.get(url.hostname);
  if (url.protocol !== "https:" || !keyFor || url.port || url.username || url.password || !match) return null;
  const slug = match[1].toLowerCase();
  if (RESERVED_SLUGS.includes(slug)) return null;
  return { storeKey: keyFor(slug), productUrl: `https://${url.hostname}/${slug}/products/${match[2]}` };
}

const productUrl = z.string().trim().max(2000).transform((value, ctx) => {
  const parsed = parseDiscoveryProductUrl(value);
  if (parsed) return parsed.productUrl;
  ctx.addIssue({ code: "custom", message: DISCOVERY_URL_MESSAGE });
  return z.NEVER;
});

export const discoveryEvidenceSchema = z.object({
  productUrl,
  storeName: z.string().trim().min(1).max(100),
  title: z.string().trim().min(1).max(300),
  query: z.string().trim().min(1).max(100),
  observedAt: z.string().datetime({ offset: true }),
  position: z.number().int().min(1).max(200).nullable(),
  adStatus: z.enum(discoveryAdStatuses),
  relevance: z.enum(discoveryRelevances),
  // Displayed purchase text is preserved verbatim for description only; it is never parsed into a sales figure.
  purchaseLabel: z.string().trim().max(100).default(""),
  reviewCount: z.number().int().min(0).max(100_000_000).nullable(),
  reviewBasis: z.enum(discoveryReviewBases).default("UNKNOWN"),
}).strict();
export type DiscoveryEvidenceInput = z.infer<typeof discoveryEvidenceSchema>;

export const discoveryRequestSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("import"), evidence: z.array(discoveryEvidenceSchema).min(1).max(DISCOVERY_IMPORT_MAX) }).strict(),
  z.object({ action: z.literal("decision"), candidateId: z.string().min(1).max(100), status: z.enum(discoveryDecisionStatuses),
    reason: z.string().trim().min(1).max(500) }).strict(),
]);
export type DiscoveryRequest = z.infer<typeof discoveryRequestSchema>;

export type DiscoveryEvidence = DiscoveryEvidenceInput & { id: string };
export interface DiscoveryCandidate {
  id: string; productUrl: string; storeKey: string; storeName: string; title: string;
  /** Persisted status string (e.g. NEW/WATCH/EXCLUDED); only EXCLUDED changes ranking. */
  status: string; decisionReason: string | null; lastSeenAt: string;
  evidence: DiscoveryEvidence[];
}
export interface RankedDiscoveryCandidate extends DiscoveryCandidate {
  recommended: boolean; eligible: boolean; reasons: string[];
  /** Distinct queries whose latest observation is an organic, matching, positioned result. */
  queryCount: number; bestPosition: number | null;
  /** Latest cumulative review count minus a comparable prior one 6–8 days earlier; null when not comparable. */
  reviewDelta: number | null;
}
export interface DiscoveryOverview {
  asOf: string; policyVersion: string; candidates: RankedDiscoveryCandidate[]; recommendedCount: number;
  latestRun: { id: string; createdAt: string; evidenceCount: number } | null;
}
