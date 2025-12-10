import { NextAuthOptions } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import { compare } from "bcryptjs";
import prisma from "@/lib/prisma";

const MY_PORTAL_API = process.env.MY_PORTAL_API_URL || "https://portal.specialrisk.me/api";

// My Portal API로 토큰 검증
async function verifyPortalToken(token: string) {
  console.log("[SSO Server] verifyPortalToken called");
  console.log("[SSO Server] API URL:", MY_PORTAL_API);
  console.log("[SSO Server] Token prefix:", token.substring(0, 30) + "...");

  try {
    const url = `${MY_PORTAL_API}/auth/verify`;
    console.log("[SSO Server] Fetching:", url);

    const response = await fetch(url, {
      method: "GET",
      headers: { Authorization: `Bearer ${token}` },
    });

    console.log("[SSO Server] Response status:", response.status);

    if (response.ok) {
      const data = await response.json();
      console.log("[SSO Server] Response data:", JSON.stringify(data));
      return { valid: true, user: data.user };
    }

    const errorText = await response.text();
    console.log("[SSO Server] Error response:", errorText);
    return { valid: false };
  } catch (error) {
    console.error("[SSO Server] Exception:", error);
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
        console.log("[SSO Server] authorize called");
        console.log("[SSO Server] credentials keys:", credentials ? Object.keys(credentials) : "none");
        console.log("[SSO Server] has ssoToken:", !!credentials?.ssoToken);
        console.log("[SSO Server] has email:", !!credentials?.email);

        if (!credentials?.email && !credentials?.ssoToken) {
          console.log("[SSO Server] No email or ssoToken provided");
          throw new Error("이메일 또는 SSO 토큰이 필요합니다.");
        }

        // SSO 로그인 처리
        if (credentials.ssoToken) {
          console.log("[SSO Server] Processing SSO token...");
          const portalData = await verifyPortalToken(credentials.ssoToken);
          console.log("[SSO Server] Portal verification result:", JSON.stringify(portalData));

          if (!portalData.valid || !portalData.user) {
            console.log("[SSO Server] Invalid SSO token");
            throw new Error("유효하지 않은 SSO 토큰입니다.");
          }

          // 사용자 찾기 또는 생성
          console.log("[SSO Server] Looking for user:", portalData.user.email);
          let user = await prisma.user.findFirst({
            where: {
              OR: [
                { email: portalData.user.email },
                { portalEmail: portalData.user.email },
              ],
            },
          });

          if (!user) {
            console.log("[SSO Server] Creating new SSO user...");
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
            console.log("[SSO Server] Created user:", user.id);
          } else {
            console.log("[SSO Server] Found existing user:", user.id);
          }

          console.log("[SSO Server] SSO login successful for:", user.email);
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
