import Link from "next/link";
import { FileUp } from "lucide-react";
import type { Prisma } from "@prisma/client";
import { ExportButton } from "@/components/export-button";
import { FilterBar, FilterItem } from "@/components/filter-bar";
import { Empty, KpiCard, PageHeader } from "@/components/page-header";
import { BusinessBadge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input, Select } from "@/components/ui/input";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { BUSINESS_COLOR, BUSINESS_LABEL } from "@/lib/constants";
import { fmtDate, fmtKrw, fmtMoney, fmtNum, parseDate } from "@/lib/format";
import { one, ownerOptions } from "@/lib/lookups";
import { isAdmin, salesScope, visibleBusinesses } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/session";

const SHOW = 300;

export default async function PerformancePage({ searchParams }: { searchParams: Record<string, string | string[] | undefined> }) {
  const me = await requireUser();
  const now = new Date();
  const business = one(searchParams.business), owner = one(searchParams.owner), q = one(searchParams.q), customer = one(searchParams.customer);
  const from = one(searchParams.from) || `${now.getFullYear()}-01-01`;
  const to = one(searchParams.to) || fmtDate(now);
  const bizOptions = visibleBusinesses(me);
  const and: Prisma.SalesRecordWhereInput[] = [salesScope(me)];
  const f = parseDate(from), t = parseDate(to);
  if (f) and.push({ saleDate: { gte: new Date(f.getFullYear(), f.getMonth(), f.getDate()) } });
  if (t) and.push({ saleDate: { lt: new Date(t.getFullYear(), t.getMonth(), t.getDate() + 1) } });
  if (business) and.push({ business });
  if (owner) and.push({ customer: { ownerId: owner } });
  if (customer) and.push({ customerId: customer });
  if (q) and.push({ OR: [{ customerName: { contains: q } }, { customerCode: { contains: q.toUpperCase() } }, { productName: { contains: q } }, { productCode: { contains: q.toUpperCase() } }] });

  const [rows, owners, customerRow] = await Promise.all([
    prisma.salesRecord.findMany({ where: { AND: and }, orderBy: [{ saleDate: "desc" }, { amountKrw: "desc" }], include: { customer: { select: { id: true, owner: { select: { name: true } } } } } }),
    ownerOptions(me),
    customer ? prisma.customer.findUnique({ where: { id: customer }, select: { name: true } }) : null,
  ]);
  const total = rows.reduce((s, r) => s + r.amountKrw, 0);
  const byBiz = bizOptions.map((b) => ({ b, amount: rows.filter((r) => r.business === b).reduce((s, r) => s + r.amountKrw, 0), count: rows.filter((r) => r.business === b).length }));

  return (
    <>
      <PageHeader title="실적" description={`${from} ~ ${to} · SAP 매출 업로드 기준 (원화 환산은 매출월 환율 적용)`}>
        <ExportButton
          fileName="매출실적"
          rows={rows.map((r) => ({ 매출일자: fmtDate(r.saleDate), 사업구분: BUSINESS_LABEL[r.business], 고객코드: r.customerCode, 고객명: r.customerName, 제품코드: r.productCode, 제품명: r.productName, 수량: r.quantity, 단위: r.unit, 금액: r.amount, 통화: r.currency, "원화환산(원)": Math.round(r.amountKrw), 담당영업: r.customer?.owner.name ?? "" }))}
        />
        {isAdmin(me) && <Button asChild size="sm"><Link href="/performance/upload"><FileUp /> 실적 업로드</Link></Button>}
      </PageHeader>

      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <KpiCard label="매출 합계 (원화 환산)" value={`${fmtKrw(total)}원`} sub={`${fmtNum(rows.length)}건`} />
        {byBiz.map((x) => <KpiCard key={x.b} label={BUSINESS_LABEL[x.b]} value={`${fmtKrw(x.amount)}원`} sub={`${fmtNum(x.count)}건`} accent={BUSINESS_COLOR[x.b]} />)}
      </div>

      <FilterBar resetHref="/performance">
        {customer && <input type="hidden" name="customer" value={customer} />}
        <FilterItem label="시작일"><Input type="date" name="from" defaultValue={from} className="h-8 w-36" /></FilterItem>
        <FilterItem label="종료일"><Input type="date" name="to" defaultValue={to} className="h-8 w-36" /></FilterItem>
        {bizOptions.length > 1 && (
          <FilterItem label="사업">
            <Select name="business" defaultValue={business} className="h-8 w-28"><option value="">전체</option>{bizOptions.map((b) => <option key={b} value={b}>{BUSINESS_LABEL[b]}</option>)}</Select>
          </FilterItem>
        )}
        <FilterItem label="담당 영업">
          <Select name="owner" defaultValue={owner} className="h-8 w-32"><option value="">전체</option>{owners.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}</Select>
        </FilterItem>
        <FilterItem label="검색"><Input name="q" defaultValue={q} placeholder="고객/제품명, 코드" className="h-8 w-44" /></FilterItem>
      </FilterBar>
      {customerRow && <div className="mb-3 text-xs"><span className="text-muted-foreground">적용된 조건:</span> <span className="rounded-full bg-amber-50 px-2 py-0.5 font-medium text-amber-800">고객사: {customerRow.name}</span></div>}

      <Card>
        {rows.length === 0 ? <Empty>조건에 맞는 실적이 없습니다.</Empty> : (
          <>
            <Table>
              <THead><tr><TH>매출일자</TH><TH>사업</TH><TH>고객코드</TH><TH>고객명</TH><TH>제품</TH><TH className="text-right">수량</TH><TH className="text-right">금액</TH><TH className="text-right">원화 환산</TH><TH>담당 영업</TH></tr></THead>
              <TBody>
                {rows.slice(0, SHOW).map((r) => (
                  <TR key={r.id}>
                    <TD className="tabular whitespace-nowrap">{fmtDate(r.saleDate)}</TD>
                    <TD><BusinessBadge business={r.business} /></TD>
                    <TD className="tabular text-xs text-muted-foreground">{r.customerCode}</TD>
                    <TD>{r.customer ? <Link href={`/customers/${r.customer.id}`} className="hover:underline">{r.customerName}</Link> : r.customerName}</TD>
                    <TD><span className="text-xs text-muted-foreground">{r.productCode}</span> {r.productName}</TD>
                    <TD className="tabular whitespace-nowrap text-right">{fmtNum(r.quantity, 1)} {r.unit}</TD>
                    <TD className="tabular whitespace-nowrap text-right">{fmtMoney(r.amount, r.currency)}</TD>
                    <TD className="tabular text-right">{fmtNum(r.amountKrw)}</TD>
                    <TD className="whitespace-nowrap">{r.customer?.owner.name ?? "-"}</TD>
                  </TR>
                ))}
              </TBody>
            </Table>
            {rows.length > SHOW && <p className="border-t px-4 py-2 text-xs text-muted-foreground">화면에는 최근 {SHOW}건만 표시합니다. 전체 {fmtNum(rows.length)}건은 엑셀 다운로드로 확인하세요.</p>}
          </>
        )}
      </Card>
    </>
  );
}
