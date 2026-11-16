import { Pencil, Plus } from "lucide-react";
import { UserFields } from "@/components/admin-fields";
import { ExportButton } from "@/components/export-button";
import { FilterBar, FilterItem } from "@/components/filter-bar";
import { FormDialog } from "@/components/form-dialog";
import { PageHeader } from "@/components/page-header";
import { Badge, BusinessBadge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Input, Select } from "@/components/ui/input";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { BUSINESSES, BUSINESS_LABEL, ROLES, ROLE_LABEL } from "@/lib/constants";
import { one } from "@/lib/lookups";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/session";
import { saveUser } from "../actions";

const ROLE_ORDER: Record<string, number> = { ADMIN: 0, EXEC: 1, HEAD: 2, SALES: 3 };

export default async function UsersPage({ searchParams }: { searchParams: Record<string, string | string[] | undefined> }) {
  const me = await requireAdmin();
  const q = one(searchParams.q), role = one(searchParams.role), business = one(searchParams.business);
  const users = (await prisma.user.findMany({
    where: { ...(role ? { role } : {}), ...(business ? { business } : {}), ...(q ? { OR: [{ name: { contains: q } }, { email: { contains: q.toLowerCase() } }] } : {}) },
    include: { _count: { select: { customers: true, opportunities: true } } },
  })).sort((a, b) => ROLE_ORDER[a.role] - ROLE_ORDER[b.role] || (a.business ?? "").localeCompare(b.business ?? "") || a.email.localeCompare(b.email, undefined, { numeric: true }));
  return (
    <>
      <PageHeader title="사용자·역할" description={`${users.length}명 · 역할과 소속 사업부에 따라 메뉴와 조회·수정 범위가 정해집니다.`}>
        <ExportButton fileName="사용자" rows={users.map((u) => ({ 이름: u.name, 이메일: u.email, 직함: u.title, 역할: ROLE_LABEL[u.role], 사업부: u.business ? BUSINESS_LABEL[u.business] : "전사", 상태: u.active ? "활성" : "비활성", 담당고객: u._count.customers, 담당기회: u._count.opportunities }))} />
        <FormDialog trigger={<><Plus /> 사용자 등록</>} title="사용자 등록" action={saveUser}><UserFields /></FormDialog>
      </PageHeader>
      <FilterBar resetHref="/admin/users">
        <FilterItem label="검색"><Input name="q" defaultValue={q} placeholder="이름 / 이메일" className="h-8 w-44" /></FilterItem>
        <FilterItem label="역할"><Select name="role" defaultValue={role} className="h-8 w-28"><option value="">전체</option>{ROLES.map((r) => <option key={r} value={r}>{ROLE_LABEL[r]}</option>)}</Select></FilterItem>
        <FilterItem label="사업부"><Select name="business" defaultValue={business} className="h-8 w-28"><option value="">전체</option>{BUSINESSES.map((b) => <option key={b} value={b}>{BUSINESS_LABEL[b]}</option>)}</Select></FilterItem>
      </FilterBar>
      <Card>
        <Table>
          <THead><tr><TH>이름</TH><TH>이메일</TH><TH>직함</TH><TH>역할</TH><TH>사업부</TH><TH>상태</TH><TH className="text-right">담당 고객</TH><TH className="text-right">담당 기회</TH><TH /></tr></THead>
          <TBody>
            {users.map((u) => (
              <TR key={u.id} className={u.active ? "" : "opacity-50"}>
                <TD className="font-medium">{u.name}{u.id === me.id && <span className="ml-1 text-xs text-primary">(나)</span>}</TD>
                <TD className="text-xs">{u.email}</TD>
                <TD>{u.title}</TD>
                <TD><Badge className={u.role === "ADMIN" || u.role === "EXEC" ? "border-slate-800 bg-slate-800 text-white" : u.role === "HEAD" ? "border-slate-400 bg-slate-100" : "bg-white"}>{ROLE_LABEL[u.role]}</Badge></TD>
                <TD>{u.business ? <BusinessBadge business={u.business} /> : <span className="text-xs text-muted-foreground">전사</span>}</TD>
                <TD>{u.active ? <span className="text-xs text-emerald-600">활성</span> : <span className="text-xs">비활성</span>}</TD>
                <TD className="tabular text-right">{u._count.customers || "-"}</TD>
                <TD className="tabular text-right">{u._count.opportunities || "-"}</TD>
                <TD className="text-right"><FormDialog trigger={<Pencil />} title="사용자 수정" action={saveUser} size="icon" variant="ghost"><UserFields user={u} /></FormDialog></TD>
              </TR>
            ))}
          </TBody>
        </Table>
      </Card>
    </>
  );
}
