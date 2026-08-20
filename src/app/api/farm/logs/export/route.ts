/**
 * 영농일지 HWPX 내보내기 (Asset Hub §6 — 관청 제출용)
 *
 * GET /api/farm/logs/export?month=YYYY-MM
 * 해당 월의 일지·작업 내역·자유 서술 본문을 HWPX 문서로 생성해 내려준다.
 */

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { z } from "zod";
import prisma from "@/lib/prisma";
import { authOptions } from "@/lib/auth/options";
import { generateFarmingLogHwpx } from "@/lib/services/farming-log-hwpx";
import { logger } from "@/lib/logger";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const monthSchema = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, "월 형식은 YYYY-MM입니다.");

export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
    }

    const monthParam = request.nextUrl.searchParams.get("month") ?? "";
    const validation = monthSchema.safeParse(monthParam);
    if (!validation.success) {
      return NextResponse.json(
        { error: validation.error.issues[0]?.message },
        { status: 400 }
      );
    }

    const [year, month] = validation.data.split("-").map(Number);
    const start = new Date(year, month - 1, 1);
    const end = new Date(year, month, 1);

    const [logs, profile] = await Promise.all([
      prisma.farmingLog.findMany({
        where: {
          userId: session.user.id,
          date: { gte: start, lt: end },
        },
        include: {
          activities: {
            include: { crop: { select: { name: true } } },
          },
        },
        orderBy: { date: "asc" },
      }),
      prisma.farmProfile.findUnique({ where: { userId: session.user.id } }),
    ]);

    if (logs.length === 0) {
      return NextResponse.json(
        { error: "해당 월에 작성된 일지가 없습니다." },
        { status: 404 }
      );
    }

    const bytes = await generateFarmingLogHwpx({
      yearMonth: validation.data,
      farm: {
        userName: session.user.name ?? session.user.email ?? "",
        region: profile?.region,
        farmingType: profile?.farmingType,
        areaPyeong: profile?.areaPyeong ? Number(profile.areaPyeong) : null,
      },
      logs: logs.map((log) => ({
        date: log.date,
        weather: log.weather,
        temperature: log.temperature ? Number(log.temperature) : null,
        notes: log.notes,
        content: log.content,
        activities: log.activities.map((activity) => ({
          type: activity.type,
          description: activity.description,
          quantity: activity.quantity ? Number(activity.quantity) : null,
          unit: activity.unit,
          crop: activity.crop,
        })),
      })),
    });

    const filename = encodeURIComponent(`영농일지_${validation.data}.hwpx`);
    return new NextResponse(Buffer.from(bytes), {
      headers: {
        "Content-Type": "application/octet-stream",
        "Content-Disposition": `attachment; filename*=UTF-8''${filename}`,
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    logger.error("Export farming log error:", error);
    return NextResponse.json(
      { error: "영농일지 내보내기 중 오류가 발생했습니다." },
      { status: 500 }
    );
  }
}
