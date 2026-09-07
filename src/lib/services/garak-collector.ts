/**
 * 가락시장 경매 데이터 수집 모듈 (garak-market에서 분리).
 *
 * 신뢰성 규칙 (리뷰 P1/P2)
 * - HTML·오류 XML·건수 누락 응답은 0건이 아니라 실패로 다룬다 (garak-parse).
 * - 페이지 조회 실패·100페이지 상한·항목 누락 의심은 PARTIAL, 전부 실패는 FAILED,
 *   실패 없이 0건이면 EMPTY. EMPTY는 "수집된 거래가 없음"일 뿐 휴장 확정이 아니다.
 * - DB 저장은 P2002(unique 충돌)만 중복으로 세고 나머지 오류는 실패로 전파한다.
 * - fetch는 타임아웃과 제한된 재시도를 두고, 같은 날짜·법인·품목 수집은 프로세스 안에서
 *   한 번만 실행한다 (동시 호출은 진행 중인 결과를 공유).
 * - 오류 메시지·로그에 요청 URL(자격증명 포함)을 절대 넣지 않는다.
 */

import { Prisma } from "@prisma/client";
import prisma from "@/lib/prisma";
import { logger } from "@/lib/logger";
import {
  type AuctionItem,
  type GarakApiResponse,
  parseGarakResponse,
  formatDateYmd,
  formatDateKey,
  parseYmdDate,
  dayRange,
} from "./garak-parse";

// HTTPS 엔드포인트는 무자격증명 요청으로 TLS·응답을 확인했다. GARAK_API_URL로 덮어쓸 수 있지만 https만 허용한다
// (자격증명이 쿼리로 나가므로 평문 HTTP·HTTPS→HTTP 리디렉션은 차단).
export const DEFAULT_GARAK_API_URL = "https://www.garak.co.kr/homepage/publicdata/dataOpen.do";

export function getGarakApiUrl(): string {
  const raw = (process.env.GARAK_API_URL || DEFAULT_GARAK_API_URL).trim();
  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    throw new Error("GARAK_API_URL이 올바른 URL이 아닙니다.");
  }
  if (parsed.protocol !== "https:") {
    throw new Error("GARAK_API_URL은 https만 허용합니다 (자격증명이 쿼리로 전송됨).");
  }
  return raw;
}

// 실인증 응답 검증: pagesize=100은 100건, 1000도 최대 100건 반환. 요청·계산 기준을 일치시킨다.
export const ACTUAL_PAGE_SIZE = 100;
// 페이지 폭주 방지 상한 (100페이지 = 10000건)
export const MAX_PAGES = 100;
// 페이지 병렬 요청 동시성
const PAGE_FETCH_CONCURRENCY = 5;
// 요청 타임아웃과 재시도 간격 (재시도 횟수 = 배열 길이)
export const FETCH_TIMEOUT_MS = 15_000;
export const FETCH_RETRY_DELAYS_MS: readonly number[] = [500, 1500];

// 법인코드 매핑
export const CORPORATION_CODES: Record<string, string> = {
  "11000101": "서울청과",
  "11000102": "농협(공)",
  "11000103": "중앙청과",
  "11000104": "동부팜창고",
  "11000105": "한국청과",
  "11000106": "대아청과",
};

export type CollectionStatus = "SUCCESS" | "PARTIAL" | "FAILED" | "EMPTY";

export interface ProductCollectionResult {
  productName: string | null;
  status: CollectionStatus;
  /** API가 알려준 총 건수 */
  totalCount: number;
  /** 실제로 파싱한 건수 */
  fetchedCount: number;
  newCount: number;
  duplicateCount: number;
  totalPages: number;
  fetchedPages: number;
  failedPages: number[];
  /** 가격·수량·일자가 유효하지 않아 제외한 항목 수 */
  invalidCount: number;
  /** 100페이지 상한에 걸려 뒤쪽을 수집하지 못함 (동일 조건 재수집으로 채워지지 않음) */
  capped: boolean;
  issues: string[];
}

export interface CorporationCollectionResult {
  corporationCode: string;
  corporationName: string;
  status: CollectionStatus;
  totalCount: number;
  newCount: number;
  duplicateCount: number;
  issues: string[];
  products: ProductCollectionResult[];
}

