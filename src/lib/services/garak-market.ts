/**
 * 가락시장 공공데이터 API 서비스
 * http://www.garak.co.kr/homepage/publicdata/dataOpen.do
 *
 * 참고: 문서에는 euc-kr이라고 하지만 실제로 UTF-8 인코딩이 작동함
 */

import prisma from "@/lib/prisma";

// API 설정
const GARAK_API_URL = "http://www.garak.co.kr/homepage/publicdata/dataOpen.do";
const GARAK_API_ID = process.env.GARAK_API_ID || "5735";
const GARAK_API_PASSWORD = process.env.GARAK_API_PASSWORD || "Hodu135977!";

// 법인코드 매핑
export const CORPORATION_CODES: Record<string, string> = {
  "11000101": "서울청과",
  "11000102": "농협(공)",
  "11000103": "중앙청과",
  "11000104": "동부팜창고",
  "11000105": "한국청과",
  "11000106": "대아청과",
};

// 주요 품목 목록
export const MAJOR_PRODUCTS = [
  "토마토",
  "딸기",
  "수박",
  "참외",
  "오이",
  "고추",
  "배추",
  "상추",
  "시금치",
  "양배추",
  "무",
  "당근",
  "감자",
  "고구마",
  "사과",
  "배",
  "포도",
  "감귤",
  "복숭아",
  "자두",
  "멜론",
  "파프리카",
  "브로콜리",
  "호박",
  "가지",
];

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
 * XML 응답을 파싱하여 데이터 추출
 */
