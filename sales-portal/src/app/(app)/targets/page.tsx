import Link from "next/link";
import { ExportButton } from "@/components/export-button";
import { PageHeader } from "@/components/page-header";
import { Card } from "@/components/ui/card";
import { BUSINESS_COLOR, BUSINESS_LABEL, ROLE_LABEL } from "@/lib/constants";
import { one } from "@/lib/lookups";
import { byMonth, isMine, loadYearSales } from "@/lib/perf";
import { canSetTargets, visibleBusinesses } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/session";
import { cn } from "@/lib/utils";
import { TargetGrid, type TargetRow } from "./target-grid";

export default async function TargetsPage({ searchParams }: { searchParams: Record<string, string | string[] | undefined> }) {
  const me = await requireUser();
  const now = new Date();
  const bizOptions = visibleBusinesses(me);
  const year = Number(one(searchParams.year)) || now.getFullYear();
  const business = bizOptions.includes(one(searchParams.business)) ? one(searchParams.business) : bizOptions[0];
  const [targets, reps, sales] = await Promise.all([
    prisma.target.findMany({ where: { year, business } }),
    prisma.user.findMany({ where: { business, role: "SALES", active: true }, orderBy: { name: "asc" } }),
    loadYearSales(me, year),
  ]);
  const bizSales = sales.filter((s) => s.business === business);
  const tOf = (userId: string | null) => Array.from({ length: 12 }, (_, i) => targets.find((t) => t.userId === userId && t.month === i + 1)?.amountKrw ?? 0);
  const rows: TargetRow[] = [
    { userId: null, name: `${BUSINESS_LABEL[business]} 사업부`, sub: "사업부 목표", targets: tOf(null), actuals: byMonth(bizSales) },
    ...reps.map((u) => ({ userId: u.id, name: u.name, sub: u.title || ROLE_LABEL[u.role], targets: tOf(u.id), actuals: byMonth(bizSales.filter((s) => isMine(s, u))) })),
  ];
  const currentMonth = year < now.getFullYear() ? 12 : year > now.getFullYear() ? 12 : now.getMonth() + 1;
  const years = [now.getFullYear() - 1, now.getFullYear(), now.getFullYear() + 1];
  const href = (y: number, b: string) => `/targets?year=${y}&business=${b}`;

  return (
    <>
      <PageHeader title="목표" description="사업부·담당자별 월 목표를 입력하면 달성률이 자동 계산됩니다. (담당자 실적 = 본인 담당 고객의 매출)">
        <ExportButton
          fileName={`목표_${year}_${BUSINESS_LABEL[business]}`}
          rows={rows.flatMap((r) => r.targets.map((t, i) => ({ 연도: year, 월: i + 1, 사업: BUSINESS_LABEL[business], 구분: r.name, "목표(원)": Math.round(t), "실적(원)": Math.round(r.actuals[i]), "달성률(%)": t ? Math.round((r.actuals[i] / t) * 1000) / 10 : null })))}
        />
      </PageHeader>
      <div className="mb-3 flex flex-wrap items-center gap-4">
        <div className="flex rounded-md border bg-white p-0.5">
          {years.map((y) => <Link key={y} href={href(y, business)} className={cn("rounded px-3 py-1 text-xs", y === year && "bg-primary text-white")}>{y}년</Link>)}
        </div>
        <div className="flex gap-1.5">
          {bizOptions.map((b) => (
            <Link key={b} href={href(year, b)} className="rounded-full border px-3 py-1 text-xs font-medium" style={business === b ? { background: BUSINESS_COLOR[b], borderColor: BUSINESS_COLOR[b], color: "#fff" } : { background: "#fff", color: BUSINESS_COLOR[b] }}>{BUSINESS_LABEL[b]}</Link>
          ))}
        </div>
      </div>
      <Card>
        <TargetGrid key={`${year}-${business}`} year={year} business={business} rows={rows} editable={canSetTargets(me, business)} color={BUSINESS_COLOR[business]} currentMonth={currentMonth} />
      </Card>
    </>
  );
}
