/**
 * 가락시장 공공데이터 응답 파싱·날짜 유틸.
 *
 * 수집 모듈(garak-collector)과 조회 서비스(garak-market)가 함께 쓴다.
 * HTML·오류 XML·list_total_count 누락 응답은 "정상 0건"이 아니라 invalid로 구분한다 (P1).
 */

export interface AuctionItem {
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

export interface GarakApiResponse {
  list_total_count: number;
  items: AuctionItem[];
}

export type GarakInvalidReason =
  | "empty" // 본문 없음
  | "html" // HTML 페이지 (로그인/오류 페이지 등)
  | "error_xml" // 오류 메시지 XML
  | "missing_count" // list_total_count 없음
  | "no_items" // 건수는 있는데 항목을 하나도 파싱하지 못함
  | "count_mismatch"; // 건수 0인데 항목이 있음

export type ParsedGarakResponse =
  | { kind: "ok"; totalCount: number; items: AuctionItem[] }
  | { kind: "invalid"; reason: GarakInvalidReason; detail: string };

export class GarakResponseError extends Error {
  readonly reason: GarakInvalidReason;
  constructor(reason: GarakInvalidReason, detail: string) {
    super(`가락 API 응답을 해석할 수 없습니다 (${reason}): ${detail}`);
    this.name = "GarakResponseError";
    this.reason = reason;
  }
}

const HTML_PATTERN = /^\s*(<!doctype\s+html|<html[\s>])/i;
const ERROR_XML_PATTERN = /<(error|errmsg|errormessage|resultmsg|message)\b[^>]*>/i;

// 외부 응답 본문은 로그·DB에 그대로 남기지 않는다 (요청 URL·자격증명이 반사될 수 있음).
// detail에는 분류와 길이 같은 일반 정보만 넣는다.

function extractItems(xmlText: string): AuctionItem[] {
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
      const normalMatch = listContent.match(new RegExp(`<${tag}>([^<]*)</${tag}>`, "i"));
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

  return items;
}

/**
 * 응답 본문을 검증하며 파싱한다. 정상 0건은 `<list_total_count>0</list_total_count>`가
 * 실제로 있을 때만 인정한다.
 */
export function parseGarakResponse(body: string): ParsedGarakResponse {
  const text = body ?? "";
  if (text.trim().length === 0) {
    return { kind: "invalid", reason: "empty", detail: "빈 본문" };
  }
  if (HTML_PATTERN.test(text) || (!/<list_total_count>/i.test(text) && /<html[\s>]/i.test(text))) {
    return { kind: "invalid", reason: "html", detail: `HTML 페이지 응답 (로그인·오류 페이지 추정, ${text.length}자)` };
  }

  const totalCountMatch = text.match(/<list_total_count>\s*(\d+)\s*<\/list_total_count>/i);
  if (!totalCountMatch) {
    const errorMatch = text.match(ERROR_XML_PATTERN);
    if (errorMatch) {
      return { kind: "invalid", reason: "error_xml", detail: `오류 XML 응답 (<${errorMatch[1].toLowerCase()}> 태그)` };
    }
    return { kind: "invalid", reason: "missing_count", detail: `list_total_count 태그 없음 (본문 ${text.length}자)` };
  }

  const totalCount = parseInt(totalCountMatch[1], 10);
  const items = extractItems(text);

  if (totalCount > 0 && items.length === 0) {
    return {
      kind: "invalid",
      reason: "no_items",
      detail: `list_total_count=${totalCount}이지만 항목을 파싱하지 못함 (형식 변경 가능성)`,
    };
  }
  if (totalCount === 0 && items.length > 0) {
    return {
      kind: "invalid",
      reason: "count_mismatch",
      detail: `list_total_count=0인데 항목 ${items.length}개가 있음`,
    };
  }

  return { kind: "ok", totalCount, items };
}

/**
 * 하위 호환용. 검증에 실패하면 GarakResponseError를 던진다 (예전에는 0건으로 취급했음).
 */
export function parseXmlResponse(xmlText: string): GarakApiResponse {
  const parsed = parseGarakResponse(xmlText);
  if (parsed.kind === "invalid") {
    throw new GarakResponseError(parsed.reason, parsed.detail);
  }
  return { list_total_count: parsed.totalCount, items: parsed.items };
}

/**
 * 날짜를 YYYYMMDD 형식으로 변환 (서버 로컬 타임존 기준)
 */
export function formatDateYmd(date: Date): string {
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

export function dayRange(date: Date): { gte: Date; lte: Date } {
  const start = new Date(date);
  start.setHours(0, 0, 0, 0);
  const end = new Date(date);
  end.setHours(23, 59, 59, 999);
  return { gte: start, lte: end };
}
