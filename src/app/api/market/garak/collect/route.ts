import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { logger } from "@/lib/logger";
import { getSessionUser } from "@/lib/auth/guards";
import {
  collectAndSaveAuctionData,
  CORPORATION_CODES,
  type CollectionStatus,
} from "@/lib/services/garak-market";

const MAX_CORPORATIONS = Object.keys(CORPORATION_CODES).length;

/** YYYY-MM-DD가 실제 달력 날짜인지 (2026-02-30 같은 값 거부) */
function isCalendarDate(value: string): boolean {
  const [y, m, d] = value.split("-").map(Number);
  const date = new Date(y, m - 1, d);
  return date.getFullYear() === y && date.getMonth() === m - 1 && date.getDate() === d;
}

const collectSchema = z.object({
  date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "날짜는 YYYY-MM-DD 형식이어야 합니다.")
    .refine(isCalendarDate, "존재하지 않는 날짜입니다.")
    .optional(),
  corporationCodes: z
    .array(z.string().min(1))
    .max(MAX_CORPORATIONS, `법인은 최대 ${MAX_CORPORATIONS}개까지 지정할 수 있습니다.`)
    .default(["11000101"])
    .transform((codes) => Array.from(new Set(codes))),
  productName: z.string().max(500).optional(),
});

// PARTIAL은 사유마다 조치가 다르므로(재수집으로 채워지는 누락 vs 상한 초과) 약속 대신 guidance를 참조하게 한다
const STATUS_MESSAGES: Record<CollectionStatus, string> = {
  SUCCESS: "데이터 수집이 완료되었습니다.",
  PARTIAL: "일부만 수집되었습니다. 사유와 조치는 안내(guidance)를 확인하세요.",
  FAILED: "데이터 수집에 실패했습니다.",
  EMPTY: "수집된 거래가 0건입니다. (휴장 여부는 확정하지 않음)",
};

// POST: 가락시장 경매 데이터 수집
// 결과 status는 SUCCESS | PARTIAL | FAILED | EMPTY. HTTP 200으로 상세를 돌려주고
// 화면이 status·issues·guidance를 그대로 보여준다 (FAILED도 원인 확인용으로 200).
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

    // 날짜 파싱 — 지정하지 않으면 어제 (당일 데이터는 아직 없을 수 있음)
    const targetDate = date ? new Date(date) : new Date();
    if (!date) {
      targetDate.setDate(targetDate.getDate() - 1);
    }

    const validCodes = corporationCodes.filter((code) => code in CORPORATION_CODES);
    if (validCodes.length === 0) {
      return NextResponse.json({ error: "유효한 법인코드가 없습니다." }, { status: 400 });
    }

    const result = await collectAndSaveAuctionData(targetDate, validCodes, productName);

    return NextResponse.json({
      message: STATUS_MESSAGES[result.status],
      date: targetDate.toISOString().split("T")[0],
      corporations: validCodes.map((code) => ({ code, name: CORPORATION_CODES[code] })),
      productName: productName || "전체",
      status: result.status,
      complete: result.complete,
      totalCount: result.totalCount,
      newCount: result.newCount,
      duplicateCount: result.duplicateCount,
      noAuction: result.noAuction,
      issues: result.issues,
      guidance: result.guidance,
      deduplicated: result.deduplicated,
      details: result.corporations.map((corp) => ({
        code: corp.corporationCode,
        name: corp.corporationName,
        status: corp.status,
        totalCount: corp.totalCount,
        newCount: corp.newCount,
        duplicateCount: corp.duplicateCount,
        issues: corp.issues,
        products: corp.products.map((p) => ({
          productName: p.productName ?? "전체",
          status: p.status,
          totalCount: p.totalCount,
          fetchedCount: p.fetchedCount,
          newCount: p.newCount,
          duplicateCount: p.duplicateCount,
          totalPages: p.totalPages,
          fetchedPages: p.fetchedPages,
          failedPages: p.failedPages,
          issues: p.issues,
        })),
      })),
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

    const corporations = Object.entries(CORPORATION_CODES).map(([code, name]) => ({ code, name }));
    return NextResponse.json({ corporations });
  } catch (error) {
    logger.error("Get collection status error:", error);
    return NextResponse.json({ error: "조회 중 오류가 발생했습니다." }, { status: 500 });
  }
}
