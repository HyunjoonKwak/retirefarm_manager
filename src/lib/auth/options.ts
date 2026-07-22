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

      // Check if this Kakao account is already linked
      const existingByKakao = await prisma.user.findUnique({
        where: { kakaoId },
      });

      if (existingByKakao) return true;

      // Check if there's an existing user with the same email
      const existingByEmail = await prisma.user.findUnique({
        where: { email },
      });

      if (existingByEmail) {
        await prisma.user.update({
          where: { id: existingByEmail.id },
          data: {
            kakaoId,
            name: existingByEmail.name || name,
            image: user.image,
          },
        });
        return true;
      }

      // First Kakao login: link to existing ADMIN user if no one has kakaoId yet
      const anyLinkedUser = await prisma.user.findFirst({
        where: { kakaoId: { not: null } },
      });

      if (!anyLinkedUser) {
        const adminUser = await prisma.user.findFirst({
          where: { role: "ADMIN" },
          orderBy: { createdAt: "asc" },
        });

        if (adminUser) {
          await prisma.user.update({
            where: { id: adminUser.id },
            data: {
              kakaoId,
              email,
              name: adminUser.name || name,
              image: user.image,
            },
          });
          return true;
        }
      }

      // New user creation
      const userCount = await prisma.user.count();
      const role = userCount === 0 ? "ADMIN" : "USER";

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
      if (account) {
        const kakaoId = String(account.providerAccountId);
        const dbUser = await prisma.user.findUnique({
          where: { kakaoId },
        });
        if (dbUser) {
          token.id = dbUser.id;
          token.role = dbUser.role;
          token.image = dbUser.image;
        }
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
