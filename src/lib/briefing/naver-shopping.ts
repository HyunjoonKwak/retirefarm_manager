import { z } from "zod";

/**
 * Naver Shopping search adapter (official Open API only).
 * Contract source: https://developers.naver.com/docs/serviceapi/search/shopping/shopping.md
 * - GET https://openapi.naver.com/v1/search/shop.json?query=&display=&start=&sort=
 * - Headers: X-Naver-Client-Id / X-Naver-Client-Secret
 * - Errors: 400 SE01~SE04/SE06, 401 (024 auth), 403 (no API permission / non-HTTPS), 404 SE05, 429 quota, 500 SE99
 *
 * Everything derived from titles (weight, variety, exclusion) is a heuristic suggestion for
 * human review, never a verified product fact. Rank is the API result order only.
 */

export const NAVER_SHOPPING_ENDPOINT = "https://openapi.naver.com/v1/search/shop.json";
export const SHOPPING_FETCH_TIMEOUT_MS = 12_000;
export const SHOPPING_MAX_RESPONSE_BYTES = 1_048_576;
export const SHOPPING_DISPLAY = 100;
export const SHOPPING_START = 1;
export const SHOPPING_SORT = "sim" as const;
const MAX_QUERY_LENGTH = 100;
const MAX_TITLE_LENGTH = 300;
const MAX_MALL_LENGTH = 100;
const MAX_PROPOSED_KG = 50;

export interface ShoppingCredentials { clientId: string; clientSecret: string }

export type ShoppingVarietyGroup = "JUJUBE" | "ROUND" | "UNKNOWN";

export type ShoppingReviewReason =
  | "VERIFY_PRICE_OPTION_SHIPPING"
  | "PRICE_UNAVAILABLE"
  | "URL_REJECTED"
  | "WEIGHT_MISSING"
  | "WEIGHT_AMBIGUOUS"
  | "WEIGHT_PROPOSED_FROM_TITLE"
  | "VARIETY_CONFLICT"
  | "CATEGORY_REVIEW"
  | "PRODUCT_TYPE_NOT_GENERAL"
  | "HEURISTIC_STEVIA"
  | "HEURISTIC_JUICE"
  | "HEURISTIC_POWDER"
  | "HEURISTIC_PROCESSED";

export interface ShoppingCandidate {
  productId: string;
  title: string;
  /** Sanitized http(s) URL; empty string when the upstream link was rejected (see URL_REJECTED). */
  url: string;
  mallName: string;
  /** Integer KRW from lprice; null when upstream reports 0 (unknown), never "free". */
  listedPrice: number | null;
  /** 1-based position in the API response (sort=sim). Not a consumer-facing or non-ad rank. */
  rank: number;
  /** Naver productType code ("1".."12") as a string. */
  productType: string;
  /** Suggestion from a single bare kg/g title token. Never a verified option weight. */
  proposedPackageKg: number | null;
  varietyGroup: ShoppingVarietyGroup;
  reviewReasons: ShoppingReviewReason[];
  /** Heuristic exclusion (stevia/juice/powder/processed/URL); not product truth. */
  excluded: boolean;
  /** Store slug only for exact smartstore.naver.com/<store>/... links; otherwise null. */
  storeKey: string | null;
}

export interface ShoppingSearchResult {
  query: string;
  sort: typeof SHOPPING_SORT;
  observedAt: string;
  total: number;
  items: ShoppingCandidate[];
  excludedCount: number;
}

export type ShoppingSearchErrorCode =
  | "INVALID_QUERY"
  | "INVALID_CREDENTIALS"
  | "AUTH_FAILED"
  | "FORBIDDEN"
  | "RATE_LIMITED"
  | "BAD_REQUEST"
  | "UPSTREAM_ERROR"
  | "TIMEOUT"
  | "REDIRECT"
  | "NETWORK"
  | "RESPONSE_TOO_LARGE"
  | "INVALID_RESPONSE";

