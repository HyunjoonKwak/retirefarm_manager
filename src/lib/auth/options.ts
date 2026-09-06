import { NextAuthOptions } from "next-auth";
import KakaoProvider from "next-auth/providers/kakao";
import prisma from "@/lib/prisma";

export const authOptions: NextAuthOptions = {
  providers: [
    KakaoProvider({
      clientId: process.env.KAKAO_CLIENT_ID!,
      clientSecret: process.env.KAKAO_CLIENT_SECRET!,
    }),
  ],
  session: {
    strategy: "jwt",
    maxAge: 30 * 24 * 60 * 60,
  },
  pages: {
    signIn: "/auth/login",
    error: "/auth/error",
  },
  callbacks: {
    async signIn({ user, account, profile }) {
      if (account?.provider !== "kakao") return false;

      const kakaoId = String(account.providerAccountId);
      const email = user.email || `kakao_${kakaoId}@kakao.user`;
      const kakaoProfile = profile as
        | { properties?: { nickname?: string } }
        | undefined;
      const name = user.name || kakaoProfile?.properties?.nickname || null;

      // 관리자 연결은 서버 운영자가 지정한 카카오 ID만 허용한다.
      const configuredAdmin = process.env.KAKAO_ADMIN_ID?.trim();
      const isConfiguredAdmin = Boolean(configuredAdmin && kakaoId === configuredAdmin);
      const legacyAdminId = process.env.KAKAO_ADMIN_USER_ID?.trim();
      const existingByKakao = await prisma.user.findUnique({ where: { kakaoId } });
      if (existingByKakao) {
        if (isConfiguredAdmin && legacyAdminId && legacyAdminId !== existingByKakao.id) return false;
        if (isConfiguredAdmin && !legacyAdminId && existingByKakao.role !== "ADMIN") {
          await prisma.user.update({ where: { id: existingByKakao.id }, data: { role: "ADMIN" } });
        }
        return true;
      }

      if (isConfiguredAdmin && legacyAdminId) {
        const admin = await prisma.user.findUnique({ where: { id: legacyAdminId } });
        if (!admin || admin.role !== "ADMIN" || admin.kakaoId) return false;
        await prisma.user.update({
          where: { id: admin.id },
          data: { kakaoId, image: user.image },
        });
        return true;
      }

      // 이메일 일치만으로 기존 계정 소유권을 넘기지 않는다.
      const existingByEmail = await prisma.user.findUnique({ where: { email } });
      if (existingByEmail) return false;
      const role = isConfiguredAdmin ? "ADMIN" : "USER";

      await prisma.user.create({
        data: {
          email,
          name: name || null,
          image: user.image || null,
          kakaoId,
          role,
        },
      });

      return true;
    },
    async jwt({ token, account }) {
      const where = account
        ? { kakaoId: String(account.providerAccountId) }
        : token.id ? { id: token.id as string } : null;
      const dbUser = where ? await prisma.user.findUnique({ where }) : null;
      if (dbUser) {
        token.id = dbUser.id;
        token.role = dbUser.role;
        token.image = dbUser.image;
      } else {
        delete token.id;
        delete token.role;
        delete token.image;
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.id = token.id as string;
        session.user.role = token.role as string;
        session.user.image = token.image as string | null;
      }
      return session;
    },
  },
  secret: process.env.NEXTAUTH_SECRET,
};
