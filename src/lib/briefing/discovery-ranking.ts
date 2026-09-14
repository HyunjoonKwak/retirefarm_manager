import { normalizeDiscoveryQuery, type DiscoveryCandidate, type DiscoveryEvidence, type RankedDiscoveryCandidate } from "./discovery-contracts";
/** Bump whenever eligibility, ordering or the review window changes so stored recommendations stay attributable. */
export const DISCOVERY_POLICY_VERSION = "2026-09-14.manual-evidence.v2";
export const DISCOVERY_RECOMMEND_LIMIT = 10;
export const DISCOVERY_FRESH_DAYS = 7;
export const DISCOVERY_REVIEW_WINDOW_DAYS = { min: 6, max: 8 } as const;
/** Titles matching these are processed or sweetened products, not fresh produce. Kept narrow to avoid false positives on plain titles. */
export const PROCESSED_TITLE_PATTERNS: readonly RegExp[] = [
  /스테비아|stevia|토망고|샤인마토/i, /가공|말랭이|건조|동결|냉동/, /주스|착즙|잼|퓨레|소스|케첩|분말|통조림|절임|피클/,
];
const DAY_MS = 86_400_000;

const time = (iso: string) => new Date(iso).getTime();
/** Whitespace-only normalisation plus case folding: "대추방울토마토  2kg" and "대추방울토마토 2KG" are the same query. Search metadata never keys this map. */
export const normalizeQuery = normalizeDiscoveryQuery;
const byTime = (a: DiscoveryEvidence, b: DiscoveryEvidence) => time(b.observedAt) - time(a.observedAt) || (a.id < b.id ? 1 : a.id > b.id ? -1 : 0);
const byUrl = (a: DiscoveryCandidate, b: DiscoveryCandidate) => (a.productUrl < b.productUrl ? -1 : a.productUrl > b.productUrl ? 1 : 0);

/** Only the latest observation per normalised query counts, so an old organic hit is not resurrected once the query now shows an ad or a mismatch. */
export function latestPerQuery(evidence: readonly DiscoveryEvidence[]): DiscoveryEvidence[] {
  const latest = new Map<string, DiscoveryEvidence>();
  for (const item of [...evidence].sort(byTime).reverse()) latest.set(normalizeQuery(item.query), item);
  return [...latest.values()].sort(byTime);
}

export const processedTitleMatch = (title: string): string | null => {
  for (const pattern of PROCESSED_TITLE_PATTERNS) { const hit = pattern.exec(title); if (hit) return hit[0]; }
  return null;
};

const formatDays = (days: number) => String(Math.round(days * 10) / 10);
/** Cumulative counts observed at one timestamp (e.g. from several queries) must agree; otherwise the reading is ambiguous. */
type CumulativeReading = { count: number; reason: null; conflict: false } | { count: null; reason: string; conflict: boolean };
function cumulativeAt(evidence: readonly DiscoveryEvidence[], at: number): CumulativeReading {
  const counted = evidence.filter(item => time(item.observedAt) === at && item.reviewCount !== null);
  if (counted.length === 0) return { count: null, reason: "리뷰 수 미확인", conflict: false };
  if (counted.some(item => item.reviewBasis !== "CUMULATIVE")) return { count: null, reason: "누적 리뷰 수가 아니어서 증가량을 계산하지 않음", conflict: false };
  const values = new Set(counted.map(item => item.reviewCount as number));
  if (values.size > 1) return { count: null, reason: "같은 시각에 서로 다른 누적 리뷰 수가 있어 검토 필요", conflict: true };
  return { count: counted[0].reviewCount as number, reason: null, conflict: false };
}

/** Latest cumulative count minus a comparable cumulative count 6–8 days earlier on the same product; anything else is null with a reason. */
export function reviewDeltaFor(evidence: readonly DiscoveryEvidence[]): { delta: number | null; reason: string } {
  const sorted = [...evidence].sort(byTime);
  if (sorted.length === 0) return { delta: null, reason: "리뷰 수 미확인" };
  const latestAt = time(sorted[0].observedAt);
  const latest = cumulativeAt(sorted, latestAt);
  if (latest.count === null) return { delta: null, reason: latest.reason };
  // Walk comparable timestamps newest first: skip ones without a cumulative count, but never guess past a conflicting one.
  const windowTimes = [...new Set(sorted.map(item => time(item.observedAt)))].filter(at => {
    const gap = (latestAt - at) / DAY_MS;
    return gap >= DISCOVERY_REVIEW_WINDOW_DAYS.min && gap <= DISCOVERY_REVIEW_WINDOW_DAYS.max;
  });
  const earlier = windowTimes.map(at => ({ at, ...cumulativeAt(sorted, at) })).find(group => group.count !== null || group.conflict);
  if (!earlier) return { delta: null, reason: "6–8일 전 누적 리뷰 수가 없어 증가량 비교 불가" };
  if (earlier.count === null) return { delta: null, reason: earlier.reason };
  const delta = latest.count - earlier.count;
  if (delta < 0) return { delta: null, reason: "리뷰 수 감소·집계 변경으로 검토 필요" };
  return { delta, reason: `최근 리뷰 증가 ${delta}건 (${formatDays((latestAt - earlier.at) / DAY_MS)}일 간격)` };
}

