import { Pencil, Plus, Trash2 } from "lucide-react";
import { ExportButton } from "@/components/export-button";
import { FilterBar, FilterItem } from "@/components/filter-bar";
import { ActionButton, FormDialog } from "@/components/form-dialog";
import { Empty, PageHeader } from "@/components/page-header";
import { BusinessBadge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Field, Input, Select } from "@/components/ui/input";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { BUSINESSES, BUSINESS_LABEL } from "@/lib/constants";
import { one } from "@/lib/lookups";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/session";
import { deleteProduct, saveProduct } from "../actions";

type P = { id: string; code: string; name: string; business: string; unit: string; active: boolean };

function ProductFields({ product }: { product?: P }) {
  return (
    <div className="grid grid-cols-2 gap-3">
      {product && <input type="hidden" name="id" value={product.id} />}
      <Field label="제품코드 (SAP)" required><Input name="code" defaultValue={product?.code} required placeholder="예: AP-2015" /></Field>
      <Field label="사업" required><Select name="business" defaultValue={product?.business ?? "CHEM"}>{BUSINESSES.map((b) => <option key={b} value={b}>{BUSINESS_LABEL[b]}</option>)}</Select></Field>
      <Field label="제품명" required className="col-span-2"><Input name="name" defaultValue={product?.name} required /></Field>
      <Field label="단위"><Input name="unit" defaultValue={product?.unit ?? "kg"} /></Field>
      <Field label="상태"><Select name="active" defaultValue={String(product?.active ?? true)}><option value="true">사용</option><option value="false">사용 안 함</option></Select></Field>
    </div>
  );
}

export default async function ProductsPage({ searchParams }: { searchParams: Record<string, string | string[] | undefined> }) {
  await requireAdmin();
  const q = one(searchParams.q), business = one(searchParams.business);
  const products = await prisma.product.findMany({
    where: { ...(business ? { business } : {}), ...(q ? { OR: [{ name: { contains: q } }, { code: { contains: q.toUpperCase() } }] } : {}) },
    orderBy: { code: "asc" }, include: { _count: { select: { opportunities: true } } },
  });
  return (
    <>
      <PageHeader title="제품 마스터" description={`${products.length}개 · 영업기회의 제품 선택과 실적 업로드 검증(제품코드)에 사용됩니다.`}>
        <ExportButton fileName="제품마스터" rows={products.map((p) => ({ 제품코드: p.code, 제품명: p.name, 사업: BUSINESS_LABEL[p.business], 단위: p.unit, 상태: p.active ? "사용" : "사용 안 함", 연결기회: p._count.opportunities }))} />
        <FormDialog trigger={<><Plus /> 제품 등록</>} title="제품 등록" action={saveProduct}><ProductFields /></FormDialog>
      </PageHeader>
      <FilterBar resetHref="/admin/products">
        <FilterItem label="검색"><Input name="q" defaultValue={q} placeholder="제품명 / 코드" className="h-8 w-44" /></FilterItem>
        <FilterItem label="사업"><Select name="business" defaultValue={business} className="h-8 w-28"><option value="">전체</option>{BUSINESSES.map((b) => <option key={b} value={b}>{BUSINESS_LABEL[b]}</option>)}</Select></FilterItem>
      </FilterBar>
      <Card>
        {products.length === 0 ? <Empty /> : (
          <Table>
            <THead><tr><TH>제품코드</TH><TH>제품명</TH><TH>사업</TH><TH>단위</TH><TH>상태</TH><TH className="text-right">연결 기회</TH><TH /></tr></THead>
            <TBody>
              {products.map((p) => (
                <TR key={p.id} className={p.active ? "" : "opacity-50"}>
                  <TD className="tabular text-xs">{p.code}</TD>
                  <TD className="font-medium">{p.name}</TD>
                  <TD><BusinessBadge business={p.business} /></TD>
                  <TD>{p.unit}</TD>
                  <TD className="text-xs">{p.active ? <span className="text-emerald-600">사용</span> : "사용 안 함"}</TD>
                  <TD className="tabular text-right">{p._count.opportunities || "-"}</TD>
                  <TD>
                    <div className="flex justify-end">
                      <FormDialog trigger={<Pencil />} title="제품 수정" action={saveProduct} size="icon" variant="ghost"><ProductFields product={p} /></FormDialog>
                      <ActionButton action={deleteProduct} fields={{ id: p.id }} confirm={`'${p.name}' 제품을 삭제할까요?`} size="icon" title="삭제"><Trash2 /></ActionButton>
                    </div>
                  </TD>
                </TR>
              ))}
            </TBody>
          </Table>
        )}
      </Card>
    </>
  );
}
