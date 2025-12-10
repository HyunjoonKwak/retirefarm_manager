import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { z } from "zod";
import prisma from "@/lib/prisma";
import { authOptions } from "@/lib/auth/options";

const addWatchlistSchema = z.object({
  itemCode: z.string().min(1, "품목 코드를 입력해주세요."),
  itemName: z.string().min(1, "품목명을 입력해주세요."),
});

// GET: 관심 품목 목록 조회
export async function GET() {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.id) {
      return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
    }

    const watchlist = await prisma.priceWatchlist.findMany({
      where: { userId: session.user.id },
      orderBy: { itemName: "asc" },
    });

    return NextResponse.json({ watchlist });
  } catch (error) {
    console.error("Get watchlist error:", error);
    return NextResponse.json(
      { error: "관심 품목 조회 중 오류가 발생했습니다." },
      { status: 500 }
    );
  }
}

// POST: 관심 품목 추가
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.id) {
      return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
    }

    const body = await request.json();
    const validatedData = addWatchlistSchema.parse(body);

    // 중복 확인
    const existing = await prisma.priceWatchlist.findUnique({
      where: {
        userId_itemCode: {
          userId: session.user.id,
          itemCode: validatedData.itemCode,
        },
      },
    });

    if (existing) {
      return NextResponse.json(
        { error: "이미 관심 품목에 등록되어 있습니다." },
        { status: 400 }
      );
    }

    const item = await prisma.priceWatchlist.create({
      data: {
        userId: session.user.id,
        itemCode: validatedData.itemCode,
        itemName: validatedData.itemName,
      },
    });

    return NextResponse.json({
      message: "관심 품목이 추가되었습니다.",
      item,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      const firstIssue = error.issues[0];
      return NextResponse.json(
        { error: firstIssue?.message || "입력값이 올바르지 않습니다." },
        { status: 400 }
      );
    }

    console.error("Add watchlist error:", error);
    return NextResponse.json(
      { error: "관심 품목 추가 중 오류가 발생했습니다." },
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
    const itemCode = searchParams.get("itemCode");

    if (!itemCode) {
      return NextResponse.json({ error: "품목 코드가 필요합니다." }, { status: 400 });
    }

    const existing = await prisma.priceWatchlist.findUnique({
      where: {
        userId_itemCode: {
          userId: session.user.id,
          itemCode,
        },
      },
    });

    if (!existing) {
      return NextResponse.json({ error: "품목을 찾을 수 없습니다." }, { status: 404 });
    }

    await prisma.priceWatchlist.delete({
      where: {
        userId_itemCode: {
          userId: session.user.id,
          itemCode,
        },
      },
    });

    return NextResponse.json({ message: "관심 품목이 삭제되었습니다." });
  } catch (error) {
    console.error("Delete watchlist error:", error);
    return NextResponse.json(
      { error: "관심 품목 삭제 중 오류가 발생했습니다." },
      { status: 500 }
    );
  }
}
