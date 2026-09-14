import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth/guards";
import { boundedJson } from "@/lib/briefing/contracts";
import { WORK_IMPORT_LIMITS, workImportRequestSchema } from "@/lib/briefing/work-import-contracts";
import { WorkImportError } from "@/lib/briefing/work-import";
import { createWorkImport, listWorkImports, previewWorkImport } from "@/lib/briefing/work-import-service";

const noStore = { headers: { "Cache-Control": "no-store" } };
const tooLarge = Symbol("too-large"); const invalidBody = Symbol("invalid-body");
const unauthorized = () => NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
const firstIssue = (issues: { path: PropertyKey[]; message: string }[]) => {
  const issue = issues[0]; if (!issue) return "입력을 확인해 주세요.";
  const field = issue.path.filter(part => part !== "input").join(".");
  return field ? `${field}: ${issue.message}` : issue.message;
};
export async function GET() {
  try {
    const user = await getSessionUser(); if (!user) return unauthorized();
    return NextResponse.json({ items: await listWorkImports(user.id) }, noStore);
  } catch { return NextResponse.json({ error: "보관된 보고서 목록을 불러오지 못했습니다." }, { status: 503 }); }
}
/** Preview never writes; import inserts one immutable version. Bodies above the limit are rejected before parsing. */
export async function POST(request: Request) {
  try {
    const user = await getSessionUser(); if (!user) return unauthorized();
    const body = await boundedJson(request, WORK_IMPORT_LIMITS.requestBytes).catch((error: unknown) => error instanceof SyntaxError ? invalidBody : tooLarge);
    if (body === tooLarge) return NextResponse.json({ error: "요청 본문이 너무 큽니다. Markdown 512KB, JSON 1MB까지 보관합니다." }, { status: 413 });
    if (body === invalidBody) return NextResponse.json({ error: "요청 본문이 JSON 형식이 아닙니다." }, { status: 400 });
    const parsed = workImportRequestSchema.safeParse(body);
    if (!parsed.success) return NextResponse.json({ error: firstIssue(parsed.error.issues) }, { status: 400 });
    if (parsed.data.action === "preview") return NextResponse.json({ preview: await previewWorkImport(user.id, parsed.data.input) }, noStore);
    const item = await createWorkImport(user.id, parsed.data.input);
    return NextResponse.json({ item }, { status: 201, ...noStore });
  } catch (error) {
    if (error instanceof WorkImportError) return NextResponse.json({ error: error.message, code: error.code }, { status: error.status });
    return NextResponse.json({ error: "보고서를 보관하지 못했습니다." }, { status: 503 });
  }
}
