import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import prisma from "@/lib/prisma";
import { logger } from "@/lib/logger";
import { getSessionUser, isAdmin } from "@/lib/auth/guards";
import { formatDateKey } from "@/lib/services/garak-market";

// GET: 데이터 현황 조회
export async function GET(request: NextRequest) {
  try {
    const user = await getSessionUser();
    if (!user) {
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
        date: formatDateKey(stat.auctionDate),
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
      const month = formatDateKey(stat.auctionDate).substring(0, 7); // YYYY-MM
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
    logger.error("Get data stats error:", error);
    return NextResponse.json(
      { error: "데이터 현황 조회 중 오류가 발생했습니다." },
      { status: 500 }
    );
  }
}

const cleanupSchema = z.object({
  retentionDays: z.coerce.number().int().min(7).max(365).catch(90),
});

// POST: 오래된 데이터 정리 (전역 공유 데이터이므로 ADMIN 전용)
export async function POST(request: NextRequest) {
  try {
    const user = await getSessionUser();
    if (!user) {
      return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
    }
    if (!isAdmin(user)) {
      return NextResponse.json(
        { error: "관리자만 데이터를 정리할 수 있습니다." },
        { status: 403 }
      );
    }

    const body = await request.json().catch(() => ({}));
    const { retentionDays: validRetention } = cleanupSchema.parse(body);
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
    logger.error("Cleanup data error:", error);
    return NextResponse.json(
      { error: "데이터 정리 중 오류가 발생했습니다." },
      { status: 500 }
    );
  }
}

// DELETE: 특정 날짜 이전 데이터 삭제 (전역 공유 데이터이므로 ADMIN 전용)
export async function DELETE(request: NextRequest) {
  try {
    const user = await getSessionUser();
    if (!user) {
      return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
    }
    if (!isAdmin(user)) {
      return NextResponse.json(
        { error: "관리자만 데이터를 삭제할 수 있습니다." },
        { status: 403 }
      );
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
    logger.error("Delete data error:", error);
    return NextResponse.json(
      { error: "데이터 삭제 중 오류가 발생했습니다." },
      { status: 500 }
    );
  }
}
