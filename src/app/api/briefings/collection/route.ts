import { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth/guards";
import { boundedJson } from "@/lib/briefing/contracts";
import { collectionRequestSchema } from "@/lib/briefing/collection-contracts";
import { collectionOverview, mutateCollection } from "@/lib/briefing/collection";
import { BriefingError } from "@/lib/briefing/queue";

const response = (data: unknown, status = 200) => NextResponse.json(data, { status, headers: { "Cache-Control": "no-store" } });
export async function GET() {
  try {
    const user = await getSessionUser(); if (!user) return response({ error: "로그인이 필요합니다." }, 401);
    return response(await collectionOverview(user.id));
  } catch { return response({ error: "수집 작업 목록을 불러오지 못했습니다." }, 503); }
}
export async function POST(request: Request) {
  try {
    const user = await getSessionUser(); if (!user) return response({ error: "로그인이 필요합니다." }, 401);
    const input = collectionRequestSchema.safeParse(await boundedJson(request, 16 * 1024).catch(() => null));
    if (!input.success) return response({ error: "수집 작업의 검색어와 요청 형식을 확인해 주세요." }, 400);
    return response(await mutateCollection(user.id, input.data));
  } catch (error) {
    if (error instanceof BriefingError) return response({ error: error.message }, error.status);
    if (error instanceof Prisma.PrismaClientKnownRequestError && ["P2002", "P2034", "P2028"].includes(error.code))
      return response({ error: "동시에 처리된 작업이 있습니다. 새로고침 후 확인해 주세요." }, 409);
    return response({ error: "수집 작업을 처리하지 못했습니다. 새로고침 후 확인해 주세요." }, 503);
  }
}