export interface CollectionResult {
  status: CollectionStatus;
  totalCount: number;
  newCount: number;
  duplicateCount: number;
  /** 하위 호환: status === "EMPTY". 휴장 확정이 아니라 "수집된 거래 0건"이다. */
  noAuction: boolean;
  /** 실패·누락 없이 끝났는지 (SUCCESS 또는 EMPTY). cleanup은 이때만 허용한다. */
  complete: boolean;
  issues: string[];
  guidance: string | null;
  corporations: CorporationCollectionResult[];
  /** 같은 조건의 수집이 이미 진행 중이어서 그 결과를 공유했으면 true */
  deduplicated: boolean;
}

/** 테스트·주입용 의존성 */
export interface CollectorDeps {
  fetchImpl?: typeof fetch;
  sleep?: (ms: number) => Promise<void>;
}

export type FetchFailureStage = "network" | "timeout" | "http" | "invalid";

export class GarakFetchError extends Error {
  readonly stage: FetchFailureStage;
  readonly pageIndex: number;
  readonly httpStatus: number | null;
  readonly attempts: number;
  constructor(stage: FetchFailureStage, pageIndex: number, detail: string, attempts: number, httpStatus: number | null = null) {
    // URL·자격증명은 절대 메시지에 넣지 않는다
    super(`페이지 ${pageIndex} ${describeStage(stage, httpStatus)}: ${detail} (${attempts}회 시도)`);
    this.name = "GarakFetchError";
    this.stage = stage;
    this.pageIndex = pageIndex;
    this.httpStatus = httpStatus;
    this.attempts = attempts;
  }
}

function describeStage(stage: FetchFailureStage, httpStatus: number | null): string {
  switch (stage) {
    case "timeout": return "타임아웃";
    case "http": return `HTTP ${httpStatus ?? "?"}`;
    case "invalid": return "응답 해석 실패";
    default: return "네트워크 오류";
  }
}

function getGarakCredentials(): { id: string; password: string } {
  const id = process.env.GARAK_API_ID;
  const password = process.env.GARAK_API_PASSWORD;
  if (!id || !password) {
    throw new Error("GARAK_API_ID / GARAK_API_PASSWORD 환경변수가 설정되지 않았습니다.");
  }
  return { id, password };
}

function isPrismaUniqueViolation(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";
}

function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  return String(error);
}

