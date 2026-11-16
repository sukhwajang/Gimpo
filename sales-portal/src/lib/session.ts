import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { cache } from "react";
import { authOptions } from "./auth";
import { prisma } from "./prisma";

export type SessionUser = {
  id: string;
  email: string;
  name: string;
  title: string;
  role: string;
  business: string | null;
};

/** 세션의 사용자 ID로 DB에서 역할/사업부를 매번 다시 읽는다(권한 변경 즉시 반영). */
export const getUser = cache(async (): Promise<SessionUser | null> => {
  const session = await getServerSession(authOptions);
  const id = (session?.user as { id?: string } | undefined)?.id;
  if (!id) return null;
  const u = await prisma.user.findUnique({ where: { id } });
  if (!u || !u.active) return null;
  return { id: u.id, email: u.email, name: u.name, title: u.title, role: u.role, business: u.business };
});

export async function requireUser(): Promise<SessionUser> {
  const u = await getUser();
  if (!u) redirect("/login");
  return u;
}

export async function requireAdmin(): Promise<SessionUser> {
  const u = await requireUser();
  if (u.role !== "ADMIN" && u.role !== "EXEC") redirect("/");
  return u;
}
