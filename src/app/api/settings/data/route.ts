import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import prisma from "@/lib/prisma";
import { authOptions } from "@/lib/auth/options";

// GET: 사용자 데이터 내보내기
export async function GET() {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.id) {
      return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
    }

    const userId = session.user.id;

    // 모든 사용자 데이터 조회
    const [
      user,
      retirementGoal,
      farmProfile,
      setupCostItems,
      fundingSources,
      farmingLogs,
      crops,
      transactions,
      inventory,
      watchlist,
    ] = await Promise.all([
      prisma.user.findUnique({
        where: { id: userId },
        select: { email: true, name: true, createdAt: true },
      }),
      prisma.retirementGoal.findUnique({ where: { userId } }),
      prisma.farmProfile.findUnique({ where: { userId } }),
      prisma.setupCostItem.findMany({
        where: { userId },
        include: { subcategory: { include: { category: true } } },
      }),
      prisma.fundingSource.findMany({ where: { userId } }),
      prisma.farmingLog.findMany({
        where: { userId },
        include: { activities: true },
      }),
      prisma.crop.findMany({ where: { userId } }),
      prisma.financialTransaction.findMany({ where: { userId } }),
      prisma.inventoryItem.findMany({ where: { userId } }),
      prisma.priceWatchlist.findMany({ where: { userId } }),
    ]);

    // BigInt/Decimal을 문자열로 변환하는 함수
    function serializeData<T>(data: T): T {
      return JSON.parse(
        JSON.stringify(data, (_, value) =>
          typeof value === "bigint" ? value.toString() : value
        )
      );
    }

    const exportData = {
      exportedAt: new Date().toISOString(),
      version: "1.0",
      user: serializeData(user),
      retirementGoal: serializeData(retirementGoal),
      farmProfile: serializeData(farmProfile),
      setupCostItems: serializeData(setupCostItems),
      fundingSources: serializeData(fundingSources),
      farmingLogs: serializeData(farmingLogs),
      crops: serializeData(crops),
      transactions: serializeData(transactions),
      inventory: serializeData(inventory),
      watchlist: serializeData(watchlist),
    };

    return NextResponse.json({ data: exportData });
  } catch (error) {
    console.error("Export data error:", error);
    return NextResponse.json(
      { error: "데이터 내보내기 중 오류가 발생했습니다." },
      { status: 500 }
    );
  }
}

// DELETE: 계정 삭제
export async function DELETE() {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.id) {
      return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
    }

    // 사용자 삭제 (Cascade로 관련 데이터 자동 삭제)
    await prisma.user.delete({
      where: { id: session.user.id },
    });

    return NextResponse.json({ message: "계정이 삭제되었습니다." });
  } catch (error) {
    console.error("Delete account error:", error);
    return NextResponse.json(
      { error: "계정 삭제 중 오류가 발생했습니다." },
      { status: 500 }
    );
  }
}
