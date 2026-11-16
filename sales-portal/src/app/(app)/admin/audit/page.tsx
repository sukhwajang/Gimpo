import type { Prisma } from "@prisma/client";
import { ExportButton } from "@/components/export-button";
import { FilterBar, FilterItem } from "@/components/filter-bar";
import { Empty, PageHeader } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Input, Select } from "@/components/ui/input";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { fmtDateTime, parseDate } from "@/lib/format";
import { one } from "@/lib/lookups";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/session";

const ACTION_LABEL: Record<string, string> = { CREATE: "생성", UPDATE: "수정", DELETE: "삭제", UPLOAD: "업로드", STAGE: "단계 변경", LOGIN: "로그인" };
const ACTION_CLS: Record<string, string> = { CREATE: "bg-emerald-50 text-emerald-700 border-emerald-200", UPDATE: "bg-blue-50 text-blue-700 border-blue-200", DELETE: "bg-red-50 text-red-700 border-red-200", UPLOAD: "bg-violet-50 text-violet-700 border-violet-200", STAGE: "bg-amber-50 text-amber-700 border-amber-200", LOGIN: "bg-slate-50 text-slate-600 border-slate-200" };
const ENTITY_LABEL: Record<string, string> = { Customer: "고객사", Contact: "고객 담당자", Opportunity: "영업기회", OpportunityDocument: "문서 체크리스트", Milestone: "마일스톤", Activity: "활동", SalesRecord: "실적", UploadBatch: "실적 업로드", Target: "목표", User: "사용자", Stage: "단계", Product: "제품", ExchangeRate: "환율", System: "시스템" };

export default async function AuditPage({ searchParams }: { searchParams: Record<string, string | string[] | undefined> }) {
  await requireAdmin();
  const action = one(searchParams.action), entity = one(searchParams.entity), q = one(searchParams.q), from = one(searchParams.from), to = one(searchParams.to);
  const and: Prisma.AuditLogWhereInput[] = [];
  if (action) and.push({ action });
  if (entity) and.push({ entity });
  if (q) and.push({ OR: [{ summary: { contains: q } }, { userName: { contains: q } }] });
  const f = parseDate(from), t = parseDate(to);
  if (f) and.push({ createdAt: { gte: new Date(f.getFullYear(), f.getMonth(), f.getDate()) } });
  if (t) and.push({ createdAt: { lt: new Date(t.getFullYear(), t.getMonth(), t.getDate() + 1) } });
  const logs = await prisma.auditLog.findMany({ where: { AND: and }, orderBy: { createdAt: "desc" }, take: 1000 });
  return (
    <>
      <PageHeader title="감사 로그" description={`${logs.length}건 (최근 1,000건까지) · 생성/수정/삭제/업로드/단계 변경/로그인 기록`}>
        <ExportButton fileName="감사로그" rows={logs.map((l) => ({ 일시: fmtDateTime(l.createdAt), 사용자: l.userName, 작업: ACTION_LABEL[l.action] ?? l.action, 대상: ENTITY_LABEL[l.entity] ?? l.entity, 내용: l.summary, 대상ID: l.entityId }))} />
      </PageHeader>
      <FilterBar resetHref="/admin/audit">
        <FilterItem label="검색"><Input name="q" defaultValue={q} placeholder="내용 / 사용자" className="h-8 w-48" /></FilterItem>
        <FilterItem label="작업"><Select name="action" defaultValue={action} className="h-8 w-28"><option value="">전체</option>{Object.entries(ACTION_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</Select></FilterItem>
        <FilterItem label="대상"><Select name="entity" defaultValue={entity} className="h-8 w-36"><option value="">전체</option>{Object.entries(ENTITY_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</Select></FilterItem>
        <FilterItem label="시작일"><Input type="date" name="from" defaultValue={from} className="h-8 w-36" /></FilterItem>
        <FilterItem label="종료일"><Input type="date" name="to" defaultValue={to} className="h-8 w-36" /></FilterItem>
      </FilterBar>
      <Card>
        {logs.length === 0 ? <Empty /> : (
          <Table>
            <THead><tr><TH>일시</TH><TH>사용자</TH><TH>작업</TH><TH>대상</TH><TH>내용</TH></tr></THead>
            <TBody>
              {logs.map((l) => (
                <TR key={l.id}>
                  <TD className="tabular whitespace-nowrap text-xs">{fmtDateTime(l.createdAt)}</TD>
                  <TD className="whitespace-nowrap">{l.userName || "-"}</TD>
                  <TD><Badge className={ACTION_CLS[l.action] ?? ""}>{ACTION_LABEL[l.action] ?? l.action}</Badge></TD>
                  <TD className="whitespace-nowrap text-xs text-muted-foreground">{ENTITY_LABEL[l.entity] ?? l.entity}</TD>
                  <TD>{l.summary}</TD>
                </TR>
              ))}
            </TBody>
          </Table>
        )}
      </Card>
    </>
  );
}
