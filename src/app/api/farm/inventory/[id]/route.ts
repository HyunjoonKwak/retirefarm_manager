import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { z } from "zod";
import prisma from "@/lib/prisma";
import { authOptions } from "@/lib/auth/options";

const updateItemSchema = z.object({
  name: z.string().min(1).optional(),
  category: z.enum(["SEED", "FERTILIZER", "PESTICIDE", "TOOL", "PACKAGING", "OTHER"]).optional(),
  currentQuantity: z.number().min(0).optional(),
  unit: z.string().min(1).optional(),
  minimumQuantity: z.number().min(0).optional(),
  lastPurchaseDate: z.string().nullable().optional(),
  lastPurchasePrice: z.number().min(0).nullable().optional(),
  location: z.string().nullable().optional(),
  expirationDate: z.string().nullable().optional(),
});

const adjustQuantitySchema = z.object({
  type: z.enum(["IN", "OUT"]),
  quantity: z.number().min(0.01, "수량은 0보다 커야 합니다."),
  reason: z.string().min(1, "사유를 입력해주세요."),
});

// GET: 개별 품목 조회
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.id) {
      return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
    }

    const { id } = await params;

    const item = await prisma.inventoryItem.findFirst({
      where: {
        id,
        userId: session.user.id,
      },
      include: {
        transactions: {
          orderBy: { date: "desc" },
          take: 20,
        },
      },
    });

    if (!item) {
      return NextResponse.json({ error: "품목을 찾을 수 없습니다." }, { status: 404 });
    }

    return NextResponse.json({
      item: {
        ...item,
        currentQuantity: Number(item.currentQuantity),
        minimumQuantity: Number(item.minimumQuantity),
        lastPurchasePrice: item.lastPurchasePrice ? Number(item.lastPurchasePrice) : null,
        transactions: item.transactions.map((tx) => ({
          ...tx,
          quantity: Number(tx.quantity),
        })),
      },
    });
  } catch (error) {
    console.error("Get inventory item error:", error);
    return NextResponse.json(
      { error: "품목 조회 중 오류가 발생했습니다." },
      { status: 500 }
    );
  }
}

// PATCH: 품목 수정
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.id) {
      return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
    }

    const { id } = await params;
    const body = await request.json();

    // 소유권 확인
    const existingItem = await prisma.inventoryItem.findFirst({
      where: {
        id,
        userId: session.user.id,
      },
    });

    if (!existingItem) {
      return NextResponse.json({ error: "품목을 찾을 수 없습니다." }, { status: 404 });
    }

    // 수량 조정인지 일반 수정인지 확인
    if (body.type && (body.type === "IN" || body.type === "OUT")) {
      const validatedData = adjustQuantitySchema.parse(body);

      const currentQty = Number(existingItem.currentQuantity);
      let newQuantity: number;

      if (validatedData.type === "IN") {
        newQuantity = currentQty + validatedData.quantity;
      } else {
        newQuantity = currentQty - validatedData.quantity;
        if (newQuantity < 0) {
          return NextResponse.json(
            { error: "재고가 부족합니다." },
            { status: 400 }
          );
        }
      }

      // 트랜잭션으로 수량 업데이트 및 이력 기록
      const [item] = await prisma.$transaction([
        prisma.inventoryItem.update({
          where: { id },
          data: { currentQuantity: newQuantity },
        }),
        prisma.inventoryTransaction.create({
          data: {
            itemId: id,
            type: validatedData.type,
            quantity: validatedData.quantity,
            date: new Date(),
            reason: validatedData.reason,
          },
        }),
      ]);

      return NextResponse.json({
        message: validatedData.type === "IN" ? "입고 처리되었습니다." : "출고 처리되었습니다.",
        item: {
          ...item,
          currentQuantity: Number(item.currentQuantity),
          minimumQuantity: Number(item.minimumQuantity),
          lastPurchasePrice: item.lastPurchasePrice ? Number(item.lastPurchasePrice) : null,
        },
      });
    }

    // 일반 수정
    const validatedData = updateItemSchema.parse(body);

    const item = await prisma.inventoryItem.update({
      where: { id },
      data: {
        ...validatedData,
        lastPurchaseDate: validatedData.lastPurchaseDate
          ? new Date(validatedData.lastPurchaseDate)
          : validatedData.lastPurchaseDate === null
          ? null
          : undefined,
        expirationDate: validatedData.expirationDate
          ? new Date(validatedData.expirationDate)
          : validatedData.expirationDate === null
          ? null
          : undefined,
      },
    });

    return NextResponse.json({
      message: "품목이 수정되었습니다.",
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

    console.error("Update inventory item error:", error);
    return NextResponse.json(
      { error: "품목 수정 중 오류가 발생했습니다." },
      { status: 500 }
    );
  }
}

// DELETE: 품목 삭제
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.id) {
      return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
    }

    const { id } = await params;

    // 소유권 확인
    const existingItem = await prisma.inventoryItem.findFirst({
      where: {
        id,
        userId: session.user.id,
      },
    });

    if (!existingItem) {
      return NextResponse.json({ error: "품목을 찾을 수 없습니다." }, { status: 404 });
    }

    await prisma.inventoryItem.delete({
      where: { id },
    });

    return NextResponse.json({ message: "품목이 삭제되었습니다." });
  } catch (error) {
    console.error("Delete inventory item error:", error);
    return NextResponse.json(
      { error: "품목 삭제 중 오류가 발생했습니다." },
      { status: 500 }
    );
  }
}
