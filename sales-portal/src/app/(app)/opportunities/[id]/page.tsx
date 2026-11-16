import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Pencil, Plus, Trash2 } from "lucide-react";
import { ActivityFields } from "@/components/customer-fields";
import { ActionButton, FormDialog } from "@/components/form-dialog";
import { DocCheckbox } from "@/components/opp-extras";
import { OpportunityFields } from "@/components/opportunity-form";
import { Empty } from "@/components/page-header";
import { StageStepper } from "@/components/stage-move";
import { Timeline } from "@/components/timeline";
import { BusinessBadge, StageBadge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, Input } from "@/components/ui/input";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { API_DOC_TYPES, BUSINESS_COLOR, LOST_REASON_LABEL } from "@/lib/constants";
import { daysBetween, fmtDate, fmtDateTime, fmtKrw, fmtMoney } from "@/lib/format";
import { loadRates } from "@/lib/fx";
import { oppFormData } from "@/lib/opp-data";
import { canEditOpp, canViewBusiness, isAdmin, isSales } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/session";
import { deleteActivity, saveActivity } from "../../customers/actions";
import { addDocument, deleteMilestone, deleteOpportunity, moveStage, saveMilestone, saveOpportunity, toggleDocument } from "../actions";

function Info({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="mt-0.5 text-sm font-medium">{children}</dd>
    </div>
  );
}

