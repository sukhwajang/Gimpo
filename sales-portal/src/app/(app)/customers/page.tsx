import Link from "next/link";
import { Plus } from "lucide-react";
import type { Prisma } from "@prisma/client";
import { CustomerFields } from "@/components/customer-fields";
import { ExportButton } from "@/components/export-button";
import { FilterBar, FilterItem } from "@/components/filter-bar";
import { FormDialog } from "@/components/form-dialog";
import { Empty, PageHeader } from "@/components/page-header";
import { BusinessBadge, GradeBadge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Input, Select } from "@/components/ui/input";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { BUSINESS_LABEL, GRADES } from "@/lib/constants";
import { fmtKrw } from "@/lib/format";
import { one, ownerOptions } from "@/lib/lookups";
import { customerScope, isSales, salesScope, visibleBusinesses } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/session";
import { saveCustomer } from "./actions";

export default async function CustomersPage({ searchParams }: { searchParams: Record<string, string | string[] | undefined> }) {
  const me = await requireUser();
  const q = one(searchParams.q), business = one(searchParams.business), grade = one(searchParams.grade), owner = one(searchParams.owner), region = one(searchParams.region);
  const and: Prisma.CustomerWhereInput[] = [customerScope(me)];
  if (q) and.push({ OR: [{ name: { contains: q } }, { code: { contains: q.toUpperCase() } }] });
  if (business) and.push({ businesses: { contains: business } });
  if (grade) and.push({ grade });
  if (owner) and.push({ ownerId: owner });
  if (region === "domestic") and.push({ country: "대한민국" });
  if (region === "overseas") and.push({ country: { not: "대한민국" } });

  const since = new Date();
  since.setFullYear(since.getFullYear() - 1);
  const [customers, owners, sales] = await Promise.all([
    prisma.customer.findMany({
      where: { AND: and }, orderBy: [{ grade: "asc" }, { name: "asc" }],
      include: { owner: { select: { name: true } }, _count: { select: { contacts: true } }, opportunities: { where: { stage: { type: "OPEN" } }, select: { id: true } } },
    }),
    ownerOptions(me),
    prisma.salesRecord.groupBy({ by: ["customerId"], where: { ...salesScope(me), saleDate: { gte: since } }, _sum: { amountKrw: true } }),
  ]);
  const salesMap = new Map(sales.map((s) => [s.customerId, s._sum.amountKrw ?? 0]));
  const rows = customers.map((c) => ({ ...c, sales12: salesMap.get(c.id) ?? 0 }));
  const bizOptions = visibleBusinesses(me);

  return (
    <>
      <PageHeader title="고객사" description={`${rows.length}곳 · 본인 담당 고객만 수정할 수 있습니다.`}>
        <ExportButton
          fileName="고객사"
          rows={rows.map((c) => ({ 고객코드: c.code, 고객사명: c.name, 국가: c.country, 사업구분: c.businesses.split(",").map((b) => BUSINESS_LABEL[b]).join(", "), 등급: c.grade, 담당영업: c.owner.name, 담당자수: c._count.contacts, 진행기회: c.opportunities.length, "최근12개월매출(원)": Math.round(c.sales12) }))}
        />
        <FormDialog trigger={<><Plus /> 고객사 등록</>} title="고객사 등록" action={saveCustomer}>
          <CustomerFields owners={owners} defaultOwnerId={isSales(me) ? me.id : owners[0]?.id ?? ""} defaultBusiness={me.business} lockOwner={isSales(me)} />
        </FormDialog>
      </PageHeader>

      <FilterBar resetHref="/customers">
        <FilterItem label="검색"><Input name="q" defaultValue={q} placeholder="고객사명 / 코드" className="h-8 w-44" /></FilterItem>
        {bizOptions.length > 1 && (
          <FilterItem label="사업">
            <Select name="business" defaultValue={business} className="h-8 w-28"><option value="">전체</option>{bizOptions.map((b) => <option key={b} value={b}>{BUSINESS_LABEL[b]}</option>)}</Select>
          </FilterItem>
        )}
        <FilterItem label="등급">
          <Select name="grade" defaultValue={grade} className="h-8 w-20"><option value="">전체</option>{GRADES.map((g) => <option key={g}>{g}</option>)}</Select>
        </FilterItem>
        <FilterItem label="지역">
          <Select name="region" defaultValue={region} className="h-8 w-24"><option value="">전체</option><option value="domestic">국내</option><option value="overseas">해외</option></Select>
        </FilterItem>
        <FilterItem label="담당 영업">
          <Select name="owner" defaultValue={owner} className="h-8 w-36"><option value="">전체</option>{owners.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}</Select>
        </FilterItem>
      </FilterBar>

      <Card>
        {rows.length === 0 ? <Empty>조건에 맞는 고객사가 없습니다.</Empty> : (
          <Table>
            <THead><tr><TH>코드</TH><TH>고객사명</TH><TH>국가</TH><TH>사업</TH><TH>등급</TH><TH>담당 영업</TH><TH className="text-right">진행 기회</TH><TH className="text-right">최근 12개월 매출</TH></tr></THead>
            <TBody>
              {rows.map((c) => (
                <TR key={c.id}>
                  <TD className="tabular text-xs text-muted-foreground">{c.code}</TD>
                  <TD><Link href={`/customers/${c.id}`} className="font-medium text-primary hover:underline">{c.name}</Link></TD>
                  <TD>{c.country}</TD>
                  <TD><div className="flex gap-1">{c.businesses.split(",").map((b) => <BusinessBadge key={b} business={b} />)}</div></TD>
                  <TD><GradeBadge grade={c.grade} /></TD>
                  <TD>{c.owner.name}{c.ownerId === me.id && <span className="ml-1 text-xs text-primary">(나)</span>}</TD>
                  <TD className="tabular text-right">{c.opportunities.length || "-"}</TD>
                  <TD className="tabular text-right">{c.sales12 ? fmtKrw(c.sales12) : "-"}</TD>
                </TR>
              ))}
            </TBody>
          </Table>
        )}
      </Card>
    </>
  );
}
