import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import prisma from "@/lib/prisma";
import { logger } from "@/lib/logger";
import { authOptions } from "@/lib/auth/options";
import { CORPORATION_CODES } from "@/lib/services/garak-market";

// GET: 수집 로그 조회
export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.id) {
      return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const days = parseInt(searchParams.get("days") || "7", 10);
    const status = searchParams.get("status"); // SUCCESS, FAILED, PARTIAL

    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);

    const where: {
      startedAt: { gte: Date };
      status?: string;
    } = {
      startedAt: { gte: startDate },
    };

    if (status) {
      where.status = status;
    }

    const logs = await prisma.dataCollectionLog.findMany({
      where,
      orderBy: { startedAt: "desc" },
      take: 100,
    });

    // 법인명 추가
    const logsWithNames = logs.map((log) => ({
      ...log,
      corporationName: CORPORATION_CODES[log.corporation] || log.corporation,
    }));

    // 요약 통계
    const summary = {
      total: logs.length,
      success: logs.filter((l) => l.status === "SUCCESS").length,
      failed: logs.filter((l) => l.status === "FAILED").length,
      totalRecords: logs.reduce((sum, l) => sum + l.totalCount, 0),
      newRecords: logs.reduce((sum, l) => sum + l.newCount, 0),
    };

    return NextResponse.json({
      logs: logsWithNames,
      summary,
    });
  } catch (error) {
    logger.error("Get collection logs error:", error);
    return NextResponse.json(
      { error: "로그 조회 중 오류가 발생했습니다." },
      { status: 500 }
    );
  }
}

// DELETE: 오래된 로그 정리
export async function DELETE(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.id) {
      return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const days = parseInt(searchParams.get("days") || "30", 10);

    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - days);

    const result = await prisma.dataCollectionLog.deleteMany({
      where: {
        startedAt: { lt: cutoffDate },
      },
    });

    return NextResponse.json({
      message: `${result.count}개의 로그가 삭제되었습니다.`,
      deletedCount: result.count,
    });
  } catch (error) {
    logger.error("Delete logs error:", error);
    return NextResponse.json(
      { error: "로그 삭제 중 오류가 발생했습니다." },
      { status: 500 }
    );
  }
}