interface Assessment { eligible: boolean; reasons: string[]; queryCount: number; bestPosition: number | null; reviewDelta: number | null }

function assess(candidate: DiscoveryCandidate, now: Date): Assessment {
  const review = reviewDeltaFor(candidate.evidence);
  const base = { queryCount: 0, bestPosition: null, reviewDelta: review.delta };
  const blockers: string[] = [];
  if (candidate.status === "EXCLUDED") blockers.push(`사용자 제외${candidate.decisionReason ? `: ${candidate.decisionReason}` : ""}`);
  if (candidate.evidence.length === 0) return { ...base, eligible: false, reasons: [...blockers, "검색 근거 없음"] };
  if (candidate.evidence.some(item => Number.isNaN(time(item.observedAt)))) blockers.push("관측 시각을 해석할 수 없어 검토 필요");
  else if (candidate.evidence.some(item => time(item.observedAt) > now.getTime())) blockers.push("현재보다 늦은 관측 시각이 있어 검토 필요");
  if (blockers.length) return { ...base, eligible: false, reasons: blockers };

  const latest = latestPerQuery(candidate.evidence);
  const ageOf = (item: DiscoveryEvidence) => (now.getTime() - time(item.observedAt)) / DAY_MS;
  const ageDays = ageOf(latest[0]);
  if (ageDays > DISCOVERY_FRESH_DAYS) blockers.push(`최근 관측이 ${Math.floor(ageDays)}일 전이라 ${DISCOVERY_FRESH_DAYS}일 기준을 넘음`);
  const processed = [candidate.title, ...latest.map(item => item.title)].map(processedTitleMatch).find(Boolean);
  if (processed) blockers.push(`가공·스테비아 상품으로 판단: "${processed}"`);
  if (latest.some(item => item.relevance === "MISMATCH")) blockers.push("최신 관측에서 비교 조건 불일치");
  // Each query must be fresh on its own: a recent unrelated observation never revives an organic hit older than the window.
  const organic = latest.filter(item => item.relevance === "MATCH" && item.adStatus === "ORGANIC" && item.position !== null && item.position > 0
    && ageOf(item) <= DISCOVERY_FRESH_DAYS);
  const notes = latest.filter(item => !organic.includes(item)).map(item => `"${item.query}": ${describeSkip(item, ageOf(item))}`);
  const queryCount = organic.length;
  const bestPosition = queryCount ? Math.min(...organic.map(item => item.position as number)) : null;
  if (queryCount === 0) blockers.push("비광고·조건 일치·위치 확인 검색어가 없음");
  const summary = queryCount ? [`검색어 ${queryCount}개에서 비광고 노출 확인 (최상위 ${bestPosition}위)`] : [];
  return { queryCount, bestPosition, reviewDelta: review.delta, eligible: blockers.length === 0,
    reasons: [...blockers, ...summary, ...notes, review.reason] };
}

const describeSkip = (item: DiscoveryEvidence, ageDays: number) => item.relevance === "MISMATCH" ? "조건 불일치" : item.relevance === "UNKNOWN" ? "조건 미확인"
  : item.adStatus === "AD" ? "광고 노출" : item.adStatus === "UNKNOWN" ? "광고 여부 미확인" : item.position === null ? "검색 위치 미확인"
  : `${Math.floor(ageDays)}일 전 관측이라 ${DISCOVERY_FRESH_DAYS}일 기준을 넘음`;

const rankOrder = (a: RankedDiscoveryCandidate, b: RankedDiscoveryCandidate) => Number(b.eligible) - Number(a.eligible) || b.queryCount - a.queryCount
  || (a.bestPosition ?? Infinity) - (b.bestPosition ?? Infinity) || byUrl(a, b);

/** Deterministic shortlist: up to 10 distinct stores, one product per store, eligible ones first. Ineligible candidates stay with explicit reasons. */
export function rankDiscoveryCandidates(candidates: readonly DiscoveryCandidate[], now = new Date()): RankedDiscoveryCandidate[] {
  const assessed = candidates.map(candidate => ({ ...candidate, recommended: false, ...assess(candidate, now) })).sort(rankOrder);
  const stores = new Set<string>();
  return assessed.map(candidate => {
    if (!candidate.eligible) return candidate;
    if (stores.has(candidate.storeKey)) return { ...candidate, reasons: [...candidate.reasons, "같은 판매처의 다른 상품이 이미 추천됨"] };
    if (stores.size >= DISCOVERY_RECOMMEND_LIMIT) return { ...candidate, reasons: [...candidate.reasons, `추천 상한 ${DISCOVERY_RECOMMEND_LIMIT}곳 초과`] };
    stores.add(candidate.storeKey);
    return { ...candidate, recommended: true };
  });
}