function parseXmlResponse(xmlText: string): GarakApiResponse {
  // list_total_count 추출
  const totalCountMatch = xmlText.match(/<list_total_count>(\d+)<\/list_total_count>/);
  const totalCount = totalCountMatch ? parseInt(totalCountMatch[1], 10) : 0;

  // 디버그: XML 길이 및 처음 부분 확인
  console.log(`[Garak XML] Response length: ${xmlText.length} chars`);

  // 각 list 항목 추출 - row 태그도 시도
  const items: AuctionItem[] = [];

  // <list> 또는 <row> 태그 모두 확인
  let listRegex = /<list>([\s\S]*?)<\/list>/g;
  let match;

  // 먼저 <list> 태그 개수 확인
  const listMatches = xmlText.match(/<list>/gi);
  const rowMatches = xmlText.match(/<row>/gi);

  console.log(`[Garak XML] Found <list> tags: ${listMatches?.length || 0}, <row> tags: ${rowMatches?.length || 0}`);

  // <row> 태그가 더 많으면 <row> 사용
  if ((rowMatches?.length || 0) > (listMatches?.length || 0)) {
    listRegex = /<row>([\s\S]*?)<\/row>/g;
    console.log(`[Garak XML] Using <row> tags instead of <list>`);
  }

  while ((match = listRegex.exec(xmlText)) !== null) {
    const listContent = match[1];

    // CDATA 형식 지원: <TAG><![CDATA[value]]></TAG> 또는 <TAG>value</TAG>
    const getTagValue = (tag: string): string => {
      // CDATA 형식 먼저 시도 - ]]> 까지 모든 문자 매칭
      const cdataMatch = listContent.match(new RegExp(`<${tag}><!\\[CDATA\\[(.*?)\\]\\]></${tag}>`, 'is'));
      if (cdataMatch) {
        return cdataMatch[1].trim();
      }
      // 일반 형식
      const normalMatch = listContent.match(new RegExp(`<${tag}>([^<]*)</${tag}>`, 'i'));
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

    // 유효한 데이터만 추가 (PUMMOK과 PPRICE가 필수)
    if (item.PUMMOK && item.PPRICE && item.ADJ_DT) {
      items.push(item);
    }
  }

  console.log(`[Garak XML] Parsed ${items.length} valid items from ${totalCount} total`);

  return { list_total_count: totalCount, items };
}

/**
 * 날짜를 YYYYMMDD 형식으로 변환
 */
function formatDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}${month}${day}`;
}

/**
 * YYYYMMDD 문자열을 Date로 변환
 */
function parseDate(dateStr: string): Date {
  const year = parseInt(dateStr.substring(0, 4), 10);
  const month = parseInt(dateStr.substring(4, 6), 10) - 1;
  const day = parseInt(dateStr.substring(6, 8), 10);
  return new Date(year, month, day);
}

interface FetchOptions {
  date: Date;
  corporationCode?: string;
  productName?: string;
  origin?: string;
  pageSize?: number; // 참고: 가락시장 API는 실제로 10개씩만 반환
  pageIndex?: number;
}

/**
 * 가락시장 API 호출
 */
export async function fetchAuctionData(options: FetchOptions): Promise<GarakApiResponse> {
  const {
    date,
    corporationCode = "11000101", // 기본: 서울청과
    productName,
    origin,
    pageSize = 1000,
    pageIndex = 1,
  } = options;

  // URLSearchParams는 기본적으로 UTF-8 인코딩 사용 (실제 API 동작에 맞음)
  const params = new URLSearchParams({
    id: GARAK_API_ID,
    passwd: GARAK_API_PASSWORD,
    dataid: "data12",
    pagesize: pageSize.toString(),
    pageidx: pageIndex.toString(),
    "portal.templet": "false",
    s_date: formatDate(date),
    s_bubin: corporationCode,
  });

  if (productName) {
    params.append("s_pummok", productName);
  }

  if (origin) {
    params.append("s_sangi", origin);
  }

  const url = `${GARAK_API_URL}?${params.toString()}`;

  console.log(`[Garak API] Request URL: ${url}`);
  console.log(`[Garak API] Product filter: ${productName || "전체"}`);

  try {
    const response = await fetch(url, {
      method: "GET",
      headers: {
        "Accept": "application/xml",
      },
    });

    if (!response.ok) {
      throw new Error(`API request failed: ${response.status}`);
    }

    const xmlText = await response.text();
    return parseXmlResponse(xmlText);
  } catch (error) {
    console.error("Failed to fetch auction data:", error);
    throw error;
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
): Promise<{ totalCount: number; newCount: number; duplicateCount: number }> {
  let totalCount = 0;
  let totalNewCount = 0;
  let totalDuplicateCount = 0;

  // 가락시장 API는 실제로 페이지당 10개씩만 반환함 (pagesize 파라미터 무시)
  const ACTUAL_PAGE_SIZE = 10;

  // 여러 품목이 쉼표로 구분된 경우 분리 (가락시장 API는 단일 품목만 지원)
  const productNames = productName
    ? productName.split(",").map(p => p.trim()).filter(Boolean)
    : [undefined]; // undefined면 전체 품목

  for (const corpCode of corporationCodes) {
    let corpNewCount = 0;
    let corpDuplicateCount = 0;
    let corpTotalCount = 0;

    try {
      // 각 품목별로 개별 API 호출
      for (const singleProduct of productNames) {
        console.log(`[Garak API] Collecting: Corp ${corpCode}, Product: ${singleProduct || "전체"}`);

        // 첫 페이지 조회로 전체 건수 파악
        const firstPage = await fetchAuctionData({
          date,
          corporationCode: corpCode,
          productName: singleProduct,
          pageSize: 1000, // API가 무시하지만 호환성을 위해 유지
          pageIndex: 1,
        });

        console.log(`[Garak API] Corp ${corpCode}, Product ${singleProduct || "전체"}: list_total_count=${firstPage.list_total_count}, items=${firstPage.items.length}`);

        corpTotalCount += firstPage.list_total_count;

        // 페이지네이션 처리 (API는 실제로 10개씩 반환)
        const totalPages = Math.ceil(firstPage.list_total_count / ACTUAL_PAGE_SIZE);
        let allItems: AuctionItem[] = [...firstPage.items];

        console.log(`[Garak API] Total pages to fetch: ${totalPages} (${ACTUAL_PAGE_SIZE} items per page)`);

        // 너무 많은 페이지는 제한 (최대 100페이지 = 1000개)
        const maxPages = Math.min(totalPages, 100);

        for (let page = 2; page <= maxPages; page++) {
          const pageData = await fetchAuctionData({
            date,
            corporationCode: corpCode,
            productName: singleProduct,
            pageSize: 1000, // API가 무시하지만 호환성을 위해 유지
            pageIndex: page,
          });
          allItems = [...allItems, ...pageData.items];

          // 진행 상황 로그 (10페이지마다)
          if (page % 10 === 0) {
            console.log(`[Garak API] Progress: ${page}/${maxPages} pages, ${allItems.length} items collected`);
          }
        }

        if (totalPages > maxPages) {
          console.log(`[Garak API] Warning: Limited to ${maxPages} pages (${maxPages * ACTUAL_PAGE_SIZE} items) out of ${totalPages} total pages`);
        }

        console.log(`[Garak API] Total items to process: ${allItems.length}`);
        if (allItems.length > 0) {
          console.log(`[Garak API] First item:`, JSON.stringify(allItems[0]));
        }

        // DB에 저장 (upsert - 기존 데이터도 갱신)
        let processedCount = 0;
        for (const item of allItems) {
          if (!item.PUMMOK || !item.PPRICE || !item.ADJ_DT) continue;

          try {
            // 값 정규화 (빈 문자열은 빈 문자열로 통일)
            const varietyValue = item.PUMJONG?.trim() || "";
            const originValue = item.SSANGI?.trim() || "";
            const priceValue = parseInt(item.PPRICE, 10) || 0;
            const auctionDateValue = parseDate(item.ADJ_DT);

            // 첫 번째 아이템 로그
            if (processedCount === 0) {
              console.log(`[Garak DB] First item to save:`, {
                productName: item.PUMMOK,
                variety: varietyValue,
                price: priceValue,
                origin: originValue,
                auctionDate: auctionDateValue,
              });
            }
            processedCount++;

            // 먼저 존재 여부 확인
            const existing = await prisma.auctionResult.findUnique({
              where: {
                productName_variety_corporation_auctionDate_price_origin: {
                  productName: item.PUMMOK,
                  variety: varietyValue,
                  corporation: item.CORP_NM,
                  auctionDate: auctionDateValue,
                  price: priceValue,
                  origin: originValue,
                },
              },
            });

            if (existing) {
              // 기존 데이터 - 중복으로 카운트
              corpDuplicateCount++;
            } else {
              // 새 데이터 생성 (variety, origin을 빈 문자열로 저장하여 unique 일관성 유지)
              await prisma.auctionResult.create({
                data: {
                  productName: item.PUMMOK,
                  variety: varietyValue,  // 빈 문자열 유지 (null 대신)
                  tempName: item.PUM_NAME_IMSI || null,
                  unit: item.UUN || "kg",
                  grade: item.DDD || null,
                  price: priceValue,
                  origin: originValue,  // 빈 문자열 유지 (null 대신)
                  corporation: item.CORP_NM,
                  corporationCode: corpCode,
                  auctionDate: auctionDateValue,
                  quantity: parseInt(item.QTY || "1", 10) || 1,
                  certification: item.INJUNG_GUBUN || null,
                },
              });
              corpNewCount++;
            }
          } catch (err) {
            // 중복 키 에러 등은 무시하지 않고 로그 출력
            console.error("[Garak DB] Save item error:", err);
          }
        }
      } // end of productNames loop

      console.log(`[Garak DB] Corp ${corpCode}: Saved ${corpNewCount} new items, ${corpDuplicateCount} duplicates`);
      totalCount += corpTotalCount;
      totalNewCount += corpNewCount;
      totalDuplicateCount += corpDuplicateCount;

      // 수집 로그 저장 (품목 정보 포함)
      await prisma.dataCollectionLog.create({
        data: {
          targetDate: date,
          corporation: corpCode,
          targetProducts: productName || null, // null이면 전체 품목
          totalCount: corpTotalCount,
          newCount: corpNewCount,
          duplicateCount: corpDuplicateCount,
          status: "SUCCESS",
          completedAt: new Date(),
        },
      });
    } catch (error) {
      // 수집 실패 로그
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

  return { totalCount, newCount: totalNewCount, duplicateCount: totalDuplicateCount };
}

/**
 * 단위 문자열에서 kg 값 추출 (예: "10kg" -> 10, "5KG" -> 5)
 */
function parseKgFromUnit(unit: string): number | null {
  if (!unit) return null;
  const match = unit.toLowerCase().match(/(\d+(?:\.\d+)?)\s*kg/);
  return match ? parseFloat(match[1]) : null;
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

  // 개별 레코드를 가져와서 가중평균 계산
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

  // 날짜별로 그룹화
  const dateGroups = new Map<string, typeof records>();
  for (const record of records) {
    const dateKey = record.auctionDate.toISOString().split("T")[0];
    const group = dateGroups.get(dateKey) || [];
    group.push(record);
    dateGroups.set(dateKey, group);
  }

  // 각 날짜별 통계 계산
  const results = Array.from(dateGroups.entries()).map(([dateKey, items]) => {
    const prices = items.map(i => i.price);

    // 가중평균: sum(price * quantity) / sum(quantity)
    const totalWeightedPrice = items.reduce((sum, i) => sum + (i.price * i.quantity), 0);
    const totalQuantity = items.reduce((sum, i) => sum + i.quantity, 0);
    const weightedAvgPrice = totalQuantity > 0 ? Math.round(totalWeightedPrice / totalQuantity) : 0;

    // kg당 단가 계산 (단위에서 kg 추출)
    let totalKg = 0;
    let totalKgValue = 0;
    for (const item of items) {
      const kg = parseKgFromUnit(item.unit || "");
      if (kg && kg > 0) {
        const itemTotalKg = kg * item.quantity;
        totalKg += itemTotalKg;
        totalKgValue += item.price * item.quantity;
      }
    }
    const pricePerKg = totalKg > 0 ? Math.round(totalKgValue / totalKg) : null;

    return {
      date: new Date(dateKey),
      avgPrice: weightedAvgPrice,
      maxPrice: Math.max(...prices),
      minPrice: Math.min(...prices),
      tradeCount: items.length,
      totalQuantity,
      pricePerKg, // kg당 단가 (계산 불가시 null)
    };
  });

  // 날짜 내림차순 정렬
  results.sort((a, b) => b.date.getTime() - a.date.getTime());

  return results;
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
  const startOfDay = new Date(date);
  startOfDay.setHours(0, 0, 0, 0);

  const endOfDay = new Date(date);
  endOfDay.setHours(23, 59, 59, 999);

  const where: {
    auctionDate: { gte: Date; lte: Date };
    productName?: { in: string[] };
  } = {
    auctionDate: { gte: startOfDay, lte: endOfDay },
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
