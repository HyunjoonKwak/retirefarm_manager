import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import prisma from "@/lib/prisma";
import { authOptions } from "@/lib/auth/options";

// GET: 데이터 현황 조회
export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.id) {
      return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const byDate = searchParams.get("byDate") === "true";

    // 전체 데이터 수
    const totalCount = await prisma.auctionResult.count();

    // 가장 오래된 데이터
    const oldest = await prisma.auctionResult.findFirst({
      orderBy: { auctionDate: "asc" },
      select: { auctionDate: true },
    });

    // 가장 최근 데이터
    const newest = await prisma.auctionResult.findFirst({
      orderBy: { auctionDate: "desc" },
      select: { auctionDate: true },
    });

    // 날짜별 데이터 현황 (byDate=true인 경우)
    if (byDate) {
      const dailyStats = await prisma.auctionResult.groupBy({
        by: ["auctionDate"],
        _count: { id: true },
        orderBy: { auctionDate: "desc" },
      });

      const dailyData = dailyStats.map((stat) => ({
        date: stat.auctionDate.toISOString().split("T")[0],
        count: stat._count.id,
      }));

      return NextResponse.json({
        totalCount,
        oldestDate: oldest?.auctionDate || null,
        newestDate: newest?.auctionDate || null,
        dailyData,
      });
    }

    // 기본: 월별 데이터 분포
    const twelveMonthsAgo = new Date();
    twelveMonthsAgo.setMonth(twelveMonthsAgo.getMonth() - 12);

    const monthlyStats = await prisma.auctionResult.groupBy({
      by: ["auctionDate"],
      where: {
        auctionDate: { gte: twelveMonthsAgo },
      },
      _count: { id: true },
    });

    // 월별로 집계
    const monthlyData: Record<string, number> = {};
    monthlyStats.forEach((stat) => {
      const month = stat.auctionDate.toISOString().substring(0, 7); // YYYY-MM
      monthlyData[month] = (monthlyData[month] || 0) + stat._count.id;
    });

    return NextResponse.json({
      totalCount,
      oldestDate: oldest?.auctionDate || null,
      newestDate: newest?.auctionDate || null,
      monthlyData: Object.entries(monthlyData)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([month, count]) => ({ month, count })),
    });
  } catch (error) {
    console.error("Get data stats error:", error);
    return NextResponse.json(
      { error: "데이터 현황 조회 중 오류가 발생했습니다." },
      { status: 500 }
    );
  }
}

// POST: 오래된 데이터 정리
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.id) {
      return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
    }

    const body = await request.json();
    const { retentionDays = 90 } = body;

    // 최소 7일, 최대 365일
    const validRetention = Math.max(7, Math.min(365, retentionDays));
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - validRetention);

    // 삭제 대상 건수 먼저 조회
    const countToDelete = await prisma.auctionResult.count({
      where: {
        auctionDate: { lt: cutoffDate },
      },
    });

    if (countToDelete === 0) {
      return NextResponse.json({
        message: "삭제할 데이터가 없습니다.",
        deletedCount: 0,
        cutoffDate: cutoffDate.toISOString(),
      });
    }

    // 데이터 삭제
    const result = await prisma.auctionResult.deleteMany({
      where: {
        auctionDate: { lt: cutoffDate },
      },
    });

    return NextResponse.json({
      message: `${result.count}개의 오래된 데이터가 삭제되었습니다.`,
      deletedCount: result.count,
      cutoffDate: cutoffDate.toISOString(),
      retentionDays: validRetention,
    });
  } catch (error) {
    console.error("Cleanup data error:", error);
    return NextResponse.json(
      { error: "데이터 정리 중 오류가 발생했습니다." },
      { status: 500 }
    );
  }
}

// DELETE: 특정 날짜 이전 데이터 삭제 (수동)
export async function DELETE(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.id) {
      return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const beforeDate = searchParams.get("before"); // YYYY-MM-DD

    if (!beforeDate) {
      return NextResponse.json(
        { error: "삭제 기준 날짜(before)가 필요합니다." },
        { status: 400 }
      );
    }

    const cutoffDate = new Date(beforeDate);
    if (isNaN(cutoffDate.getTime())) {
      return NextResponse.json(
        { error: "유효하지 않은 날짜 형식입니다." },
        { status: 400 }
      );
    }

    const result = await prisma.auctionResult.deleteMany({
      where: {
        auctionDate: { lt: cutoffDate },
      },
    });

    return NextResponse.json({
      message: `${result.count}개의 데이터가 삭제되었습니다.`,
      deletedCount: result.count,
      beforeDate,
    });
  } catch (error) {
    console.error("Delete data error:", error);
    return NextResponse.json(
      { error: "데이터 삭제 중 오류가 발생했습니다." },
      { status: 500 }
    );
  }
}
