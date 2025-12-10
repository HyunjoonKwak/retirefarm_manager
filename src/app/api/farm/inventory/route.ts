import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { z } from "zod";
import prisma from "@/lib/prisma";
import { authOptions } from "@/lib/auth/options";

const createItemSchema = z.object({
  name: z.string().min(1, "품목명을 입력해주세요."),
  category: z.enum(["SEED", "FERTILIZER", "PESTICIDE", "TOOL", "PACKAGING", "OTHER"]),
  currentQuantity: z.number().min(0, "수량은 0 이상이어야 합니다."),
  unit: z.string().min(1, "단위를 입력해주세요."),
  minimumQuantity: z.number().min(0).default(0),
  lastPurchaseDate: z.string().optional(),
  lastPurchasePrice: z.number().min(0).optional(),
  location: z.string().optional(),
  expirationDate: z.string().optional(),
});

// GET: 재고 목록 조회
export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.id) {
      return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const category = searchParams.get("category");
    const lowStock = searchParams.get("lowStock") === "true";

    const whereClause: {
      userId: string;
      category?: "SEED" | "FERTILIZER" | "PESTICIDE" | "TOOL" | "PACKAGING" | "OTHER";
    } = {
      userId: session.user.id,
    };

    if (category && ["SEED", "FERTILIZER", "PESTICIDE", "TOOL", "PACKAGING", "OTHER"].includes(category)) {
      whereClause.category = category as typeof whereClause.category;
    }

    const items = await prisma.inventoryItem.findMany({
      where: whereClause,
      include: {
        transactions: {
          take: 5,
          orderBy: { date: "desc" },
        },
      },
      orderBy: { name: "asc" },
    });

    // 재고 부족 필터링
    let filteredItems = items;
    if (lowStock) {
      filteredItems = items.filter(
        (item) => Number(item.currentQuantity) <= Number(item.minimumQuantity)
      );
    }

    // Decimal을 숫자로 변환
    const serializedItems = filteredItems.map((item) => ({
      ...item,
      currentQuantity: Number(item.currentQuantity),
      minimumQuantity: Number(item.minimumQuantity),
      lastPurchasePrice: item.lastPurchasePrice ? Number(item.lastPurchasePrice) : null,
      transactions: item.transactions.map((tx) => ({
        ...tx,
        quantity: Number(tx.quantity),
      })),
    }));

    return NextResponse.json({ items: serializedItems });
  } catch (error) {
    console.error("Get inventory error:", error);
    return NextResponse.json(
      { error: "재고 조회 중 오류가 발생했습니다." },
      { status: 500 }
    );
  }
}

// POST: 재고 품목 등록
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.id) {
      return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
    }

    const body = await request.json();
    const validatedData = createItemSchema.parse(body);

    const item = await prisma.inventoryItem.create({
      data: {
        userId: session.user.id,
        name: validatedData.name,
        category: validatedData.category,
        currentQuantity: validatedData.currentQuantity,
        unit: validatedData.unit,
        minimumQuantity: validatedData.minimumQuantity,
        lastPurchaseDate: validatedData.lastPurchaseDate
          ? new Date(validatedData.lastPurchaseDate)
          : null,
        lastPurchasePrice: validatedData.lastPurchasePrice,
        location: validatedData.location,
        expirationDate: validatedData.expirationDate
          ? new Date(validatedData.expirationDate)
          : null,
      },
    });

    return NextResponse.json({
      message: "품목이 등록되었습니다.",
      item: {
        ...item,
        currentQuantity: Number(item.currentQuantity),
        minimumQuantity: Number(item.minimumQuantity),
        lastPurchasePrice: item.lastPurchasePrice ? Number(item.lastPurchasePrice) : null,
      },
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      const firstIssue = error.issues[0];
      return NextResponse.json(
        { error: firstIssue?.message || "입력값이 올바르지 않습니다." },
        { status: 400 }
      );
    }

    console.error("Create inventory item error:", error);
    return NextResponse.json(
      { error: "품목 등록 중 오류가 발생했습니다." },
      { status: 500 }
    );
  }
}