// Messages are fixed strings: never echo upstream bodies, headers, query, or credentials.
const ERROR_MESSAGES: Record<ShoppingSearchErrorCode, string> = {
  INVALID_QUERY: "검색어가 비어 있거나 허용 길이를 초과했습니다.",
  INVALID_CREDENTIALS: "네이버 API 자격증명이 설정되지 않았습니다.",
  AUTH_FAILED: "네이버 API 인증에 실패했습니다.",
  FORBIDDEN: "네이버 API 호출 권한이 없습니다.",
  RATE_LIMITED: "네이버 API 호출 한도를 초과했습니다.",
  BAD_REQUEST: "네이버 API가 요청을 거부했습니다.",
  UPSTREAM_ERROR: "네이버 API 서버 오류입니다.",
  TIMEOUT: "네이버 API 응답 시간이 초과되었습니다.",
  REDIRECT: "네이버 API가 예상치 못한 리디렉션을 반환했습니다.",
  NETWORK: "네이버 API에 연결하지 못했습니다.",
  RESPONSE_TOO_LARGE: "네이버 API 응답이 허용 크기를 초과했습니다.",
  INVALID_RESPONSE: "네이버 API 응답 형식이 올바르지 않습니다.",
};

export class ShoppingSearchError extends Error {
  readonly code: ShoppingSearchErrorCode;
  readonly status: number | null;
  constructor(code: ShoppingSearchErrorCode, status: number | null = null) {
    super(ERROR_MESSAGES[code]);
    this.name = "ShoppingSearchError";
    this.code = code;
    this.status = status;
  }
}

// ---------- upstream schema (JSON variant returns numerics as strings) ----------

const intLike = z.union([z.number(), z.string()]).transform((value, ctx) => {
  const text = String(value).trim();
  if (!/^-?\d+$/.test(text)) { ctx.addIssue({ code: "custom", message: "not an integer" }); return z.NEVER; }
  const parsed = Number(text);
  if (!Number.isSafeInteger(parsed)) { ctx.addIssue({ code: "custom", message: "unsafe integer" }); return z.NEVER; }
  return parsed;
});
const idLike = z.union([z.number(), z.string()]).transform(value => String(value).trim()).pipe(z.string().min(1).max(64));
const text = z.string().max(2000).catch("");

const rawItemSchema = z.object({
  productId: idLike,
  title: z.string().max(2000),
  link: z.string().max(4000),
  lprice: intLike.optional(),
  mallName: text.optional(),
  productType: intLike,
  category1: text.optional(), category2: text.optional(), category3: text.optional(), category4: text.optional(),
}).passthrough();

const rawResponseSchema = z.object({
  total: intLike,
  items: z.array(rawItemSchema).max(SHOPPING_DISPLAY),
}).passthrough();

type RawItem = z.infer<typeof rawItemSchema>;

// ---------- text sanitizing ----------

const NAMED_ENTITIES: Record<string, string> = {
  amp: "&", lt: "<", gt: ">", quot: "\"", apos: "'", nbsp: " ", "#39": "'",
};

/** Strip tags first, then decode entities once, so `&lt;b&gt;` never turns into markup. */
export function cleanShoppingText(input: string, maxLength = MAX_TITLE_LENGTH): string {
  const withoutTags = input.replace(/<[^>]*>/g, "");
  const decoded = withoutTags.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (whole, entity: string) => {
    const lower = entity.toLowerCase();
    if (lower in NAMED_ENTITIES) return NAMED_ENTITIES[lower];
    if (lower.startsWith("#x")) return safeCodePoint(parseInt(lower.slice(2), 16), whole);
    if (lower.startsWith("#")) return safeCodePoint(parseInt(lower.slice(1), 10), whole);
    return whole;
  });
  // Remove control characters and collapse whitespace for single-line React text.
  return decoded.replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim().slice(0, maxLength);
}

function safeCodePoint(codePoint: number, fallback: string): string {
  if (!Number.isFinite(codePoint) || codePoint < 0x20 || codePoint > 0x10ffff) return fallback;
  if (codePoint >= 0xd800 && codePoint <= 0xdfff) return fallback;
  return String.fromCodePoint(codePoint);
}

// ---------- URL / store ----------

const STORE_SLUG = /^[a-z0-9_-]{2,64}$/i;
const RESERVED_STORE_SEGMENTS = new Set(["products", "main", "inflow", "category", "search", "api"]);

