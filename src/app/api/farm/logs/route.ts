import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { z } from "zod";
import prisma from "@/lib/prisma";
import { authOptions } from "@/lib/auth/options";

const createLogSchema = z.object({
  date: z.string().refine((val) => !isNaN(Date.parse(val)), "유효한 날짜를 입력해주세요."),
  temperature: z.number().min(-50).max(60).optional(),
  humidity: z.number().min(0).max(100).optional(),
  rainfall: z.number().min(0).optional(),
  weather: z.string().optional(),
  notes: z.string().optional(),
});

// GET: 영농일지 목록 조회
export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.id) {
      return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const month = searchParams.get("month"); // YYYY-MM 형식
    const limit = searchParams.get("limit");

    const whereClause: {
      userId: string;
      date?: {
        gte?: Date;
        lt?: Date;
      };
    } = {
      userId: session.user.id,
    };

    // 월별 필터링
    if (month) {
      const [year, monthNum] = month.split("-").map(Number);
      const startDate = new Date(year, monthNum - 1, 1);
      const endDate = new Date(year, monthNum, 1);
      whereClause.date = {
        gte: startDate,
        lt: endDate,
      };
    }

    const logs = await prisma.farmingLog.findMany({
      where: whereClause,
      include: {
        activities: {
          include: {
            crop: {
              select: { id: true, name: true },
            },
          },
        },
      },
      orderBy: { date: "desc" },
      take: limit ? parseInt(limit) : undefined,
    });

    // Decimal을 문자열/숫자로 변환
    const serializedLogs = logs.map((log) => ({
      ...log,
      temperature: log.temperature ? Number(log.temperature) : null,
      rainfall: log.rainfall ? Number(log.rainfall) : null,
      activities: log.activities.map((activity) => ({
        ...activity,
        quantity: activity.quantity ? Number(activity.quantity) : null,
      })),
    }));

    return NextResponse.json({ logs: serializedLogs });
  } catch (error) {
    console.error("Get logs error:", error);
    return NextResponse.json(
      { error: "영농일지 조회 중 오류가 발생했습니다." },
      { status: 500 }
    );
  }
}

// POST: 영농일지 생성
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.id) {
      return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
    }

    const body = await request.json();
    const validatedData = createLogSchema.parse(body);

    // 같은 날짜 일지 중복 확인
    const existingLog = await prisma.farmingLog.findUnique({
      where: {
        userId_date: {
          userId: session.user.id,
          date: new Date(validatedData.date),
        },
      },
    });

    if (existingLog) {
      return NextResponse.json(
        { error: "해당 날짜의 일지가 이미 존재합니다." },
        { status: 400 }
      );
    }

    const log = await prisma.farmingLog.create({
      data: {
        userId: session.user.id,
        date: new Date(validatedData.date),
        temperature: validatedData.temperature,
        humidity: validatedData.humidity,
        rainfall: validatedData.rainfall,
        weather: validatedData.weather,
        notes: validatedData.notes,
      },
      include: {
        activities: true,
      },
    });

    return NextResponse.json({
      message: "영농일지가 등록되었습니다.",
      log: {
        ...log,
        temperature: log.temperature ? Number(log.temperature) : null,
        rainfall: log.rainfall ? Number(log.rainfall) : null,
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

    console.error("Create log error:", error);
    return NextResponse.json(
      { error: "영농일지 등록 중 오류가 발생했습니다." },
      { status: 500 }
    );
  }
}
