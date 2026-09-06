import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import prisma from "@/lib/prisma";
import { getSessionUser } from "@/lib/auth/guards";
import { logger } from "@/lib/logger";

const label = z.string().min(1).max(50).refine(value => value.trim().length > 0);
const shortLabel = z.string().min(1).max(30).refine(value => value.trim().length > 0);
const schema = z.object({
  name: z.string().trim().min(1).max(100), productName: label,
  varieties: z.array(label.refine(value => !value.includes(","))).max(30).default([])
    .transform(values => [...new Set(values)]).refine(values => values.join(",").length <= 500),
  origin: label.nullable().default(null), unit: shortLabel.nullable().default(null),
  grade: shortLabel.nullable().default(null),
}).strict();
const serialize = (row: { id: string; name: string; productName: string; varieties: string; origin: string | null; unit: string | null; grade: string | null }) => ({
  id: row.id, name: row.name, productName: row.productName, varieties: JSON.parse(row.varieties) as string[],
  origin: row.origin, unit: row.unit, grade: row.grade,
});
const unauthorized = () => NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
const failure = (error: unknown) => {
  logger.error("Market comparison preset failed", error);
  return NextResponse.json({ error: "비교 조건을 처리하지 못했습니다. 다시 시도해 주세요." }, { status: 500 });
};
export async function GET() {
  try {
    const user = await getSessionUser(); if (!user) return unauthorized();
    const rows = await prisma.marketComparisonPreset.findMany({ where: { userId: user.id }, orderBy: [{ createdAt: "desc" }, { id: "desc" }] });
    return NextResponse.json({ presets: rows.map(serialize) });
  } catch (error) { return failure(error); }
}
export async function POST(request: NextRequest) {
  try {
    const user = await getSessionUser(); if (!user) return unauthorized();
    const parsed = schema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return NextResponse.json({ error: "비교 조건의 이름과 필터를 확인해 주세요." }, { status: 400 });
    const row = await prisma.$transaction(async tx => {
      if (await tx.marketComparisonPreset.count({ where: { userId: user.id } }) >= 50) return null;
      return tx.marketComparisonPreset.create({ data: { ...parsed.data, userId: user.id, varieties: JSON.stringify(parsed.data.varieties) } });
    });
    if (!row) return NextResponse.json({ error: "비교 조건은 최대 50개까지 저장할 수 있습니다." }, { status: 409 });
    return NextResponse.json({ preset: serialize(row) }, { status: 201 });
  } catch (error) { return failure(error); }
}
export async function DELETE(request: NextRequest) {
  try {
    const user = await getSessionUser(); if (!user) return unauthorized();
    const id = z.string().min(1).max(100).safeParse(request.nextUrl.searchParams.get("id"));
    if (!id.success) return NextResponse.json({ error: "삭제할 비교 조건을 선택해 주세요." }, { status: 400 });
    const result = await prisma.marketComparisonPreset.deleteMany({ where: { id: id.data, userId: user.id } });
    if (!result.count) return NextResponse.json({ error: "비교 조건을 찾을 수 없습니다." }, { status: 404 });
    return NextResponse.json({ deleted: true });
  } catch (error) { return failure(error); }
}
