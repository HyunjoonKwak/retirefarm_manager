/**
 * Canonical list of Garak market products used across
 * the collector service, API routes, and UI defaults.
 */
export const MARKET_PRODUCTS = [
  "토마토",
  "포도",
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
  "감귤",
  "복숭아",
  "멜론",
  "자두",
  "파프리카",
  "브로콜리",
  "호박",
  "가지",
] as const;

export type MarketProduct = (typeof MARKET_PRODUCTS)[number];
