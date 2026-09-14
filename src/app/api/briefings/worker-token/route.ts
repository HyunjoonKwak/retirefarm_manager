import { NextResponse } from "next/server";
import { z } from "zod";
import prisma from "@/lib/prisma";
import { getSessionUser } from "@/lib/auth/guards";
import { boundedJson } from "@/lib/briefing/contracts";
import { issueWorkerToken } from "@/lib/briefing/queue";

export async function POST(request: Request) {
  try {
    const user = await getSessionUser();
    if (!user) return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
    const input = z.object({ action: z.enum(["issue", "revoke"]) }).strict()
      .safeParse(await boundedJson(request, 1024).catch(() => null));
    if (!input.success) return NextResponse.json({ error: "토큰 요청을 확인해 주세요." }, { status: 400 });
    if (input.data.action === "issue") return NextResponse.json({ token: await issueWorkerToken(user.id) },
      { headers: { "Cache-Control": "no-store" } });
    await prisma.$transaction(async tx => {
      await tx.briefingWorkerCredential.deleteMany({ where: { userId: user.id } });
      await tx.briefingRun.updateMany({ where: { userId: user.id, status: "RUNNING" }, data: {
        status: "BLOCKED", lastError: "AUTH_REQUIRED", leaseToken: null, leaseUntil: null, credentialId: null,
      } });
    });
    return NextResponse.json({ ok: true });
  } catch { return NextResponse.json({ error: "워커 연결 설정을 변경하지 못했습니다." }, { status: 503 }); }
}
