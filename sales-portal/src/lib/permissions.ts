import type { Prisma } from "@prisma/client";
import { BUSINESSES } from "./constants";
import type { SessionUser } from "./session";

export const isAdmin = (u: SessionUser) => u.role === "ADMIN" || u.role === "EXEC";
export const isHead = (u: SessionUser) => u.role === "HEAD";
export const isSales = (u: SessionUser) => u.role === "SALES";

/** 조회 가능한 사업부 */
export function visibleBusinesses(u: SessionUser): string[] {
  if (isAdmin(u)) return [...BUSINESSES];
  return u.business ? [u.business] : [];
}

export function canViewBusiness(u: SessionUser, business: string) {
  return visibleBusinesses(u).includes(business);
}

/** 기회 조회 범위 */
export function oppScope(u: SessionUser): Prisma.OpportunityWhereInput {
  if (isAdmin(u)) return {};
  return { business: u.business ?? "__none__" };
}

/** 고객 조회 범위 (사업구분 다중 선택 중 하나라도 겹치면 조회) */
export function customerScope(u: SessionUser): Prisma.CustomerWhereInput {
  if (isAdmin(u)) return {};
  return { businesses: { contains: u.business ?? "__none__" } };
}

export function salesScope(u: SessionUser): Prisma.SalesRecordWhereInput {
  if (isAdmin(u)) return {};
  return { business: u.business ?? "__none__" };
}

export function canEditOpp(u: SessionUser, opp: { business: string; ownerId: string }) {
  if (isAdmin(u)) return true;
  if (isHead(u)) return opp.business === u.business;
  return opp.ownerId === u.id;
}

export function canEditCustomer(u: SessionUser, c: { businesses: string; ownerId: string }) {
  if (isAdmin(u)) return true;
  if (isHead(u)) return !!u.business && c.businesses.split(",").includes(u.business);
  return c.ownerId === u.id;
}

export function canViewCustomer(u: SessionUser, c: { businesses: string }) {
  if (isAdmin(u)) return true;
  return !!u.business && c.businesses.split(",").includes(u.business);
}

/** 기회를 만들 수 있는 사업부 */
export function creatableBusinesses(u: SessionUser): string[] {
  return visibleBusinesses(u);
}

export function canSetTargets(u: SessionUser, business: string) {
  if (isAdmin(u)) return true;
  return isHead(u) && u.business === business;
}
