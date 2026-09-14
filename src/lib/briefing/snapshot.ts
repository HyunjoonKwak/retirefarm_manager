import { Prisma } from "@prisma/client";
import prisma from "@/lib/prisma";
import { snapshotSchema, type BriefingSnapshot } from "./contracts";
import { summarizeCoverage } from "./coverage";
import { supplementalSources } from "./supplemental-sources";

export function previousWeek(now = new Date()) {
  const kst = new Date(now.getTime() + 9 * 3600_000);
  const end = Date.UTC(kst.getUTCFullYear(), kst.getUTCMonth(), kst.getUTCDate() - (kst.getUTCDay() + 6) % 7) - 9 * 3600_000;
  return { start: new Date(end - 7 * 86400_000), end: new Date(end) };
}
export interface SnapshotFilters { productName: string; origin?: string; variety?: string }
type Group = { corporationCode: string; corporation: string; productName: string; variety: string;
  origin: string; unit: string; grade: string; amount: bigint | number; volume: bigint | number; trades: bigint | number; days: number;
  prevAmount: number; prevVolume: number; prevTrades: number; prevDays: number; fourAmount: number; fourVolume: number; fourTrades: number; fourDays: number };
export async function buildSnapshot(userId: string, filters: SnapshotFilters, now = new Date()): Promise<BriefingSnapshot> {
  const { start, end } = previousWeek(now);
  const previousStart = new Date(start.getTime() - 7 * 86400_000);
  const fourStart = new Date(start.getTime() - 28 * 86400_000);
  const settings = await prisma.marketCollectionSettings.findUnique({ where: { userId } });
  const corporations = [...new Set((settings?.corporationCodes ?? "11000101,11000102").split(",").map(code => code.trim()).filter(Boolean))].sort();
  if (!corporations.length) throw new Error("NO_CORPORATIONS");
  // LIMIT detects excessive groups, never quietly drops trades from a group or publishes a partial set.
  const rows = await prisma.$queryRaw<Group[]>(Prisma.sql`
    SELECT "corporationCode", "corporation", "productName", "variety", "origin", "unit", "grade",
      SUM(CASE WHEN "auctionDate" >= ${start} THEN CAST("price" AS REAL) * "quantity" ELSE 0 END) AS amount,
      SUM(CASE WHEN "auctionDate" >= ${start} THEN "quantity" ELSE 0 END) AS volume,
      SUM(CASE WHEN "auctionDate" >= ${start} THEN 1 ELSE 0 END) AS trades,
      COUNT(DISTINCT CASE WHEN "auctionDate" >= ${start} THEN date("auctionDate" / 1000, 'unixepoch', '+9 hours') END) AS days,
      SUM(CASE WHEN "auctionDate" >= ${previousStart} AND "auctionDate" < ${start} THEN CAST("price" AS REAL) * "quantity" ELSE 0 END) AS prevAmount,
      SUM(CASE WHEN "auctionDate" >= ${previousStart} AND "auctionDate" < ${start} THEN "quantity" ELSE 0 END) AS prevVolume,
      SUM(CASE WHEN "auctionDate" >= ${previousStart} AND "auctionDate" < ${start} THEN 1 ELSE 0 END) AS prevTrades,
      COUNT(DISTINCT CASE WHEN "auctionDate" >= ${previousStart} AND "auctionDate" < ${start} THEN date("auctionDate" / 1000, 'unixepoch', '+9 hours') END) AS prevDays,
      SUM(CASE WHEN "auctionDate" < ${start} THEN CAST("price" AS REAL) * "quantity" ELSE 0 END) AS fourAmount,
      SUM(CASE WHEN "auctionDate" < ${start} THEN "quantity" ELSE 0 END) AS fourVolume,
      SUM(CASE WHEN "auctionDate" < ${start} THEN 1 ELSE 0 END) AS fourTrades,
      COUNT(DISTINCT CASE WHEN "auctionDate" < ${start} THEN date("auctionDate" / 1000, 'unixepoch', '+9 hours') END) AS fourDays
    FROM "AuctionResult"
    WHERE "auctionDate" >= ${fourStart} AND "auctionDate" < ${end}
      AND "productName" = ${filters.productName} AND "corporationCode" IN (${Prisma.join(corporations)})
      AND "price" > 0 AND "quantity" > 0
      ${filters.origin ? Prisma.sql`AND "origin" = ${filters.origin}` : Prisma.empty}
      ${filters.variety ? Prisma.sql`AND "variety" = ${filters.variety}` : Prisma.empty}
    GROUP BY "corporationCode", "corporation", "productName", "variety", "origin", "unit", "grade"
    HAVING SUM(CASE WHEN "auctionDate" >= ${start} THEN "quantity" ELSE 0 END) > 0
    ORDER BY "corporationCode", "corporation", "productName", "variety", "origin", "unit", "grade" LIMIT 201`);
  if (rows.length > 200) throw new Error("TOO_MANY_GROUPS");
  const exclusions = await prisma.auctionResult.count({ where: {
    auctionDate: { gte: start, lt: end }, productName: filters.productName,
    corporationCode: { in: corporations }, ...(filters.origin ? { origin: filters.origin } : {}),
    ...(filters.variety ? { variety: filters.variety } : {}), OR: [{ price: { lte: 0 } }, { quantity: { lte: 0 } }],
  } });
  const logs = await prisma.dataCollectionLog.findMany({ where: {
    targetDate: { gte: fourStart, lt: end }, corporation: { in: corporations }, startedAt: { lte: now },
  }, select: { id: true, targetDate: true, corporation: true, targetProducts: true, status: true, startedAt: true, completedAt: true } });
  const coverageFor = (from: Date, to: Date, codes = corporations) => summarizeCoverage({
    start: from, end: to, corporations: codes, productName: filters.productName, logs, now,
  });
  const coverage = { current: coverageFor(start, end), previous: coverageFor(previousStart, start), fourWeeks: coverageFor(fourStart, start) };
  // Per-corporation coverage prevents an unrelated corporation from hiding a valid comparison.
  const verified = new Map(corporations.map(code => [code, {
    current: coverageFor(start, end, [code]), previous: coverageFor(previousStart, start, [code]), fourWeeks: coverageFor(fourStart, start, [code]),
  }]));
  const comparisons = rows.map((row, index) => {
    const checks = verified.get(row.corporationCode)!;
    const compare = (amount: number, volume: number, trades: number, days: number, window: typeof checks.previous) => {
      const price = Number(volume) > 0 ? Number(amount) / Number(volume) : null;
      const status = price === null ? "NO_BASELINE" : Number(row.trades) < 3 || Number(trades) < 3 || Number(row.days) < 2 || Number(days) < 2
        ? "LOW_SAMPLE" : checks.current.verifiedSlots !== checks.current.totalSlots || window.verifiedSlots !== window.totalSlots
          ? "UNVERIFIED_COLLECTION" : "COMPARABLE";
      return { price, tradeCount: Number(trades), observedDays: Number(days), status,
        changePct: status === "COMPARABLE" ? (Number(row.amount) / Number(row.volume) / price! - 1) * 100 : null };
    };
    return { metricId: `price-${index}`, currentDays: Number(row.days), currentTrades: Number(row.trades),
      previous: compare(row.prevAmount, row.prevVolume, row.prevTrades, row.prevDays, checks.previous),
      fourWeeks: compare(row.fourAmount, row.fourVolume, row.fourTrades, row.fourDays, checks.fourWeeks) };
  });
  const metrics = rows.flatMap((row, index) => {
    const label = [row.corporation, row.productName, row.variety || "품종 미기재", row.origin || "산지 미기재", row.grade || "등급 미기재", row.unit].join(" · ");
    return [
      { id: `price-${index}`, label, value: Number(row.amount) / Number(row.volume), unit: `원/${row.unit}`, sourceId: "market" },
      { id: `volume-${index}`, label: `${label} 거래수량`, value: Number(row.volume), unit: "원자료 QTY", sourceId: "market" },
      { id: `trades-${index}`, label: `${label} 거래건수`, value: Number(row.trades), unit: "건", sourceId: "market" },
    ];
  });
  const supplemental = await supplementalSources(userId, start, end, now);
  return snapshotSchema.parse({ schemaVersion: 1, rulesVersion: "briefing-v1", statisticsVersion: "auction-unit-weighted-v1",
    periodStart: start.toISOString(), periodEnd: end.toISOString(), generatedAt: now.toISOString(),
    sources: [
      { id: "market", title: "수집된 가락시장 경매 원자료", url: null, status: rows.length ? "AVAILABLE" : "NOT_COLLECTED",
        // Keep filters in the immutable input even when no matching trades exist.
        note: `조회 조건 ${JSON.stringify({ productName: filters.productName, variety: filters.variety || null, origin: filters.origin || null })}. 법인 코드 ${corporations.join(", ")}. 동일 조건 내 수량 가중평균. 수집 로그 확인은 원자료 보존·시장 전체 완전성의 보증이 아닙니다.` },
      ...[ ["cultivation", "재배·기상"], ["commerce", "판매·물류"] ].map(([id, title]) => ({
        id, title, url: null, status: "NOT_COLLECTED", note: "자동 자료 수집 연결 전입니다. 변화 없음으로 해석하지 않습니다.",
      })),
      ...supplemental.sources,
    ], metrics: [...metrics, ...supplemental.metrics], analysis: { version: 1, coverage, comparisons },
    limitations: ["수집 확인은 품목·법인·날짜별 최신 적용 로그 기준입니다. 확인 기록 없음은 휴장이나 실제 무거래를 뜻하지 않습니다.",
      "같은 법인·품종·산지·등급·단위의 수량 가중평균을 비교하며 공개 일평균 시계열과 구분합니다. kg 환산은 제공하지 않습니다.",
      "보고 주간과 비교 기간 모두 수집 완료 기록이 있고 각각 거래 세 건·관측 이틀 이상일 때만 등락률을 표시합니다. 통계적 유의성을 보장하는 기준은 아닙니다.",
      "직전 네 주 기준가는 해당 기간의 전체 유효 거래를 수량 가중한 값이며 주간 평균의 단순평균이 아닙니다. 이번 주에 관측된 조건만 비교합니다.",
      "수집 로그의 성공은 원자료가 현재까지 온전히 보존됐거나 시장 전체가 완전하게 수집됐다는 보증이 아닙니다.",
      "재배·기상, 판매·물류의 최신 외부 자료는 미수집이며 관련 사실을 추정하지 않습니다.",
      ...supplemental.limitations,
      "같은 거래단위 안에서만 비교합니다. 원거래 중복 식별 방식에 따른 표본 한계가 있습니다.",
      ...(exclusions ? [`가격 또는 수량이 양수가 아닌 원자료 ${exclusions}건은 집계에서 제외했습니다.`] : []),
      ...(!rows.length ? ["해당 조건에서 유효한 거래를 찾지 못했습니다. 실제 시장에 거래가 없었다는 뜻은 아닙니다."] : []),
    ],
  });
}
