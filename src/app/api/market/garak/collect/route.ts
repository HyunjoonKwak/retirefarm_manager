import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth/options";
import {
  collectAndSaveAuctionData,
  CORPORATION_CODES,
} from "@/lib/services/garak-market";

// POST: 가락시장 경매 데이터 수집
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.id) {
      return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
    }

    const body = await request.json();
    const {
      date, // YYYY-MM-DD 형식
      corporationCodes = ["11000101"], // 기본: 서울청과
      productName,
    } = body;

    // 날짜 파싱
    const targetDate = date ? new Date(date) : new Date();
    // 어제 날짜로 기본 설정 (당일 데이터는 아직 없을 수 있음)
    if (!date) {
      targetDate.setDate(targetDate.getDate() - 1);
    }

    // 유효한 법인코드 확인
    const validCodes = corporationCodes.filter(
      (code: string) => code in CORPORATION_CODES
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

    return NextResponse.json({
      message: "데이터 수집이 완료되었습니다.",
      date: targetDate.toISOString().split("T")[0],
      corporations: validCodes.map((code: string) => ({
        code,
        name: CORPORATION_CODES[code],
      })),
      productName: productName || "전체",
      ...result,
    });
  } catch (error) {
    console.error("Collect garak data error:", error);
    return NextResponse.json(
      { error: "데이터 수집 중 오류가 발생했습니다." },
      { status: 500 }
    );
  }
}

// GET: 수집 현황 조회
export async function GET() {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.id) {
      return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
    }

    // 법인 목록 반환
    const corporations = Object.entries(CORPORATION_CODES).map(([code, name]) => ({
      code,
      name,
    }));

    return NextResponse.json({ corporations });
  } catch (error) {
    console.error("Get collection status error:", error);
    return NextResponse.json(
      { error: "조회 중 오류가 발생했습니다." },
      { status: 500 }
    );
  }
}
