import type { NextAuthOptions } from "next-auth";
import AzureADProvider from "next-auth/providers/azure-ad";
import CredentialsProvider from "next-auth/providers/credentials";
import { prisma } from "./prisma";

export const azureEnabled = !!(
  process.env.AZURE_AD_CLIENT_ID && process.env.AZURE_AD_CLIENT_SECRET && process.env.AZURE_AD_TENANT_ID
);
export const demoLoginEnabled = process.env.DEMO_LOGIN === "true";

const providers: NextAuthOptions["providers"] = [];

if (azureEnabled) {
  providers.push(
    AzureADProvider({
      clientId: process.env.AZURE_AD_CLIENT_ID!,
      clientSecret: process.env.AZURE_AD_CLIENT_SECRET!,
      tenantId: process.env.AZURE_AD_TENANT_ID!,
      authorization: { params: { scope: "openid profile email User.Read" } },
    })
  );
}

if (demoLoginEnabled) {
  providers.push(
    CredentialsProvider({
      id: "demo",
      name: "시연용 로그인",
      credentials: { email: { label: "이메일", type: "email" } },
      async authorize(credentials) {
        const email = credentials?.email?.trim().toLowerCase();
        if (!email) return null;
        const user = await prisma.user.findUnique({ where: { email } });
        if (!user || !user.active) return null;
        return { id: user.id, email: user.email, name: user.name };
      },
    })
  );
}

export const authOptions: NextAuthOptions = {
  providers,
  session: { strategy: "jwt", maxAge: 60 * 60 * 10 },
  pages: { signIn: "/login", error: "/login" },
  callbacks: {
    // Entra ID 로 로그인해도 포탈에 등록된(활성) 사용자만 허용한다.
    async signIn({ user, profile }) {
      const email = (user?.email || (profile as { preferred_username?: string } | undefined)?.preferred_username || "")
        .trim()
        .toLowerCase();
      if (!email) return false;
      const dbUser = await prisma.user.findUnique({ where: { email } });
      if (!dbUser || !dbUser.active) return "/login?error=NotRegistered";
      await prisma.auditLog.create({
        data: { userId: dbUser.id, userName: dbUser.name, action: "LOGIN", entity: "User", entityId: dbUser.id, summary: `${dbUser.name} 로그인` },
      });
      return true;
    },
    async jwt({ token, user, profile }) {
      if (user) {
        const email = (user.email || (profile as { preferred_username?: string } | undefined)?.preferred_username || "")
          .trim()
          .toLowerCase();
        const dbUser = await prisma.user.findUnique({ where: { email } });
        if (dbUser) token.uid = dbUser.id;
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user && token.uid) (session.user as { id?: string }).id = token.uid as string;
      return session;
    },
  },
};
