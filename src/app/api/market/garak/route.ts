import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import prisma from "@/lib/prisma";
import { logger } from "@/lib/logger";
import { getSessionUser, isAdmin } from "@/lib/auth/guards";
import { getMarketVarietyFacets } from "@/lib/services/market-facets";
import {
  getAvailableProducts,
  getProductPriceHistory,
  getProductVarieties,
  getProductOrigins,
  getDailySummary,
  getLatestCollectionDate,
  MAJOR_PRODUCTS,
} from "@/lib/services/garak-market";

const dateStrSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "날짜는 YYYY-MM-DD 형식이어야 합니다.");

const getQuerySchema = z.object({
  action: z
    .enum([
      "products",
      "varieties",
      "facets",
      "origins",
      "history",
      "daily",
      "dailyDetail",
      "checkDate",
      "latest",
    ])
    .nullable(),
  productName: z.string().max(50).nullable(),
  variety: z.string().max(50).nullable(),
  origin: z.string().max(50).nullable(),
  days: z.coerce.number().int().min(1).max(730).catch(30),
  date: dateStrSchema.nullable().catch(null),
  varieties: z.string().max(500).nullable(),
  unit: z.string().max(30).nullable(),
});

// GET: 가락시장 경매 데이터 조회
export async function GET(request: NextRequest) {
  try {
    const user = await getSessionUser();
    if (!user) {
      return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const parsed = getQuerySchema.safeParse({
      action: searchParams.get("action"),
      productName: searchParams.get("productName"),
      variety: searchParams.get("variety"),
      origin: searchParams.get("origin"),
      days: searchParams.get("days") ?? undefined,
      date: searchParams.get("date"),
      varieties: searchParams.get("varieties"),
      unit: searchParams.get("unit"),
    });

    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message || "잘못된 요청입니다." },
        { status: 400 }
      );
    }

    const { action, productName, variety, origin, days, date: dateStr, unit } =
      parsed.data;
    const varietiesParam = parsed.data.varieties;

    if (action === "facets") {
      if (!productName?.trim()) {
        return NextResponse.json({ error: "품목을 선택해 주세요." }, { status: 400 });
      }
      // Unlike legacy queries, malformed windows must not silently become 30 days.
      const facetDays = z.coerce.number().int().min(1).max(730)
        .safeParse(searchParams.get("days") ?? 30);
      if (!facetDays.success) {
        return NextResponse.json({ error: "조회 기간은 1~730일이어야 합니다." }, { status: 400 });
      }
      return NextResponse.json(await getMarketVarietyFacets(productName, facetDays.data, origin, unit));
    }

    // 저장된 품목 목록 조회
    if (action === "products") {
      const savedProducts = await getAvailableProducts();

      if (savedProducts.length === 0) {
        return NextResponse.json({
          products: MAJOR_PRODUCTS,
          source: "default",
        });
      }

      return NextResponse.json({
        products: savedProducts,
        source: "database",
      });
    }

    // 품목별 품종 목록 조회
    if (action === "varieties" && productName) {
      const varieties = await getProductVarieties(productName);
      return NextResponse.json({ varieties });
    }

    // 품목별 산지 목록 조회
    if (action === "origins" && productName) {
      const origins = await getProductOrigins(productName);
      return NextResponse.json({ origins });
    }

    // 품목 가격 히스토리 조회
    if (action === "history" && productName) {
      const varieties = varietiesParam
        ? varietiesParam.split(",").map((v) => v.trim()).filter(Boolean)
        : undefined;

      const { history, noAuctionDates } = await getProductPriceHistory(
        productName,
        days,
        variety || undefined,
        origin || undefined,
        varieties,
        unit || undefined
      );

      return NextResponse.json({
        productName,
        variety,
        varieties,
        origin,
        unit,
        days,
        history,
        noAuctionDates,
      });
    }

    // 특정 날짜의 시세 요약
    if (action === "daily" && dateStr) {
      const date = new Date(dateStr);
      const productsParam = z
        .string()
        .max(500)
        .nullable()
        .catch(null)
        .parse(searchParams.get("products"));
      const productNames = productsParam?.split(",").filter(Boolean);
      const summary = await getDailySummary(date, productNames);
      return NextResponse.json({ date: dateStr, summary });
    }

    // 특정 날짜의 상세 데이터 조회
    if (action === "dailyDetail" && dateStr && productName) {
      const date = new Date(dateStr);
      const startOfDay = new Date(date);
      startOfDay.setHours(0, 0, 0, 0);
      const endOfDay = new Date(date);
      endOfDay.setHours(23, 59, 59, 999);

      const whereClause: {
        auctionDate: { gte: Date; lte: Date };
        productName: string;
        variety?: string;
        origin?: { contains: string };
      } = {
        auctionDate: { gte: startOfDay, lte: endOfDay },
        productName,
      };

      if (variety) whereClause.variety = variety;
      if (origin) whereClause.origin = { contains: origin };

      const results = await prisma.auctionResult.findMany({
        where: whereClause,
        orderBy: { price: "desc" },
      });

      const prices = results.map((r) => r.price);
      const stats =
        prices.length > 0
          ? {
              avgPrice: Math.round(
                prices.reduce((a, b) => a + b, 0) / prices.length
              ),
              maxPrice: Math.max(...prices),
              minPrice: Math.min(...prices),
              tradeCount: results.length,
              totalQuantity: results.reduce((sum, r) => sum + r.quantity, 0),
            }
          : null;

      return NextResponse.json({
        date: dateStr,
        productName,
        variety,
        origin,
        results,
        stats,
        hasData: results.length > 0,
      });
    }

    // 데이터 존재 여부 확인
    if (action === "checkDate" && dateStr) {
      const date = new Date(dateStr);
      const startOfDay = new Date(date);
      startOfDay.setHours(0, 0, 0, 0);
      const endOfDay = new Date(date);
      endOfDay.setHours(23, 59, 59, 999);

      const count = await prisma.auctionResult.count({
        where: {
          auctionDate: { gte: startOfDay, lte: endOfDay },
        },
      });

      return NextResponse.json({
        date: dateStr,
        hasData: count > 0,
        count,
      });
    }

    // 최근 데이터 날짜 조회
    if (action === "latest") {
      const latestDate = await getLatestCollectionDate();
      return NextResponse.json({ latestDate });
    }

    // 기본: 최근 경매 결과 조회
    const latestDate = await getLatestCollectionDate();
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

    const recentResults = await prisma.auctionResult.findMany({
      where: {
        auctionDate: { gte: sevenDaysAgo },
        ...(productName ? { productName } : {}),
      },
      orderBy: [{ auctionDate: "desc" }, { price: "desc" }],
      take: 100,
    });

    return NextResponse.json({
      latestDate,
      results: recentResults,
    });
  } catch (error) {
    logger.error("Get garak data error:", error);
    return NextResponse.json(
      { error: "데이터 조회 중 오류가 발생했습니다." },
      { status: 500 }
    );
  }
}

