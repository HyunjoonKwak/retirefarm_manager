import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { logger } from "@/lib/logger";
import { getSessionUser } from "@/lib/auth/guards";
import {
  collectAndSaveAuctionData,
  CORPORATION_CODES,
} from "@/lib/services/garak-market";

const collectSchema = z.object({
  date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "날짜는 YYYY-MM-DD 형식이어야 합니다.")
    .optional(),
  corporationCodes: z.array(z.string()).default(["11000101"]),
  productName: z.string().max(500).optional(),
});

// POST: 가락시장 경매 데이터 수집
export async function POST(request: NextRequest) {
  try {
    const user = await getSessionUser();
    if (!user) {
      return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
    }

    const body = await request.json();
    const parsed = collectSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message || "잘못된 요청입니다." },
        { status: 400 }
      );
    }
    const { date, corporationCodes, productName } = parsed.data;

    // 날짜 파싱
    const targetDate = date ? new Date(date) : new Date();
    // 어제 날짜로 기본 설정 (당일 데이터는 아직 없을 수 있음)
    if (!date) {
      targetDate.setDate(targetDate.getDate() - 1);
    }

    // 유효한 법인코드 확인
    const validCodes = corporationCodes.filter(
      (code) => code in CORPORATION_CODES
    );

    if (validCodes.length === 0) {
      return NextResponse.json(
        { error: "유효한 법인코드가 없습니다." },
        { status: 400 }
      );
    }

    // 데이터 수집 실행
    const result = await collectAndSaveAuctionData(
      targetDate,
      validCodes,
      productName
    );

    // 경매 없는 날인 경우 메시지 변경
    const message = result.noAuction
      ? "경매가 없는 날입니다. (휴장일/공휴일)"
      : "데이터 수집이 완료되었습니다.";

    return NextResponse.json({
      message,
      date: targetDate.toISOString().split("T")[0],
      corporations: validCodes.map((code) => ({
        code,
        name: CORPORATION_CODES[code],
      })),
      productName: productName || "전체",
      ...result,
    });
  } catch (error) {
    logger.error("Collect garak data error:", error);
    return NextResponse.json(
      { error: "데이터 수집 중 오류가 발생했습니다." },
      { status: 500 }
    );
  }
}

// GET: 수집 현황 조회
export async function GET() {
  try {
    const user = await getSessionUser();
    if (!user) {
      return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
    }

    // 법인 목록 반환
    const corporations = Object.entries(CORPORATION_CODES).map(([code, name]) => ({
      code,
      name,
    }));

    return NextResponse.json({ corporations });
  } catch (error) {
    logger.error("Get collection status error:", error);
    return NextResponse.json(
      { error: "조회 중 오류가 발생했습니다." },
      { status: 500 }
    );
  }
}
