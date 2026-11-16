"use client";
import * as React from "react";
import { Field, Input, Select, Textarea } from "@/components/ui/input";
import { BUSINESS_LABEL, CURRENCIES } from "@/lib/constants";

export type OppFormData = {
  businesses: string[];
  customers: { id: string; name: string; businesses: string }[];
  products: { id: string; name: string; business: string }[];
  owners: { id: string; name: string; business: string | null }[];
  stages: { id: string; name: string; business: string; probability: number }[];
  lockOwner: boolean;
  meId: string;
};
export type OppFormValue = {
  id: string; business: string; customerId: string; title: string; productId: string | null; amount: number; currency: string;
  expectedCloseDate: string; ownerId: string; nextAction: string; nextActionDue: string; description: string; auditDate: string;
};

/** 기회 등록/수정 필드. 사업을 바꾸면 고객·제품·단계·담당자 선택지가 함께 바뀐다. */
export function OpportunityFields({ data, value, defaultBusiness, defaultCustomerId }: { data: OppFormData; value?: OppFormValue; defaultBusiness?: string; defaultCustomerId?: string }) {
  const [business, setBusiness] = React.useState(value?.business ?? defaultBusiness ?? data.businesses[0]);
  const customers = data.customers.filter((c) => c.businesses.split(",").includes(business));
  const products = data.products.filter((p) => p.business === business);
  const owners = data.owners.filter((o) => !o.business || o.business === business);
  const stages = data.stages.filter((s) => s.business === business);
  const editing = !!value;
  return (
    <div className="grid grid-cols-2 gap-3">
      {editing && <input type="hidden" name="id" value={value.id} />}
      <Field label="사업" required>
        {editing ? <Input disabled value={BUSINESS_LABEL[business]} /> : (
          <Select name="business" value={business} onChange={(e) => setBusiness(e.target.value)}>
            {data.businesses.map((b) => <option key={b} value={b}>{BUSINESS_LABEL[b]}</option>)}
          </Select>
        )}
      </Field>
      <Field label="고객사" required>
        {editing ? <Input disabled value={data.customers.find((c) => c.id === value.customerId)?.name ?? ""} /> : (
          <Select name="customerId" defaultValue={defaultCustomerId ?? ""} required key={business}>
            <option value="" disabled>고객사 선택</option>
            {customers.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </Select>
        )}
      </Field>
      <Field label="제품/프로젝트명" required className="col-span-2"><Input name="title" defaultValue={value?.title} required placeholder={business === "CDMO" ? "예: KX-201 임상 2상용 원료 생산" : "예: 아세토니트릴 연간 공급"} /></Field>
      <Field label="제품 (마스터)">
        <Select name="productId" defaultValue={value?.productId ?? ""} key={business}>
          <option value="">선택 안 함</option>
          {products.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </Select>
      </Field>
      {!editing ? (
        <Field label="시작 단계">
          <Select name="stageId" key={business}>{stages.map((s) => <option key={s.id} value={s.id}>{s.name} ({s.probability}%)</option>)}</Select>
        </Field>
      ) : <div />}
      <Field label="예상 금액" required><Input name="amount" type="number" min={0} step="any" defaultValue={value?.amount} required /></Field>
      <Field label="통화" required>
        <Select name="currency" defaultValue={value?.currency ?? "KRW"}>{CURRENCIES.map((c) => <option key={c}>{c}</option>)}</Select>
      </Field>
      <Field label="예상 수주일"><Input name="expectedCloseDate" type="date" defaultValue={value?.expectedCloseDate} /></Field>
      <Field label="담당자" required>
        {data.lockOwner ? (
          <>
            <input type="hidden" name="ownerId" value={value?.ownerId ?? data.meId} />
            <Input disabled value={data.owners.find((o) => o.id === (value?.ownerId ?? data.meId))?.name ?? "본인"} />
          </>
        ) : (
          <Select name="ownerId" defaultValue={value?.ownerId ?? (owners.some((o) => o.id === data.meId) ? data.meId : owners[0]?.id)} key={business}>
            {owners.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
          </Select>
        )}
      </Field>
      <Field label="다음 액션"><Input name="nextAction" defaultValue={value?.nextAction} placeholder="예: 견적서 송부" /></Field>
      <Field label="다음 액션 기한"><Input name="nextActionDue" type="date" defaultValue={value?.nextActionDue} /></Field>
      {business === "API" && <Field label="고객 실사 일정 (API)"><Input name="auditDate" type="date" defaultValue={value?.auditDate} /></Field>}
      <Field label="비고" className="col-span-2"><Textarea name="description" defaultValue={value?.description} /></Field>
      {!editing && business === "API" && <p className="col-span-2 text-xs text-muted-foreground">등록하면 요청 문서 체크리스트(CoA, DMF, CEP, MSDS 등)가 자동으로 만들어집니다.</p>}
      {!editing && business === "CDMO" && <p className="col-span-2 text-xs text-muted-foreground">등록하면 프로젝트 마일스톤(계약, 기술이전, 첫 생산 등)이 자동으로 만들어집니다.</p>}
    </div>
  );
}
