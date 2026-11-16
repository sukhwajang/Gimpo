"use server";
import { revalidatePath } from "next/cache";
import { audit } from "@/lib/audit";
import { ACTIVITY_TYPES, BUSINESSES, GRADES } from "@/lib/constants";
import { fail, ok, str } from "@/lib/form";
import { parseDate } from "@/lib/format";
import { canEditCustomer, canEditOpp, canViewCustomer, isAdmin, isSales } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/session";

export async function saveCustomer(fd: FormData) {
  const me = await requireUser();
  const id = str(fd, "id");
  const code = str(fd, "code").toUpperCase();
  const name = str(fd, "name");
  const country = str(fd, "country");
  const grade = str(fd, "grade");
  const businesses = BUSINESSES.filter((b) => fd.getAll("businesses").includes(b));
  let ownerId = str(fd, "ownerId");
  if (!code || !name || !country) return fail("고객코드, 고객사명, 국가는 필수입니다.");
  if (businesses.length === 0) return fail("사업구분을 하나 이상 선택하세요.");
  if (!GRADES.includes(grade as (typeof GRADES)[number])) return fail("등급을 선택하세요.");
  if (!isAdmin(me) && me.business && !businesses.includes(me.business as (typeof BUSINESSES)[number])) return fail("소속 사업부는 사업구분에 반드시 포함되어야 합니다.");
  if (isSales(me) && !id) ownerId = me.id;
  const owner = await prisma.user.findUnique({ where: { id: ownerId } });
  if (!owner || !owner.active) return fail("담당 영업을 선택하세요.");
  const dup = await prisma.customer.findUnique({ where: { code } });
  if (dup && dup.id !== id) return fail(`이미 등록된 고객코드입니다: ${code}`);
  const data = { code, name, country, grade, businesses: businesses.join(","), ownerId, memo: str(fd, "memo") };

  if (id) {
    const cur = await prisma.customer.findUnique({ where: { id } });
    if (!cur) return fail("고객사를 찾을 수 없습니다.");
    if (!canEditCustomer(me, cur)) return fail("수정 권한이 없습니다. (본인 담당 고객만 수정할 수 있습니다)");
    if (isSales(me)) data.ownerId = cur.ownerId; // 영업담당은 담당자를 바꿀 수 없다
    await prisma.customer.update({ where: { id }, data });
    await audit(me, "UPDATE", "Customer", id, `고객사 수정: ${name} (${code})`);
  } else {
    const c = await prisma.customer.create({ data });
    await audit(me, "CREATE", "Customer", c.id, `고객사 등록: ${name} (${code})`);
    revalidatePath("/customers");
    return ok(`/customers/${c.id}`);
  }
  revalidatePath("/customers");
  return ok();
}

export async function deleteCustomer(fd: FormData) {
  const me = await requireUser();
  const id = str(fd, "id");
  const c = await prisma.customer.findUnique({ where: { id }, include: { _count: { select: { opportunities: true, salesRecords: true } } } });
  if (!c) return fail("고객사를 찾을 수 없습니다.");
  if (!canEditCustomer(me, c) || isSales(me)) return fail("삭제 권한이 없습니다. (사업부장 이상)");
  if (c._count.opportunities > 0 || c._count.salesRecords > 0) return fail("영업기회 또는 실적이 연결된 고객사는 삭제할 수 없습니다.");
  await prisma.customer.delete({ where: { id } });
  await audit(me, "DELETE", "Customer", id, `고객사 삭제: ${c.name} (${c.code})`);
  revalidatePath("/customers");
  return ok("/customers");
}

