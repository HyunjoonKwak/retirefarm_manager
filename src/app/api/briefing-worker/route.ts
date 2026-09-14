import { NextResponse } from "next/server";
import { boundedJson, workerRequestSchema } from "@/lib/briefing/contracts";
import { authenticateWorker, BriefingError, handleWorker } from "@/lib/briefing/queue";

export const runtime = "nodejs";
export async function POST(request: Request) {
  try {
    const credential = await authenticateWorker(request.headers.get("authorization"));
    if (!credential) return NextResponse.json({ error: "워커 인증이 필요합니다." }, { status: 401 });
    const input = workerRequestSchema.safeParse(await boundedJson(request).catch(() => null));
    if (!input.success) return NextResponse.json({ error: "워커 요청 형식을 확인해 주세요." }, { status: 400 });
    return NextResponse.json(await handleWorker(credential, input.data), { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    if (error instanceof BriefingError) return NextResponse.json({ error: error.message }, { status: error.status });
    // Worker credentials and model text must not reach logs through error objects.
    return NextResponse.json({ error: "워커 요청을 처리하지 못했습니다." }, { status: 503 });
  }
}
