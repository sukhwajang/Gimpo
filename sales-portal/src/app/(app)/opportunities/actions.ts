"use server";
import { revalidatePath } from "next/cache";
import { audit } from "@/lib/audit";
import { API_DOC_TYPES, CDMO_MILESTONES, CURRENCIES, LOST_REASONS, LOST_REASON_LABEL } from "@/lib/constants";
import { fail, num, ok, str } from "@/lib/form";
import { parseDate } from "@/lib/format";
import { canEditOpp, canViewCustomer, creatableBusinesses, isSales } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/session";

export async function saveOpportunity(fd: FormData) {
  const me = await requireUser();
  const id = str(fd, "id");
  const title = str(fd, "title");
  const amount = num(fd, "amount");
  const currency = str(fd, "currency");
  const customerId = str(fd, "customerId");
  const productId = str(fd, "productId") || null;
  let ownerId = str(fd, "ownerId");
  if (!title) return fail("제품/프로젝트명은 필수입니다.");
  if (!Number.isFinite(amount) || amount < 0) return fail("예상 금액을 숫자로 입력하세요.");
  if (!CURRENCIES.includes(currency as (typeof CURRENCIES)[number])) return fail("통화를 선택하세요.");
  const common = {
    title, amount, currency, productId,
    expectedCloseDate: parseDate(fd.get("expectedCloseDate")),
    nextAction: str(fd, "nextAction"),
    nextActionDue: parseDate(fd.get("nextActionDue")),
    description: str(fd, "description"),
  };

  if (id) {
    const cur = await prisma.opportunity.findUnique({ where: { id } });
    if (!cur) return fail("영업기회를 찾을 수 없습니다.");
    if (!canEditOpp(me, cur)) return fail("수정 권한이 없습니다. (본인 담당 기회만 수정할 수 있습니다)");
    if (isSales(me) || !ownerId) ownerId = cur.ownerId;
    const owner = await prisma.user.findUnique({ where: { id: ownerId } });
    if (!owner || (owner.business && owner.business !== cur.business)) return fail("담당자는 같은 사업부 소속이어야 합니다.");
    if (productId) {
      const p = await prisma.product.findUnique({ where: { id: productId } });
      if (!p || p.business !== cur.business) return fail("해당 사업의 제품을 선택하세요.");
    }
    await prisma.opportunity.update({
      where: { id },
      data: { ...common, ownerId, ...(cur.business === "API" ? { auditDate: parseDate(fd.get("auditDate")) } : {}) },
    });
    await audit(me, "UPDATE", "Opportunity", id, `기회 수정: ${title}`);
    revalidatePath("/opportunities");
    return ok();
  }

  const business = str(fd, "business");
  if (!creatableBusinesses(me).includes(business)) return fail("해당 사업의 기회를 등록할 권한이 없습니다.");
  const customer = await prisma.customer.findUnique({ where: { id: customerId } });
  if (!customer) return fail("고객사를 선택하세요.");
  if (!canViewCustomer(me, customer) || !customer.businesses.split(",").includes(business)) return fail("선택한 사업에 해당하는 고객사가 아닙니다. 고객사의 사업구분을 먼저 확인하세요.");
  if (isSales(me) || !ownerId) ownerId = me.id;
  const owner = await prisma.user.findUnique({ where: { id: ownerId } });
  if (!owner || !owner.active) return fail("담당자를 선택하세요.");
  if (owner.business && owner.business !== business) return fail("담당자는 같은 사업부 소속이어야 합니다.");
  if (productId) {
    const p = await prisma.product.findUnique({ where: { id: productId } });
    if (!p || p.business !== business) return fail("해당 사업의 제품을 선택하세요.");
  }
  const stageId = str(fd, "stageId");
  const stage = (await prisma.stage.findFirst({ where: { id: stageId, business, type: "OPEN" } })) ?? (await prisma.stage.findFirst({ where: { business, type: "OPEN" }, orderBy: { order: "asc" } }));
  if (!stage) return fail("해당 사업에 진행 단계가 설정되어 있지 않습니다.");

  const opp = await prisma.opportunity.create({
    data: {
      ...common, business, customerId, ownerId, stageId: stage.id,
      auditDate: business === "API" ? parseDate(fd.get("auditDate")) : null,
      history: { create: { toStageId: stage.id, changedById: me.id, note: "기회 등록" } },
      documents: business === "API" ? { create: API_DOC_TYPES.map((docType) => ({ docType })) } : undefined,
      milestones: business === "CDMO" ? { create: CDMO_MILESTONES.map((name, order) => ({ name, order })) } : undefined,
    },
  });
  await audit(me, "CREATE", "Opportunity", opp.id, `기회 등록: ${title} (${customer.name})`);
  revalidatePath("/opportunities");
  return ok(`/opportunities/${opp.id}`);
}

