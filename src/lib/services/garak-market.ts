/**
 * 가락시장 공공데이터 API 서비스
 * http://www.garak.co.kr/homepage/publicdata/dataOpen.do
 *
 * 참고: 문서에는 euc-kr이라고 하지만 실제로 UTF-8 인코딩이 작동함
 */

import prisma from "@/lib/prisma";
import { logger } from "@/lib/logger";
import { MARKET_PRODUCTS } from "@/lib/constants/market-products";

const GARAK_API_URL = "http://www.garak.co.kr/homepage/publicdata/dataOpen.do";

// 가락시장 API는 pagesize 파라미터를 무시하고 항상 10건씩 반환함
const ACTUAL_PAGE_SIZE = 10;
// 페이지 폭주 방지 상한 (100페이지 = 1000건)
const MAX_PAGES = 100;
// 페이지 병렬 요청 동시성
const PAGE_FETCH_CONCURRENCY = 5;

function getGarakCredentials(): { id: string; password: string } {
  const id = process.env.GARAK_API_ID;
  const password = process.env.GARAK_API_PASSWORD;
  if (!id || !password) {
    throw new Error(
      "GARAK_API_ID / GARAK_API_PASSWORD 환경변수가 설정되지 않았습니다."
    );
  }
  return { id, password };
}

// 법인코드 매핑
export const CORPORATION_CODES: Record<string, string> = {
  "11000101": "서울청과",
  "11000102": "농협(공)",
  "11000103": "중앙청과",
  "11000104": "동부팜창고",
  "11000105": "한국청과",
  "11000106": "대아청과",
};

// 주요 품목 목록 (공용 상수 재노출 — 기존 import 경로 호환)
export const MAJOR_PRODUCTS: readonly string[] = MARKET_PRODUCTS;

interface AuctionItem {
  PUMMOK: string; // 품목명
  PUMJONG?: string; // 품종명
  PUM_NAME_IMSI?: string; // 임시품목명
  UUN: string; // 거래단량
  DDD?: string; // 등급단위
  PPRICE: string; // 경락가
  SSANGI?: string; // 산지명
  CORP_NM: string; // 법인명
  ADJ_DT: string; // 경매일자 (YYYYMMDD)
  QTY?: string; // 수량
  INJUNG_GUBUN?: string; // 인증구분
}

interface GarakApiResponse {
  list_total_count: number;
  items: AuctionItem[];
}

/**
 * XML 응답을 파싱하여 데이터 추출 (테스트를 위해 export)
 */
export function parseXmlResponse(xmlText: string): GarakApiResponse {
  const totalCountMatch = xmlText.match(
    /<list_total_count>(\d+)<\/list_total_count>/
  );
  const totalCount = totalCountMatch ? parseInt(totalCountMatch[1], 10) : 0;

  const items: AuctionItem[] = [];

  // <list> 또는 <row> 태그 중 더 많은 쪽 사용
  let listRegex = /<list>([\s\S]*?)<\/list>/g;
  const listMatches = xmlText.match(/<list>/gi);
  const rowMatches = xmlText.match(/<row>/gi);
  if ((rowMatches?.length || 0) > (listMatches?.length || 0)) {
    listRegex = /<row>([\s\S]*?)<\/row>/g;
  }

  let match;
  while ((match = listRegex.exec(xmlText)) !== null) {
    const listContent = match[1];

    // CDATA 형식 지원: <TAG><![CDATA[value]]></TAG> 또는 <TAG>value</TAG>
    const getTagValue = (tag: string): string => {
      const cdataMatch = listContent.match(
        new RegExp(`<${tag}><!\\[CDATA\\[(.*?)\\]\\]></${tag}>`, "is")
      );
      if (cdataMatch) return cdataMatch[1].trim();
      const normalMatch = listContent.match(
        new RegExp(`<${tag}>([^<]*)</${tag}>`, "i")
      );
      return normalMatch ? normalMatch[1].trim() : "";
    };

    const item: AuctionItem = {
      PUMMOK: getTagValue("PUMMOK"),
      PUMJONG: getTagValue("PUMJONG") || undefined,
      PUM_NAME_IMSI: getTagValue("PUM_NAME_IMSI") || undefined,
      UUN: getTagValue("UUN"),
      DDD: getTagValue("DDD") || undefined,
      PPRICE: getTagValue("PPRICE"),
      SSANGI: getTagValue("SSANGI") || undefined,
      CORP_NM: getTagValue("CORP_NM"),
      ADJ_DT: getTagValue("ADJ_DT"),
      QTY: getTagValue("QTY") || undefined,
      INJUNG_GUBUN: getTagValue("INJUNG_GUBUN") || undefined,
    };

    if (item.PUMMOK && item.PPRICE && item.ADJ_DT) {
      items.push(item);
    }
  }

  return { list_total_count: totalCount, items };
}

