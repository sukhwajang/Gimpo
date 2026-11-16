"use server";
import { revalidatePath } from "next/cache";
import { audit } from "@/lib/audit";
import { BUSINESSES, BUSINESS_LABEL, ROLES, ROLE_LABEL } from "@/lib/constants";
import { fail, num, ok, str } from "@/lib/form";
import { isAdmin } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/session";

async function admin() {
  const me = await requireUser();
  return isAdmin(me) ? me : null;
}
const DENY = "관리 권한이 없습니다.";
const isBiz = (b: string) => (BUSINESSES as readonly string[]).includes(b);

/* ── 사용자·역할 ── */
export async function saveUser(fd: FormData) {
  const me = await admin();
  if (!me) return fail(DENY);
  const id = str(fd, "id");
  const email = str(fd, "email").toLowerCase();
  const name = str(fd, "name");
  const role = str(fd, "role");
  let business: string | null = str(fd, "business") || null;
  const active = str(fd, "active") !== "false";
  if (!name || !email) return fail("이름과 이메일은 필수입니다.");
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return fail("이메일 형식이 올바르지 않습니다.");
  if (!(ROLES as readonly string[]).includes(role)) return fail("역할을 선택하세요.");
  if (role === "SALES" || role === "HEAD") {
    if (!business || !isBiz(business)) return fail("영업담당·사업부장은 소속 사업부를 선택해야 합니다.");
  } else business = null;
  const dup = await prisma.user.findUnique({ where: { email } });
  if (dup && dup.id !== id) return fail(`이미 등록된 이메일입니다: ${email}`);
  const data = { email, name, title: str(fd, "title"), role, business, active };
  if (id) {
    const cur = await prisma.user.findUnique({ where: { id } });
    if (!cur) return fail("사용자를 찾을 수 없습니다.");
    if (id === me.id && (!active || !["ADMIN", "EXEC"].includes(role))) return fail("본인 계정의 관리 권한을 없애거나 비활성화할 수 없습니다.");
    if (cur.business && cur.business !== business) {
      const [c, o] = await Promise.all([
        prisma.customer.count({ where: { ownerId: id } }),
        prisma.opportunity.count({ where: { ownerId: id, stage: { type: "OPEN" } } }),
      ]);
      if (c + o > 0) return fail(`담당 고객 ${c}곳·진행 기회 ${o}건이 있어 사업부를 바꿀 수 없습니다. 먼저 담당자를 변경하세요.`);
    }
    await prisma.user.update({ where: { id }, data });
    const changes = [cur.role !== role && `역할 ${ROLE_LABEL[cur.role]}→${ROLE_LABEL[role]}`, cur.business !== business && `사업부 ${cur.business ?? "-"}→${business ?? "-"}`, cur.active !== active && (active ? "활성화" : "비활성화")].filter(Boolean).join(", ");
    await audit(me, "UPDATE", "User", id, `사용자 수정: ${name} (${email})${changes ? ` — ${changes}` : ""}`);
  } else {
    const u = await prisma.user.create({ data });
    await audit(me, "CREATE", "User", u.id, `사용자 등록: ${name} (${email}, ${ROLE_LABEL[role]}${business ? `·${BUSINESS_LABEL[business]}` : ""})`);
  }
  revalidatePath("/admin/users");
  return ok();
}

