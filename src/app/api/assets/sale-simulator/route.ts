/**
 * 매도 시뮬레이션 프록시 (Asset Hub Integration §1.5.3)
 *
 * 계산의 소유자는 asset_manager — 이 라우트는 세션 검증 후
 * asset_manager POST /api/simulations/sale로 위임만 한다.
 * 물건 정보는 asset_manager 원장에서 자동 로드되므로 body에는
 * 선택·가정만 담는다.
 */

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { z } from "zod";
import { authOptions } from "@/lib/auth/options";
import { runSaleSimulation } from "@/lib/api/asset-simulation";
import { logger } from "@/lib/logger";

const simulationRequestSchema = z.object({
  portfolioIds: z.array(z.string().min(1)).optional(),
  targetAmount: z.string().regex(/^\d+$/, "목표 금액은 원 단위 정수여야 합니다.").optional(),
  salePriceOverrides: z.record(z.string(), z.string().regex(/^\d+$/)).optional(),
  assumptions: z
    .object({
      isOnlyHouse: z.boolean().optional(),
      hasResided: z.boolean().optional(),
    })
    .optional(),
});

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
    const validation = simulationRequestSchema.safeParse(body);
    if (!validation.success) {
      return NextResponse.json(
        {
          success: false,
          error: validation.error.issues[0]?.message || "입력값이 올바르지 않습니다.",
        },
        { status: 400 }
      );
    }

    const result = await runSaleSimulation(validation.data);
    return NextResponse.json({ success: true, data: result });
  } catch (error) {
    logger.error("Sale simulation proxy error:", error);
    const message =
      error instanceof Error ? error.message : "시뮬레이션 중 오류가 발생했습니다.";
    return NextResponse.json({ success: false, error: message }, { status: 502 });
  }
}
