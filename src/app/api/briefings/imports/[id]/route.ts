import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getSessionUser } from "@/lib/auth/guards";
import { WorkImportError } from "@/lib/briefing/work-import";
import { getWorkImport } from "@/lib/briefing/work-import-service";

const idSchema = z.string().trim().min(1).max(100);
/** Detail is read-only: there is no update or delete, corrections are new versions created through the list route. */
export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await getSessionUser(); if (!user) return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
    const id = idSchema.safeParse((await params).id);
    if (!id.success) return NextResponse.json({ error: "보관된 보고서를 찾을 수 없습니다." }, { status: 404 });
    return NextResponse.json({ item: await getWorkImport(user.id, id.data) }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    if (error instanceof WorkImportError) return NextResponse.json({ error: error.message, code: error.code }, { status: error.status });
    return NextResponse.json({ error: "보관된 보고서를 불러오지 못했습니다." }, { status: 503 });
  }
}
