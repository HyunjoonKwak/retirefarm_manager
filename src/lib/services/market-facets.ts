import { marketWindowStart } from "@/lib/market-date";
import prisma from "@/lib/prisma";

/** Availability in stored auction records, never a claim about regional production. */
export async function getMarketVarietyFacets(
  productName: string,
  days: number,
  origin?: string | null,
  unit?: string | null,
  grade?: string | null,
) {
  const asOf = new Date();
  // Match the history endpoint's Korean calendar window.
  const startDate = marketWindowStart(days, asOf);
  const productWhere = { productName, variety: { not: "" } };
  // Keep the existing history/daily origin semantics until region codes are introduced.
  const originWhere = { ...productWhere, ...(origin ? { origin: { contains: origin } } : {}) };

  // Deliberately ignore selected varieties: selecting A must not hide candidate B.
  const [candidates, originHistory, periodGroups] = await Promise.all([
    prisma.auctionResult.groupBy({
      by: ["variety"], where: productWhere,
    }),
    prisma.auctionResult.groupBy({
      by: ["variety"], where: originWhere,
      _max: { auctionDate: true },
    }),
    prisma.auctionResult.groupBy({
      by: ["variety", "unit", "grade"],
      where: { ...originWhere, auctionDate: { gte: startDate } },
      _count: { _all: true },
    }),
  ]);

  const lastSeen = new Map(originHistory.map((row) => [row.variety, row._max.auctionDate]));
  const counts = new Map<string, { period: number; matching: number }>();
  for (const row of periodGroups) {
    const count = counts.get(row.variety) ?? { period: 0, matching: 0 };
    count.period += row._count._all;
    if ((!unit || row.unit === unit) && (!grade || row.grade === grade)) count.matching += row._count._all;
    counts.set(row.variety, count);
  }

  const facets = candidates.map(({ variety }) => {
    const count = counts.get(variety) ?? { period: 0, matching: 0 };
    const availability = count.matching > 0 ? "available"
      : count.period > 0 ? "filtered_out"
      : lastSeen.has(variety) ? "no_period_records" : "unobserved";
    return {
      variety,
      originPeriodCount: count.period,
      matchingCount: count.matching,
      lastSeenAt: lastSeen.get(variety)?.toISOString() ?? null,
      availability,
    };
  }).sort((a, b) => a.variety.localeCompare(b.variety, "ko"));

  return {
    facets,
    units: [...new Set(periodGroups.map(row => row.unit).filter(Boolean))].sort(),
    grades: [...new Set(periodGroups.map(row => row.grade).filter(Boolean))].sort(),
    scope: { productName, origin: origin || null, unit: unit || null, grade: grade || null, days },
    asOf: asOf.toISOString(),
    // Current collection logs cannot prove complete coverage. Do not infer absence.
    collectionState: "stored_records_only" as const,
  };
}
