import { NextResponse } from "next/server";
import { getSchedulerStatus } from "@/lib/scheduler";

export const dynamic = "force-dynamic";

// GET: 컨테이너 헬스체크용 (인증 불필요)
export async function GET() {
  return NextResponse.json({ status: "ok", marketSchedulerReady: getSchedulerStatus().ready });
}
