import { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth/guards";
import { boundedJson } from "@/lib/briefing/contracts";
import { competitorRequestSchema } from "@/lib/briefing/competitor-contracts";
import { competitorOverview, mutateCompetitors } from "@/lib/briefing/competitors";
import { BriefingError } from "@/lib/briefing/queue";
const response = (data: unknown, status = 200) => NextResponse.json(data, { status, headers: { "Cache-Control": "no-store" } });
export async function GET() {
  try {
    const user = await getSessionUser(); if (!user) return response({ error: "로그인이 필요합니다." }, 401);
    return response(await competitorOverview(user.id));
  } catch { return response({ error: "경쟁점 자료를 불러오지 못했습니다." }, 503); }
}
export async function POST(request: Request) {
  try {
    const user = await getSessionUser(); if (!user) return response({ error: "로그인이 필요합니다." }, 401);
    const input = competitorRequestSchema.safeParse(await boundedJson(request, 8192).catch(() => null));
    if (!input.success) return response({ error: "입력값을 확인해 주세요." }, 400);
    return response(await mutateCompetitors(user.id, input.data));
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && ["P2002", "P2034", "P2028"].includes(error.code)) return response({ error: "동시에 처리된 요청이 있습니다. 새로고침 후 확인해 주세요." }, 409);
    if (error instanceof BriefingError) return response({ error: error.message }, error.status);
    return response({ error: "경쟁점 자료를 저장하지 못했습니다. 새로고침해 확인해 주세요." }, 503);
  }
}