export async function moveStage(fd: FormData) {
  const me = await requireUser();
  const id = str(fd, "id");
  const stageId = str(fd, "stageId");
  const opp = await prisma.opportunity.findUnique({ where: { id }, include: { stage: true } });
  if (!opp) return fail("영업기회를 찾을 수 없습니다.");
  if (!canEditOpp(me, opp)) return fail("본인 담당 기회만 단계를 변경할 수 있습니다.");
  const to = await prisma.stage.findUnique({ where: { id: stageId } });
  if (!to || to.business !== opp.business) return fail("이 사업에 없는 단계입니다.");
  if (to.id === opp.stageId) return ok();
  const lostReason = str(fd, "lostReason");
  const lostNote = str(fd, "lostNote");
  if (to.type === "LOST") {
    if (!LOST_REASONS.includes(lostReason as (typeof LOST_REASONS)[number])) return fail("실패 사유를 선택하세요.");
    if (lostReason === "OTHER" && !lostNote) return fail("사유가 '기타'이면 상세 내용을 입력하세요.");
  }
  const now = new Date();
  await prisma.$transaction([
    prisma.opportunity.update({
      where: { id },
      data: {
        stageId: to.id,
        closedAt: to.type === "OPEN" ? null : now,
        lostReason: to.type === "LOST" ? lostReason : null,
        lostNote: to.type === "LOST" ? lostNote : "",
        lastActivityAt: now,
        ...(to.type !== "OPEN" ? { nextAction: "", nextActionDue: null } : {}),
      },
    }),
    prisma.stageHistory.create({
      data: { opportunityId: id, fromStageId: opp.stageId, toStageId: to.id, changedById: me.id, note: to.type === "LOST" ? `${LOST_REASON_LABEL[lostReason]}${lostNote ? ` - ${lostNote}` : ""}` : str(fd, "note") },
    }),
  ]);
  await audit(me, "STAGE", "Opportunity", id, `단계 변경: ${opp.title} (${opp.stage.name} → ${to.name})`);
  revalidatePath("/opportunities");
  return ok();
}

export async function deleteOpportunity(fd: FormData) {
  const me = await requireUser();
  const opp = await prisma.opportunity.findUnique({ where: { id: str(fd, "id") } });
  if (!opp) return fail("영업기회를 찾을 수 없습니다.");
  if (!canEditOpp(me, opp) || isSales(me)) return fail("삭제 권한이 없습니다. (사업부장 이상)");
  await prisma.opportunity.delete({ where: { id: opp.id } });
  await audit(me, "DELETE", "Opportunity", opp.id, `기회 삭제: ${opp.title}`);
  revalidatePath("/opportunities");
  return ok("/opportunities");
}

