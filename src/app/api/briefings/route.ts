import { NextResponse } from "next/server";
import { z } from "zod";
import prisma from "@/lib/prisma";
import { getSessionUser } from "@/lib/auth/guards";
import { boundedJson } from "@/lib/briefing/contracts";
import { buildSnapshot } from "@/lib/briefing/snapshot";
import { BriefingError, enqueueBriefing } from "@/lib/briefing/queue";

const unauthorized = () => NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
const requestSchema = z.discriminatedUnion("action", [
  z.object({ action: z.enum(["enqueue", "preview"]), productName: z.string().trim().min(1).max(50),
    origin: z.string().trim().max(50).optional(), variety: z.string().trim().max(50).optional() }).strict(),
  z.object({ action: z.literal("retry"), jobId: z.string().min(1).max(100) }).strict(),
]);
export async function GET() {
  try {
    const user = await getSessionUser(); if (!user) return unauthorized();
    const [runs, worker] = await Promise.all([
      prisma.briefingRun.findMany({ where: { userId: user.id }, orderBy: [{ createdAt: "desc" }, { id: "desc" }], take: 20,
        select: { id: true, weekStart: true, status: true, attempts: true, lastError: true, createdAt: true, leaseUntil: true,
          snapshot: true, usage: true, briefing: { select: { id: true, status: true, body: true, createdAt: true } } } }),
      prisma.briefingWorkerCredential.findUnique({ where: { userId: user.id }, select: { lastSeenAt: true } }),
    ]);
    return NextResponse.json({ runs: runs.map(run => ({ ...run, snapshot: JSON.parse(run.snapshot),
      usage: run.usage ? JSON.parse(run.usage) : null, briefing: run.briefing ? { ...run.briefing, body: JSON.parse(run.briefing.body) } : null })),
      worker: { configured: !!worker, lastSeenAt: worker?.lastSeenAt ?? null }, scheduleEnabled: false },
    { headers: { "Cache-Control": "no-store" } });
  } catch { return NextResponse.json({ error: "브리핑 목록을 불러오지 못했습니다." }, { status: 503 }); }
}
export async function POST(request: Request) {
  try {
    const user = await getSessionUser(); if (!user) return unauthorized();
    const input = requestSchema.safeParse(await boundedJson(request, 4096).catch(() => null));
    if (!input.success) return NextResponse.json({ error: "요청 조건을 확인해 주세요." }, { status: 400 });
    if (input.data.action === "retry") {
      const count = await prisma.$transaction(async tx => {
        if (await tx.briefingRun.count({ where: { userId: user.id, status: { in: ["PENDING", "RUNNING"] } } }) >= 3) return 0;
        return (await tx.briefingRun.updateMany({ where: { id: input.data.action === "retry" ? input.data.jobId : "", userId: user.id,
          status: { in: ["FAILED", "BLOCKED"] } }, data: { status: "PENDING", attempts: 0, lastError: null,
          leaseToken: null, leaseUntil: null, credentialId: null } })).count;
      });
      return NextResponse.json(count ? { ok: true } : { error: "재시도할 수 없는 작업이거나 대기 작업이 많습니다." }, { status: count ? 200 : 409 });
    }
    const snapshot = await buildSnapshot(user.id, input.data);
    if (input.data.action === "preview") return NextResponse.json({ snapshot }, { headers: { "Cache-Control": "no-store" } });
    const job = await enqueueBriefing(user.id, snapshot);
    return NextResponse.json({ jobId: job.id, status: job.status }, { status: 201 });
  } catch (error) {
    if (error instanceof BriefingError) return NextResponse.json({ error: error.message }, { status: error.status });
    if (error instanceof Error && error.message === "TOO_MANY_GROUPS") return NextResponse.json({ error: "비교 그룹이 많습니다. 품종이나 산지를 입력해 조건을 좁혀 주세요." }, { status: 400 });
    if (error instanceof Error && error.message === "NO_CORPORATIONS") return NextResponse.json({ error: "시세 수집 설정에서 법인을 선택해 주세요." }, { status: 400 });
    return NextResponse.json({ error: "브리핑 작업을 준비하지 못했습니다." }, { status: 503 });
  }
}
