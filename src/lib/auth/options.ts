import { NextAuthOptions } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import { compare } from "bcryptjs";
import prisma from "@/lib/prisma";

const MY_PORTAL_API = process.env.MY_PORTAL_API_URL || "http://192.168.219.175:3100/api";

// My Portal API로 토큰 검증
async function verifyPortalToken(token: string) {
  try {
    const response = await fetch(`${MY_PORTAL_API}/auth/verify`, {
      method: "GET",
      headers: { Authorization: `Bearer ${token}` },
    });

    if (response.ok) {
      const data = await response.json();
      return { valid: true, user: data.user };
    }
    return { valid: false };
  } catch {
    return { valid: false };
  }
}

export const authOptions: NextAuthOptions = {
  providers: [
    CredentialsProvider({
      name: "credentials",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
        ssoToken: { label: "SSO Token", type: "text" },
      },
      async authorize(credentials) {
        if (!credentials?.email && !credentials?.ssoToken) {
          throw new Error("이메일 또는 SSO 토큰이 필요합니다.");
        }

        // SSO 로그인 처리
        if (credentials.ssoToken) {
          const portalData = await verifyPortalToken(credentials.ssoToken);

          if (!portalData.valid || !portalData.user) {
            throw new Error("유효하지 않은 SSO 토큰입니다.");
          }

          // 사용자 찾기 또는 생성
          let user = await prisma.user.findFirst({
            where: {
              OR: [
                { email: portalData.user.email },
                { portalEmail: portalData.user.email },
              ],
            },
          });

          if (!user) {
            user = await prisma.user.create({
              data: {
                email: portalData.user.email,
                name: portalData.user.name,
                password: null,
                isSsoUser: true,
                portalEmail: portalData.user.email,
                ssoEnabled: true,
              },
            });
          }

          return {
            id: user.id,
            email: user.email,
            name: user.name,
          };
        }

        // 일반 로그인 처리
        if (!credentials.email || !credentials.password) {
          throw new Error("이메일과 비밀번호를 입력해주세요.");
        }

        const user = await prisma.user.findUnique({
          where: { email: credentials.email },
        });

        if (!user) {
          throw new Error("등록되지 않은 이메일입니다.");
        }

        // SSO 전용 계정 체크
        if (!user.password && user.isSsoUser) {
          throw new Error("SSO 계정입니다. My Portal을 통해 로그인해주세요.");
        }

        if (!user.password) {
          throw new Error("비밀번호가 설정되지 않았습니다.");
        }

        const isPasswordValid = await compare(credentials.password, user.password);

        if (!isPasswordValid) {
          throw new Error("비밀번호가 일치하지 않습니다.");
        }

        return {
          id: user.id,
          email: user.email,
          name: user.name,
        };
      },
    }),
  ],
  session: {
    strategy: "jwt",
    maxAge: 30 * 24 * 60 * 60, // 30 days
  },
  pages: {
    signIn: "/auth/login",
    error: "/auth/error",
  },
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id;
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.id = token.id as string;
      }
      return session;
    },
  },
  secret: process.env.NEXTAUTH_SECRET,
};
