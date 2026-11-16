import Link from "next/link";
import type { Prisma } from "@prisma/client";
import { ExportButton } from "@/components/export-button";
import { FilterBar, FilterItem } from "@/components/filter-bar";
import { Empty, PageHeader } from "@/components/page-header";
import { Card } from "@/components/ui/card";
import { Input, Select } from "@/components/ui/input";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { ACTIVITY_LABEL, ACTIVITY_TYPES } from "@/lib/constants";
import { fmtDate, parseDate } from "@/lib/format";
import { one, ownerOptions } from "@/lib/lookups";
import { customerScope, isAdmin, oppScope } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/session";

export default async function ActivitiesPage({ searchParams }: { searchParams: Record<string, string | string[] | undefined> }) {
  const me = await requireUser();
  const type = one(searchParams.type), user = one(searchParams.user), q = one(searchParams.q), from = one(searchParams.from), to = one(searchParams.to);
  const and: Prisma.ActivityWhereInput[] = [];
  // 기회에 연결된 활동은 기회의 사업 기준, 고객 활동은 고객의 사업 기준으로 조회 범위를 제한
  if (!isAdmin(me)) and.push({ OR: [{ opportunity: oppScope(me) }, { opportunityId: null, customer: customerScope(me) }] });
  if (type) and.push({ type });
  if (user) and.push({ userId: user });
  if (q) and.push({ OR: [{ subject: { contains: q } }, { customer: { name: { contains: q } } }] });
  const f = parseDate(from), t = parseDate(to);
  if (f) and.push({ date: { gte: new Date(f.getFullYear(), f.getMonth(), f.getDate()) } });
  if (t) and.push({ date: { lt: new Date(t.getFullYear(), t.getMonth(), t.getDate() + 1) } });
  const [rows, owners] = await Promise.all([
    prisma.activity.findMany({ where: { AND: and }, include: { user: { select: { name: true } }, customer: { select: { id: true, name: true } }, opportunity: { select: { id: true, title: true } } }, orderBy: { date: "desc" }, take: 1000 }),
    ownerOptions(me),
  ]);
  return (
    <>
      <PageHeader title="활동 기록" description={`${rows.length}건 · 활동은 고객사 또는 영업기회 상세 화면에서 기록합니다.`}>
        <ExportButton fileName="활동기록" rows={rows.map((a) => ({ 일자: fmtDate(a.date), 유형: ACTIVITY_LABEL[a.type], 제목: a.subject, 내용: a.content, 고객사: a.customer.name, 영업기회: a.opportunity?.title ?? "", 작성자: a.user.name }))} />
      </PageHeader>
      <FilterBar resetHref="/activities">
        <FilterItem label="검색"><Input name="q" defaultValue={q} placeholder="제목 / 고객사" className="h-8 w-44" /></FilterItem>
        <FilterItem label="유형">
          <Select name="type" defaultValue={type} className="h-8 w-28"><option value="">전체</option>{ACTIVITY_TYPES.map((t) => <option key={t} value={t}>{ACTIVITY_LABEL[t]}</option>)}</Select>
        </FilterItem>
        <FilterItem label="작성자">
          <Select name="user" defaultValue={user} className="h-8 w-32"><option value="">전체</option>{owners.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}</Select>
        </FilterItem>
        <FilterItem label="시작일"><Input type="date" name="from" defaultValue={from} className="h-8 w-36" /></FilterItem>
        <FilterItem label="종료일"><Input type="date" name="to" defaultValue={to} className="h-8 w-36" /></FilterItem>
      </FilterBar>
      <Card>
        {rows.length === 0 ? <Empty /> : (
          <Table>
            <THead><tr><TH>일자</TH><TH>유형</TH><TH>제목</TH><TH>고객사</TH><TH>영업기회</TH><TH>작성자</TH></tr></THead>
            <TBody>
              {rows.map((a) => (
                <TR key={a.id}>
                  <TD className="tabular whitespace-nowrap">{fmtDate(a.date)}</TD>
                  <TD><span className="rounded bg-slate-100 px-1.5 py-0.5 text-xs font-medium">{ACTIVITY_LABEL[a.type]}</span></TD>
                  <TD><div className="font-medium">{a.subject}</div>{a.content && <div className="max-w-md truncate text-xs text-muted-foreground">{a.content}</div>}</TD>
                  <TD><Link href={`/customers/${a.customer.id}`} className="hover:underline">{a.customer.name}</Link></TD>
                  <TD className="max-w-[240px] truncate">{a.opportunity ? <Link href={`/opportunities/${a.opportunity.id}`} className="text-primary hover:underline">{a.opportunity.title}</Link> : "-"}</TD>
                  <TD className="whitespace-nowrap">{a.user.name}</TD>
                </TR>
              ))}
            </TBody>
          </Table>
        )}
      </Card>
    </>
  );
}
