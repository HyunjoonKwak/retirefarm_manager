import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

export function middleware(request: NextRequest) {
  const { pathname, searchParams } = request.nextUrl;

  // SSO 토큰이 있고 로그인 페이지가 아닌 경우 로그인 페이지로 리다이렉트
  const ssoToken = searchParams.get("sso_token");

  if (ssoToken && pathname !== "/auth/login") {
    const loginUrl = new URL("/auth/login", request.url);
    loginUrl.searchParams.set("sso_token", ssoToken);
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    // SSO 토큰 처리를 위해 루트와 주요 경로 매칭
    "/",
    "/(main)/:path*",
  ],
};
