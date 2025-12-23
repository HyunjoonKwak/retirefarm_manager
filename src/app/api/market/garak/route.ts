import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import prisma from "@/lib/prisma";
import { authOptions } from "@/lib/auth/options";
import {
  getAvailableProducts,
  getProductPriceHistory,
  getProductVarieties,
  getProductOrigins,
  getDailySummary,
  getLatestCollectionDate,
  MAJOR_PRODUCTS,
} from "@/lib/services/garak-market";

// GET: 가락시장 경매 데이터 조회
export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.id) {
      return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const action = searchParams.get("action");
    const productName = searchParams.get("productName");
    const variety = searchParams.get("variety");
    const origin = searchParams.get("origin");
    const days = parseInt(searchParams.get("days") || "30", 10);
    const dateStr = searchParams.get("date");
    // 새 필터 파라미터
    const varietiesParam = searchParams.get("varieties"); // 쉼표 구분 다중 품종
    const unit = searchParams.get("unit");

    // 저장된 품목 목록 조회
    if (action === "products") {
      const savedProducts = await getAvailableProducts();

      // 저장된 품목이 없으면 주요 품목 목록 반환
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
      // 다중 품종 파라미터 파싱
      const varieties = varietiesParam
        ? varietiesParam.split(",").map(v => v.trim()).filter(Boolean)
        : undefined;

      const history = await getProductPriceHistory(
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
      });
    }

    // 특정 날짜의 시세 요약
    if (action === "daily" && dateStr) {
      const date = new Date(dateStr);
      const productNames = searchParams.get("products")?.split(",").filter(Boolean);
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

      // 통계 계산
      const prices = results.map((r) => r.price);
      const stats = prices.length > 0 ? {
        avgPrice: Math.round(prices.reduce((a, b) => a + b, 0) / prices.length),
        maxPrice: Math.max(...prices),
        minPrice: Math.min(...prices),
        tradeCount: results.length,
        totalQuantity: results.reduce((sum, r) => sum + r.quantity, 0),
      } : null;

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
    console.error("Get garak data error:", error);
    return NextResponse.json(
      { error: "데이터 조회 중 오류가 발생했습니다." },
      { status: 500 }
    );
  }
}

// DELETE: 특정 날짜 데이터 삭제
export async function DELETE(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.id) {
      return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const dateStr = searchParams.get("date");
    const productName = searchParams.get("productName");

    if (!dateStr) {
      return NextResponse.json({ error: "날짜가 필요합니다." }, { status: 400 });
    }

    const date = new Date(dateStr);
    const startOfDay = new Date(date);
    startOfDay.setHours(0, 0, 0, 0);
    const endOfDay = new Date(date);
    endOfDay.setHours(23, 59, 59, 999);

    // 삭제 조건 구성
    const whereClause: {
      auctionDate: { gte: Date; lte: Date };
      productName?: string;
    } = {
      auctionDate: { gte: startOfDay, lte: endOfDay },
    };

    if (productName) {
      whereClause.productName = productName;
    }

    // 삭제 전 개수 확인
    const countBefore = await prisma.auctionResult.count({
      where: whereClause,
    });

    // 데이터 삭제
    const deleteResult = await prisma.auctionResult.deleteMany({
      where: whereClause,
    });

    // 수집 로그도 삭제 (선택적)
    if (!productName) {
      await prisma.dataCollectionLog.deleteMany({
        where: {
          targetDate: { gte: startOfDay, lte: endOfDay },
        },
      });
    }

    return NextResponse.json({
      message: "데이터가 삭제되었습니다.",
      date: dateStr,
      productName: productName || "전체",
      deletedCount: deleteResult.count,
      countBefore,
    });
  } catch (error) {
    console.error("Delete garak data error:", error);
    return NextResponse.json(
      { error: "데이터 삭제 중 오류가 발생했습니다." },
      { status: 500 }
    );
  }
}