/**
 * 날짜를 YYYYMMDD 형식으로 변환 (서버 로컬 타임존 기준)
 */
function formatDateYmd(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}${month}${day}`;
}

/**
 * Date → "YYYY-MM-DD" 키 (서버 로컬 타임존 기준)
 * toISOString()은 UTC로 변환되어 KST 환경에서 날짜가 하루 밀리므로 사용 금지
 */
export function formatDateKey(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

/**
 * YYYYMMDD 문자열을 로컬 자정 Date로 변환
 */
export function parseYmdDate(dateStr: string): Date {
  const year = parseInt(dateStr.substring(0, 4), 10);
  const month = parseInt(dateStr.substring(4, 6), 10) - 1;
  const day = parseInt(dateStr.substring(6, 8), 10);
  return new Date(year, month, day);
}

function dayRange(date: Date): { gte: Date; lte: Date } {
  const start = new Date(date);
  start.setHours(0, 0, 0, 0);
  const end = new Date(date);
  end.setHours(23, 59, 59, 999);
  return { gte: start, lte: end };
}

interface FetchOptions {
  date: Date;
  corporationCode?: string;
  productName?: string;
  origin?: string;
  pageIndex?: number;
}

/**
 * 가락시장 API 호출 (1페이지 = 10건)
 */
export async function fetchAuctionData(
  options: FetchOptions
): Promise<GarakApiResponse> {
  const {
    date,
    corporationCode = "11000101", // 기본: 서울청과
    productName,
    origin,
    pageIndex = 1,
  } = options;

  const credentials = getGarakCredentials();

  const params = new URLSearchParams({
    id: credentials.id,
    passwd: credentials.password,
    dataid: "data12",
    pagesize: "1000", // API가 무시하지만 호환성을 위해 유지
    pageidx: pageIndex.toString(),
    "portal.templet": "false",
    s_date: formatDateYmd(date),
    s_bubin: corporationCode,
  });

  if (productName) params.append("s_pummok", productName);
  if (origin) params.append("s_sangi", origin);

  const url = `${GARAK_API_URL}?${params.toString()}`;

  try {
    const response = await fetch(url, {
      method: "GET",
      headers: { Accept: "application/xml" },
    });

    if (!response.ok) {
      throw new Error(`API request failed: ${response.status}`);
    }

    const xmlText = await response.text();
    return parseXmlResponse(xmlText);
  } catch (error) {
    logger.error("[Garak API] Fetch failed:", error);
    throw error;
  }
}

/**
 * 남은 페이지들을 제한된 동시성으로 병렬 조회.
 * 일부 페이지 실패 시 성공한 페이지는 유지한다 (부분 수집 보존).
 */
async function fetchRemainingPages(
  baseOptions: Omit<FetchOptions, "pageIndex">,
  fromPage: number,
  toPage: number
): Promise<{ items: AuctionItem[]; failedPages: number[] }> {
  const pages: number[] = [];
  for (let p = fromPage; p <= toPage; p++) pages.push(p);

  const items: AuctionItem[] = [];
  const failedPages: number[] = [];
  for (let i = 0; i < pages.length; i += PAGE_FETCH_CONCURRENCY) {
    const chunk = pages.slice(i, i + PAGE_FETCH_CONCURRENCY);
    const results = await Promise.allSettled(
      chunk.map((pageIndex) =>
        fetchAuctionData({ ...baseOptions, pageIndex })
      )
    );
    results.forEach((r, idx) => {
      if (r.status === "fulfilled") {
        items.push(...r.value.items);
      } else {
        failedPages.push(chunk[idx]);
      }
    });
  }

  if (failedPages.length > 0) {
    logger.warn(
      `[Garak API] ${failedPages.length} page(s) failed: ${failedPages.join(", ")}`
    );
  }
  return { items, failedPages };
}

interface NormalizedAuctionRow {
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

/**
 * 중복 판정용 복합 키 (unique 제약과 동일한 필드 조합)
 */
function rowKey(r: NormalizedAuctionRow): string {
  return [
    r.productName,
    r.variety,
    r.corporation,
    formatDateKey(r.auctionDate),
    r.price,
    r.origin,
    r.unit,
    r.grade,
    r.quantity,
  ].join("|");
}

function normalizeItem(
  item: AuctionItem,
  corpCode: string
): NormalizedAuctionRow | null {
  if (!item.PUMMOK || !item.PPRICE || !item.ADJ_DT) return null;
  return {
    productName: item.PUMMOK,
    variety: item.PUMJONG?.trim() || "",
    tempName: item.PUM_NAME_IMSI || null,
    unit: item.UUN || "kg",
    grade: item.DDD?.trim() || "",
    price: parseInt(item.PPRICE, 10) || 0,
    origin: item.SSANGI?.trim() || "",
    corporation: item.CORP_NM,
    corporationCode: corpCode,
    auctionDate: parseYmdDate(item.ADJ_DT),
    quantity: parseInt(item.QTY || "1", 10) || 1,
    certification: item.INJUNG_GUBUN || null,
  };
}

/**
 * 수집된 행을 배치로 저장.
 * 1) 해당 날짜+법인의 기존 행 키를 한 번에 조회
 * 2) 배치 내부/기존 데이터와 중복 제거
 * 3) createMany로 일괄 삽입 (기존 건별 findUnique+create 대비 쿼리 수 대폭 감소)
 */
async function saveRowsBatch(
  rows: NormalizedAuctionRow[],
  date: Date,
  corpCode: string
): Promise<{ newCount: number; duplicateCount: number }> {
  if (rows.length === 0) return { newCount: 0, duplicateCount: 0 };

  const existing = await prisma.auctionResult.findMany({
    where: { auctionDate: dayRange(date), corporationCode: corpCode },
    select: {
      productName: true,
      variety: true,
      corporation: true,
      auctionDate: true,
      price: true,
      origin: true,
      unit: true,
      grade: true,
      quantity: true,
    },
  });

  const seen = new Set(
    existing.map((e) =>
      rowKey({
        ...e,
        variety: e.variety ?? "",
        origin: e.origin ?? "",
        grade: e.grade ?? "",
      } as NormalizedAuctionRow)
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
    // 동시 수집 등으로 unique 충돌 시 건별 저장으로 폴백
    logger.warn("[Garak DB] createMany failed, falling back to per-row:", error);
    let newCount = 0;
    for (const row of toInsert) {
      try {
        await prisma.auctionResult.create({ data: row });
        newCount++;
      } catch {
        duplicateCount++;
      }
    }
    return { newCount, duplicateCount };
  }
}

/**
 * 경매 데이터 수집 및 저장
 * productName이 쉼표로 구분된 여러 품목인 경우 각각 개별 API 호출
 */
export async function collectAndSaveAuctionData(
  date: Date,
  corporationCodes: string[] = ["11000101"],
  productName?: string
): Promise<{
  totalCount: number;
  newCount: number;
  duplicateCount: number;
  noAuction: boolean;
}> {
  let totalCount = 0;
  let totalNewCount = 0;
  let totalDuplicateCount = 0;

  // 가락시장 API는 단일 품목만 지원하므로 쉼표 구분 품목은 분리 호출
  const productNames = productName
    ? productName.split(",").map((p) => p.trim()).filter(Boolean)
    : [undefined]; // undefined면 전체 품목

  for (const corpCode of corporationCodes) {
    let corpNewCount = 0;
    let corpDuplicateCount = 0;
    let corpTotalCount = 0;

    try {
      for (const singleProduct of productNames) {
        const baseOptions = {
          date,
          corporationCode: corpCode,
          productName: singleProduct,
        };

        const firstPage = await fetchAuctionData({ ...baseOptions, pageIndex: 1 });
        corpTotalCount += firstPage.list_total_count;

        const totalPages = Math.ceil(
          firstPage.list_total_count / ACTUAL_PAGE_SIZE
        );
        const maxPages = Math.min(totalPages, MAX_PAGES);

        let allItems: AuctionItem[] = [...firstPage.items];
        if (maxPages >= 2) {
          const rest = await fetchRemainingPages(baseOptions, 2, maxPages);
          allItems = [...allItems, ...rest.items];
        }

        if (totalPages > maxPages) {
          logger.warn(
            `[Garak API] Corp ${corpCode} ${singleProduct || "전체"}: ${totalPages}페이지 중 ${maxPages}페이지만 수집 (상한 초과)`
          );
        }

        const rows = allItems
          .map((item) => normalizeItem(item, corpCode))
          .filter((r): r is NormalizedAuctionRow => r !== null);

        const { newCount, duplicateCount } = await saveRowsBatch(
          rows,
          date,
          corpCode
        );
        corpNewCount += newCount;
        corpDuplicateCount += duplicateCount;
      }

      logger.info(
        `[Garak] Corp ${corpCode}: total=${corpTotalCount}, new=${corpNewCount}, dup=${corpDuplicateCount}`
      );
      totalCount += corpTotalCount;
      totalNewCount += corpNewCount;
      totalDuplicateCount += corpDuplicateCount;

      // 수집 로그 저장 — 결과 0건이면 NO_AUCTION
      // (특정 품목만 수집한 경우 해당 품목 무거래일 수도 있으므로,
      //  휴장일 판정은 조회 시점에 "그 날짜에 데이터가 전혀 없는지"로 재검증함)
      const status = corpTotalCount === 0 ? "NO_AUCTION" : "SUCCESS";
      await prisma.dataCollectionLog.create({
        data: {
          targetDate: date,
          corporation: corpCode,
          targetProducts: productName || null,
          totalCount: corpTotalCount,
          newCount: corpNewCount,
          duplicateCount: corpDuplicateCount,
          status,
          completedAt: new Date(),
        },
      });
    } catch (error) {
      logger.error(`[Garak] Corp ${corpCode} collection failed:`, error);
      await prisma.dataCollectionLog.create({
        data: {
          targetDate: date,
          corporation: corpCode,
          targetProducts: productName || null,
          totalCount: 0,
          newCount: 0,
          duplicateCount: 0,
          status: "FAILED",
          errorMessage: error instanceof Error ? error.message : "Unknown error",
          completedAt: new Date(),
        },
      });
    }
  }

  return {
    totalCount,
    newCount: totalNewCount,
    duplicateCount: totalDuplicateCount,
    noAuction: totalCount === 0,
  };
}

/**
 * 오래된 경매 데이터 전역 정리.
 * AuctionResult는 전체 사용자가 공유하므로, 특정 사용자의 retentionDays가 아니라
 * 모든 사용자 설정 중 가장 긴 보관 기간을 기준으로 삭제한다.
 */
export async function cleanupOldAuctionData(): Promise<{
  deletedCount: number;
  retentionDays: number;
}> {
  const allSettings = await prisma.marketCollectionSettings.findMany({
    select: { retentionDays: true },
  });

  const retentionDays =
    allSettings.length > 0
      ? Math.max(...allSettings.map((s) => s.retentionDays))
      : 90;

  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - retentionDays);
  cutoffDate.setHours(0, 0, 0, 0);

  const result = await prisma.auctionResult.deleteMany({
    where: { auctionDate: { lt: cutoffDate } },
  });

  if (result.count > 0) {
    logger.info(
      `[Garak] Cleaned up ${result.count} records older than ${retentionDays} days`
    );
  }

  return { deletedCount: result.count, retentionDays };
}

/**
 * 단위 문자열에서 kg 값 추출 (예: "10kg" -> 10, "5KG" -> 5)
 */
export function parseKgFromUnit(unit: string): number | null {
  if (!unit) return null;
  const match = unit.toLowerCase().match(/(\d+(?:\.\d+)?)\s*kg/);
  return match ? parseFloat(match[1]) : null;
}

function weightedAveragePrice(
  items: { price: number; quantity: number }[]
): number {
  const totalQuantity = items.reduce((sum, i) => sum + i.quantity, 0);
  if (totalQuantity <= 0) return 0;
  const totalWeighted = items.reduce(
    (sum, i) => sum + i.price * i.quantity,
    0
  );
  return Math.round(totalWeighted / totalQuantity);
}

/**
 * 품목별 일자별 평균가격 조회 (가중평균 + kg당 단가)
 */
export async function getProductPriceHistory(
  productName: string,
  days: number = 30,
  variety?: string,
  origin?: string,
  varieties?: string[],
  unit?: string
) {
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - days);
  startDate.setHours(0, 0, 0, 0);

  const where: {
    productName: string;
    auctionDate: { gte: Date };
    variety?: string | { in: string[] };
    origin?: { contains: string };
    unit?: string;
  } = {
    productName,
    auctionDate: { gte: startDate },
  };

  // 다중 품종 필터 (varieties 배열)가 있으면 우선 사용
  if (varieties && varieties.length > 0) {
    where.variety = { in: varieties };
  } else if (variety) {
    where.variety = variety;
  }

  if (origin) {
    // 부분 일치 검색 (예: "충남" 입력 시 "충남 논산", "충남 예산" 등 매칭)
    where.origin = { contains: origin };
  }

  if (unit) {
    where.unit = unit;
  }

  const records = await prisma.auctionResult.findMany({
    where,
    select: {
      auctionDate: true,
      price: true,
      quantity: true,
      unit: true,
    },
    orderBy: { auctionDate: "desc" },
  });

  // 날짜별로 그룹화 (서버 로컬 타임존 기준 날짜 키)
  const dateGroups = new Map<string, typeof records>();
  for (const record of records) {
    const dateKey = formatDateKey(record.auctionDate);
    const group = dateGroups.get(dateKey) || [];
    group.push(record);
    dateGroups.set(dateKey, group);
  }

  const results = Array.from(dateGroups.entries()).map(([dateKey, items]) => {
    const prices = items.map((i) => i.price);
    const totalQuantity = items.reduce((sum, i) => sum + i.quantity, 0);
    const weightedAvgPrice = weightedAveragePrice(items);

    // kg당 단가 계산 (단위에서 kg 추출)
    let totalKg = 0;
    let totalKgValue = 0;
    for (const item of items) {
      const kg = parseKgFromUnit(item.unit || "");
      if (kg && kg > 0) {
        totalKg += kg * item.quantity;
        totalKgValue += item.price * item.quantity;
      }
    }
    const pricePerKg = totalKg > 0 ? Math.round(totalKgValue / totalKg) : null;

    return {
      date: dateKey,
      avgPrice: weightedAvgPrice,
      maxPrice: Math.max(...prices),
      minPrice: Math.min(...prices),
      tradeCount: items.length,
      totalQuantity,
      pricePerKg,
    };
  });

  results.sort((a, b) => b.date.localeCompare(a.date));

  // 해당 기간 내 휴장일 후보 (NO_AUCTION 로그)
  const noAuctionLogs = await prisma.dataCollectionLog.findMany({
    where: {
      targetDate: { gte: startDate },
      status: "NO_AUCTION",
    },
    select: { targetDate: true },
    distinct: ["targetDate"],
  });

  // 특정 품목만 수집한 날 그 품목이 무거래였던 경우도 NO_AUCTION으로 기록되므로,
  // "그 날짜에 어떤 품목 데이터도 없는 경우"만 실제 휴장일로 판정
  const datesWithData = await prisma.auctionResult.findMany({
    where: { auctionDate: { gte: startDate } },
    select: { auctionDate: true },
    distinct: ["auctionDate"],
  });
  const withDataSet = new Set(
    datesWithData.map((d) => formatDateKey(d.auctionDate))
  );

  const noAuctionDates = Array.from(
    new Set(noAuctionLogs.map((log) => formatDateKey(log.targetDate)))
  ).filter((d) => !withDataSet.has(d));

  return { history: results, noAuctionDates };
}

/**
 * 관심 품목용 최신 시세 정보 (일자별 가중평균 기준 변동률)
 */
export async function getWatchlistPriceInfo(
  productName: string,
  variety?: string,
  origin?: string
): Promise<{
  latestPrice: number | null;
  latestDate: Date | null;
  unit: string | null;
  latestVariety: string | null;
  priceChange: number | null;
}> {
  const where = {
    productName,
    ...(variety ? { variety } : {}),
    ...(origin ? { origin } : {}),
  };

  const latest = await prisma.auctionResult.findFirst({
    where,
    orderBy: { auctionDate: "desc" },
    select: { auctionDate: true },
  });

  if (!latest) {
    return {
      latestPrice: null,
      latestDate: null,
      unit: null,
      latestVariety: null,
      priceChange: null,
    };
  }

  const latestRows = await prisma.auctionResult.findMany({
    where: { ...where, auctionDate: dayRange(latest.auctionDate) },
    select: { price: true, quantity: true, unit: true, variety: true },
  });

  const latestAvg = weightedAveragePrice(latestRows);

  // 대표 단위/품종: 거래량이 가장 많은 행 기준
  const representative = latestRows.reduce(
    (best, row) => (row.quantity > best.quantity ? row : best),
    latestRows[0]
  );

  const prev = await prisma.auctionResult.findFirst({
    where: { ...where, auctionDate: { lt: dayRange(latest.auctionDate).gte } },
    orderBy: { auctionDate: "desc" },
    select: { auctionDate: true },
  });

  let priceChange: number | null = null;
  if (prev) {
    const prevRows = await prisma.auctionResult.findMany({
      where: { ...where, auctionDate: dayRange(prev.auctionDate) },
      select: { price: true, quantity: true },
    });
    const prevAvg = weightedAveragePrice(prevRows);
    if (prevAvg > 0) {
      priceChange = ((latestAvg - prevAvg) / prevAvg) * 100;
    }
  }

  return {
    latestPrice: latestAvg || null,
    latestDate: latest.auctionDate,
    unit: representative?.unit || null,
    latestVariety: representative?.variety || null,
    priceChange,
  };
}

/**
 * 품목별 품종 목록 조회
 */
export async function getProductVarieties(productName: string) {
  const varieties = await prisma.auctionResult.findMany({
    where: { productName },
    distinct: ["variety"],
    select: { variety: true },
  });

  return varieties
    .map((v) => v.variety)
    .filter((v): v is string => v !== null && v !== "");
}

/**
 * 품목별 산지 목록 조회
 */
export async function getProductOrigins(productName: string) {
  const origins = await prisma.auctionResult.findMany({
    where: { productName },
    distinct: ["origin"],
    select: { origin: true },
  });

  return origins
    .map((o) => o.origin)
    .filter((o): o is string => o !== null && o !== "");
}

/**
 * 저장된 품목 목록 조회
 */
export async function getAvailableProducts() {
  const products = await prisma.auctionResult.findMany({
    distinct: ["productName"],
    select: { productName: true },
    orderBy: { productName: "asc" },
  });

  return products.map((p) => p.productName);
}

/**
 * 특정 날짜의 품목별 시세 요약
 */
export async function getDailySummary(date: Date, productNames?: string[]) {
  const where: {
    auctionDate: { gte: Date; lte: Date };
    productName?: { in: string[] };
  } = {
    auctionDate: dayRange(date),
  };

  if (productNames && productNames.length > 0) {
    where.productName = { in: productNames };
  }

  const results = await prisma.auctionResult.groupBy({
    by: ["productName"],
    where,
    _avg: { price: true },
    _max: { price: true },
    _min: { price: true },
    _count: { price: true },
    _sum: { quantity: true },
  });

  return results.map((r) => ({
    productName: r.productName,
    avgPrice: Math.round(r._avg.price || 0),
    maxPrice: r._max.price || 0,
    minPrice: r._min.price || 0,
    tradeCount: r._count.price,
    totalQuantity: r._sum.quantity || 0,
  }));
}

/**
 * 최근 수집된 데이터 날짜 조회
 */
export async function getLatestCollectionDate(): Promise<Date | null> {
  const latest = await prisma.auctionResult.findFirst({
    orderBy: { auctionDate: "desc" },
    select: { auctionDate: true },
  });

  return latest?.auctionDate || null;
}
