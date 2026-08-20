import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { z } from "zod";
import prisma from "@/lib/prisma";
import { authOptions } from "@/lib/auth/options";

const createFundingSchema = z.object({
  type: z.enum(["REAL_ESTATE_SALE", "SAVINGS", "LOAN", "GOVERNMENT_SUBSIDY", "RETIREMENT_PAY", "SEVERANCE_PAY", "OTHER"]),
  name: z.string().min(1, "자금원 이름을 입력해주세요."),
  amount: z.number().min(0, "금액은 0 이상이어야 합니다."),
  expectedDate: z.string().refine((val) => !isNaN(Date.parse(val)), "유효한 날짜를 입력해주세요."),
  // asset_manager Portfolio id — 원장은 asset_manager 소유 (Asset Hub §1.5)
  externalAssetId: z.string().optional(),
  status: z.enum(["PLANNED", "IN_PROGRESS", "COMPLETED"]).default("PLANNED"),
  notes: z.string().optional(),
});

// GET: 자금 조달 목록 조회
export async function GET() {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.id) {
      return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
    }

    const fundingSources = await prisma.fundingSource.findMany({
      where: { userId: session.user.id },
      orderBy: { expectedDate: "asc" },
    });

    const serialized = fundingSources.map((source) => ({
      ...source,
      amount: source.amount.toString(),
    }));

    return NextResponse.json({ fundingSources: serialized });
  } catch (error) {
    console.error("Get funding sources error:", error);
    return NextResponse.json(
      { error: "자금 조달 목록 조회 중 오류가 발생했습니다." },
      { status: 500 }
    );
  }
}

// POST: 자금 조달원 등록
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.id) {
      return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
    }

    const body = await request.json();
    const validatedData = createFundingSchema.parse(body);

    // 연결 물건이 있는 경우 중복 확인
    if (validatedData.externalAssetId) {
      const existingLink = await prisma.fundingSource.findUnique({
        where: { externalAssetId: validatedData.externalAssetId },
      });

      if (existingLink) {
        return NextResponse.json(
          { error: "해당 물건은 이미 다른 자금원에 연결되어 있습니다." },
          { status: 400 }
        );
      }
    }

    const fundingSource = await prisma.fundingSource.create({
      data: {
        userId: session.user.id,
        type: validatedData.type,
        name: validatedData.name,
        amount: validatedData.amount,
        expectedDate: new Date(validatedData.expectedDate),
        externalAssetId: validatedData.externalAssetId || null,
        status: validatedData.status,
        notes: validatedData.notes,
      },
    });

    return NextResponse.json({
      message: "자금원이 등록되었습니다.",
      fundingSource: {
        ...fundingSource,
        amount: fundingSource.amount.toString(),
      },
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      const firstIssue = error.issues[0];
      return NextResponse.json(
        { error: firstIssue?.message || "입력값이 올바르지 않습니다." },
        { status: 400 }
      );
    }

    console.error("Create funding source error:", error);
    return NextResponse.json(
      { error: "자금원 등록 중 오류가 발생했습니다." },
      { status: 500 }
    );
  }
}
