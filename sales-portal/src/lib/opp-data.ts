import type { OppFormData } from "@/components/opportunity-form";
import { ownerOptions } from "./lookups";
import { creatableBusinesses, customerScope, isSales } from "./permissions";
import { prisma } from "./prisma";
import type { SessionUser } from "./session";

export async function oppFormData(me: SessionUser): Promise<OppFormData> {
  const businesses = creatableBusinesses(me);
  const [customers, products, owners, stages] = await Promise.all([
    prisma.customer.findMany({ where: customerScope(me), orderBy: { name: "asc" }, select: { id: true, name: true, businesses: true } }),
    prisma.product.findMany({ where: { active: true, business: { in: businesses } }, orderBy: { name: "asc" }, select: { id: true, name: true, business: true } }),
    ownerOptions(me),
    prisma.stage.findMany({ where: { type: "OPEN", business: { in: businesses } }, orderBy: { order: "asc" }, select: { id: true, name: true, business: true, probability: true } }),
  ]);
  return { businesses, customers, products, owners, stages, lockOwner: isSales(me), meId: me.id };
}

export const STALE_DAYS = 30;
export const staleDate = () => new Date(Date.now() - STALE_DAYS * 86400000);

/** 이번 주(월~일) 범위 */
export function weekRange() {
  const now = new Date();
  const day = (now.getDay() + 6) % 7;
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate() - day);
  const end = new Date(start.getFullYear(), start.getMonth(), start.getDate() + 7);
  return { start, end };
}
