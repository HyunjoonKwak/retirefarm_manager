import type { ShoppingReviewReason, ShoppingSearchErrorCode } from "@/lib/briefing/naver-shopping";
import type { CompetitorEntry, CompetitorObservation } from "@/lib/briefing/competitor-contracts";

export const availabilityLabels = { IN_STOCK: "판매 중", OUT_OF_STOCK: "품절", UNKNOWN: "미확인" } as const;
export type Availability = keyof typeof availabilityLabels;

export const reviewReasonLabels: Record<ShoppingReviewReason, string> = {
  VERIFY_PRICE_OPTION_SHIPPING: "가격·옵션·배송비 직접 확인 필요",
  PRICE_UNAVAILABLE: "API 가격 없음",
  URL_REJECTED: "링크 사용 불가",
  WEIGHT_MISSING: "중량 표기 없음",
  WEIGHT_AMBIGUOUS: "중량 표기 불명확",
  WEIGHT_PROPOSED_FROM_TITLE: "중량은 제목 추정치",
  VARIETY_CONFLICT: "품종 표기 상충",
  CATEGORY_REVIEW: "카테고리 확인 필요",
  PRODUCT_TYPE_NOT_GENERAL: "일반 상품 아님(가격비교·카탈로그 등)",
  HEURISTIC_STEVIA: "스테비아 추정 제외",
  HEURISTIC_JUICE: "주스·음료 추정 제외",
  HEURISTIC_POWDER: "분말 추정 제외",
  HEURISTIC_PROCESSED: "가공품·자재 추정 제외",
};

export const searchErrorLabels: Record<ShoppingSearchErrorCode, string> = {
  INVALID_QUERY: "검색어가 비어 있거나 허용 길이를 초과했습니다.",
  INVALID_CREDENTIALS: "네이버 API 자격증명이 서버에 설정되지 않았습니다.",
  AUTH_FAILED: "네이버 API 인증에 실패했습니다.",
  FORBIDDEN: "네이버 API 호출 권한이 없습니다.",
  RATE_LIMITED: "네이버 API 호출 한도를 초과했습니다.",
  BAD_REQUEST: "네이버 API가 요청을 거부했습니다.",
  UPSTREAM_ERROR: "네이버 API 서버 오류입니다.",
  TIMEOUT: "네이버 API 응답 시간이 초과되었습니다.",
  REDIRECT: "네이버 API가 예상치 못한 응답을 반환했습니다.",
  NETWORK: "네이버 API에 연결하지 못했습니다.",
  RESPONSE_TOO_LARGE: "네이버 API 응답이 허용 크기를 초과했습니다.",
  INVALID_RESPONSE: "네이버 API 응답 형식이 올바르지 않습니다.",
};

export const describeSearchError = (code: string | null): string =>
  code && code in searchErrorLabels ? searchErrorLabels[code as ShoppingSearchErrorCode] : "검색을 완료하지 못했습니다.";

export const won = (value: number | null | undefined): string =>
  value === null || value === undefined ? "미확인" : `${Math.round(value).toLocaleString("ko-KR")}원`;

export const kg = (value: number): string => `${Number(value.toFixed(3))}kg`;

export const dateTime = (value: string): string => {
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? "시각 미확인" : parsed.toLocaleString("ko-KR", { timeZone: "Asia/Seoul", dateStyle: "short", timeStyle: "short" });
};

const pad = (value: number) => String(value).padStart(2, "0");

/** Format a Date as the browser-local `YYYY-MM-DDTHH:mm` value a datetime-local input expects. */
export function toDatetimeLocal(date: Date): string {
  if (Number.isNaN(date.getTime())) return "";
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

/** Interpret a datetime-local value in the browser's zone and return an ISO-8601 (UTC) string, or null when invalid. */
export function fromDatetimeLocal(value: string): string | null {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?$/.test(value)) return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toISOString();
}

export type MoneyParse = { ok: true; value: number | null } | { ok: false; error: string };

/** Blank means unknown (null); "0" is a real zero (e.g. free shipping). Only non-negative integers are accepted. */
export function parseMoney(input: string): MoneyParse {
  const text = input.replace(/[,\s]/g, "");
  if (text === "") return { ok: true, value: null };
  if (!/^\d+$/.test(text)) return { ok: false, error: "0 이상의 정수(원)만 입력할 수 있습니다." };
  const value = Number(text);
  if (value > 10_000_000) return { ok: false, error: "1,000만 원을 넘는 금액은 입력할 수 없습니다." };
  return { ok: true, value };
}

export type KgParse = { ok: true; value: number } | { ok: false; error: string };

export function parseKg(input: string): KgParse {
  const text = input.trim();
  if (text === "") return { ok: false, error: "포장 중량(kg)을 입력해 주세요." };
  const value = Number(text);
  if (!Number.isFinite(value) || value < 0.05 || value > 50) return { ok: false, error: "포장 중량은 0.05kg 이상 50kg 이하여야 합니다." };
  return { ok: true, value };
}

/** Only http(s) URLs without embedded credentials are rendered as links. */
export function isSafeHttpUrl(value: string): boolean {
  try {
    const parsed = new URL(value);
    return (parsed.protocol === "https:" || parsed.protocol === "http:") && parsed.username === "" && parsed.password === "";
  } catch { return false; }
}

/** Mirrors the server's canonical rule: https smartstore.naver.com/<store>/products/<id> with no port or credentials. */
export const isSmartstoreProductUrl = (value: string): boolean => {
  try {
    const parsed = new URL(value);
    return parsed.protocol === "https:" && parsed.hostname === "smartstore.naver.com" && parsed.port === "" && parsed.username === ""
      && parsed.password === "" && /^\/[a-z0-9_-]{2,64}\/products\/\d+\/?$/i.test(parsed.pathname);
  } catch { return false; }
};

/** Delivered price = price + shipping; unknown when either side is unknown. */
export const deliveredPrice = (observation: Pick<CompetitorObservation, "price" | "shippingFee">): number | null =>
  observation.price === null || observation.shippingFee === null ? null : observation.price + observation.shippingFee;

export const perKg = (amount: number | null, packageKg: number): number | null =>
  amount === null || packageKg <= 0 ? null : Math.round(amount / packageKg);

/** Observations sorted newest first without mutating the server payload. */
export const sortedObservations = (entry: Pick<CompetitorEntry, "observations">): CompetitorObservation[] =>
  [...entry.observations].sort((a, b) => b.observedAt.localeCompare(a.observedAt));

export const latestObservation = (entry: Pick<CompetitorEntry, "observations">): CompetitorObservation | null =>
  sortedObservations(entry)[0] ?? null;

export const shippingLabel = (fee: number | null): string => fee === null ? "배송비 미확인" : fee === 0 ? "무료배송" : `배송비 ${won(fee)}`;

/** Native select styled like the shadcn Input so it stays testable in jsdom. */
export const nativeSelectClass = "border-input dark:bg-input/30 h-9 w-full min-w-0 rounded-md border bg-transparent px-3 py-1 text-base shadow-xs outline-none md:text-sm disabled:cursor-not-allowed disabled:opacity-50 focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px]";