/** Accept http(s) only; reject embedded credentials. Returns null when rejected. */
export function sanitizeShoppingUrl(link: string): string | null {
  const trimmed = link.trim();
  let parsed: URL;
  try { parsed = new URL(trimmed); } catch { return null; }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return null;
  if (parsed.username !== "" || parsed.password !== "") return null;
  if (parsed.hostname === "") return null;
  return parsed.href;
}

/** Store slug only from exact `smartstore.naver.com/<store>/...`; mallName is never used. */
export function extractSmartstoreKey(url: string | null): string | null {
  if (!url) return null;
  let parsed: URL;
  try { parsed = new URL(url); } catch { return null; }
  if (parsed.hostname !== "smartstore.naver.com") return null;
  const segments = parsed.pathname.split("/").filter(segment => segment.length > 0);
  if (segments.length < 2) return null;
  const store = segments[0];
  if (!STORE_SLUG.test(store) || RESERVED_STORE_SEGMENTS.has(store.toLowerCase())) return null;
  return store;
}

// ---------- title heuristics ----------

const WEIGHT_TOKEN = /(?<![\d.,])(\d+(?:\.\d+)?)\s*(kg|㎏|g)(?![a-z])/gi;
const QUALIFIER_BEFORE = /(?:[x×*~\-/]|당|씩)\s*$/i;
const QUALIFIER_AFTER = /^\s*(?:[x×*~\-/]|당|씩|기준|이상|이하|내외|부터|까지)/i;
const MULTIPACK = /(?:[x×*]\s*\d+)|(?:\b(?:[2-9]|[1-9]\d+)\s*(?:팩|봉|박스|세트|set|개입|개|입|묶음|병|포|망))/i;

export interface WeightProposal { kg: number | null; reason: "WEIGHT_MISSING" | "WEIGHT_AMBIGUOUS" | "WEIGHT_PROPOSED_FROM_TITLE" }

/** Propose a package weight only from an unambiguous single bare kg/g token in the title. */
export function proposePackageWeight(title: string): WeightProposal {
  const matches = [...title.matchAll(WEIGHT_TOKEN)];
  if (matches.length === 0) return { kg: null, reason: "WEIGHT_MISSING" };
  if (matches.length > 1 || MULTIPACK.test(title)) return { kg: null, reason: "WEIGHT_AMBIGUOUS" };
  const [match] = matches;
  const index = match.index ?? 0;
  const before = title.slice(0, index);
  const after = title.slice(index + match[0].length);
  if (QUALIFIER_BEFORE.test(before) || QUALIFIER_AFTER.test(after)) return { kg: null, reason: "WEIGHT_AMBIGUOUS" };
  const value = Number(match[1]);
  const unit = match[2].toLowerCase();
  const kg = unit === "g" ? value / 1000 : value;
  if (!Number.isFinite(kg) || kg <= 0 || kg > MAX_PROPOSED_KG) return { kg: null, reason: "WEIGHT_AMBIGUOUS" };
  return { kg: Math.round(kg * 1000) / 1000, reason: "WEIGHT_PROPOSED_FROM_TITLE" };
}

const JUJUBE_PATTERN = /대추/;
const ROUND_PATTERN = /원형|동그란|둥근|라운드/;

/** Variety group only from explicit title wording; conflicts fall back to UNKNOWN. */
export function classifyVariety(title: string): { group: ShoppingVarietyGroup; conflict: boolean } {
  const jujube = JUJUBE_PATTERN.test(title);
  const round = ROUND_PATTERN.test(title);
  if (jujube && round) return { group: "UNKNOWN", conflict: true };
  if (jujube) return { group: "JUJUBE", conflict: false };
  if (round) return { group: "ROUND", conflict: false };
  return { group: "UNKNOWN", conflict: false };
}

