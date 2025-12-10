import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import prisma from "@/lib/prisma";
import { authOptions } from "@/lib/auth/options";

// 주요 농산물 목록 (실제로는 외부 API에서 가져와야 함)
const SAMPLE_ITEMS = [
  { itemCode: "411", itemName: "쌀", unit: "20kg" },
  { itemCode: "312", itemName: "배추", unit: "10kg" },
  { itemCode: "314", itemName: "양배추", unit: "8kg" },
  { itemCode: "313", itemName: "시금치", unit: "4kg" },
  { itemCode: "315", itemName: "상추", unit: "4kg" },
  { itemCode: "421", itemName: "사과", unit: "10kg" },
  { itemCode: "422", itemName: "배", unit: "15kg" },
  { itemCode: "424", itemName: "포도", unit: "5kg" },
  { itemCode: "425", itemName: "감귤", unit: "10kg" },
  { itemCode: "611", itemName: "딸기", unit: "2kg" },
  { itemCode: "612", itemName: "수박", unit: "1개" },
  { itemCode: "613", itemName: "참외", unit: "10kg" },
  { itemCode: "614", itemName: "토마토", unit: "10kg" },
  { itemCode: "316", itemName: "오이", unit: "100개" },
  { itemCode: "317", itemName: "호박", unit: "10kg" },
  { itemCode: "318", itemName: "고추", unit: "10kg" },
  { itemCode: "321", itemName: "무", unit: "20kg" },
  { itemCode: "322", itemName: "당근", unit: "20kg" },
  { itemCode: "323", itemName: "감자", unit: "20kg" },
  { itemCode: "324", itemName: "고구마", unit: "10kg" },
];

// GET: 시세 정보 조회
export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.id) {
      return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const itemCode = searchParams.get("itemCode");
    const search = searchParams.get("search");

    // 품목 목록 반환 (검색 기능)
    if (search !== null) {
      const filteredItems = SAMPLE_ITEMS.filter(
        (item) =>
          item.itemName.includes(search) || item.itemCode.includes(search)
      );
      return NextResponse.json({ items: filteredItems });
    }

    // 특정 품목의 시세 조회
    if (itemCode) {
      // 캐시된 데이터 조회 (최근 30일)
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

      const prices = await prisma.marketPriceCache.findMany({
        where: {
          itemCode,
          date: {
            gte: thirtyDaysAgo,
          },
        },
        orderBy: { date: "desc" },
        take: 30,
      });

      const serializedPrices = prices.map((price) => ({
        ...price,
        avgPrice: price.avgPrice.toString(),
        maxPrice: price.maxPrice.toString(),
        minPrice: price.minPrice.toString(),
        tradingVolume: price.tradingVolume.toString(),
      }));

      return NextResponse.json({ prices: serializedPrices });
    }

    // 전체 품목 목록 반환
    return NextResponse.json({ items: SAMPLE_ITEMS });
  } catch (error) {
    console.error("Get prices error:", error);
    return NextResponse.json(
      { error: "시세 조회 중 오류가 발생했습니다." },
      { status: 500 }
    );
  }
}
