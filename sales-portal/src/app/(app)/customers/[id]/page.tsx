import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Pencil, Plus, Trash2 } from "lucide-react";
import { MiniBar } from "@/components/charts";
import { ActivityFields, ContactFields, CustomerFields } from "@/components/customer-fields";
import { ActionButton, FormDialog } from "@/components/form-dialog";
import { Empty, KpiCard } from "@/components/page-header";
import { Timeline } from "@/components/timeline";
import { BusinessBadge, GradeBadge, StageBadge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { fmtDate, fmtKrw, fmtMoney, fmtNum } from "@/lib/format";
import { loadRates } from "@/lib/fx";
import { ownerOptions } from "@/lib/lookups";
import { canEditCustomer, canEditOpp, canViewCustomer, isAdmin, isSales, oppScope, salesScope } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/session";
import { deleteActivity, deleteContact, deleteCustomer, saveActivity, saveContact, saveCustomer } from "../actions";

export default async function CustomerDetail({ params }: { params: { id: string } }) {
  const me = await requireUser();
  const customer = await prisma.customer.findUnique({ where: { id: params.id }, include: { owner: true, contacts: { orderBy: { createdAt: "asc" } } } });
  if (!customer || !canViewCustomer(me, customer)) notFound();
  const editable = canEditCustomer(me, customer);

  const since = new Date(new Date().getFullYear(), new Date().getMonth() - 11, 1);
  const [opps, sales, recentSales, activities, owners, rates] = await Promise.all([
    prisma.opportunity.findMany({ where: { customerId: customer.id, ...oppScope(me) }, include: { stage: true, owner: { select: { name: true } } }, orderBy: { updatedAt: "desc" } }),
    prisma.salesRecord.findMany({ where: { customerId: customer.id, ...salesScope(me) }, select: { saleDate: true, amountKrw: true } }),
    prisma.salesRecord.findMany({ where: { customerId: customer.id, ...salesScope(me) }, orderBy: { saleDate: "desc" }, take: 15 }),
    prisma.activity.findMany({
      where: { customerId: customer.id, ...(isAdmin(me) ? {} : { OR: [{ opportunityId: null }, { opportunity: oppScope(me) }] }) },
      include: { user: { select: { name: true } }, opportunity: { select: { id: true, title: true } } }, orderBy: { date: "desc" }, take: 60,
    }),
    ownerOptions(me),
    loadRates(),
  ]);
  const openOpps = opps.filter((o) => o.stage.type === "OPEN");
  const closedOpps = opps.filter((o) => o.stage.type !== "OPEN");
  const monthly = Array.from({ length: 12 }, (_, i) => {
    const d = new Date(since.getFullYear(), since.getMonth() + i, 1);
    const value = sales.filter((s) => s.saleDate.getFullYear() === d.getFullYear() && s.saleDate.getMonth() === d.getMonth()).reduce((s, x) => s + x.amountKrw, 0);
    return { label: `${String(d.getFullYear()).slice(2)}.${String(d.getMonth() + 1).padStart(2, "0")}`, value };
  });
  const total12 = monthly.reduce((s, x) => s + x.value, 0);
  const totalAll = sales.reduce((s, x) => s + x.amountKrw, 0);
  const pipeline = openOpps.reduce((s, o) => s + rates.toKrw(o.amount, o.currency), 0);
  const myOpps = openOpps.filter((o) => canEditOpp(me, o));

  return (
    <>
      <Link href="/customers" className="mb-2 inline-flex items-center gap-1 text-xs text-muted-foreground hover:underline"><ArrowLeft className="h-3 w-3" /> 고객사 목록</Link>
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-xl font-bold">{customer.name}</h1>
            <GradeBadge grade={customer.grade} />
            {customer.businesses.split(",").map((b) => <BusinessBadge key={b} business={b} />)}
          </div>
          <p className="mt-1 text-sm text-muted-foreground">{customer.code} · {customer.country} · 담당 영업 {customer.owner.name}</p>
          {customer.memo && <p className="mt-1 max-w-2xl whitespace-pre-wrap text-sm">{customer.memo}</p>}
        </div>
        {editable ? (
          <div className="flex gap-2">
            <FormDialog trigger={<><Pencil /> 수정</>} title="고객사 수정" action={saveCustomer} variant="outline">
              <CustomerFields customer={customer} owners={owners.some((o) => o.id === customer.ownerId) ? owners : [...owners, { id: customer.owner.id, name: customer.owner.name, business: customer.owner.business }]} defaultOwnerId={customer.ownerId} defaultBusiness={me.business} lockOwner={isSales(me)} />
            </FormDialog>
            {!isSales(me) && (
              <ActionButton action={deleteCustomer} fields={{ id: customer.id }} confirm={`'${customer.name}'을(를) 삭제할까요?`} variant="outline" size="default" className="text-destructive"><Trash2 /> 삭제</ActionButton>
            )}
          </div>
        ) : (
          <span className="rounded-md bg-slate-100 px-2 py-1 text-xs text-muted-foreground">조회 전용 (담당자: {customer.owner.name})</span>
        )}
      </div>

      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <KpiCard label="진행 중인 기회" value={`${openOpps.length}건`} sub={`예상 금액 ${fmtKrw(pipeline)}원`} />
        <KpiCard label="최근 12개월 매출" value={`${fmtKrw(total12)}원`} sub={`누적 ${fmtKrw(totalAll)}원`} />
        <KpiCard label="종료된 기회" value={`${closedOpps.length}건`} sub={`수주 ${closedOpps.filter((o) => o.stage.type === "WON").length} · 실패 ${closedOpps.filter((o) => o.stage.type === "LOST").length}`} />
        <KpiCard label="최근 활동" value={activities[0] ? fmtDate(activities[0].date) : "-"} sub={`활동 기록 ${activities.length}건${activities.length === 60 ? "+" : ""}`} />
      </div>

      <div className="grid gap-4 xl:grid-cols-3">
        <div className="space-y-4 xl:col-span-2">
          <Card>
            <CardHeader><CardTitle>진행 중인 기회</CardTitle><Link href={`/opportunities?view=list&q=${encodeURIComponent(customer.name)}`} className="text-xs text-primary hover:underline">전체 보기</Link></CardHeader>
            <CardContent className="px-0 pb-2">
              {openOpps.length === 0 ? <Empty>진행 중인 기회가 없습니다.</Empty> : (
                <Table>
                  <THead><tr><TH>사업</TH><TH>제품/프로젝트</TH><TH>단계</TH><TH className="text-right">예상 금액</TH><TH>예상 수주일</TH><TH>담당</TH></tr></THead>
                  <TBody>
                    {openOpps.map((o) => (
                      <TR key={o.id}>
                        <TD><BusinessBadge business={o.business} /></TD>
                        <TD><Link href={`/opportunities/${o.id}`} className="font-medium text-primary hover:underline">{o.title}</Link></TD>
                        <TD><StageBadge name={o.stage.name} type={o.stage.type} /> <span className="text-xs text-muted-foreground">{o.stage.probability}%</span></TD>
                        <TD className="tabular text-right">{fmtMoney(o.amount, o.currency)}</TD>
                        <TD className="tabular">{fmtDate(o.expectedCloseDate)}</TD>
                        <TD>{o.owner.name}</TD>
                      </TR>
                    ))}
                  </TBody>
                </Table>
              )}
              {closedOpps.length > 0 && (
                <details className="px-5 pt-2 text-sm">
                  <summary className="cursor-pointer text-xs text-muted-foreground">종료된 기회 {closedOpps.length}건 보기</summary>
                  <ul className="mt-2 space-y-1">
                    {closedOpps.map((o) => (
                      <li key={o.id} className="flex items-center gap-2">
                        <StageBadge name={o.stage.name} type={o.stage.type} />
                        <Link href={`/opportunities/${o.id}`} className="hover:underline">{o.title}</Link>
                        <span className="tabular ml-auto text-xs text-muted-foreground">{fmtMoney(o.amount, o.currency)} · {fmtDate(o.closedAt)}</span>
                      </li>
                    ))}
                  </ul>
                </details>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle>과거 실적 (최근 12개월, 원화 환산)</CardTitle><Link href={`/performance?q=${encodeURIComponent(customer.code)}`} className="text-xs text-primary hover:underline">실적 상세</Link></CardHeader>
            <CardContent>
              {sales.length === 0 ? <Empty>실적이 없습니다.</Empty> : (
                <>
                  <MiniBar data={monthly} />
                  <Table className="mt-3">
                    <THead><tr><TH>매출일자</TH><TH>사업</TH><TH>제품</TH><TH className="text-right">수량</TH><TH className="text-right">금액</TH><TH className="text-right">원화 환산</TH></tr></THead>
                    <TBody>
                      {recentSales.map((s) => (
                        <TR key={s.id}>
                          <TD className="tabular">{fmtDate(s.saleDate)}</TD>
                          <TD><BusinessBadge business={s.business} /></TD>
                          <TD>{s.productName}</TD>
                          <TD className="tabular text-right">{fmtNum(s.quantity, 1)} {s.unit}</TD>
                          <TD className="tabular text-right">{fmtMoney(s.amount, s.currency)}</TD>
                          <TD className="tabular text-right">{fmtKrw(s.amountKrw)}</TD>
                        </TR>
                      ))}
                    </TBody>
                  </Table>
                </>
              )}
            </CardContent>
          </Card>
        </div>

        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>고객 담당자</CardTitle>
              {editable && <FormDialog trigger={<><Plus /> 추가</>} title="담당자 추가" action={saveContact} size="sm" variant="outline"><ContactFields customerId={customer.id} /></FormDialog>}
            </CardHeader>
            <CardContent>
              {customer.contacts.length === 0 ? <Empty>등록된 담당자가 없습니다.</Empty> : (
                <ul className="divide-y">
                  {customer.contacts.map((c) => (
                    <li key={c.id} className="flex items-start justify-between gap-2 py-2">
                      <div className="min-w-0">
                        <div className="text-sm font-medium">{c.name} <span className="text-xs font-normal text-muted-foreground">{c.title}</span></div>
                        <div className="truncate text-xs text-muted-foreground">{[c.email, c.phone].filter(Boolean).join(" · ") || "-"}</div>
                      </div>
                      {editable && (
                        <div className="flex shrink-0">
                          <FormDialog trigger={<Pencil />} title="담당자 수정" action={saveContact} size="icon" variant="ghost"><ContactFields customerId={customer.id} contact={c} /></FormDialog>
                          <ActionButton action={deleteContact} fields={{ id: c.id }} confirm={`${c.name} 담당자를 삭제할까요?`} size="icon" title="삭제"><Trash2 /></ActionButton>
                        </div>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>활동 기록 타임라인</CardTitle>
              {(editable || myOpps.length > 0) && (
                <FormDialog trigger={<><Plus /> 활동 기록</>} title="활동 기록" action={saveActivity} size="sm" variant="outline">
                  <ActivityFields customerId={customer.id} opportunities={myOpps.map((o) => ({ id: o.id, title: o.title }))} />
                </FormDialog>
              )}
            </CardHeader>
            <CardContent className="max-h-[720px] overflow-y-auto">
              <Timeline
                onDelete={deleteActivity}
                items={activities.map((a) => ({ id: a.id, type: a.type, subject: a.subject, content: a.content, date: a.date, userName: a.user.name, opportunity: a.opportunity, deletable: a.userId === me.id || isAdmin(me) }))}
              />
            </CardContent>
          </Card>
        </div>
      </div>
    </>
  );
}
