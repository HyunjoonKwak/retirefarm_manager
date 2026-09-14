import { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth/guards";
import { boundedJson } from "@/lib/briefing/contracts";
import { discoveryRequestSchema } from "@/lib/briefing/discovery-contracts";
import { discoveryOverview, mutateDiscovery } from "@/lib/briefing/discovery";
import { BriefingError } from "@/lib/briefing/queue";

const response = (data: unknown, status = 200) => NextResponse.json(data, { status, headers: { "Cache-Control": "no-store" } });
export async function GET() {
  try {
    const user = await getSessionUser(); if (!user) return response({ error: "로그인이 필요합니다." }, 401);
    return response(await discoveryOverview(user.id));
  } catch { return response({ error: "추천 후보를 불러오지 못했습니다." }, 503); }
}
export async function POST(request: Request) {
  try {
    const user = await getSessionUser(); if (!user) return response({ error: "로그인이 필요합니다." }, 401);
    const input = discoveryRequestSchema.safeParse(await boundedJson(request, 256 * 1024).catch(() => null));
    if (!input.success) return response({ error: "후보 자료의 주소·검색어·관측 시각과 입력 형식을 확인해 주세요." }, 400);
    return response(await mutateDiscovery(user.id, input.data));
  } catch (error) {
    if (error instanceof BriefingError) return response({ error: error.message }, error.status);
    if (error instanceof Prisma.PrismaClientKnownRequestError && ["P2002", "P2034", "P2028"].includes(error.code))
      return response({ error: "동시에 처리된 자료가 있습니다. 새로고침 후 확인해 주세요." }, 409);
    return response({ error: "후보를 저장하지 못했습니다. 새로고침 후 확인해 주세요." }, 503);
  }
}
