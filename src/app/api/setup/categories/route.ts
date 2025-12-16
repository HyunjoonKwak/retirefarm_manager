import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import prisma from "@/lib/prisma";
import { authOptions } from "@/lib/auth/options";

// GET: 비용 카테고리 및 서브카테고리 목록 조회
export async function GET() {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.id) {
      return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
    }

    const categories = await prisma.setupCostCategory.findMany({
      orderBy: { order: "asc" },
      include: {
        subcategories: {
          orderBy: { order: "asc" },
          include: {
            items: {
              where: { userId: session.user.id },
              orderBy: { createdAt: "asc" },
            },
          },
        },
      },
    });

    // BigInt를 문자열로 변환
    const serializedCategories = categories.map((category) => ({
      ...category,
      subcategories: category.subcategories.map((subcategory) => ({
        ...subcategory,
        items: subcategory.items.map((item) => ({
          ...item,
          estimatedCost: item.estimatedCost.toString(),
          actualCost: item.actualCost?.toString() || null,
          areaInPyeong: item.areaInPyeong?.toString() || null,
          pricePerPyeong: item.pricePerPyeong?.toString() || null,
          personCount: item.personCount || null,
          pricePerPerson: item.pricePerPerson?.toString() || null,
          durationMonths: item.durationMonths || null,
          subsidyAmount: item.subsidyAmount?.toString() || null,
          subsidyRate: item.subsidyRate ? Number(item.subsidyRate) : null,
        })),
      })),
    }));

    return NextResponse.json({ categories: serializedCategories });
  } catch (error) {
    console.error("Get categories error:", error);
    return NextResponse.json(
      { error: "카테고리 조회 중 오류가 발생했습니다." },
      { status: 500 }
    );
  }
}
