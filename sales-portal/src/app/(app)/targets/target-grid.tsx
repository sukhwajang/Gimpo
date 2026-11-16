"use client";
import * as React from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { fmtNum } from "@/lib/format";
import { cn } from "@/lib/utils";
import { saveTargets } from "../performance/actions";

export type TargetRow = { userId: string | null; name: string; sub: string; targets: number[]; actuals: number[] };
const M = 1_000_000;

/** 월별 목표 입력 그리드 (단위: 백만원). 달성률은 입력 즉시 다시 계산된다. */
export function TargetGrid({ year, business, rows, editable, color, currentMonth }: { year: number; business: string; rows: TargetRow[]; editable: boolean; color: string; currentMonth: number }) {
  const router = useRouter();
  const [values, setValues] = React.useState(() => rows.map((r) => r.targets.map((t) => (t ? String(Math.round(t / M)) : ""))));
  const [msg, setMsg] = React.useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = React.useTransition();
  React.useEffect(() => setValues(rows.map((r) => r.targets.map((t) => (t ? String(Math.round(t / M)) : "")))), [rows]);

  const n = (s: string) => (Number.isFinite(Number(s)) ? Math.max(0, Number(s)) : 0);
  const set = (ri: number, mi: number, v: string) => { setMsg(null); setValues((prev) => prev.map((row, i) => (i === ri ? row.map((x, j) => (j === mi ? v : x)) : row))); };
  const distribute = (ri: number) => {
    const input = window.prompt(`${rows[ri].name}의 ${year}년 연간 목표(백만원)를 입력하면 12개월에 균등 배분합니다.`, String(values[ri].reduce((s, x) => s + n(x), 0)));
    if (input == null) return;
    const total = Number(input.replace(/,/g, ""));
    if (!Number.isFinite(total) || total < 0) return alert("숫자를 입력하세요.");
    const each = Math.floor(total / 12);
    setMsg(null);
    setValues((prev) => prev.map((row, i) => (i === ri ? row.map((_, j) => String(j === 11 ? total - each * 11 : each)) : row)));
  };
  const save = () =>
    start(async () => {
      const items = rows.flatMap((r, ri) => values[ri].map((v, mi) => ({ userId: r.userId, month: mi + 1, amountKrw: n(v) * M })));
      const res = await saveTargets(year, business, items);
      setMsg(res.ok ? { ok: true, text: "목표를 저장했습니다. 대시보드 달성률에 바로 반영됩니다." } : { ok: false, text: res.error ?? "저장 실패" });
      if (res.ok) router.refresh();
    });
  const repSum = (mi: number) => rows.reduce((s, r, ri) => (r.userId ? s + n(values[ri][mi]) : s), 0);

  return (
    <div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-muted/60 text-xs text-muted-foreground">
            <tr>
              <th className="sticky left-0 z-10 min-w-[150px] bg-slate-100 px-3 py-2 text-left">구분</th>
              {Array.from({ length: 12 }, (_, i) => <th key={i} className={cn("min-w-[84px] px-1 py-2 text-right", i + 1 === currentMonth && "text-primary")}>{i + 1}월</th>)}
              <th className="min-w-[90px] px-2 py-2 text-right">연간 목표</th>
              <th className="min-w-[90px] px-2 py-2 text-right">누적 실적</th>
              <th className="min-w-[70px] px-2 py-2 text-right">달성률</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, ri) => {
              const annual = values[ri].reduce((s, x) => s + n(x), 0);
              const actual = r.actuals.reduce((s, x) => s + x, 0) / M;
              const ytdTarget = values[ri].slice(0, currentMonth).reduce((s, x) => s + n(x), 0);
              const rate = ytdTarget ? (actual / ytdTarget) * 100 : null;
              return (
                <tr key={r.userId ?? "biz"} className={cn("border-b align-top", !r.userId && "bg-slate-50 font-semibold")}>
                  <td className={cn("sticky left-0 z-10 px-3 py-2", r.userId ? "bg-white" : "bg-slate-50")} style={!r.userId ? { boxShadow: `inset 3px 0 0 ${color}` } : undefined}>
                    <div>{r.name}</div>
                    <div className="text-[11px] font-normal text-muted-foreground">{r.sub}</div>
                    {editable && <button type="button" onClick={() => distribute(ri)} className="text-[11px] font-normal text-primary hover:underline">연간 목표 균등 배분</button>}
                  </td>
                  {values[ri].map((v, mi) => {
                    const a = r.actuals[mi] / M;
                    const t = n(v);
                    return (
                      <td key={mi} className="px-1 py-2 text-right">
                        {editable ? (
                          <input value={v} onChange={(e) => set(ri, mi, e.target.value.replace(/[^\d.]/g, ""))} inputMode="numeric" aria-label={`${r.name} ${mi + 1}월 목표`} className="tabular h-7 w-full rounded border border-input bg-white px-1.5 text-right text-xs focus:outline-none focus:ring-2 focus:ring-ring" />
                        ) : (
                          <div className="tabular text-xs">{t ? fmtNum(t) : "-"}</div>
                        )}
                        <div className={cn("tabular mt-0.5 text-[11px] font-normal", a === 0 ? "text-slate-300" : t && a >= t ? "text-emerald-600" : "text-slate-500")} title="실적(백만원)">{a ? fmtNum(a) : "·"}</div>
                      </td>
                    );
                  })}
                  <td className="tabular px-2 py-2 text-right">{fmtNum(annual)}</td>
                  <td className="tabular px-2 py-2 text-right">{fmtNum(actual)}</td>
                  <td className={cn("tabular px-2 py-2 text-right", rate == null ? "" : rate >= 100 ? "text-emerald-600" : rate < 80 ? "text-red-600" : "")}>{rate == null ? "-" : `${rate.toFixed(1)}%`}</td>
                </tr>
              );
            })}
            <tr className="text-xs text-muted-foreground">
              <td className="sticky left-0 bg-white px-3 py-2">담당자 목표 합계</td>
              {Array.from({ length: 12 }, (_, mi) => <td key={mi} className="tabular px-2 py-2 text-right">{fmtNum(repSum(mi))}</td>)}
              <td className="tabular px-2 py-2 text-right">{fmtNum(Array.from({ length: 12 }, (_, mi) => repSum(mi)).reduce((a, b) => a + b, 0))}</td>
              <td colSpan={2} />
            </tr>
          </tbody>
        </table>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2 border-t px-4 py-3">
        <p className="text-xs text-muted-foreground">단위: 백만원 · 각 칸 아래 작은 숫자는 해당 월 실적 · 달성률 = 누적 실적 ÷ {currentMonth}월까지의 누적 목표</p>
        <div className="flex items-center gap-3">
          {msg && <span className={cn("text-xs", msg.ok ? "text-emerald-600" : "text-red-600")}>{msg.text}</span>}
          {editable ? <Button onClick={save} disabled={pending}>{pending ? "저장 중…" : "목표 저장"}</Button> : <span className="text-xs text-muted-foreground">조회 전용 (목표 설정은 사업부장 이상)</span>}
        </div>
      </div>
    </div>
  );
}
