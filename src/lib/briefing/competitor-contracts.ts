import { z } from "zod";
import type { ShoppingSearchResult } from "./naver-shopping";
export const varietyLabels = { JUJUBE: "대추방울", ROUND: "원형 방울", UNKNOWN: "미확인" } as const;
export const qualityLabels = { REGULAR: "일반", ORGANIC: "친환경", GIFT: "선물", UGLY: "못난이", OTHER: "기타" } as const;
/** Size grade confirmed by the operator. UNKNOWN rows (including every row created before the column existed) never enter statistics. */
export const sizeLabels = { SMALL: "소과", MEDIUM: "중과", LARGE: "대과", ROYAL: "로얄과", MIXED: "혼합", UNKNOWN: "미확인" } as const;
export const sizeGrades = ["SMALL", "MEDIUM", "LARGE", "ROYAL", "MIXED", "UNKNOWN"] as const;
export type SizeGrade = (typeof sizeGrades)[number];
export const SIZE_CRITERIA_MAX = 100;
/** Option identity confirmed by the operator from the seller's listing. Nothing here is inferred from titles; UNKNOWN/OTHER/MIXED rows never enter statistics. */
export const colorLabels = { RED: "빨강", ORANGE: "주황", YELLOW: "노랑", GREEN: "초록", BROWN: "갈색", OTHER: "기타", UNKNOWN: "미확인" } as const;
export const colorGroups = ["RED", "ORANGE", "YELLOW", "GREEN", "BROWN", "OTHER", "UNKNOWN"] as const;
export type ColorGroup = (typeof colorGroups)[number];
export const mixtureLabels = { SINGLE: "단일", MIXED: "혼합", UNKNOWN: "미확인" } as const;
export const mixtureGroups = ["SINGLE", "MIXED", "UNKNOWN"] as const;
export type MixtureGroup = (typeof mixtureGroups)[number];
export const processingLabels = { FRESH: "무가공 생과", STEVIA: "스테비아", XYLITOL: "자일리톨", OTHER: "기타", UNKNOWN: "미확인" } as const;
export const processingGroups = ["FRESH", "STEVIA", "XYLITOL", "OTHER", "UNKNOWN"] as const;
export type ProcessingGroup = (typeof processingGroups)[number];
/** Seller-stated cultivar name (e.g. 대저, 스텔라) copied verbatim after trimming; empty means not confirmed. */
export const CULTIVAR_NAME_MAX = 100;
/** Naver's official Shopping Search API was terminated on this date; the search action is kept only to answer 410. */
export const SEARCH_RETIRED_ON = "2026-07-31";
export const SEARCH_RETIRED_MESSAGE = `네이버 공식 쇼핑검색 API가 ${SEARCH_RETIRED_ON}에 종료되어 새 검색은 지원하지 않습니다. 이전 검색 결과는 열람만 가능합니다.`;
const money = z.number().int().min(0).max(10_000_000);
export const competitorRequestSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("search"), query: z.string().trim().min(1).max(100) }).strict(),
  z.object({ action: z.literal("addPanel"), storeName: z.string().trim().min(1).max(100), productUrl: z.string().url().max(2000),
    productName: z.string().trim().min(1).max(100), varietyGroup: z.enum(["JUJUBE", "ROUND", "UNKNOWN"]),
    qualityGroup: z.enum(["REGULAR", "ORGANIC", "GIFT", "UGLY", "OTHER"]), optionLabel: z.string().trim().min(1).max(200),
    packageKg: z.number().min(0.05).max(50),
    // Defaults keep clients built before size comparison working; such rows stay outside statistics.
    sizeGrade: z.enum(sizeGrades).default("UNKNOWN"),
    // Human-confirmed comparable boundary (diameter/count) copied verbatim; seller labels are never mapped automatically.
    sizeCriteria: z.string().trim().max(SIZE_CRITERIA_MAX).default(""),
    // Option identity defaults keep older clients working; defaulted rows are excluded from statistics, never promoted.
    cultivarName: z.string().trim().max(CULTIVAR_NAME_MAX).default(""),
    color: z.enum(colorGroups).default("UNKNOWN"),
    mixture: z.enum(mixtureGroups).default("UNKNOWN"),
    processing: z.enum(processingGroups).default("UNKNOWN"),
    confirmed: z.literal(true) }).strict(),
  z.object({ action: z.literal("record"), entryId: z.string().min(1).max(100), observedAt: z.string().datetime({ offset: true }),
    price: money.nullable(), shippingFee: money.nullable(), availability: z.enum(["IN_STOCK", "OUT_OF_STOCK", "UNKNOWN"]),
    notes: z.string().trim().max(1000).optional() }).strict(),
  z.object({ action: z.literal("archive"), entryId: z.string().min(1).max(100), reason: z.string().trim().min(1).max(500) }).strict(),
]);
export type CompetitorRequest = z.infer<typeof competitorRequestSchema>;
export interface CompetitorObservation { id: string; observedAt: string; price: number|null; shippingFee: number|null; availability: string; notes: string|null }
export interface CompetitorEntry {
  id: string; storeKey: string; storeName: string; productUrl: string; productName: string;
  varietyGroup: string; qualityGroup: string; optionLabel: string; packageKg: number;
  /** Optional so fixtures and rows serialized before the size columns existed still type-check; treated as UNKNOWN. */
  sizeGrade?: string; sizeCriteria?: string;
  /** Optional for the same reason; missing values are treated as unconfirmed ("" / UNKNOWN). */
  cultivarName?: string; color?: string; mixture?: string; processing?: string;
  archivedAt: string|null; archiveReason: string|null; observations: CompetitorObservation[];
}
export interface CompetitorGroup {
  key: string; label: string; packageKg?: number; sizeGrade?: string; sizeCriteria?: string;
  cultivarName?: string; color?: string; mixture?: string; processing?: string;
  count: number; medianDeliveredPrice: number|null; min: number|null; max: number|null;
  previousWeekChangePct: number|null; pairedCount: number;
}
export interface CompetitorOverview {
  /** Always false since the search API retirement; kept so older clients keep rendering the read-only search history. */
  configured: boolean; searchRetiredOn: string; asOf: string; target: number; activeCount: number;
  latestSearch: { id: string; createdAt: string; status: string; errorCode: string|null; result: ShoppingSearchResult|null }|null;
  entries: CompetitorEntry[]; groups: CompetitorGroup[];
  limitations: string[];
}
