export interface WatchlistItem {
  id: string;
  productName: string;
  variety?: string | null;
  origin?: string | null;
  targetPrice?: number | null;
  isActive: boolean;
  latestPrice: number | null;
  latestDate: string | null;
  unit: string | null;
  latestVariety: string | null;
  priceChange: number | null;
}

export interface SavedFilterPreset {
  id: string;
  name: string;
  productName: string;
  varieties: string[];
  origin: string | null;
  unit: string | null;
}

export interface PriceHistory {
  date: string;
  avgPrice: number;
  maxPrice: number;
  minPrice: number;
  tradeCount: number;
  totalQuantity?: number;
  pricePerKg?: number | null;
}

export type NoAuctionDates = string[];

export interface DailyDetailResult {
  id: string;
  productName: string;
  variety: string | null;
  origin: string | null;
  price: number;
  unit: string;
  quantity: number;
  corporation: string;
  grade: string | null;
}

import { MARKET_PRODUCTS } from "@/lib/constants/market-products";

export const DEFAULT_PRODUCTS: readonly string[] = MARKET_PRODUCTS;

export const PERIOD_OPTIONS = [
  { value: "7", label: "일간", days: 7, description: "최근 7일" },
  { value: "30", label: "주간", days: 30, description: "최근 4주" },
  { value: "90", label: "월간", days: 90, description: "최근 3개월" },
  { value: "365", label: "연간", days: 365, description: "최근 1년" },
];

export const DAY_NAMES = ["일", "월", "화", "수", "목", "금", "토"];

export type SortField = "price" | "quantity" | "origin" | "unit" | "variety" | "corporation";
export type SortDirection = "asc" | "desc";

// Parse date string to local Date (avoids timezone issues)
export const parseLocalDate = (dateStr: string): Date => {
  const datePart = dateStr.split("T")[0];
  const [year, month, day] = datePart.split("-").map(Number);
  return new Date(year, month - 1, day);
};

// Format Date to YYYY-MM-DD string (local time)
export const formatLocalDateStr = (date: Date): string => {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
};