export default async function OpportunityDetail({ params }: { params: { id: string } }) {
  const me = await requireUser();
  const opp = await prisma.opportunity.findUnique({
    where: { id: params.id },
    include: {
      customer: true, owner: true, stage: true, product: true,
      history: { include: { fromStage: true, toStage: true, changedBy: { select: { name: true } } }, orderBy: { changedAt: "desc" } },
      activities: { include: { user: { select: { name: true } } }, orderBy: { date: "desc" } },
      documents: true, milestones: { orderBy: { order: "asc" } },
    },
  });
  if (!opp || !canViewBusiness(me, opp.business)) notFound();
  const editable = canEditOpp(me, opp);
  const [stages, rates, formData] = await Promise.all([
    prisma.stage.findMany({ where: { business: opp.business }, orderBy: { order: "asc" } }),
    loadRates(),
    oppFormData(me),
  ]);
  const amountKrw = rates.toKrw(opp.amount, opp.currency);
  const today = new Date(new Date().getFullYear(), new Date().getMonth(), new Date().getDate());
  const overdue = opp.nextActionDue && opp.nextActionDue < today;
  const idle = daysBetween(opp.lastActivityAt, new Date());
  const docOrder = (t: string) => (API_DOC_TYPES.indexOf(t) === -1 ? 99 : API_DOC_TYPES.indexOf(t));
  opp.documents.sort((a, b) => docOrder(a.docType) - docOrder(b.docType));
  const docsProvided = opp.documents.filter((d) => d.provided).length;
  const docsRequested = opp.documents.filter((d) => d.requested).length;
  // 수정 폼의 선택지에 현재 값이 빠지지 않도록 보강
  const fd = {
    ...formData,
    customers: formData.customers.some((c) => c.id === opp.customerId) ? formData.customers : [...formData.customers, { id: opp.customer.id, name: opp.customer.name, businesses: opp.customer.businesses }],
    owners: formData.owners.some((o) => o.id === opp.ownerId) ? formData.owners : [...formData.owners, { id: opp.owner.id, name: opp.owner.name, business: opp.owner.business }],
    products: opp.product && !formData.products.some((p) => p.id === opp.productId) ? [...formData.products, { id: opp.product.id, name: opp.product.name, business: opp.product.business }] : formData.products,
  };

  return (
    <>
      <Link href={`/opportunities?business=${opp.business}`} className="mb-2 inline-flex items-center gap-1 text-xs text-muted-foreground hover:underline"><ArrowLeft className="h-3 w-3" /> 영업기회</Link>
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <BusinessBadge business={opp.business} />
            <h1 className="text-xl font-bold">{opp.title}</h1>
            <StageBadge name={opp.stage.name} type={opp.stage.type} />
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            <Link href={`/customers/${opp.customerId}`} className="text-primary hover:underline">{opp.customer.name}</Link> · {opp.customer.country} · 담당 {opp.owner.name}
          </p>
        </div>
        {editable ? (
          <div className="flex gap-2">
            <FormDialog trigger={<><Pencil /> 수정</>} title="영업기회 수정" action={saveOpportunity} variant="outline" wide>
              <OpportunityFields
                data={fd}
                value={{ id: opp.id, business: opp.business, customerId: opp.customerId, title: opp.title, productId: opp.productId, amount: opp.amount, currency: opp.currency, expectedCloseDate: opp.expectedCloseDate ? fmtDate(opp.expectedCloseDate) : "", ownerId: opp.ownerId, nextAction: opp.nextAction, nextActionDue: opp.nextActionDue ? fmtDate(opp.nextActionDue) : "", description: opp.description, auditDate: opp.auditDate ? fmtDate(opp.auditDate) : "" }}
              />
            </FormDialog>
            {!isSales(me) && <ActionButton action={deleteOpportunity} fields={{ id: opp.id }} confirm={`'${opp.title}' 기회를 삭제할까요? 이력과 체크리스트도 함께 삭제됩니다.`} variant="outline" size="default" className="text-destructive"><Trash2 /> 삭제</ActionButton>}
          </div>
        ) : (
          <span className="rounded-md bg-slate-100 px-2 py-1 text-xs text-muted-foreground">조회 전용 (담당자: {opp.owner.name})</span>
        )}
      </div>

      <Card className="mb-4" style={{ borderTop: `3px solid ${BUSINESS_COLOR[opp.business]}` }}>
        <CardContent className="pt-4">
          <StageStepper opp={{ id: opp.id, title: opp.title }} stages={stages.map((s) => ({ id: s.id, name: s.name, probability: s.probability, type: s.type, order: s.order }))} currentId={opp.stageId} editable={editable} move={moveStage} />
          {opp.stage.type === "LOST" && (
            <p className="mt-3 rounded-md bg-slate-100 px-3 py-2 text-sm">실패 사유: <b>{opp.lostReason ? LOST_REASON_LABEL[opp.lostReason] : "-"}</b>{opp.lostNote && ` — ${opp.lostNote}`}</p>
          )}
        </CardContent>
      </Card>

      <div className="grid gap-4 xl:grid-cols-3">
        <div className="space-y-4 xl:col-span-2">
          <Card>
            <CardHeader><CardTitle>기회 정보</CardTitle></CardHeader>
            <CardContent>
              <dl className="grid grid-cols-2 gap-4 md:grid-cols-4">
                <Info label="예상 금액"><span className="tabular">{fmtMoney(opp.amount, opp.currency)}</span></Info>
                <Info label="원화 환산 (최신 환율)"><span className="tabular">{fmtKrw(amountKrw)}원</span></Info>
                <Info label={`가중 금액 (${opp.stage.probability}%)`}><span className="tabular">{fmtKrw((amountKrw * opp.stage.probability) / 100)}원</span></Info>
                <Info label="예상 수주일"><span className="tabular">{fmtDate(opp.expectedCloseDate)}</span></Info>
                <Info label="제품 (마스터)">{opp.product ? `${opp.product.name} (${opp.product.code})` : "-"}</Info>
                <Info label="등록일"><span className="tabular">{fmtDate(opp.createdAt)}</span></Info>
                <Info label="최근 활동"><span className={idle >= 30 && opp.stage.type === "OPEN" ? "text-amber-600" : ""}>{fmtDate(opp.lastActivityAt)} ({idle}일 전)</span></Info>
                <Info label={opp.closedAt ? "종료일" : "상태"}>{opp.closedAt ? fmtDate(opp.closedAt) : "진행 중"}</Info>
              </dl>
              <div className={`mt-4 rounded-md border px-3 py-2 text-sm ${overdue ? "border-red-200 bg-red-50" : "bg-slate-50"}`}>
                <span className="text-xs text-muted-foreground">다음 액션</span>
                <div className="font-medium">{opp.nextAction || "-"} {opp.nextActionDue && <span className={`tabular ml-2 text-xs ${overdue ? "font-semibold text-red-600" : "text-muted-foreground"}`}>기한 {fmtDate(opp.nextActionDue)}{overdue ? " (기한 경과)" : ""}</span>}</div>
              </div>
              {opp.description && <p className="mt-3 whitespace-pre-wrap text-sm">{opp.description}</p>}
            </CardContent>
          </Card>

          {opp.business === "API" && (
            <Card>
              <CardHeader>
                <CardTitle>요청 문서 체크리스트 <span className="ml-1 text-xs font-normal text-muted-foreground">요청 {docsRequested} · 제공 {docsProvided}</span></CardTitle>
                <div className="flex items-center gap-3">
                  <span className="text-xs text-muted-foreground">고객 실사 일정: <b className="tabular text-foreground">{fmtDate(opp.auditDate)}</b></span>
                  {editable && (
                    <FormDialog trigger={<><Plus /> 문서 추가</>} title="요청 문서 추가" action={addDocument} size="sm" variant="outline">
                      <input type="hidden" name="opportunityId" value={opp.id} />
                      <Field label="문서명" required><Input name="docType" required placeholder="예: Nitrosamine Risk Assessment" /></Field>
                    </FormDialog>
                  )}
                </div>
              </CardHeader>
              <CardContent className="px-0 pb-2">
                <Table>
                  <THead><tr><TH>문서</TH><TH className="text-center">고객 요청</TH><TH className="text-center">제공 완료</TH><TH>제공일</TH></tr></THead>
                  <TBody>
                    {opp.documents.map((d) => (
                      <TR key={d.id}>
                        <TD className="font-medium">{d.docType}</TD>
                        <TD className="text-center"><DocCheckbox id={d.id} field="requested" checked={d.requested} disabled={!editable} action={toggleDocument} label={`${d.docType} 요청`} /></TD>
                        <TD className="text-center"><DocCheckbox id={d.id} field="provided" checked={d.provided} disabled={!editable} action={toggleDocument} label={`${d.docType} 제공`} /></TD>
                        <TD className="tabular text-xs text-muted-foreground">{d.requested && !d.provided ? <span className="font-medium text-amber-600">제공 대기</span> : fmtDate(d.providedAt)}</TD>
                      </TR>
                    ))}
                  </TBody>
                </Table>
              </CardContent>
            </Card>
          )}

          {opp.business === "CDMO" && (
            <Card>
              <CardHeader>
                <CardTitle>프로젝트 마일스톤</CardTitle>
                {editable && (
                  <FormDialog trigger={<><Plus /> 마일스톤 추가</>} title="마일스톤 추가" action={saveMilestone} size="sm" variant="outline">
                    <input type="hidden" name="opportunityId" value={opp.id} />
                    <Field label="마일스톤" required><Input name="name" required /></Field>
                    <div className="grid grid-cols-2 gap-3">
                      <Field label="계획일"><Input type="date" name="plannedDate" /></Field>
                      <Field label="완료일"><Input type="date" name="actualDate" /></Field>
                    </div>
                  </FormDialog>
                )}
              </CardHeader>
              <CardContent className="px-0 pb-2">
                {opp.milestones.length === 0 ? <Empty>마일스톤이 없습니다.</Empty> : (
                  <Table>
                    <THead><tr><TH>마일스톤</TH><TH>계획일</TH><TH>완료일</TH><TH>상태</TH><TH /></tr></THead>
                    <TBody>
                      {opp.milestones.map((m) => {
                        const late = !m.actualDate && m.plannedDate && m.plannedDate < today;
                        return (
                          <TR key={m.id}>
                            <TD className="font-medium">{m.name}</TD>
                            <TD className="tabular">{fmtDate(m.plannedDate)}</TD>
                            <TD className="tabular">{fmtDate(m.actualDate)}</TD>
                            <TD>{m.actualDate ? <span className="text-xs font-medium text-emerald-600">완료</span> : late ? <span className="text-xs font-medium text-red-600">지연</span> : <span className="text-xs text-muted-foreground">{m.plannedDate ? "예정" : "미정"}</span>}</TD>
                            <TD className="text-right">
                              {editable && (
                                <div className="flex justify-end">
                                  <FormDialog trigger={<Pencil />} title="마일스톤 수정" action={saveMilestone} size="icon" variant="ghost">
                                    <input type="hidden" name="opportunityId" value={opp.id} />
                                    <input type="hidden" name="id" value={m.id} />
                                    <Field label="마일스톤" required><Input name="name" defaultValue={m.name} required /></Field>
                                    <div className="grid grid-cols-2 gap-3">
                                      <Field label="계획일"><Input type="date" name="plannedDate" defaultValue={m.plannedDate ? fmtDate(m.plannedDate) : ""} /></Field>
                                      <Field label="완료일"><Input type="date" name="actualDate" defaultValue={m.actualDate ? fmtDate(m.actualDate) : ""} /></Field>
                                    </div>
                                  </FormDialog>
                                  <ActionButton action={deleteMilestone} fields={{ id: m.id }} confirm={`'${m.name}' 마일스톤을 삭제할까요?`} size="icon" title="삭제"><Trash2 /></ActionButton>
                                </div>
                              )}
                            </TD>
                          </TR>
                        );
                      })}
                    </TBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          )}

          <Card>
            <CardHeader><CardTitle>단계 변경 이력</CardTitle></CardHeader>
            <CardContent className="px-0 pb-2">
              <Table>
                <THead><tr><TH>일시</TH><TH>변경</TH><TH>변경자</TH><TH>비고</TH></tr></THead>
                <TBody>
                  {opp.history.map((h) => (
                    <TR key={h.id}>
                      <TD className="tabular whitespace-nowrap text-xs">{fmtDateTime(h.changedAt)}</TD>
                      <TD className="whitespace-nowrap">{h.fromStage ? <><span className="text-muted-foreground">{h.fromStage.name}</span> → </> : null}<b>{h.toStage.name}</b></TD>
                      <TD>{h.changedBy.name}</TD>
                      <TD className="text-xs text-muted-foreground">{h.note}</TD>
                    </TR>
                  ))}
                </TBody>
              </Table>
            </CardContent>
          </Card>
        </div>

        <Card className="self-start">
          <CardHeader>
            <CardTitle>활동 기록 <span className="text-xs font-normal text-muted-foreground">{opp.activities.length}건</span></CardTitle>
            {editable && (
              <FormDialog trigger={<><Plus /> 활동 기록</>} title="활동 기록" action={saveActivity} size="sm" variant="outline">
                <ActivityFields opportunityId={opp.id} />
              </FormDialog>
            )}
          </CardHeader>
          <CardContent className="max-h-[900px] overflow-y-auto">
            <Timeline
              onDelete={deleteActivity}
              items={opp.activities.map((a) => ({ id: a.id, type: a.type, subject: a.subject, content: a.content, date: a.date, userName: a.user.name, deletable: a.userId === me.id || isAdmin(me) }))}
            />
          </CardContent>
        </Card>
      </div>
    </>
  );
}