/** API: 요청 문서 체크리스트 토글 */
export async function toggleDocument(fd: FormData) {
  const me = await requireUser();
  const doc = await prisma.opportunityDocument.findUnique({ where: { id: str(fd, "id") }, include: { opportunity: true } });
  if (!doc) return fail("문서를 찾을 수 없습니다.");
  if (!canEditOpp(me, doc.opportunity)) return fail("수정 권한이 없습니다.");
  const field = str(fd, "field");
  const value = str(fd, "value") === "true";
  if (field === "requested") {
    await prisma.opportunityDocument.update({ where: { id: doc.id }, data: { requested: value, ...(value ? {} : { provided: false, providedAt: null }) } });
  } else if (field === "provided") {
    await prisma.opportunityDocument.update({ where: { id: doc.id }, data: { provided: value, providedAt: value ? new Date() : null, ...(value ? { requested: true } : {}) } });
  } else return fail("잘못된 요청입니다.");
  await audit(me, "UPDATE", "OpportunityDocument", doc.id, `문서 체크리스트: ${doc.opportunity.title} / ${doc.docType} ${field === "requested" ? "요청" : "제공"} ${value ? "체크" : "해제"}`);
  revalidatePath(`/opportunities/${doc.opportunityId}`);
  return ok();
}

export async function addDocument(fd: FormData) {
  const me = await requireUser();
  const opportunityId = str(fd, "opportunityId");
  const docType = str(fd, "docType");
  if (!docType) return fail("문서명을 입력하세요.");
  const opp = await prisma.opportunity.findUnique({ where: { id: opportunityId } });
  if (!opp || opp.business !== "API") return fail("API 기회에서만 사용할 수 있습니다.");
  if (!canEditOpp(me, opp)) return fail("수정 권한이 없습니다.");
  if (await prisma.opportunityDocument.findUnique({ where: { opportunityId_docType: { opportunityId, docType } } })) return fail("이미 있는 문서입니다.");
  await prisma.opportunityDocument.create({ data: { opportunityId, docType, requested: true } });
  await audit(me, "CREATE", "OpportunityDocument", opportunityId, `요청 문서 추가: ${opp.title} / ${docType}`);
  revalidatePath(`/opportunities/${opportunityId}`);
  return ok();
}

/** CDMO: 마일스톤 저장(추가/수정) */
export async function saveMilestone(fd: FormData) {
  const me = await requireUser();
  const id = str(fd, "id");
  const opportunityId = str(fd, "opportunityId");
  const name = str(fd, "name");
  if (!name) return fail("마일스톤명을 입력하세요.");
  const opp = await prisma.opportunity.findUnique({ where: { id: opportunityId }, include: { _count: { select: { milestones: true } } } });
  if (!opp || opp.business !== "CDMO") return fail("CDMO 기회에서만 사용할 수 있습니다.");
  if (!canEditOpp(me, opp)) return fail("수정 권한이 없습니다.");
  const data = { name, plannedDate: parseDate(fd.get("plannedDate")), actualDate: parseDate(fd.get("actualDate")) };
  if (id) await prisma.milestone.update({ where: { id }, data });
  else await prisma.milestone.create({ data: { ...data, opportunityId, order: opp._count.milestones } });
  await audit(me, id ? "UPDATE" : "CREATE", "Milestone", id || opportunityId, `마일스톤 ${id ? "수정" : "추가"}: ${opp.title} / ${name}`);
  revalidatePath(`/opportunities/${opportunityId}`);
  return ok();
}

export async function deleteMilestone(fd: FormData) {
  const me = await requireUser();
  const m = await prisma.milestone.findUnique({ where: { id: str(fd, "id") }, include: { opportunity: true } });
  if (!m) return fail("마일스톤을 찾을 수 없습니다.");
  if (!canEditOpp(me, m.opportunity)) return fail("수정 권한이 없습니다.");
  await prisma.milestone.delete({ where: { id: m.id } });
  await audit(me, "DELETE", "Milestone", m.id, `마일스톤 삭제: ${m.opportunity.title} / ${m.name}`);
  revalidatePath(`/opportunities/${m.opportunityId}`);
  return ok();
}
