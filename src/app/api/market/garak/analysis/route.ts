import { marketWindowStart } from "@/lib/market-date";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import prisma from "@/lib/prisma";
import { getSessionUser } from "@/lib/auth/guards";
import { logger } from "@/lib/logger";
import { summarizeVarietyTrades } from "@/lib/market-analysis";

const querySchema = z.object({
  productName: z.string().trim().min(1).max(50),
  days: z.coerce.number().int().min(1).max(730).default(30),
  grade: z.string().max(30).optional(),
  varieties: z.string().max(500).optional(),
  origin: z.string().max(50).optional(), unit: z.string().max(30).optional(),
});
export async function GET(request: NextRequest) {
  if (!(await getSessionUser())) return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  const parsed = querySchema.safeParse(Object.fromEntries(request.nextUrl.searchParams));
  if (!parsed.success) return NextResponse.json({ error: "품목과 조회 기간을 확인해 주세요." }, { status: 400 });
  const { productName, days, origin, unit, grade, varieties } = parsed.data;
  const asOf = new Date();
  const since = marketWindowStart(days, asOf);
  try {
    const rows = await prisma.auctionResult.findMany({
      where: { productName, auctionDate: { gte: since }, ...(origin ? { origin: { contains: origin } } : {}), ...(unit ? { unit } : {}), ...(grade ? { grade } : {}), ...(varieties ? { variety: { in: varieties.split(",").map(v => v.trim()).filter(Boolean) } } : {}) },
      select: { id: true, variety: true, grade: true, unit: true, price: true, quantity: true, auctionDate: true, origin: true, corporation: true },
      orderBy: [{ auctionDate: "desc" }, { id: "asc" }], take: 20001,
    });
    return NextResponse.json({
      ...summarizeVarietyTrades(rows.slice(0, 20000)),
      truncated: rows.length > 20000, analyzedCount: Math.min(rows.length, 20000),
      scope: { productName, days, origin: origin || null, unit: unit || null, grade: grade || null, varieties: varieties?.split(",").map(v => v.trim()).filter(Boolean) ?? [] },
      asOf: asOf.toISOString(), collectionState: "stored_records_only", statisticsVersion: 1,
    });
  } catch (error) {
    logger.error("Market analysis failed", error);
    return NextResponse.json({ error: "품종별 가격 분석을 불러오지 못했습니다." }, { status: 500 });
  }
}
