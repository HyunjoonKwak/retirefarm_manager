import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getToken } from "next-auth/jwt";

export async function middleware(request: NextRequest) {
  const { pathname, searchParams } = request.nextUrl;

  // SSO 토큰이 있고 로그인 페이지가 아닌 경우 로그인 페이지로 리다이렉트
  const ssoToken = searchParams.get("sso_token");

  if (ssoToken && pathname !== "/auth/login") {
    const loginUrl = new URL("/auth/login", request.url);
    loginUrl.searchParams.set("sso_token", ssoToken);
    return NextResponse.redirect(loginUrl);
  }

  // 인증 토큰 확인
  const token = await getToken({ req: request, secret: process.env.NEXTAUTH_SECRET });

  // 로그인/회원가입 페이지나 API는 통과
  if (pathname.startsWith("/auth") || pathname.startsWith("/api")) {
    return NextResponse.next();
  }

  // 미로그인 상태에서 보호된 페이지 접근 시 로그인 페이지로 리다이렉트
  if (!token) {
    const loginUrl = new URL("/auth/login", request.url);
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    // 정적 파일 제외한 모든 경로 매칭
    "/((?!_next/static|_next/image|favicon.ico).*)",
  ],
};
