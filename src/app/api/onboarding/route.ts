/**
 * 온보딩 마법사 (Asset Hub §6 — ssampin 온보딩 패턴 차용)
 *
 * GET  — 온보딩 완료 여부·기존 프로필 (마법사 프리필용)
 * POST — 농장 프로필 저장 + 재배 예정 작물의 시세 워치리스트 프리셋 등록
 *
 * 재배 예정 작물은 FarmProfile.plannedCrops(JSON)로만 저장한다.
 * Crop 행은 실제 파종 시 작물 관리에서 생성 (예정 단계엔 날짜가 없다).
 */

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { z } from "zod";
import prisma from "@/lib/prisma";
import { authOptions } from "@/lib/auth/options";
import { MARKET_PRODUCTS } from "@/lib/constants/market-products";
import { FARMING_TYPES } from "@/lib/constants/farming";
import { logger } from "@/lib/logger";

const onboardingSchema = z.object({
  region: z.string().min(1, "지역을 입력해주세요.").max(100),
  farmingType: z.enum(FARMING_TYPES),
  areaPyeong: z.number().positive().max(1_000_000).optional(),
  targetStartYear: z.number().int().min(2020).max(2100).optional(),
  plannedCrops: z.array(z.string().min(1).max(50)).max(30).default([]),
  addToWatchlist: z.boolean().default(true),
  notes: z.string().max(1000).optional(),
});

function parsePlannedCrops(json: string): string[] {
  try {
    const parsed = JSON.parse(json);
    return Array.isArray(parsed) ? parsed.filter((v) => typeof v === "string") : [];
  } catch {
    return [];
  }
}

// GET: 온보딩 상태 조회
export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json(
        { success: false, error: "로그인이 필요합니다." },
        { status: 401 }
      );
    }

    const profile = await prisma.farmProfile.findUnique({
      where: { userId: session.user.id },
    });

    return NextResponse.json({
      success: true,
      data: {
        completed: Boolean(profile),
        profile: profile
          ? {
              region: profile.region,
              farmingType: profile.farmingType,
              areaPyeong: profile.areaPyeong ? Number(profile.areaPyeong) : null,
              targetStartYear: profile.targetStartYear,
              plannedCrops: parsePlannedCrops(profile.plannedCrops),
              notes: profile.notes,
            }
          : null,
      },
    });
  } catch (error) {
    logger.error("Get onboarding status error:", error);
    return NextResponse.json(
      { success: false, error: "온보딩 상태 조회에 실패했습니다." },
      { status: 500 }
    );
  }
}

// POST: 온보딩 저장 (재실행 시 프로필 갱신)
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json(
        { success: false, error: "로그인이 필요합니다." },
        { status: 401 }
      );
    }

    const body = await request.json().catch(() => ({}));
    const validation = onboardingSchema.safeParse(body);
    if (!validation.success) {
      return NextResponse.json(
        {
          success: false,
          error: validation.error.issues[0]?.message || "입력값이 올바르지 않습니다.",
        },
        { status: 400 }
      );
    }

    const data = validation.data;
    const userId = session.user.id;
    const plannedCrops = [...new Set(data.plannedCrops.map((c) => c.trim()))].filter(
      Boolean
    );

    const profileData = {
      region: data.region,
      farmingType: data.farmingType,
      areaPyeong: data.areaPyeong ?? null,
      targetStartYear: data.targetStartYear ?? null,
      plannedCrops: JSON.stringify(plannedCrops),
      notes: data.notes ?? null,
    };

    await prisma.farmProfile.upsert({
      where: { userId },
      update: profileData,
      create: { userId, ...profileData },
    });

    // 시세 워치리스트 프리셋 — 가락시장 수집 품목에 있는 작물만 등록 가능
    const watchable = plannedCrops.filter((name) =>
      (MARKET_PRODUCTS as readonly string[]).includes(name)
    );
    const skipped = plannedCrops.filter(
      (name) => !(MARKET_PRODUCTS as readonly string[]).includes(name)
    );

    let watchlistAdded = 0;
    if (data.addToWatchlist) {
      for (const productName of watchable) {
        const result = await prisma.productWatchlist.upsert({
          where: {
            userId_productName_variety_origin: {
              userId,
              productName,
              variety: "",
              origin: "",
            },
          },
          update: { isActive: true },
          create: { userId, productName, variety: "", origin: "" },
        });
        if (result) watchlistAdded += 1;
      }
    }

    return NextResponse.json({
      success: true,
      data: {
        plannedCrops,
        watchlistAdded,
        watchlistSkipped: data.addToWatchlist ? skipped : [],
      },
    });
  } catch (error) {
    logger.error("Save onboarding error:", error);
    return NextResponse.json(
      { success: false, error: "온보딩 저장에 실패했습니다." },
      { status: 500 }
    );
  }
}