// DELETE: 특정 날짜 데이터 삭제 (전역 공유 데이터이므로 ADMIN 전용)
export async function DELETE(request: NextRequest) {
  try {
    const user = await getSessionUser();
    if (!user) {
      return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
    }
    if (!isAdmin(user)) {
      return NextResponse.json(
        { error: "관리자만 데이터를 삭제할 수 있습니다." },
        { status: 403 }
      );
    }

    const { searchParams } = new URL(request.url);
    const dateParsed = dateStrSchema.safeParse(searchParams.get("date"));
    const productName = searchParams.get("productName");

    if (!dateParsed.success) {
      return NextResponse.json(
        { error: "날짜(YYYY-MM-DD)가 필요합니다." },
        { status: 400 }
      );
    }

    const date = new Date(dateParsed.data);
    const startOfDay = new Date(date);
    startOfDay.setHours(0, 0, 0, 0);
    const endOfDay = new Date(date);
    endOfDay.setHours(23, 59, 59, 999);

    const whereClause: {
      auctionDate: { gte: Date; lte: Date };
      productName?: string;
    } = {
      auctionDate: { gte: startOfDay, lte: endOfDay },
    };

    if (productName) {
      whereClause.productName = productName;
    }

    const countBefore = await prisma.auctionResult.count({
      where: whereClause,
    });

    const deleteResult = await prisma.auctionResult.deleteMany({
      where: whereClause,
    });

    if (!productName) {
      await prisma.dataCollectionLog.deleteMany({
        where: {
          targetDate: { gte: startOfDay, lte: endOfDay },
        },
      });
    }

    return NextResponse.json({
      message: "데이터가 삭제되었습니다.",
      date: dateParsed.data,
      productName: productName || "전체",
      deletedCount: deleteResult.count,
      countBefore,
    });
  } catch (error) {
    logger.error("Delete garak data error:", error);
    return NextResponse.json(
      { error: "데이터 삭제 중 오류가 발생했습니다." },
      { status: 500 }
    );
  }
}
