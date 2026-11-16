import { Field, Input, Select, Textarea } from "@/components/ui/input";
import { ACTIVITY_LABEL, ACTIVITY_TYPES, BUSINESSES, BUSINESS_LABEL, COUNTRIES, GRADES } from "@/lib/constants";
import { fmtDate } from "@/lib/format";

type Owner = { id: string; name: string; business: string | null };
type CustomerLike = { id: string; code: string; name: string; country: string; businesses: string; grade: string; ownerId: string; memo: string };

export function CustomerFields({ customer, owners, defaultOwnerId, defaultBusiness, lockOwner }: { customer?: CustomerLike; owners: Owner[]; defaultOwnerId: string; defaultBusiness: string | null; lockOwner: boolean }) {
  const selected = customer ? customer.businesses.split(",") : defaultBusiness ? [defaultBusiness] : [];
  return (
    <div className="grid grid-cols-2 gap-3">
      {customer && <input type="hidden" name="id" value={customer.id} />}
      <Field label="고객코드 (SAP)" required><Input name="code" defaultValue={customer?.code} placeholder="예: K10100" required /></Field>
      <Field label="고객사명" required><Input name="name" defaultValue={customer?.name} required /></Field>
      <Field label="국가" required>
        <Input name="country" list="country-list" defaultValue={customer?.country ?? "대한민국"} required />
        <datalist id="country-list">{COUNTRIES.map((c) => <option key={c} value={c} />)}</datalist>
      </Field>
      <Field label="등급" required>
        <Select name="grade" defaultValue={customer?.grade ?? "B"}>{GRADES.map((g) => <option key={g}>{g}</option>)}</Select>
      </Field>
      <Field label="사업구분 (다중 선택)" required className="col-span-2">
        <div className="flex gap-4 pt-1">
          {BUSINESSES.map((b) => (
            <label key={b} className="flex items-center gap-1.5 text-sm">
              <input type="checkbox" name="businesses" value={b} defaultChecked={selected.includes(b)} className="h-4 w-4" /> {BUSINESS_LABEL[b]}
            </label>
          ))}
        </div>
      </Field>
      <Field label="담당 영업" required className="col-span-2">
        {lockOwner ? (
          <>
            <input type="hidden" name="ownerId" value={customer?.ownerId ?? defaultOwnerId} />
            <Input disabled value={owners.find((o) => o.id === (customer?.ownerId ?? defaultOwnerId))?.name ?? "본인"} />
          </>
        ) : (
          <Select name="ownerId" defaultValue={customer?.ownerId ?? defaultOwnerId}>
            {owners.map((o) => <option key={o.id} value={o.id}>{o.name}{o.business ? ` (${BUSINESS_LABEL[o.business]})` : ""}</option>)}
          </Select>
        )}
      </Field>
      <Field label="메모" className="col-span-2"><Textarea name="memo" defaultValue={customer?.memo} /></Field>
    </div>
  );
}

export function ContactFields({ customerId, contact }: { customerId: string; contact?: { id: string; name: string; title: string; email: string; phone: string } }) {
  return (
    <div className="grid grid-cols-2 gap-3">
      <input type="hidden" name="customerId" value={customerId} />
      {contact && <input type="hidden" name="id" value={contact.id} />}
      <Field label="이름" required><Input name="name" defaultValue={contact?.name} required /></Field>
      <Field label="직책"><Input name="title" defaultValue={contact?.title} /></Field>
      <Field label="이메일"><Input name="email" type="email" defaultValue={contact?.email} /></Field>
      <Field label="전화"><Input name="phone" defaultValue={contact?.phone} /></Field>
    </div>
  );
}

export function ActivityFields({ customerId, opportunityId, opportunities }: { customerId?: string; opportunityId?: string; opportunities?: { id: string; title: string }[] }) {
  return (
    <div className="grid grid-cols-2 gap-3">
      {customerId && <input type="hidden" name="customerId" value={customerId} />}
      {opportunityId && <input type="hidden" name="opportunityId" value={opportunityId} />}
      <Field label="유형" required>
        <Select name="type" defaultValue="MEETING">{ACTIVITY_TYPES.map((t) => <option key={t} value={t}>{ACTIVITY_LABEL[t]}</option>)}</Select>
      </Field>
      <Field label="일자" required><Input name="date" type="date" defaultValue={fmtDate(new Date())} required /></Field>
      {!opportunityId && opportunities && (
        <Field label="연결할 영업기회 (선택)" className="col-span-2">
          <Select name="opportunityId" defaultValue="">
            <option value="">연결 안 함 (고객 활동)</option>
            {opportunities.map((o) => <option key={o.id} value={o.id}>{o.title}</option>)}
          </Select>
        </Field>
      )}
      <Field label="제목" required className="col-span-2"><Input name="subject" required placeholder="예: 구매팀 정기 미팅" /></Field>
      <Field label="내용" className="col-span-2"><Textarea name="content" placeholder="논의 내용, 고객 반응, 후속 조치 등" /></Field>
    </div>
  );
}