const EXCLUSION_RULES: ReadonlyArray<{ reason: ShoppingReviewReason; pattern: RegExp }> = [
  { reason: "HEURISTIC_STEVIA", pattern: /스테비아|stevia|토망고|스테비토/i },
  { reason: "HEURISTIC_JUICE", pattern: /주스|쥬스|juice|착즙|음료/i },
  { reason: "HEURISTIC_POWDER", pattern: /분말|가루|파우더|powder/i },
  { reason: "HEURISTIC_PROCESSED", pattern: /건조|말린|절임|잼|퓨레|소스|케찹|케첩|통조림|피클|젤리|스낵|칩|추출|엑기스|농축|씨앗|종자|모종|묘목|비료/i },
];
const CATEGORY_REVIEW_PATTERN = /가공|음료|건강|다이어트|분말|주스|씨앗|종자|원예|반려/i;
const GENERAL_PRODUCT_TYPES = new Set(["1", "2", "3"]);

export function detectExclusionReasons(title: string): ShoppingReviewReason[] {
  return EXCLUSION_RULES.filter(rule => rule.pattern.test(title)).map(rule => rule.reason);
}

// ---------- normalization ----------

function normalizeItem(raw: RawItem, rank: number): ShoppingCandidate {
  const title = cleanShoppingText(raw.title);
  const url = sanitizeShoppingUrl(raw.link);
  const listedPrice = raw.lprice !== undefined && raw.lprice > 0 ? raw.lprice : null;
  const weight = proposePackageWeight(title);
  const variety = classifyVariety(title);
  const exclusionReasons = detectExclusionReasons(title);
  const productType = String(raw.productType);
  const categories = [raw.category1, raw.category2, raw.category3, raw.category4].filter((c): c is string => !!c);

  const reviewReasons: ShoppingReviewReason[] = [
    "VERIFY_PRICE_OPTION_SHIPPING",
    ...(listedPrice === null ? ["PRICE_UNAVAILABLE" as const] : []),
    ...(url === null ? ["URL_REJECTED" as const] : []),
    weight.reason,
    ...(variety.conflict ? ["VARIETY_CONFLICT" as const] : []),
    ...(categories.some(c => CATEGORY_REVIEW_PATTERN.test(c)) ? ["CATEGORY_REVIEW" as const] : []),
    ...(GENERAL_PRODUCT_TYPES.has(productType) ? [] : ["PRODUCT_TYPE_NOT_GENERAL" as const]),
    ...exclusionReasons,
  ];

  return {
    productId: raw.productId,
    title,
    url: url ?? "",
    mallName: cleanShoppingText(raw.mallName ?? "", MAX_MALL_LENGTH),
    listedPrice,
    rank,
    productType,
    proposedPackageKg: weight.kg,
    varietyGroup: variety.group,
    reviewReasons,
    excluded: exclusionReasons.length > 0 || url === null,
    storeKey: extractSmartstoreKey(url),
  };
}

/** Normalize a parsed upstream JSON body. Exported for snapshot/replay consumers. */
export function normalizeShoppingResponse(body: unknown, query: string, observedAt: string): ShoppingSearchResult {
  const parsed = rawResponseSchema.safeParse(body);
  if (!parsed.success) throw new ShoppingSearchError("INVALID_RESPONSE", 200);
  const items = parsed.data.items.map((raw, index) => normalizeItem(raw, index + SHOPPING_START));
  return {
    query,
    sort: SHOPPING_SORT,
    observedAt,
    total: Math.max(0, parsed.data.total),
    items,
    excludedCount: items.filter(item => item.excluded).length,
  };
}

// ---------- transport ----------

const HEADER_SAFE = /^[\x21-\x7e]+$/;

function validateCredentials(credentials: ShoppingCredentials): ShoppingCredentials {
  const clientId = typeof credentials?.clientId === "string" ? credentials.clientId.trim() : "";
  const clientSecret = typeof credentials?.clientSecret === "string" ? credentials.clientSecret.trim() : "";
  if (!HEADER_SAFE.test(clientId) || !HEADER_SAFE.test(clientSecret)) throw new ShoppingSearchError("INVALID_CREDENTIALS");
  return { clientId, clientSecret };
}

function validateQuery(query: string): string {
  const trimmed = typeof query === "string" ? query.replace(/\s+/g, " ").trim() : "";
  if (trimmed.length === 0 || trimmed.length > MAX_QUERY_LENGTH) throw new ShoppingSearchError("INVALID_QUERY");
  if (/[\u0000-\u001f\u007f]/.test(trimmed)) throw new ShoppingSearchError("INVALID_QUERY");
  return trimmed;
}

