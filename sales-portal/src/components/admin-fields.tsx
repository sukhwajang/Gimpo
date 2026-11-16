"use client";
import * as React from "react";
import { Field, Input, Select } from "@/components/ui/input";
import { BUSINESSES, BUSINESS_LABEL, ROLES, ROLE_LABEL } from "@/lib/constants";

type UserLike = { id: string; email: string; name: string; title: string; role: string; business: string | null; active: boolean };

export function UserFields({ user }: { user?: UserLike }) {
  const [role, setRole] = React.useState(user?.role ?? "SALES");
  const needsBiz = role === "SALES" || role === "HEAD";
  return (
    <div className="grid grid-cols-2 gap-3">
      {user && <input type="hidden" name="id" value={user.id} />}
      <Field label="이름" required><Input name="name" defaultValue={user?.name} required /></Field>
      <Field label="직함"><Input name="title" defaultValue={user?.title} placeholder="예: API영업팀 과장" /></Field>
      <Field label="이메일 (Entra ID 계정과 동일해야 SSO 로그인 가능)" required className="col-span-2"><Input name="email" type="email" defaultValue={user?.email} required /></Field>
      <Field label="역할" required>
        <Select name="role" value={role} onChange={(e) => setRole(e.target.value)}>{ROLES.map((r) => <option key={r} value={r}>{ROLE_LABEL[r]}</option>)}</Select>
      </Field>
      <Field label="소속 사업부" required={needsBiz}>
        <Select name="business" defaultValue={user?.business ?? "CHEM"} disabled={!needsBiz} key={String(needsBiz)}>
          {needsBiz ? BUSINESSES.map((b) => <option key={b} value={b}>{BUSINESS_LABEL[b]}</option>) : <option value="">전사</option>}
        </Select>
      </Field>
      <Field label="상태">
        <Select name="active" defaultValue={String(user?.active ?? true)}><option value="true">활성</option><option value="false">비활성 (로그인 불가)</option></Select>
      </Field>
    </div>
  );
}
