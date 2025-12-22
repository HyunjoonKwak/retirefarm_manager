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
      const history = await getProductPriceHistory(
        productName,
        days,
        variety || undefined,
        origin || undefined
      );

      return NextResponse.json({
        productName,
        variety,
        origin,
        days,
        history,
      });
    }

    // 특정 날짜의 시세 요약
    if (action === "daily" && dateStr) {
      const date = new Date(dateStr);
      const productNames = searchParams.get("products")?.split(",");
      const summary = await getDailySummary(date, productNames);
      return NextResponse.json({ date: dateStr, summary });
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
