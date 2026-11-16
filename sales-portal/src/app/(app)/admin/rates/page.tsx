import { Pencil, Plus, Trash2 } from "lucide-react";
import { ExportButton } from "@/components/export-button";
import { ActionButton, FormDialog } from "@/components/form-dialog";
import { PageHeader } from "@/components/page-header";
import { Card } from "@/components/ui/card";
import { Field, Input, Select } from "@/components/ui/input";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { fmtNum } from "@/lib/format";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/session";
import { deleteRate, saveRate } from "../actions";

function RateFields({ year, month, currency, rate, lock }: { year: number; month: number; currency?: string; rate?: number; lock?: boolean }) {
  return (
    <div className="grid grid-cols-2 gap-3">
      {lock ? (
        <>
          <input type="hidden" name="year" value={year} /><input type="hidden" name="month" value={month} /><input type="hidden" name="currency" value={currency} />
          <Field label="기준월"><Input disabled value={`${year}년 ${month}월`} /></Field>
          <Field label="통화"><Input disabled value={currency} /></Field>
        </>
      ) : (
        <>
          <Field label="연도" required><Input name="year" type="number" defaultValue={year} required /></Field>
          <Field label="월" required><Select name="month" defaultValue={month}>{Array.from({ length: 12 }, (_, i) => <option key={i} value={i + 1}>{i + 1}월</option>)}</Select></Field>
          <Field label="통화" required><Select name="currency" defaultValue={currency ?? "USD"}><option>USD</option><option>EUR</option></Select></Field>
        </>
      )}
      <Field label="환율 (1 외화 = 원)" required><Input name="rate" type="number" step="0.01" min={0} defaultValue={rate} required /></Field>
      <p className="col-span-2 text-xs text-muted-foreground">저장하면 해당 월·통화의 기존 실적도 새 환율로 다시 환산됩니다. 환율이 없는 월은 직전 월 환율을 적용합니다.</p>
    </div>
  );
}

export default async function RatesPage() {
  await requireAdmin();
  const rates = await prisma.exchangeRate.findMany({ orderBy: [{ year: "desc" }, { month: "desc" }, { currency: "asc" }] });
  const now = new Date();
  const months = [...new Set(rates.map((r) => r.year * 100 + r.month))];
  return (
    <>
      <PageHeader title="환율 (월별)" description="실적 업로드 시 매출월 환율로 원화 환산합니다. 파이프라인 금액은 최신 환율을 적용합니다.">
        <ExportButton fileName="환율" rows={rates.map((r) => ({ 연도: r.year, 월: r.month, 통화: r.currency, 환율: r.rate }))} />
        <FormDialog trigger={<><Plus /> 환율 등록</>} title="환율 등록" action={saveRate}><RateFields year={now.getFullYear()} month={now.getMonth() + 1} /></FormDialog>
      </PageHeader>
      <Card className="max-w-2xl">
        <Table>
          <THead><tr><TH>기준월</TH><TH className="text-right">USD</TH><TH className="text-right">EUR</TH></tr></THead>
          <TBody>
            {months.map((ym) => {
              const y = Math.floor(ym / 100), m = ym % 100;
              const current = y === now.getFullYear() && m === now.getMonth() + 1;
              return (
                <TR key={ym} className={current ? "bg-blue-50/60" : ""}>
                  <TD className="tabular">{y}년 {m}월 {current && <span className="ml-1 text-xs text-primary">이번 달</span>}</TD>
                  {["USD", "EUR"].map((cur) => {
                    const r = rates.find((x) => x.year === y && x.month === m && x.currency === cur);
                    return (
                      <TD key={cur}>
                        <div className="flex items-center justify-end gap-1">
                          <span className="tabular">{r ? fmtNum(r.rate, 2) : <span className="text-xs text-muted-foreground">미등록</span>}</span>
                          <FormDialog trigger={<Pencil />} title="환율 수정" action={saveRate} size="icon" variant="ghost"><RateFields year={y} month={m} currency={cur} rate={r?.rate} lock /></FormDialog>
                          {r ? <ActionButton action={deleteRate} fields={{ id: r.id }} confirm={`${y}년 ${m}월 ${cur} 환율을 삭제할까요?`} size="icon" title="삭제"><Trash2 /></ActionButton> : <span className="w-8" />}
                        </div>
                      </TD>
                    );
                  })}
                </TR>
              );
            })}
          </TBody>
        </Table>
      </Card>
    </>
  );
}
