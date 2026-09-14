import prisma from "@/lib/prisma";
import { previousWeek } from "./snapshot";

export interface BriefingFacetsInput { productName: string; origin?: string }
export interface BriefingOriginFacet { origin: string; tradeCount: number; varietyCount: number }
export interface BriefingVarietyFacet { variety: string; tradeCount: number; observedForOrigin: boolean }
export interface BriefingFacets {
  periodStart: string; periodEnd: string; corporations: string[];
  scope: { productName: string; origin: string | null };
  origins: BriefingOriginFacet[]; varieties: BriefingVarietyFacet[];
  asOf: string; collectionState: "stored_records_only";
}

// Same fallback as buildSnapshot so the choices match the rows the snapshot will aggregate.
const DEFAULT_CORPORATIONS = "11000101,11000102";
const byKorean = (a: string, b: string) => a.localeCompare(b, "ko");

/**
 * Origins and varieties observed in stored auction records for the last completed KST week.
 * Exact product and origin matching only; a stored record never proves actual shipping.
 */
export async function getBriefingFacets(userId: string, input: BriefingFacetsInput, now = new Date()): Promise<BriefingFacets> {
  const { start, end } = previousWeek(now);
  const settings = await prisma.marketCollectionSettings.findUnique({ where: { userId } });
  const corporations = [...new Set((settings?.corporationCodes ?? DEFAULT_CORPORATIONS).split(",").map(code => code.trim()).filter(Boolean))].sort();
  if (!corporations.length) throw new Error("NO_CORPORATIONS");
  // Same validity filter as the snapshot query, so every offered choice yields at least one aggregated group.
  const rows = await prisma.auctionResult.groupBy({
    by: ["origin", "variety"],
    where: { auctionDate: { gte: start, lt: end }, productName: input.productName,
      corporationCode: { in: corporations }, price: { gt: 0 }, quantity: { gt: 0 } },
    _count: { _all: true },
  });
  const selectedOrigin = input.origin?.trim() || null;
  // Blank origin/variety cannot be selected: the snapshot treats an empty filter as "all", not "unlabeled".
  const originTotals = rows.filter(row => row.origin).reduce((map, row) => {
    const current = map.get(row.origin) ?? { tradeCount: 0, varieties: new Set<string>() };
    return new Map(map).set(row.origin, { tradeCount: current.tradeCount + row._count._all,
      varieties: row.variety ? new Set([...current.varieties, row.variety]) : current.varieties });
  }, new Map<string, { tradeCount: number; varieties: Set<string> }>());
  const inScope = selectedOrigin ? rows.filter(row => row.origin === selectedOrigin) : rows;
  const scopedCounts = inScope.filter(row => row.variety).reduce((map, row) =>
    new Map(map).set(row.variety, (map.get(row.variety) ?? 0) + row._count._all), new Map<string, number>());
  const varieties = [...new Set(rows.map(row => row.variety).filter(Boolean))].sort(byKorean).map(variety => ({
    variety, tradeCount: scopedCounts.get(variety) ?? 0, observedForOrigin: scopedCounts.has(variety),
  }));
  const origins = [...originTotals.entries()].sort(([a], [b]) => byKorean(a, b)).map(([origin, total]) => ({
    origin, tradeCount: total.tradeCount, varietyCount: total.varieties.size,
  }));
  return { periodStart: start.toISOString(), periodEnd: end.toISOString(), corporations,
    scope: { productName: input.productName, origin: selectedOrigin }, origins, varieties,
    asOf: now.toISOString(), collectionState: "stored_records_only" };
}
