import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { collectAndSaveAuctionData } from "@/lib/services/garak-market";

// Vercel Cron을 위한 설정
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300; // 5분

/**
 * GET: 스케줄된 자동 수집 실행
 * Vercel Cron에서 호출되거나 수동 테스트용
 */
export async function GET(request: NextRequest) {
  try {
    // Vercel Cron 인증 확인
    const authHeader = request.headers.get("authorization");
    const cronSecret = process.env.CRON_SECRET;

    // 개발 환경이 아닌 경우 CRON_SECRET 검증
    if (process.env.NODE_ENV !== "development" && cronSecret) {
      if (authHeader !== `Bearer ${cronSecret}`) {
        return NextResponse.json(
          { error: "Unauthorized" },
          { status: 401 }
        );
      }
    }

    // 현재 시간 기준으로 수집해야 할 사용자 설정 조회
    const now = new Date();
    const currentTime = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
    const currentDay = now.getDay(); // 0=일, 1=월, ..., 6=토

    // 현재 시간 +/- 5분 범위 내의 설정 조회
    const allSettings = await prisma.marketCollectionSettings.findMany({
      where: {
        autoCollectEnabled: true,
      },
    });

    // 시간 및 요일 비교
    const settingsToRun = allSettings.filter((s) => {
      // 1. 요일 체크
      const collectDays = s.collectDays.split(",").filter(Boolean).map(Number);
      if (!collectDays.includes(currentDay)) {
        return false;
      }

      // 2. 시간 비교 (현재 시간과 15분 이내 차이)
      const [setHour, setMin] = s.collectTime.split(":").map(Number);
      const [curHour, curMin] = currentTime.split(":").map(Number);

      const setMinutes = setHour * 60 + setMin;
      const curMinutes = curHour * 60 + curMin;

      return Math.abs(setMinutes - curMinutes) <= 15;
    });

    if (settingsToRun.length === 0) {
      return NextResponse.json({
        message: "현재 시간에 실행할 수집 작업이 없습니다.",
        currentTime,
        currentDay,
        checkedSettings: allSettings.length,
      });
    }

    const results: Array<{
      userId: string;
      success: boolean;
      totalCount?: number;
      newCount?: number;
      error?: string;
    }> = [];

    for (const setting of settingsToRun) {
      try {
        const targetDate = new Date();
        targetDate.setDate(targetDate.getDate() - setting.collectDaysAgo);

        const corporationCodes = setting.corporationCodes.split(",").filter(Boolean);
        const targetProducts = setting.targetProducts.split(",").filter(Boolean);

        let totalCount = 0;
        let newCount = 0;

        // 각 대상 품목별로 수집
        if (targetProducts.length > 0) {
          for (const product of targetProducts) {
            const result = await collectAndSaveAuctionData(
              targetDate,
              corporationCodes,
              product.trim()
            );
            totalCount += result.totalCount;
            newCount += result.newCount;
          }
        } else {
          // 대상 품목이 없으면 전체 수집
          const result = await collectAndSaveAuctionData(
            targetDate,
            corporationCodes
          );
          totalCount = result.totalCount;
          newCount = result.newCount;
        }

        // 자동 정리가 활성화된 경우 오래된 데이터 정리
        if (setting.autoCleanupEnabled) {
          const cutoffDate = new Date();
          cutoffDate.setDate(cutoffDate.getDate() - setting.retentionDays);

          await prisma.auctionResult.deleteMany({
            where: {
              auctionDate: { lt: cutoffDate },
            },
          });
        }

        results.push({
          userId: setting.userId,
          success: true,
          totalCount,
          newCount,
        });
      } catch (error) {
        results.push({
          userId: setting.userId,
          success: false,
          error: error instanceof Error ? error.message : "Unknown error",
        });
      }
    }

    return NextResponse.json({
      message: `${results.length}개의 수집 작업이 실행되었습니다.`,
      currentTime,
      results,
    });
  } catch (error) {
    console.error("Cron collection error:", error);
    return NextResponse.json(
      { error: "수집 작업 중 오류가 발생했습니다." },
      { status: 500 }
    );
  }
}

/**
 * POST: 수동 수집 트리거 (특정 사용자용)
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { userId, date, products } = body;

    if (!userId) {
      return NextResponse.json(
        { error: "userId가 필요합니다." },
        { status: 400 }
      );
    }

    // 사용자 설정 조회
    const setting = await prisma.marketCollectionSettings.findUnique({
      where: { userId },
    });

    if (!setting) {
      return NextResponse.json(
        { error: "설정을 찾을 수 없습니다." },
        { status: 404 }
      );
    }

    const targetDate = date ? new Date(date) : new Date();
    if (!date) {
      targetDate.setDate(targetDate.getDate() - setting.collectDaysAgo);
    }

    const corporationCodes = setting.corporationCodes.split(",").filter(Boolean);
    const targetProducts = products
      ? products.split(",").filter(Boolean)
      : setting.targetProducts.split(",").filter(Boolean);

    let totalCount = 0;
    let newCount = 0;

    if (targetProducts.length > 0) {
      for (const product of targetProducts) {
        const result = await collectAndSaveAuctionData(
          targetDate,
          corporationCodes,
          product.trim()
        );
        totalCount += result.totalCount;
        newCount += result.newCount;
      }
    } else {
      const result = await collectAndSaveAuctionData(
        targetDate,
        corporationCodes
      );
      totalCount = result.totalCount;
      newCount = result.newCount;
    }

    return NextResponse.json({
      message: "수집이 완료되었습니다.",
      targetDate: targetDate.toISOString(),
      targetProducts,
      totalCount,
      newCount,
    });
  } catch (error) {
    console.error("Manual collection error:", error);
    return NextResponse.json(
      { error: "수집 중 오류가 발생했습니다." },
      { status: 500 }
    );
  }
}
