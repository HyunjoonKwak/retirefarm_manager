import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { z } from "zod";
import prisma from "@/lib/prisma";
import { logger } from "@/lib/logger";
import { authOptions } from "@/lib/auth/options";
import { getWatchlistPriceInfo } from "@/lib/services/garak-market";

const addWatchlistSchema = z.object({
  productName: z.string().min(1, "품목명을 입력해주세요."),
  variety: z.string().optional(),
  origin: z.string().optional(),
  targetPrice: z.number().optional(),
});

// GET: 관심 품목 목록 조회
export async function GET() {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.id) {
      return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
    }

    const watchlist = await prisma.productWatchlist.findMany({
      where: { userId: session.user.id },
      orderBy: { createdAt: "desc" },
    });

    // 각 관심 품목의 최신 시세 정보 (일자별 가중평균 기준 변동률)
    const watchlistWithPrices = await Promise.all(
      watchlist.map(async (item) => {
        const priceInfo = await getWatchlistPriceInfo(
          item.productName,
          item.variety || undefined,
          item.origin || undefined
        );
        return { ...item, ...priceInfo };
      })
    );

    return NextResponse.json({ watchlist: watchlistWithPrices });
  } catch (error) {
    logger.error("Get watchlist error:", error);
    return NextResponse.json(
      { error: "관심 품목 조회 중 오류가 발생했습니다." },
      { status: 500 }
    );
  }
}

// POST: 관심 품목 등록
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.id) {
      return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
    }

    const body = await request.json();
    const validatedData = addWatchlistSchema.parse(body);

    // 중복 확인
    const existing = await prisma.productWatchlist.findUnique({
      where: {
        userId_productName_variety_origin: {
          userId: session.user.id,
          productName: validatedData.productName,
          variety: validatedData.variety || "",
          origin: validatedData.origin || "",
        },
      },
    });

    if (existing) {
      return NextResponse.json(
        { error: "이미 등록된 관심 품목입니다." },
        { status: 400 }
      );
    }

    const watchlistItem = await prisma.productWatchlist.create({
      data: {
        userId: session.user.id,
        productName: validatedData.productName,
        variety: validatedData.variety || "",
        origin: validatedData.origin || "",
        targetPrice: validatedData.targetPrice || null,
      },
    });

    return NextResponse.json({
      message: "관심 품목이 등록되었습니다.",
      item: watchlistItem,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: error.issues[0]?.message || "입력값이 올바르지 않습니다." },
        { status: 400 }
      );
    }

    logger.error("Add watchlist error:", error);
    return NextResponse.json(
      { error: "관심 품목 등록 중 오류가 발생했습니다." },
      { status: 500 }
    );
  }
}

// DELETE: 관심 품목 삭제
export async function DELETE(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.id) {
      return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");

    if (!id) {
      return NextResponse.json({ error: "ID가 필요합니다." }, { status: 400 });
    }

    // 소유권 확인
    const item = await prisma.productWatchlist.findUnique({
      where: { id },
    });

    if (!item || item.userId !== session.user.id) {
      return NextResponse.json(
        { error: "삭제 권한이 없습니다." },
        { status: 403 }
      );
    }

    await prisma.productWatchlist.delete({
      where: { id },
    });

    return NextResponse.json({ message: "관심 품목이 삭제되었습니다." });
  } catch (error) {
    logger.error("Delete watchlist error:", error);
    return NextResponse.json(
      { error: "관심 품목 삭제 중 오류가 발생했습니다." },
      { status: 500 }
    );
  }
}
