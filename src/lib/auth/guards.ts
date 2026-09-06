import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth/options";

export interface SessionUser {
  id: string;
  role?: string | null;
  email?: string | null;
  name?: string | null;
}

/**
 * 로그인 세션 사용자 조회. 미로그인 시 null.
 */
export async function getSessionUser(): Promise<SessionUser | null> {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return null;
  return session.user as SessionUser;
}

export function isAdmin(user: SessionUser): boolean {
  return user.role === "ADMIN";
}

/**
 * CRON_SECRET 검증 (서비스 간 호출용 엔드포인트 보호).
 * 프로덕션에서 시크릿 미설정 시 항상 거부한다.
 */
export function isValidCronRequest(authHeader: string | null): boolean {
  const cronSecret = process.env.CRON_SECRET;
  if (process.env.NODE_ENV === "development" && !cronSecret) return true;
  if (!cronSecret) return false;
  return authHeader === `Bearer ${cronSecret}`;
}

/** 전체 DB 작업은 현재 DB 권한을 확인하여 오래된 JWT 권한을 사용하지 않는다. */
export async function requireAdminUser(): Promise<NextResponse | null> {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  const currentUser = await prisma.user.findUnique({
    where: { id: user.id },
    select: { role: true },
  });
  if (currentUser?.role !== "ADMIN") {
    return NextResponse.json({ error: "관리자 권한이 필요합니다." }, { status: 403 });
  }
  return null;
}
