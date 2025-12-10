import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import prisma from "@/lib/prisma";
import { authOptions } from "@/lib/auth/options";
import { z } from "zod";

const updateProfileSchema = z.object({
  name: z.string().min(1, "이름을 입력해주세요.").max(50, "이름은 50자 이내로 입력해주세요."),
});

// GET: 프로필 조회
export async function GET() {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.id) {
      return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
    }

    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: {
        id: true,
        email: true,
        name: true,
        createdAt: true,
      },
    });

    if (!user) {
      return NextResponse.json({ error: "사용자를 찾을 수 없습니다." }, { status: 404 });
    }

    return NextResponse.json({ profile: user });
  } catch (error) {
    console.error("Get profile error:", error);
    return NextResponse.json(
      { error: "프로필 조회 중 오류가 발생했습니다." },
      { status: 500 }
    );
  }
}

// PATCH: 프로필 수정
export async function PATCH(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.id) {
      return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
    }

    const body = await request.json();
    const validation = updateProfileSchema.safeParse(body);

    if (!validation.success) {
      const firstError = validation.error.issues[0];
      return NextResponse.json(
        { error: firstError?.message || "입력값이 올바르지 않습니다." },
        { status: 400 }
      );
    }

    const { name } = validation.data;

    const user = await prisma.user.update({
      where: { id: session.user.id },
      data: { name },
      select: {
        id: true,
        email: true,
        name: true,
        createdAt: true,
      },
    });

    return NextResponse.json({ profile: user });
  } catch (error) {
    console.error("Update profile error:", error);
    return NextResponse.json(
      { error: "프로필 수정 중 오류가 발생했습니다." },
      { status: 500 }
    );
  }
}