/** 로그·DB에 남는 문자열에서 자격증명과 요청 URL을 지운다 (상류가 URL/본문을 반사해도 안전). */
export function redactSecrets(text: string): string {
  let out = text.replace(/([?&])(id|passwd)=[^&\s"']*/gi, "$1$2=***");
  for (const secret of [process.env.GARAK_API_ID, process.env.GARAK_API_PASSWORD]) {
    if (secret && secret.length > 0) out = out.split(secret).join("***");
  }
  return out;
}

/** 네트워크 오류는 메시지 대신 이름·코드만 남긴다 (URL이 섞여 나오는 경우가 있음). */
function describeNetworkError(error: unknown): string {
  if (!(error instanceof Error)) return "unknown";
  const cause = (error as Error & { cause?: { code?: string; name?: string } }).cause;
  const code = (error as Error & { code?: string }).code ?? cause?.code ?? cause?.name;
  return redactSecrets([error.name, code].filter(Boolean).join(" "));
}

const defaultSleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

export interface FetchOptions {
  date: Date;
  corporationCode?: string;
  productName?: string;
  origin?: string;
  pageIndex?: number;
}

type AttemptOutcome =
  | { ok: true; totalCount: number; items: AuctionItem[] }
  | { ok: false; stage: FetchFailureStage; detail: string; httpStatus: number | null; retryable: boolean };

async function attemptFetch(url: string, fetchImpl: typeof fetch): Promise<AttemptOutcome> {
  let response: Response;
  let bodyText: string;
  try {
    response = await fetchImpl(url, {
      method: "GET",
      headers: { Accept: "application/xml" },
      // HTTPS→HTTP 리디렉션으로 자격증명이 평문으로 나가지 않게 한다
      redirect: "error",
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
    if (!response.ok) {
      const retryable = response.status >= 500 || response.status === 429;
      return { ok: false, stage: "http", detail: "요청 실패", httpStatus: response.status, retryable };
    }
    // 본문 읽기 중 타임아웃·연결 끊김도 재시도 범위에 넣는다
    bodyText = await response.text();
  } catch (error) {
    const name = error instanceof Error ? error.name : "";
    const isTimeout = name === "TimeoutError" || name === "AbortError";
    return {
      ok: false,
      stage: isTimeout ? "timeout" : "network",
      detail: isTimeout ? `${FETCH_TIMEOUT_MS}ms 초과` : describeNetworkError(error),
      httpStatus: null,
      retryable: true,
    };
  }

  const parsed = parseGarakResponse(bodyText);
  if (parsed.kind === "invalid") {
    // 한도 초과는 같은 날 다시 시도해도 회복되지 않고 남은 한도만 소모한다.
    return {
      ok: false, stage: "invalid", detail: `${parsed.reason}: ${parsed.detail}`,
      httpStatus: response.status, retryable: parsed.reason !== "quota_exceeded",
    };
  }
  return { ok: true, totalCount: parsed.totalCount, items: parsed.items };
}

/**
 * 가락시장 API 1페이지 조회 (타임아웃 + 제한 재시도). 실패하면 GarakFetchError.
 */
export async function fetchAuctionPage(
  options: FetchOptions,
  deps: CollectorDeps = {}
): Promise<GarakApiResponse> {
  const { date, corporationCode = "11000101", productName, origin, pageIndex = 1 } = options;
  const fetchImpl = deps.fetchImpl ?? fetch;
  const sleep = deps.sleep ?? defaultSleep;
  const credentials = getGarakCredentials();

  const params = new URLSearchParams({
    id: credentials.id,
    passwd: credentials.password,
    dataid: "data12",
    pagesize: String(ACTUAL_PAGE_SIZE),
    pageidx: pageIndex.toString(),
    "portal.templet": "false",
    s_date: formatDateYmd(date),
    s_bubin: corporationCode,
  });
  if (productName) params.append("s_pummok", productName);
  if (origin) params.append("s_sangi", origin);
  const url = `${getGarakApiUrl()}?${params.toString()}`;

  const maxAttempts = FETCH_RETRY_DELAYS_MS.length + 1;
  let lastFailure: Extract<AttemptOutcome, { ok: false }> | null = null;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const outcome = await attemptFetch(url, fetchImpl);
    if (outcome.ok) {
      return { list_total_count: outcome.totalCount, items: outcome.items };
    }
    lastFailure = outcome;
    if (!outcome.retryable || attempt === maxAttempts) break;
    await sleep(FETCH_RETRY_DELAYS_MS[attempt - 1]);
  }

  const failure = lastFailure!;
  throw new GarakFetchError(
    failure.stage,
    pageIndex,
    failure.detail,
    failure.retryable ? maxAttempts : 1,
    failure.httpStatus
  );
}

/** 하위 호환 이름 */
export function fetchAuctionData(options: FetchOptions): Promise<GarakApiResponse> {
  return fetchAuctionPage(options);
}

interface RemainingPagesResult {
  items: AuctionItem[];
  failedPages: number[];
  /** 마지막 페이지가 아닌데 10건 미만인 페이지 — 항목 누락 의심 */
  shortPages: number[];
}

async function fetchRemainingPages(
  baseOptions: Omit<FetchOptions, "pageIndex">,
  fromPage: number,
  toPage: number,
  lastPage: number,
  deps: CollectorDeps
): Promise<RemainingPagesResult> {
  const pages = Array.from({ length: toPage - fromPage + 1 }, (_, i) => fromPage + i);
  const items: AuctionItem[] = [];
  const failedPages: number[] = [];
  const shortPages: number[] = [];

  for (let i = 0; i < pages.length; i += PAGE_FETCH_CONCURRENCY) {
    const chunk = pages.slice(i, i + PAGE_FETCH_CONCURRENCY);
    const results = await Promise.allSettled(
      chunk.map((pageIndex) => fetchAuctionPage({ ...baseOptions, pageIndex }, deps))
    );
    results.forEach((r, idx) => {
      const pageIndex = chunk[idx];
      if (r.status === "fulfilled") {
        items.push(...r.value.items);
        if (pageIndex < lastPage && r.value.items.length < ACTUAL_PAGE_SIZE) shortPages.push(pageIndex);
      } else {
        failedPages.push(pageIndex);
        logger.warn(`[Garak API] 페이지 조회 실패: ${redactSecrets(errorMessage(r.reason))}`);
      }
    });
  }

  return { items, failedPages, shortPages };
}

export interface NormalizedAuctionRow {
  productName: string;
  variety: string;
  tempName: string | null;
  unit: string;
  grade: string;
  price: number;
  origin: string;
  corporation: string;
  corporationCode: string;
  auctionDate: Date;
  quantity: number;
  certification: string | null;
}

/** 중복 판정용 복합 키 (unique 제약과 동일한 필드 조합) */
function rowKey(r: NormalizedAuctionRow): string {
  return [
    r.productName, r.variety, r.corporation, formatDateKey(r.auctionDate),
    r.price, r.origin, r.unit, r.grade, r.quantity,
  ].join("|");
}

export type NormalizeOutcome =
  | { ok: true; row: NormalizedAuctionRow }
  | { ok: false; reason: "missing_fields" | "invalid_price" | "invalid_quantity" | "invalid_date" };

function parsePositiveInt(value: string): number | null {
  if (!/^\s*\d+\s*$/.test(value)) return null;
  const n = parseInt(value, 10);
  return Number.isFinite(n) && n > 0 ? n : null;
}

/**
 * 항목을 저장 행으로 바꾼다. 가격·수량·일자가 유효하지 않으면 0/1로 보정하지 않고 제외 사유를 돌려준다
 * (제외 건수는 PARTIAL 사유로 집계). QTY가 아예 없을 때만 1건으로 본다.
 */
export function normalizeItem(item: AuctionItem, corpCode: string): NormalizeOutcome {
  if (!item.PUMMOK || !item.PPRICE || !item.ADJ_DT || !item.CORP_NM) return { ok: false, reason: "missing_fields" };

  const price = parsePositiveInt(item.PPRICE);
  if (price === null) return { ok: false, reason: "invalid_price" };

  const quantity = item.QTY === undefined || item.QTY === "" ? 1 : parsePositiveInt(item.QTY);
  if (quantity === null) return { ok: false, reason: "invalid_quantity" };

  if (!/^\d{8}$/.test(item.ADJ_DT)) return { ok: false, reason: "invalid_date" };
  const auctionDate = parseYmdDate(item.ADJ_DT);
  if (Number.isNaN(auctionDate.getTime()) || formatDateYmd(auctionDate) !== item.ADJ_DT) {
    return { ok: false, reason: "invalid_date" };
  }

  return {
    ok: true,
    row: {
      productName: item.PUMMOK,
      variety: item.PUMJONG?.trim() || "",
      tempName: item.PUM_NAME_IMSI || null,
      unit: item.UUN || "kg",
      grade: item.DDD?.trim() || "",
      price,
      origin: item.SSANGI?.trim() || "",
      corporation: item.CORP_NM,
      corporationCode: corpCode,
      auctionDate,
      quantity,
      certification: item.INJUNG_GUBUN || null,
    },
  };
}

/**
 * 수집된 행을 배치로 저장. 기존 행·배치 내부 중복은 미리 제거하고, 저장 중 P2002만 중복으로 센다.
 * 그 밖의 DB 오류는 그대로 던진다.
 */
export async function saveRowsBatch(
  rows: NormalizedAuctionRow[],
  date: Date,
  corpCode: string
): Promise<{ newCount: number; duplicateCount: number }> {
  if (rows.length === 0) return { newCount: 0, duplicateCount: 0 };

  const existing = await prisma.auctionResult.findMany({
    where: { auctionDate: dayRange(date), corporationCode: corpCode },
    select: {
      productName: true, variety: true, corporation: true, auctionDate: true,
      price: true, origin: true, unit: true, grade: true, quantity: true,
    },
  });

  const seen = new Set(
    existing.map((e) =>
      rowKey({ ...e, variety: e.variety ?? "", origin: e.origin ?? "", grade: e.grade ?? "" } as NormalizedAuctionRow)
    )
  );

  const toInsert: NormalizedAuctionRow[] = [];
  let duplicateCount = 0;
  for (const row of rows) {
    const key = rowKey(row);
    if (seen.has(key)) {
      duplicateCount++;
    } else {
      seen.add(key);
      toInsert.push(row);
    }
  }

  if (toInsert.length === 0) return { newCount: 0, duplicateCount };

  try {
    const created = await prisma.auctionResult.createMany({ data: toInsert });
    return { newCount: created.count, duplicateCount };
  } catch (error) {
    if (!isPrismaUniqueViolation(error)) throw error;
  }

  // 동시 수집 등으로 unique 충돌 시 건별 저장으로 폴백 — P2002만 중복, 나머지는 전파
  let newCount = 0;
  for (const row of toInsert) {
    try {
      await prisma.auctionResult.create({ data: row });
      newCount++;
    } catch (error) {
      if (!isPrismaUniqueViolation(error)) throw error;
      duplicateCount++;
    }
  }
  return { newCount, duplicateCount };
}

const PARTIAL_GUIDANCE = "누락분은 같은 날짜·법인·품목으로 다시 수집하면 채워집니다 (이미 저장된 건은 중복으로 제외).";
const CAP_GUIDANCE = `페이지 상한(${MAX_PAGES}페이지)에 걸린 부분은 같은 조건으로 다시 수집해도 채워지지 않습니다. 품목을 나눠 범위를 줄이거나 상한 확대가 필요합니다.`;
const FAILED_GUIDANCE = "원인을 확인한 뒤 같은 조건으로 다시 수집하세요.";
const EMPTY_GUIDANCE = "수집된 거래가 0건입니다. 휴장 여부는 확정하지 않습니다.";

async function collectProduct(
  date: Date,
  corpCode: string,
  productName: string | undefined,
  deps: CollectorDeps
): Promise<ProductCollectionResult> {
  const base: ProductCollectionResult = {
    productName: productName ?? null,
    status: "FAILED",
    totalCount: 0,
    fetchedCount: 0,
    newCount: 0,
    duplicateCount: 0,
    totalPages: 0,
    fetchedPages: 0,
    failedPages: [],
    invalidCount: 0,
    capped: false,
    issues: [],
  };
  const baseOptions = { date, corporationCode: corpCode, productName };

  let firstPage: GarakApiResponse;
  try {
    firstPage = await fetchAuctionPage({ ...baseOptions, pageIndex: 1 }, deps);
  } catch (error) {
    return { ...base, failedPages: [1], issues: [redactSecrets(errorMessage(error))] };
  }

  const totalCount = firstPage.list_total_count;
  const totalPages = Math.ceil(totalCount / ACTUAL_PAGE_SIZE);
  const maxPages = Math.min(totalPages, MAX_PAGES);
  const issues: string[] = [];

  let items: AuctionItem[] = [...firstPage.items];
  let failedPages: number[] = [];
  if (maxPages >= 2) {
    const rest = await fetchRemainingPages(baseOptions, 2, maxPages, totalPages, deps);
    items = [...items, ...rest.items];
    failedPages = rest.failedPages;
    if (rest.failedPages.length > 0) {
      issues.push(`페이지 ${rest.failedPages.length}개 조회 실패 (${rest.failedPages.join(", ")})`);
    }
    if (rest.shortPages.length > 0) {
      issues.push(`페이지 ${rest.shortPages.join(", ")}에서 항목 누락 의심 (100건 미만 파싱)`);
    }
  }
  const capped = totalPages > maxPages;
  if (capped) {
    issues.push(`${totalPages}페이지 중 ${maxPages}페이지만 수집 (상한 ${MAX_PAGES}페이지, 동일 조건 재수집으로 채워지지 않음)`);
  }
  if (totalPages >= 1 && firstPage.items.length < ACTUAL_PAGE_SIZE && totalPages > 1) {
    issues.push("페이지 1에서 항목 누락 의심 (100건 미만 파싱)");
  }
  // 일반 누락 판정: 상한·페이지 실패와 무관하게 API 총 건수보다 파싱 항목이 적으면 PARTIAL
  // (중복 제거 전 파싱 항목 기준 — 단일 페이지 5건 중 3건, 마지막 페이지 3건 부족 같은 경우를 잡는다)
  if (items.length < totalCount) {
    issues.push(`API 총 ${totalCount}건 중 ${items.length}건만 파싱됨 (누락 ${totalCount - items.length}건)`);
  }

  const rows: NormalizedAuctionRow[] = [];
  const invalidReasons = new Map<string, number>();
  for (const item of items) {
    const outcome = normalizeItem(item, corpCode);
    if (outcome.ok) {
      rows.push(outcome.row);
    } else {
      invalidReasons.set(outcome.reason, (invalidReasons.get(outcome.reason) ?? 0) + 1);
    }
  }
  const invalidCount = items.length - rows.length;
  if (invalidCount > 0) {
    const breakdown = Array.from(invalidReasons.entries()).map(([reason, n]) => `${reason} ${n}`).join(", ");
    issues.push(`유효하지 않은 항목 ${invalidCount}건 제외 (${breakdown})`);
  }

  let saved: { newCount: number; duplicateCount: number };
  try {
    saved = await saveRowsBatch(rows, date, corpCode);
  } catch (error) {
    logger.error(`[Garak DB] 저장 실패 (${corpCode}/${productName || "전체"}):`, redactSecrets(errorMessage(error)));
    return {
      ...base,
      totalCount,
      fetchedCount: rows.length,
      totalPages,
      fetchedPages: maxPages - failedPages.length,
      failedPages,
      invalidCount,
      capped,
      issues: [...issues, `저장 실패: ${redactSecrets(errorMessage(error))}`],
    };
  }

  const status: CollectionStatus =
    issues.length > 0 ? "PARTIAL" : totalCount === 0 ? "EMPTY" : "SUCCESS";

  return {
    productName: productName ?? null,
    status,
    totalCount,
    fetchedCount: rows.length,
    newCount: saved.newCount,
    duplicateCount: saved.duplicateCount,
    totalPages,
    fetchedPages: maxPages - failedPages.length,
    failedPages,
    invalidCount,
    capped,
    issues,
  };
}

export function aggregateStatus(statuses: CollectionStatus[]): CollectionStatus {
  if (statuses.length === 0) return "EMPTY";
  if (statuses.every((s) => s === "FAILED")) return "FAILED";
  if (statuses.some((s) => s === "FAILED" || s === "PARTIAL")) return "PARTIAL";
  if (statuses.every((s) => s === "EMPTY")) return "EMPTY";
  return "SUCCESS";
}

function guidanceFor(status: CollectionStatus, capped: boolean = false): string | null {
  switch (status) {
    case "PARTIAL": return capped ? `${PARTIAL_GUIDANCE} ${CAP_GUIDANCE}` : PARTIAL_GUIDANCE;
    case "FAILED": return FAILED_GUIDANCE;
    case "EMPTY": return EMPTY_GUIDANCE;
    default: return null;
  }
}

function productLabel(product: ProductCollectionResult): string {
  return product.productName ?? "전체";
}

async function collectCorporation(
  date: Date,
  corpCode: string,
  productNames: (string | undefined)[],
  productParam: string | undefined,
  deps: CollectorDeps
): Promise<CorporationCollectionResult> {
  const products: ProductCollectionResult[] = [];
  for (const productName of productNames) {
    products.push(await collectProduct(date, corpCode, productName, deps));
  }

  const status = aggregateStatus(products.map((p) => p.status));
  const issues = products.flatMap((p) =>
    p.issues.map((issue) => (productNames.length > 1 ? `${productLabel(p)}: ${issue}` : issue))
  );
  const result: CorporationCollectionResult = {
    corporationCode: corpCode,
    corporationName: CORPORATION_CODES[corpCode] ?? corpCode,
    status,
    totalCount: products.reduce((sum, p) => sum + p.totalCount, 0),
    newCount: products.reduce((sum, p) => sum + p.newCount, 0),
    duplicateCount: products.reduce((sum, p) => sum + p.duplicateCount, 0),
    issues,
    products,
  };

  logger.info(
    `[Garak] Corp ${corpCode}: status=${status}, total=${result.totalCount}, new=${result.newCount}, dup=${result.duplicateCount}`
  );

  const guidance = guidanceFor(status, products.some((p) => p.capped));
  const errorMessageText = [...issues, ...(guidance && status !== "SUCCESS" ? [guidance] : [])].join(" | ");
  try {
    await prisma.dataCollectionLog.create({
      data: {
        targetDate: date,
        corporation: corpCode,
        targetProducts: productParam || null,
        totalCount: result.totalCount,
        newCount: result.newCount,
        duplicateCount: result.duplicateCount,
        status,
        errorMessage: errorMessageText || null,
        completedAt: new Date(),
      },
    });
  } catch (error) {
    logger.error(`[Garak] 수집 로그 기록 실패 (${corpCode}):`, error);
  }

  return result;
}

// 같은 날짜·법인·품목 수집의 프로세스 내 중복 실행 억제
const inFlight = new Map<string, Promise<CollectionResult>>();

function collectionKey(date: Date, corporationCodes: string[], productName?: string): string {
  const products = (productName ?? "").split(",").map((p) => p.trim()).filter(Boolean).sort().join(",");
  return `${formatDateKey(date)}|${[...corporationCodes].sort().join(",")}|${products}`;
}

export function getInFlightCollectionCount(): number {
  return inFlight.size;
}

/**
 * 경매 데이터 수집 및 저장.
 * productName이 쉼표로 구분된 여러 품목이면 각각 개별 API 호출.
 */
export async function collectAndSaveAuctionData(
  date: Date,
  corporationCodes: string[] = ["11000101"],
  productName?: string,
  deps: CollectorDeps = {}
): Promise<CollectionResult> {
  const key = collectionKey(date, corporationCodes, productName);
  const running = inFlight.get(key);
  if (running) {
    logger.info(`[Garak] 같은 조건의 수집이 진행 중이라 결과를 공유합니다: ${key}`);
    const shared = await running;
    return { ...shared, deduplicated: true };
  }

  const run = (async (): Promise<CollectionResult> => {
    const productNames = productName
      ? productName.split(",").map((p) => p.trim()).filter(Boolean)
      : [undefined];

    const corporations: CorporationCollectionResult[] = [];
    for (const corpCode of corporationCodes) {
      corporations.push(await collectCorporation(date, corpCode, productNames, productName, deps));
    }

    const status = aggregateStatus(corporations.map((c) => c.status));
    const issues = corporations.flatMap((c) =>
      c.issues.map((issue) => (corporationCodes.length > 1 ? `${c.corporationName}: ${issue}` : issue))
    );

    return {
      status,
      totalCount: corporations.reduce((sum, c) => sum + c.totalCount, 0),
      newCount: corporations.reduce((sum, c) => sum + c.newCount, 0),
      duplicateCount: corporations.reduce((sum, c) => sum + c.duplicateCount, 0),
      noAuction: status === "EMPTY",
      complete: status === "SUCCESS" || status === "EMPTY",
      issues,
      guidance: guidanceFor(status, corporations.some((c) => c.products.some((p) => p.capped))),
      corporations,
      deduplicated: false,
    };
  })();

  inFlight.set(key, run);
  try {
    return await run;
  } finally {
    inFlight.delete(key);
  }
}

/**
 * 오래된 경매 데이터 전역 정리.
 * AuctionResult는 전체 사용자가 공유하므로 모든 사용자 설정 중 가장 긴 보관 기간을 기준으로 삭제한다.
 * 호출자는 수집이 완전 성공(result.complete)했을 때만 호출한다.
 */
export async function cleanupOldAuctionData(): Promise<{ deletedCount: number; retentionDays: number }> {
  const allSettings = await prisma.marketCollectionSettings.findMany({ select: { retentionDays: true } });
  const retentionDays = allSettings.length > 0 ? Math.max(...allSettings.map((s) => s.retentionDays)) : 90;

  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - retentionDays);
  cutoffDate.setHours(0, 0, 0, 0);

  const result = await prisma.auctionResult.deleteMany({ where: { auctionDate: { lt: cutoffDate } } });
  if (result.count > 0) {
    logger.info(`[Garak] Cleaned up ${result.count} records older than ${retentionDays} days`);
  }
  return { deletedCount: result.count, retentionDays };
}