/* ── 사업별 단계·확률 ── */
export async function saveStage(fd: FormData) {
  const me = await admin();
  if (!me) return fail(DENY);
  const id = str(fd, "id");
  const name = str(fd, "name");
  const probability = num(fd, "probability");
  if (!name) return fail("단계명을 입력하세요.");
  if (id) {
    const cur = await prisma.stage.findUnique({ where: { id } });
    if (!cur) return fail("단계를 찾을 수 없습니다.");
    const p = cur.type === "LOST" ? 0 : cur.type === "WON" ? 100 : probability;
    if (!Number.isInteger(p) || p < 0 || p > 100) return fail("성공확률은 0~100 사이의 정수로 입력하세요.");
    await prisma.stage.update({ where: { id }, data: { name, probability: p } });
    await audit(me, "UPDATE", "Stage", id, `단계 수정: [${BUSINESS_LABEL[cur.business]}] ${cur.name} ${cur.probability}% → ${name} ${p}%`);
  } else {
    const business = str(fd, "business");
    if (!isBiz(business)) return fail("사업을 선택하세요.");
    if (!Number.isInteger(probability) || probability < 0 || probability > 100) return fail("성공확률은 0~100 사이의 정수로 입력하세요.");
    // 새 진행 단계는 마지막 진행 단계 뒤(수주/실패 앞)에 넣는다
    const all = await prisma.stage.findMany({ where: { business }, orderBy: { order: "asc" } });
    const open = all.filter((s) => s.type === "OPEN");
    const closed = all.filter((s) => s.type !== "OPEN");
    const pos = (open[open.length - 1]?.order ?? 0) + 1;
    await prisma.$transaction([
      ...closed.map((s, i) => prisma.stage.update({ where: { id: s.id }, data: { order: pos + 1 + i } })),
      prisma.stage.create({ data: { business, name, probability, order: pos, type: "OPEN" } }),
    ]);
    await audit(me, "CREATE", "Stage", business, `단계 추가: [${BUSINESS_LABEL[business]}] ${name} ${probability}%`);
  }
  revalidatePath("/", "layout");
  return ok();
}

export async function reorderStage(fd: FormData) {
  const me = await admin();
  if (!me) return fail(DENY);
  const cur = await prisma.stage.findUnique({ where: { id: str(fd, "id") } });
  if (!cur || cur.type !== "OPEN") return fail("진행 단계만 순서를 바꿀 수 있습니다.");
  const open = await prisma.stage.findMany({ where: { business: cur.business, type: "OPEN" }, orderBy: { order: "asc" } });
  const i = open.findIndex((s) => s.id === cur.id);
  const j = str(fd, "dir") === "up" ? i - 1 : i + 1;
  if (j < 0 || j >= open.length) return ok();
  await prisma.$transaction([
    prisma.stage.update({ where: { id: open[i].id }, data: { order: open[j].order } }),
    prisma.stage.update({ where: { id: open[j].id }, data: { order: open[i].order } }),
  ]);
  await audit(me, "UPDATE", "Stage", cur.id, `단계 순서 변경: [${BUSINESS_LABEL[cur.business]}] ${cur.name}`);
  revalidatePath("/", "layout");
  return ok();
}

export async function deleteStage(fd: FormData) {
  const me = await admin();
  if (!me) return fail(DENY);
  const cur = await prisma.stage.findUnique({ where: { id: str(fd, "id") }, include: { _count: { select: { opportunities: true, historyFrom: true, historyTo: true } } } });
  if (!cur) return fail("단계를 찾을 수 없습니다.");
  if (cur.type !== "OPEN") return fail("수주/실패 단계는 삭제할 수 없습니다.");
  if (cur._count.opportunities > 0) return fail(`이 단계에 기회 ${cur._count.opportunities}건이 있어 삭제할 수 없습니다. 먼저 다른 단계로 옮기세요.`);
  if (cur._count.historyFrom + cur._count.historyTo > 0) return fail("단계 변경 이력에 사용된 단계는 삭제할 수 없습니다. 이름을 바꿔 재사용하세요.");
  if ((await prisma.stage.count({ where: { business: cur.business, type: "OPEN" } })) <= 1) return fail("진행 단계는 최소 1개가 필요합니다.");
  await prisma.stage.delete({ where: { id: cur.id } });
  await audit(me, "DELETE", "Stage", cur.id, `단계 삭제: [${BUSINESS_LABEL[cur.business]}] ${cur.name}`);
  revalidatePath("/", "layout");
  return ok();
}

/* ── 제품 마스터 ── */
export async function saveProduct(fd: FormData) {
  const me = await admin();
  if (!me) return fail(DENY);
  const id = str(fd, "id");
  const code = str(fd, "code").toUpperCase();
  const name = str(fd, "name");
  const business = str(fd, "business");
  const unit = str(fd, "unit") || "kg";
  const active = str(fd, "active") !== "false";
  if (!code || !name) return fail("제품코드와 제품명은 필수입니다.");
  if (!isBiz(business)) return fail("사업을 선택하세요.");
  const dup = await prisma.product.findUnique({ where: { code } });
  if (dup && dup.id !== id) return fail(`이미 등록된 제품코드입니다: ${code}`);
  if (id) {
    const cur = await prisma.product.findUnique({ where: { id }, include: { _count: { select: { opportunities: true } } } });
    if (!cur) return fail("제품을 찾을 수 없습니다.");
    if (cur.business !== business && cur._count.opportunities > 0) return fail("영업기회에 연결된 제품은 사업을 바꿀 수 없습니다.");
    await prisma.product.update({ where: { id }, data: { code, name, business, unit, active } });
    await audit(me, "UPDATE", "Product", id, `제품 수정: ${name} (${code})`);
  } else {
    const p = await prisma.product.create({ data: { code, name, business, unit, active } });
    await audit(me, "CREATE", "Product", p.id, `제품 등록: ${name} (${code})`);
  }
  revalidatePath("/admin/products");
  return ok();
}

