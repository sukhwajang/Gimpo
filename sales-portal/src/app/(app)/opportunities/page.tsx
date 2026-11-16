import Link from "next/link";
import { KanbanSquare, List, Plus } from "lucide-react";
import type { Prisma } from "@prisma/client";
import { ExportButton } from "@/components/export-button";
import { FilterBar, FilterItem } from "@/components/filter-bar";
import { FormDialog } from "@/components/form-dialog";
import { Kanban } from "@/components/kanban";
import { OpportunityFields } from "@/components/opportunity-form";
import { Empty, PageHeader } from "@/components/page-header";
import { BusinessBadge, StageBadge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Input, Select } from "@/components/ui/input";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { BUSINESS_COLOR, BUSINESS_LABEL, LOST_REASONS, LOST_REASON_LABEL } from "@/lib/constants";
import { fmtDate, fmtKrw, fmtMoney, parseDate } from "@/lib/format";
import { loadRates } from "@/lib/fx";
import { one } from "@/lib/lookups";
import { oppFormData, staleDate, weekRange } from "@/lib/opp-data";
import { canEditOpp, oppScope, visibleBusinesses } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/session";
import { cn } from "@/lib/utils";
import { moveStage, saveOpportunity } from "./actions";

export default async function OpportunitiesPage({ searchParams }: { searchParams: Record<string, string | string[] | undefined> }) {
  const me = await requireUser();
  const sp = (k: string) => one(searchParams[k]);
  const bizOptions = visibleBusinesses(me);
  const view = sp("view") === "list" ? "list" : "kanban";
  // 칸반은 사업별로 단계가 달라 한 번에 한 사업만 표시한다
  const business = bizOptions.includes(sp("business")) ? sp("business") : view === "kanban" ? me.business ?? bizOptions[0] : "";
  const owner = sp("owner"), q = sp("q"), stageId = sp("stage"), status = sp("status"), from = sp("from"), to = sp("to");
  const stale = sp("stale") === "1", due = sp("due"), lostReason = sp("lostReason"), closedFrom = sp("closedFrom"), closedTo = sp("closedTo");

  const and: Prisma.OpportunityWhereInput[] = [oppScope(me)];
  if (business) and.push({ business });
  if (owner) and.push({ ownerId: owner });
  if (q) and.push({ OR: [{ title: { contains: q } }, { customer: { name: { contains: q } } }] });
  if (view === "list") {
    if (stageId) and.push({ stageId });
    if (status === "open") and.push({ stage: { type: "OPEN" } });
    if (status === "won") and.push({ stage: { type: "WON" } });
    if (status === "lost") and.push({ stage: { type: "LOST" } });
    const f = parseDate(from), t = parseDate(to);
    if (f || t) and.push({ expectedCloseDate: { ...(f ? { gte: new Date(f.getFullYear(), f.getMonth(), f.getDate()) } : {}), ...(t ? { lt: new Date(t.getFullYear(), t.getMonth(), t.getDate() + 1) } : {}) } });
    const cf = parseDate(closedFrom), ct = parseDate(closedTo);
    if (cf || ct) and.push({ closedAt: { ...(cf ? { gte: new Date(cf.getFullYear(), cf.getMonth(), cf.getDate()) } : {}), ...(ct ? { lt: new Date(ct.getFullYear(), ct.getMonth(), ct.getDate() + 1) } : {}) } });
    if (stale) and.push({ stage: { type: "OPEN" }, lastActivityAt: { lt: staleDate() } });
    if (due === "week") and.push({ stage: { type: "OPEN" }, nextActionDue: { lt: weekRange().end } });
    if (lostReason) and.push({ lostReason });
  } else {
    // 칸반: 진행 중 전체 + 최근 60일 내 종료 건
    and.push({ OR: [{ stage: { type: "OPEN" } }, { closedAt: { gte: new Date(Date.now() - 60 * 86400000) } }] });
  }

  const [opps, stages, owners, rates, formData] = await Promise.all([
    prisma.opportunity.findMany({
      where: { AND: and }, include: { customer: { select: { name: true } }, owner: { select: { name: true } }, stage: true },
      orderBy: view === "list" ? [{ expectedCloseDate: "asc" }] : [{ amount: "desc" }],
    }),
    prisma.stage.findMany({ where: { business: { in: bizOptions } }, orderBy: [{ business: "asc" }, { order: "asc" }] }),
    prisma.user.findMany({ where: { role: { in: ["SALES", "HEAD"] }, business: { in: bizOptions }, ...(business ? { business } : {}) }, orderBy: { name: "asc" }, select: { id: true, name: true } }),
    loadRates(),
    oppFormData(me),
  ]);
  const now = new Date();
  const staleAt = staleDate();
  const rows = opps.map((o) => {
    const amountKrw = rates.toKrw(o.amount, o.currency);
    return { ...o, amountKrw, weighted: (amountKrw * o.stage.probability) / 100, isStale: o.stage.type === "OPEN" && o.lastActivityAt < staleAt, overdue: !!o.nextActionDue && o.nextActionDue < new Date(now.getFullYear(), now.getMonth(), now.getDate()) };
  });
  const openRows = rows.filter((r) => r.stage.type === "OPEN");
  const total = openRows.reduce((s, r) => s + r.amountKrw, 0);
  const weighted = openRows.reduce((s, r) => s + r.weighted, 0);

  const qs = (patch: Record<string, string>) => {
    const p = new URLSearchParams();
    for (const [k, v] of Object.entries({ view, business, owner, q, ...patch })) if (v) p.set(k, v);
    return `/opportunities?${p.toString()}`;
  };
  const special = [stale && "30일 이상 업데이트 없음", due === "week" && "이번 주까지 할 일", lostReason && `실패 사유: ${LOST_REASON_LABEL[lostReason] ?? lostReason}`, (closedFrom || closedTo) && `종료일 ${closedFrom || ""}~${closedTo || ""}`].filter(Boolean);

  return (
    <>
      <PageHeader title="영업기회" description={`진행 ${openRows.length}건 · 예상 금액 ${fmtKrw(total)}원 · 가중 예상 매출 ${fmtKrw(weighted)}원`}>
        <div className="flex rounded-md border bg-white p-0.5">
          <Link href={qs({ view: "kanban" })} className={cn("flex items-center gap-1 rounded px-2.5 py-1 text-xs", view === "kanban" && "bg-primary text-white")}><KanbanSquare className="h-3.5 w-3.5" /> 칸반</Link>
          <Link href={qs({ view: "list" })} className={cn("flex items-center gap-1 rounded px-2.5 py-1 text-xs", view === "list" && "bg-primary text-white")}><List className="h-3.5 w-3.5" /> 목록</Link>
        </div>
        <ExportButton
          fileName="영업기회"
          rows={rows.map((o) => ({ 사업: BUSINESS_LABEL[o.business], 고객사: o.customer.name, "제품/프로젝트": o.title, 단계: o.stage.name, "성공확률(%)": o.stage.probability, 예상금액: o.amount, 통화: o.currency, "원화환산(원)": Math.round(o.amountKrw), "가중금액(원)": Math.round(o.weighted), 예상수주일: fmtDate(o.expectedCloseDate), 담당자: o.owner.name, 다음액션: o.nextAction, 다음액션기한: o.nextActionDue ? fmtDate(o.nextActionDue) : "", 최근활동일: fmtDate(o.lastActivityAt), 실패사유: o.lostReason ? LOST_REASON_LABEL[o.lostReason] : "" }))}
        />
        <FormDialog trigger={<><Plus /> 기회 등록</>} title="영업기회 등록" action={saveOpportunity} wide>
          <OpportunityFields data={formData} defaultBusiness={business || me.business || bizOptions[0]} />
        </FormDialog>
      </PageHeader>

      {(view === "kanban" || bizOptions.length > 1) && (
        <div className="mb-3 flex flex-wrap gap-1.5">
          {view === "list" && <Link href={qs({ business: "", stage: "" })} className={cn("rounded-full border bg-white px-3 py-1 text-xs font-medium", !business && "border-slate-800 bg-slate-800 text-white")}>전체 사업</Link>}
          {bizOptions.map((b) => (
            <Link key={b} href={qs({ business: b, owner: "", stage: "" })} className="rounded-full border px-3 py-1 text-xs font-medium" style={business === b ? { background: BUSINESS_COLOR[b], borderColor: BUSINESS_COLOR[b], color: "#fff" } : { background: "#fff", color: BUSINESS_COLOR[b] }}>
              {BUSINESS_LABEL[b]}
            </Link>
          ))}
        </div>
      )}

      <FilterBar resetHref={`/opportunities?view=${view}${view === "kanban" && business ? `&business=${business}` : ""}`}>
        <input type="hidden" name="view" value={view} />
        {business && <input type="hidden" name="business" value={business} />}
        <FilterItem label="검색"><Input name="q" defaultValue={q} placeholder="제품/프로젝트, 고객사" className="h-8 w-48" /></FilterItem>
        <FilterItem label="담당자">
          <Select name="owner" defaultValue={owner} className="h-8 w-32"><option value="">전체</option>{owners.map((o) => <option key={o.id} value={o.id}>{o.name}{o.id === me.id ? " (나)" : ""}</option>)}</Select>
        </FilterItem>
        {view === "list" && (
          <>
            <FilterItem label="상태">
              <Select name="status" defaultValue={status} className="h-8 w-24"><option value="">전체</option><option value="open">진행</option><option value="won">수주</option><option value="lost">실패</option></Select>
            </FilterItem>
            <FilterItem label="단계">
              <Select name="stage" defaultValue={stageId} className="h-8 w-44">
                <option value="">전체</option>
                {stages.filter((s) => !business || s.business === business).map((s) => <option key={s.id} value={s.id}>{business ? "" : `[${BUSINESS_LABEL[s.business]}] `}{s.name}</option>)}
              </Select>
            </FilterItem>
            <FilterItem label="예상 수주일 (시작)"><Input type="date" name="from" defaultValue={from} className="h-8 w-36" /></FilterItem>
            <FilterItem label="예상 수주일 (종료)"><Input type="date" name="to" defaultValue={to} className="h-8 w-36" /></FilterItem>
            <FilterItem label="실패 사유">
              <Select name="lostReason" defaultValue={lostReason} className="h-8 w-24"><option value="">전체</option>{LOST_REASONS.map((r) => <option key={r} value={r}>{LOST_REASON_LABEL[r]}</option>)}</Select>
            </FilterItem>
            {stale && <input type="hidden" name="stale" value="1" />}
            {due && <input type="hidden" name="due" value={due} />}
            {closedFrom && <input type="hidden" name="closedFrom" value={closedFrom} />}
            {closedTo && <input type="hidden" name="closedTo" value={closedTo} />}
          </>
        )}
      </FilterBar>
      {view === "list" && special.length > 0 && (
        <div className="mb-3 flex flex-wrap items-center gap-2 text-xs">
          <span className="text-muted-foreground">적용된 조건:</span>
          {special.map((s) => <span key={String(s)} className="rounded-full bg-amber-50 px-2 py-0.5 font-medium text-amber-800">{s}</span>)}
        </div>
      )}

      {view === "kanban" ? (
        <>
          <Kanban
            color={BUSINESS_COLOR[business]} move={moveStage}
            stages={stages.filter((s) => s.business === business).map((s) => ({ id: s.id, name: s.name, probability: s.probability, type: s.type, order: s.order }))}
            cards={rows.map((o) => ({ id: o.id, title: o.title, customerName: o.customer.name, amount: o.amount, currency: o.currency, amountKrw: o.amountKrw, ownerName: o.owner.name, stageId: o.stageId, nextAction: o.nextAction, nextActionDue: o.nextActionDue ? fmtDate(o.nextActionDue) : null, overdue: o.overdue, stale: o.isStale, editable: canEditOpp(me, o) }))}
          />
          <p className="text-xs text-muted-foreground">카드를 끌어 단계를 옮기면 이력이 자동 기록됩니다. 실패로 옮기면 사유를 입력해야 합니다. 자물쇠 표시는 조회 전용(다른 담당자)이며, 수주·실패 열에는 최근 60일 내 종료 건만 표시됩니다.</p>
        </>
      ) : (
        <Card>
          {rows.length === 0 ? <Empty>조건에 맞는 영업기회가 없습니다.</Empty> : (
            <Table>
              <THead><tr><TH>사업</TH><TH>제품/프로젝트</TH><TH>고객사</TH><TH>단계</TH><TH className="text-right">예상 금액</TH><TH className="text-right">원화 환산</TH><TH>예상 수주일</TH><TH>담당자</TH><TH>다음 액션</TH><TH>최근 활동</TH></tr></THead>
              <TBody>
                {rows.map((o) => (
                  <TR key={o.id}>
                    <TD><BusinessBadge business={o.business} /></TD>
                    <TD className="max-w-[260px]"><Link href={`/opportunities/${o.id}`} className="font-medium text-primary hover:underline">{o.title}</Link></TD>
                    <TD><Link href={`/customers/${o.customerId}`} className="hover:underline">{o.customer.name}</Link></TD>
                    <TD className="whitespace-nowrap"><StageBadge name={o.stage.name} type={o.stage.type} /> {o.stage.type === "OPEN" && <span className="text-xs text-muted-foreground">{o.stage.probability}%</span>}{o.lostReason && <span className="text-xs text-muted-foreground">({LOST_REASON_LABEL[o.lostReason]})</span>}</TD>
                    <TD className="tabular whitespace-nowrap text-right">{fmtMoney(o.amount, o.currency)}</TD>
                    <TD className="tabular text-right">{fmtKrw(o.amountKrw)}</TD>
                    <TD className="tabular whitespace-nowrap">{fmtDate(o.expectedCloseDate)}</TD>
                    <TD className="whitespace-nowrap">{o.owner.name}</TD>
                    <TD className="max-w-[200px] text-xs">{o.nextAction ? <><span className={cn("tabular", o.overdue && "font-semibold text-red-600")}>{o.nextActionDue ? fmtDate(o.nextActionDue).slice(5) : ""}</span> {o.nextAction}</> : "-"}</TD>
                    <TD className={cn("tabular whitespace-nowrap text-xs", o.isStale && "font-semibold text-amber-600")}>{fmtDate(o.lastActivityAt)}</TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          )}
        </Card>
      )}
    </>
  );
}