export function buildShoppingSearchUrl(query: string): string {
  const params = new URLSearchParams({
    query, display: String(SHOPPING_DISPLAY), start: String(SHOPPING_START), sort: SHOPPING_SORT,
  });
  return `${NAVER_SHOPPING_ENDPOINT}?${params.toString()}`;
}

function statusToError(status: number): ShoppingSearchError {
  if (status === 401) return new ShoppingSearchError("AUTH_FAILED", status);
  if (status === 403) return new ShoppingSearchError("FORBIDDEN", status);
  if (status === 429) return new ShoppingSearchError("RATE_LIMITED", status);
  if (status >= 300 && status < 400) return new ShoppingSearchError("REDIRECT", status);
  if (status >= 400 && status < 500) return new ShoppingSearchError("BAD_REQUEST", status);
  return new ShoppingSearchError("UPSTREAM_ERROR", status);
}

function transportError(error: unknown): ShoppingSearchError {
  const name = error instanceof Error ? error.name : "";
  if (name === "TimeoutError" || name === "AbortError") return new ShoppingSearchError("TIMEOUT");
  const cause = error instanceof Error && error.cause instanceof Error ? error.cause.message : "";
  const message = error instanceof Error ? error.message : "";
  if (/redirect/i.test(`${message} ${cause}`)) return new ShoppingSearchError("REDIRECT");
  return new ShoppingSearchError("NETWORK");
}

/** Read at most `limit` bytes; abort and fail closed on oversize or forged Content-Length. */
async function readBoundedBody(response: Response, limit: number): Promise<string> {
  const declared = Number(response.headers.get("content-length") ?? "0");
  if (Number.isFinite(declared) && declared > limit) throw new ShoppingSearchError("RESPONSE_TOO_LARGE", response.status);
  if (!response.body) {
    const fallback = await response.text();
    if (Buffer.byteLength(fallback, "utf8") > limit) throw new ShoppingSearchError("RESPONSE_TOO_LARGE", response.status);
    return fallback;
  }
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > limit) { await reader.cancel(); throw new ShoppingSearchError("RESPONSE_TOO_LARGE", response.status); }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  return Buffer.concat(chunks).toString("utf8");
}

export interface SearchOptions { now?: () => Date }

/**
 * Single-page official search (display=100, start=1, sort=sim). One request, no retry,
 * no proxy fallback, no product-page fetches. Rejects on any non-2xx or malformed body.
 */
export async function searchNaverShopping(
  query: string,
  credentials: ShoppingCredentials,
  fetcher: typeof fetch = fetch,
  options: SearchOptions = {},
): Promise<ShoppingSearchResult> {
  const safeCredentials = validateCredentials(credentials);
  const safeQuery = validateQuery(query);
  const url = buildShoppingSearchUrl(safeQuery);

  let response: Response;
  try {
    response = await fetcher(url, {
      method: "GET",
      headers: {
        Accept: "application/json",
        "X-Naver-Client-Id": safeCredentials.clientId,
        "X-Naver-Client-Secret": safeCredentials.clientSecret,
      },
      // Never follow: a redirect could carry the credential headers to another host.
      redirect: "error",
      signal: AbortSignal.timeout(SHOPPING_FETCH_TIMEOUT_MS),
    });
  } catch (error) {
    throw transportError(error);
  }
  if (response.status < 200 || response.status >= 300) throw statusToError(response.status);

  let bodyText: string;
  try {
    bodyText = await readBoundedBody(response, SHOPPING_MAX_RESPONSE_BYTES);
  } catch (error) {
    if (error instanceof ShoppingSearchError) throw error;
    throw transportError(error);
  }
  let body: unknown;
  try { body = JSON.parse(bodyText); } catch { throw new ShoppingSearchError("INVALID_RESPONSE", response.status); }
  const observedAt = (options.now ?? (() => new Date()))().toISOString();
  return normalizeShoppingResponse(body, safeQuery, observedAt);
}
