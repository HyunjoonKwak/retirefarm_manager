import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { z } from "zod";
import prisma from "@/lib/prisma";
import { authOptions } from "@/lib/auth/options";
import { krwAmountSchema } from "@/lib/validations/money";

const createTransactionSchema = z.object({
  date: z.string().refine((val) => !isNaN(Date.parse(val)), "유효한 날짜를 입력해주세요."),
  type: z.enum(["INCOME", "EXPENSE"]),
  category: z.string().min(1, "분류를 선택해주세요."),
  subcategory: z.string().optional(),
  amount: krwAmountSchema({ min: 1, minMessage: "금액은 1원 이상이어야 합니다." }),
  description: z.string().min(1, "내용을 입력해주세요."),
  relatedCropId: z.string().optional(),
  paymentMethod: z.string().optional(),
});

// GET: 거래 내역 조회
export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.id) {
      return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const type = searchParams.get("type");
    const month = searchParams.get("month"); // YYYY-MM
    const category = searchParams.get("category");
    const limit = searchParams.get("limit");

    const whereClause: {
      userId: string;
      type?: "INCOME" | "EXPENSE";
      category?: string;
      date?: {
        gte?: Date;
        lt?: Date;
      };
    } = {
      userId: session.user.id,
    };

    if (type && (type === "INCOME" || type === "EXPENSE")) {
      whereClause.type = type;
    }

    if (category) {
      whereClause.category = category;
    }

    if (month) {
      const [year, monthNum] = month.split("-").map(Number);
      const startDate = new Date(year, monthNum - 1, 1);
      const endDate = new Date(year, monthNum, 1);
      whereClause.date = {
        gte: startDate,
        lt: endDate,
      };
    }

    const transactions = await prisma.financialTransaction.findMany({
      where: whereClause,
      include: {
        crop: {
          select: { id: true, name: true },
        },
      },
      orderBy: { date: "desc" },
      take: limit ? parseInt(limit) : undefined,
    });

    // Decimal을 문자열로 변환
    const serialized = transactions.map((tx) => ({
      ...tx,
      amount: tx.amount.toString(),
    }));

    return NextResponse.json({ transactions: serialized });
  } catch (error) {
    console.error("Get transactions error:", error);
    return NextResponse.json(
      { error: "거래 내역 조회 중 오류가 발생했습니다." },
      { status: 500 }
    );
  }
}

// POST: 거래 등록
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.id) {
      return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
    }

    const body = await request.json();
    const validatedData = createTransactionSchema.parse(body);

    // 관련 작물 확인 (선택된 경우)
    if (validatedData.relatedCropId) {
      const crop = await prisma.crop.findFirst({
        where: {
          id: validatedData.relatedCropId,
          userId: session.user.id,
        },
      });

      if (!crop) {
        return NextResponse.json({ error: "작물을 찾을 수 없습니다." }, { status: 404 });
      }
    }

    const transaction = await prisma.financialTransaction.create({
      data: {
        userId: session.user.id,
        date: new Date(validatedData.date),
        type: validatedData.type,
        category: validatedData.category,
        subcategory: validatedData.subcategory,
        amount: validatedData.amount,
        description: validatedData.description,
        relatedCropId: validatedData.relatedCropId || null,
        paymentMethod: validatedData.paymentMethod,
      },
      include: {
        crop: {
          select: { id: true, name: true },
        },
      },
    });

    return NextResponse.json({
      message: "거래가 등록되었습니다.",
      transaction: {
        ...transaction,
        amount: transaction.amount.toString(),
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

    console.error("Create transaction error:", error);
    return NextResponse.json(
      { error: "거래 등록 중 오류가 발생했습니다." },
      { status: 500 }
    );
  }
}
