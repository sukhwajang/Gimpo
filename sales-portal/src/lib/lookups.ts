import { prisma } from "./prisma";
import { isAdmin } from "./permissions";
import type { SessionUser } from "./session";

/** 담당자로 지정할 수 있는 사용자(영업담당·사업부장). 관리자 외에는 소속 사업부만 */
export async function ownerOptions(me: SessionUser) {
  return prisma.user.findMany({
    where: { active: true, role: { in: ["SALES", "HEAD"] }, ...(isAdmin(me) ? {} : { business: me.business }) },
    orderBy: [{ business: "asc" }, { role: "asc" }, { name: "asc" }],
    select: { id: true, name: true, business: true },
  });
}

export const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";