export async function deleteProduct(fd: FormData) {
  const me = await admin();
  if (!me) return fail(DENY);
  const cur = await prisma.product.findUnique({ where: { id: str(fd, "id") }, include: { _count: { select: { opportunities: true } } } });
  if (!cur) return fail("제품을 찾을 수 없습니다.");
  if (cur._count.opportunities > 0) return fail(`영업기회 ${cur._count.opportunities}건에 연결되어 삭제할 수 없습니다. '사용 안 함'으로 바꾸세요.`);
  await prisma.product.delete({ where: { id: cur.id } });
  await audit(me, "DELETE", "Product", cur.id, `제품 삭제: ${cur.name} (${cur.code})`);
  revalidatePath("/admin/products");
  return ok();
}

/* ── 환율 (월별) ── */
async function reconvert(year: number, month: number, currency: string) {
  // 해당 월·통화의 실적을 현재 환율표 기준으로 다시 환산한다
  const { loadRates } = await import("@/lib/fx");
  const rates = await loadRates();
  const recs = await prisma.salesRecord.findMany({ where: { currency, saleDate: { gte: new Date(year, month - 1, 1), lt: new Date(year, month, 1) } }, select: { id: true, amount: true, saleDate: true } });
  await prisma.$transaction(recs.map((r) => prisma.salesRecord.update({ where: { id: r.id }, data: { amountKrw: Math.round(r.amount * rates.rate(currency, r.saleDate)) } })));
  return recs.length;
}

export async function saveRate(fd: FormData) {
  const me = await admin();
  if (!me) return fail(DENY);
  const year = num(fd, "year"), month = num(fd, "month"), rate = num(fd, "rate");
  const currency = str(fd, "currency");
  if (!Number.isInteger(year) || year < 2000 || year > 2100) return fail("연도가 올바르지 않습니다.");
  if (!Number.isInteger(month) || month < 1 || month > 12) return fail("월이 올바르지 않습니다.");
  if (!["USD", "EUR"].includes(currency)) return fail("통화는 USD 또는 EUR 입니다. (KRW는 항상 1)");
  if (!Number.isFinite(rate) || rate <= 0) return fail("환율은 0보다 큰 숫자로 입력하세요.");
  await prisma.exchangeRate.upsert({ where: { year_month_currency: { year, month, currency } }, update: { rate }, create: { year, month, currency, rate } });
  const n = await reconvert(year, month, currency);
  await audit(me, "UPDATE", "ExchangeRate", `${year}-${month}-${currency}`, `환율 저장: ${year}년 ${month}월 ${currency} = ${rate}원${n ? ` (실적 ${n}행 재환산)` : ""}`);
  revalidatePath("/", "layout");
  return ok();
}

export async function deleteRate(fd: FormData) {
  const me = await admin();
  if (!me) return fail(DENY);
  const cur = await prisma.exchangeRate.findUnique({ where: { id: str(fd, "id") } });
  if (!cur) return fail("환율을 찾을 수 없습니다.");
  if ((await prisma.exchangeRate.count({ where: { currency: cur.currency } })) <= 1) return fail("통화별 환율은 최소 1개가 필요합니다.");
  await prisma.exchangeRate.delete({ where: { id: cur.id } });
  const n = await reconvert(cur.year, cur.month, cur.currency);
  await audit(me, "DELETE", "ExchangeRate", cur.id, `환율 삭제: ${cur.year}년 ${cur.month}월 ${cur.currency}${n ? ` (실적 ${n}행은 직전 월 환율로 재환산)` : ""}`);
  revalidatePath("/", "layout");
  return ok();
}
