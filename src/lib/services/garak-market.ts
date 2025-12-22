/**
 * 가락시장 공공데이터 API 서비스
 * http://www.garak.co.kr/homepage/publicdata/dataOpen.do
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

  // 각 list 항목 추출
  const items: AuctionItem[] = [];
  const listRegex = /<list>([\s\S]*?)<\/list>/g;
  let match;

  while ((match = listRegex.exec(xmlText)) !== null) {
    const listContent = match[1];

    const getTagValue = (tag: string): string => {
      const tagMatch = listContent.match(new RegExp(`<${tag}>([^<]*)</${tag}>`));
      return tagMatch ? tagMatch[1].trim() : "";
    };

    items.push({
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
    });
  }

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
  pageSize?: number;
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
 */
export async function collectAndSaveAuctionData(
  date: Date,
  corporationCodes: string[] = ["11000101"],
  productName?: string
): Promise<{ totalCount: number; newCount: number }> {
  let totalCount = 0;
  let newCount = 0;

  for (const corpCode of corporationCodes) {
    try {
      // 첫 페이지 조회로 전체 건수 파악
      const firstPage = await fetchAuctionData({
        date,
        corporationCode: corpCode,
        productName,
        pageSize: 1000,
        pageIndex: 1,
      });

      totalCount += firstPage.list_total_count;

      // 페이지네이션 처리
      const totalPages = Math.ceil(firstPage.list_total_count / 1000);
      let allItems: AuctionItem[] = [...firstPage.items];

      for (let page = 2; page <= totalPages; page++) {
        const pageData = await fetchAuctionData({
          date,
          corporationCode: corpCode,
          productName,
          pageSize: 1000,
          pageIndex: page,
        });
        allItems = [...allItems, ...pageData.items];
      }

      // DB에 저장
      for (const item of allItems) {
        if (!item.PUMMOK || !item.PPRICE || !item.ADJ_DT) continue;

        try {
          await prisma.auctionResult.upsert({
            where: {
              productName_variety_corporation_auctionDate_price_origin: {
                productName: item.PUMMOK,
                variety: item.PUMJONG || "",
                corporation: item.CORP_NM,
                auctionDate: parseDate(item.ADJ_DT),
                price: parseInt(item.PPRICE, 10) || 0,
                origin: item.SSANGI || "",
              },
            },
            update: {},
            create: {
              productName: item.PUMMOK,
              variety: item.PUMJONG || null,
              tempName: item.PUM_NAME_IMSI || null,
              unit: item.UUN || "kg",
              grade: item.DDD || null,
              price: parseInt(item.PPRICE, 10) || 0,
              origin: item.SSANGI || null,
              corporation: item.CORP_NM,
              corporationCode: corpCode,
              auctionDate: parseDate(item.ADJ_DT),
              quantity: parseInt(item.QTY || "1", 10) || 1,
              certification: item.INJUNG_GUBUN || null,
            },
          });
          newCount++;
        } catch {
          // 중복 데이터는 무시
        }
      }

      // 수집 로그 저장
      await prisma.dataCollectionLog.create({
        data: {
          targetDate: date,
          corporation: corpCode,
          totalCount: firstPage.list_total_count,
          newCount,
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
          totalCount: 0,
          newCount: 0,
          status: "FAILED",
          errorMessage: error instanceof Error ? error.message : "Unknown error",
          completedAt: new Date(),
        },
      });
    }
  }

  return { totalCount, newCount };
}

/**
 * 품목별 일자별 평균가격 조회
 */
export async function getProductPriceHistory(
  productName: string,
  days: number = 30,
  variety?: string,
  origin?: string
) {
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - days);

  const where: {
    productName: string;
    auctionDate: { gte: Date };
    variety?: string;
    origin?: string;
  } = {
    productName,
    auctionDate: { gte: startDate },
  };

  if (variety) {
    where.variety = variety;
  }

  if (origin) {
    where.origin = origin;
  }

  const results = await prisma.auctionResult.groupBy({
    by: ["auctionDate"],
    where,
    _avg: { price: true },
    _max: { price: true },
    _min: { price: true },
    _count: { price: true },
    orderBy: { auctionDate: "desc" },
  });

  return results.map((r) => ({
    date: r.auctionDate,
    avgPrice: Math.round(r._avg.price || 0),
    maxPrice: r._max.price || 0,
    minPrice: r._min.price || 0,
    tradeCount: r._count.price,
  }));
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
