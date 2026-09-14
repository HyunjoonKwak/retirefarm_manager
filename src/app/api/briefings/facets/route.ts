import { NextResponse } from "next/server";
import { z } from "zod";
import { getSessionUser } from "@/lib/auth/guards";
import { getBriefingFacets } from "@/lib/briefing/facets";

const querySchema = z.object({
  productName: z.string().trim().min(1).max(50),
  origin: z.string().trim().max(50).optional(),
}).strict();

/** Observed origins/varieties for the briefing picker. Stored records only; never proof of shipping. */
export async function GET(request: Request) {
  try {
    const user = await getSessionUser(); if (!user) return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
    const { searchParams } = new URL(request.url);
    const input = querySchema.safeParse({ productName: searchParams.get("productName") ?? undefined, origin: searchParams.get("origin") ?? undefined });
    if (!input.success) return NextResponse.json({ error: "품목을 확인해 주세요." }, { status: 400 });
    const facets = await getBriefingFacets(user.id, input.data);
    return NextResponse.json(facets, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    if (error instanceof Error && error.message === "NO_CORPORATIONS") return NextResponse.json({ error: "시세 수집 설정에서 법인을 선택해 주세요." }, { status: 400 });
    return NextResponse.json({ error: "선택 가능한 산지·품종을 불러오지 못했습니다." }, { status: 503 });
  }
}