export async function saveContact(fd: FormData) {
  const me = await requireUser();
  const id = str(fd, "id");
  const customerId = str(fd, "customerId");
  const name = str(fd, "name");
  const email = str(fd, "email");
  if (!name) return fail("이름은 필수입니다.");
  if (email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return fail("이메일 형식이 올바르지 않습니다.");
  const c = await prisma.customer.findUnique({ where: { id: customerId } });
  if (!c) return fail("고객사를 찾을 수 없습니다.");
  if (!canEditCustomer(me, c)) return fail("수정 권한이 없습니다.");
  const data = { name, title: str(fd, "title"), email, phone: str(fd, "phone") };
  if (id) {
    await prisma.contact.update({ where: { id }, data });
    await audit(me, "UPDATE", "Contact", id, `담당자 수정: ${c.name} / ${name}`);
  } else {
    const n = await prisma.contact.create({ data: { ...data, customerId } });
    await audit(me, "CREATE", "Contact", n.id, `담당자 등록: ${c.name} / ${name}`);
  }
  revalidatePath(`/customers/${customerId}`);
  return ok();
}

export async function deleteContact(fd: FormData) {
  const me = await requireUser();
  const contact = await prisma.contact.findUnique({ where: { id: str(fd, "id") }, include: { customer: true } });
  if (!contact) return fail("담당자를 찾을 수 없습니다.");
  if (!canEditCustomer(me, contact.customer)) return fail("삭제 권한이 없습니다.");
  await prisma.contact.delete({ where: { id: contact.id } });
  await audit(me, "DELETE", "Contact", contact.id, `담당자 삭제: ${contact.customer.name} / ${contact.name}`);
  revalidatePath(`/customers/${contact.customerId}`);
  return ok();
}

/** 활동 기록 (고객 또는 기회에 연결) */
export async function saveActivity(fd: FormData) {
  const me = await requireUser();
  const type = str(fd, "type");
  const subject = str(fd, "subject");
  const date = parseDate(fd.get("date"));
  const opportunityId = str(fd, "opportunityId") || null;
  let customerId = str(fd, "customerId");
  if (!ACTIVITY_TYPES.includes(type as (typeof ACTIVITY_TYPES)[number])) return fail("활동 유형을 선택하세요.");
  if (!subject) return fail("제목은 필수입니다.");
  if (!date) return fail("일자를 입력하세요.");
  if (date.getTime() > Date.now() + 86400000) return fail("미래 일자의 활동은 기록할 수 없습니다. 예정된 일은 '다음 액션'에 입력하세요.");

  if (opportunityId) {
    const opp = await prisma.opportunity.findUnique({ where: { id: opportunityId } });
    if (!opp) return fail("영업기회를 찾을 수 없습니다.");
    if (!canEditOpp(me, opp)) return fail("본인 담당 기회에만 활동을 기록할 수 있습니다.");
    customerId = opp.customerId;
  } else {
    const c = await prisma.customer.findUnique({ where: { id: customerId } });
    if (!c) return fail("고객사를 선택하세요.");
    if (!canViewCustomer(me, c) || !canEditCustomer(me, c)) return fail("본인 담당 고객에만 활동을 기록할 수 있습니다.");
  }
  const a = await prisma.activity.create({ data: { type, subject, content: str(fd, "content"), date, userId: me.id, customerId, opportunityId } });
  if (opportunityId) {
    const opp = await prisma.opportunity.findUnique({ where: { id: opportunityId } });
    if (opp && opp.lastActivityAt < date) await prisma.opportunity.update({ where: { id: opportunityId }, data: { lastActivityAt: date > new Date() ? new Date() : date } });
  }
  await audit(me, "CREATE", "Activity", a.id, `활동 기록: ${subject}`);
  revalidatePath("/activities");
  return ok();
}

export async function deleteActivity(fd: FormData) {
  const me = await requireUser();
  const a = await prisma.activity.findUnique({ where: { id: str(fd, "id") }, include: { customer: true } });
  if (!a) return fail("활동을 찾을 수 없습니다.");
  const allowed = a.userId === me.id || isAdmin(me) || (me.role === "HEAD" && canEditCustomer(me, a.customer));
  if (!allowed) return fail("본인이 작성한 활동만 삭제할 수 있습니다.");
  await prisma.activity.delete({ where: { id: a.id } });
  await audit(me, "DELETE", "Activity", a.id, `활동 삭제: ${a.subject}`);
  revalidatePath("/activities");
  return ok();
}
