import { salesScope } from "./permissions";
import { prisma } from "./prisma";
import type { SessionUser } from "./session";

export type SaleLite = { saleDate: Date; business: string; amountKrw: number; customerId: string | null; customerName: string; ownerId: string | null };

/** 해당 연도의 실적(조회 권한 범위). PoC 규모에서는 메모리 집계로 충분하다. */
export async function loadYearSales(me: SessionUser, year: number): Promise<SaleLite[]> {
  const rows = await prisma.salesRecord.findMany({
    where: { ...salesScope(me), saleDate: { gte: new Date(year, 0, 1), lt: new Date(year + 1, 0, 1) } },
    select: { saleDate: true, business: true, amountKrw: true, customerId: true, customerName: true, customer: { select: { ownerId: true, name: true } } },
  });
  return rows.map((r) => ({ saleDate: r.saleDate, business: r.business, amountKrw: r.amountKrw, customerId: r.customerId, customerName: r.customer?.name ?? r.customerName, ownerId: r.customer?.ownerId ?? null }));
}

export const sum = <T,>(arr: T[], f: (x: T) => number) => arr.reduce((s, x) => s + f(x), 0);

export function byMonth(rows: { saleDate: Date; amountKrw: number }[]): number[] {
  const out = Array<number>(12).fill(0);
  for (const r of rows) out[r.saleDate.getMonth()] += r.amountKrw;
  return out;
}

/** 담당자 실적 = 본인 담당 고객의 소속 사업부 매출 */
export const isMine = (r: SaleLite, user: { id: string; business: string | null }) => r.ownerId === user.id && r.business === user.business;
