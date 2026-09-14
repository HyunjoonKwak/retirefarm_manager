import { Prisma } from "@prisma/client";
import prisma from "@/lib/prisma";
import { snapshotSchema, type BriefingSnapshot } from "./contracts";

export function previousWeek(now = new Date()) {
  const kst = new Date(now.getTime() + 9 * 3600_000);
  const end = Date.UTC(kst.getUTCFullYear(), kst.getUTCMonth(), kst.getUTCDate() - (kst.getUTCDay() + 6) % 7) - 9 * 3600_000;
  return { start: new Date(end - 7 * 86400_000), end: new Date(end) };
}
export interface SnapshotFilters { productName: string; origin?: string; variety?: string }
type Group = { corporationCode: string; corporation: string; productName: string; variety: string;
  origin: string; unit: string; grade: string; amount: bigint | number; volume: bigint | number; trades: bigint | number };
export async function buildSnapshot(userId: string, filters: SnapshotFilters, now = new Date()): Promise<BriefingSnapshot> {
  const { start, end } = previousWeek(now);
  const settings = await prisma.marketCollectionSettings.findUnique({ where: { userId } });
  const corporations = (settings?.corporationCodes ?? "11000101,11000102").split(",").filter(Boolean);
  if (!corporations.length) throw new Error("NO_CORPORATIONS");
  // LIMIT detects excessive groups, never quietly drops trades from a group or publishes a partial set.
  const rows = await prisma.$queryRaw<Group[]>(Prisma.sql`
    SELECT "corporationCode", "corporation", "productName", "variety", "origin", "unit", "grade",
      SUM(CAST("price" AS REAL) * "quantity") AS amount, SUM("quantity") AS volume, COUNT(*) AS trades
    FROM "AuctionResult"
    WHERE "auctionDate" >= ${start} AND "auctionDate" < ${end}
      AND "productName" = ${filters.productName} AND "corporationCode" IN (${Prisma.join(corporations)})
      AND "price" > 0 AND "quantity" > 0
      ${filters.origin ? Prisma.sql`AND "origin" = ${filters.origin}` : Prisma.empty}
      ${filters.variety ? Prisma.sql`AND "variety" = ${filters.variety}` : Prisma.empty}
    GROUP BY "corporationCode", "corporation", "productName", "variety", "origin", "unit", "grade"
    ORDER BY "corporationCode", "corporation", "productName", "variety", "origin", "unit", "grade" LIMIT 201`);
  if (rows.length > 200) throw new Error("TOO_MANY_GROUPS");
  const exclusions = await prisma.auctionResult.count({ where: {
    auctionDate: { gte: start, lt: end }, productName: filters.productName,
    corporationCode: { in: corporations }, ...(filters.origin ? { origin: filters.origin } : {}),
    ...(filters.variety ? { variety: filters.variety } : {}), OR: [{ price: { lte: 0 } }, { quantity: { lte: 0 } }],
  } });
  const metrics = rows.flatMap((row, index) => {
    const label = [row.corporation, row.productName, row.variety || "품종 미기재", row.origin || "산지 미기재", row.grade || "등급 미기재", row.unit].join(" · ");
    return [
      { id: `price-${index}`, label, value: Number(row.amount) / Number(row.volume), unit: `원/${row.unit}`, sourceId: "market" },
      { id: `volume-${index}`, label: `${label} 거래수량`, value: Number(row.volume), unit: "원자료 QTY", sourceId: "market" },
      { id: `trades-${index}`, label: `${label} 거래건수`, value: Number(row.trades), unit: "건", sourceId: "market" },
    ];
  });
  return snapshotSchema.parse({ schemaVersion: 1, rulesVersion: "briefing-v1", statisticsVersion: "auction-unit-weighted-v1",
    periodStart: start.toISOString(), periodEnd: end.toISOString(), generatedAt: now.toISOString(),
    sources: [
      { id: "market", title: "수집된 가락시장 경매 원자료", url: null, status: rows.length ? "AVAILABLE" : "NOT_COLLECTED",
        // Keep filters in the immutable input even when no matching trades exist.
        note: `조회 조건 ${JSON.stringify({ productName: filters.productName, variety: filters.variety || null, origin: filters.origin || null })}. 법인 코드 ${corporations.join(", ")}. 동일 조건 내 수량 가중평균. 수집 완전성 미검증.` },
      ...[ ["cultivation", "재배·기상"], ["commerce", "판매·물류"], ["competitors", "경쟁점 가격"] ].map(([id, title]) => ({
        id, title, url: null, status: "NOT_COLLECTED", note: "자동 자료 수집 연결 전입니다. 변화 없음으로 해석하지 않습니다.",
      })),
    ], metrics,
    limitations: ["지난 완결 주의 수집 자료만 사용하며 중간 누락 여부는 아직 검증하지 않았습니다.",
      "전주 대비·직전 네 주 비교 및 kg 환산은 이번 초안에서 제공하지 않습니다.",
      "재배·기상, 판매·물류, 경쟁점은 미수집이며 관련 사실을 추정하지 않습니다.",
      "같은 거래단위 안에서만 비교합니다. 원거래 중복 식별 방식에 따른 표본 한계가 있습니다.",
      ...(exclusions ? [`가격 또는 수량이 양수가 아닌 원자료 ${exclusions}건은 집계에서 제외했습니다.`] : []),
      ...(!rows.length ? ["해당 조건에서 유효한 거래를 찾지 못했습니다. 실제 시장에 거래가 없었다는 뜻은 아닙니다."] : []),
    ],
  });
}
