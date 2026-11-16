import Link from "next/link";
import { ClickChart } from "@/components/charts";
import { Empty, KpiCard, PageHeader, ProgressBar } from "@/components/page-header";
import { BusinessBadge, StageBadge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { BUSINESS_COLOR, BUSINESS_LABEL, LOST_REASONS, LOST_REASON_LABEL, ROLE_LABEL } from "@/lib/constants";
import { daysBetween, fmtDate, fmtKrw, fmtMoney, pct } from "@/lib/format";
import { loadRates } from "@/lib/fx";
import { staleDate, weekRange } from "@/lib/opp-data";
import { byMonth, isMine, loadYearSales, sum } from "@/lib/perf";
import { isSales, oppScope, visibleBusinesses } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { requireUser, type SessionUser } from "@/lib/session";
import { cn } from "@/lib/utils";

const ymd = (d: Date) => fmtDate(d);
const monthRange = (year: number, m: number) => ({ from: ymd(new Date(year, m, 1)), to: ymd(new Date(year, m + 1, 0)) });
const rateColor = (r: number) => (r >= 100 ? "text-emerald-600" : r < 80 ? "text-red-600" : "");

export default async function DashboardPage() {
  const me = await requireUser();
  return isSales(me) ? <SalesDashboard me={me} /> : <ManagerDashboard me={me} />;
}

/* ───────────── 영업담당 ───────────── */
async function SalesDashboard({ me }: { me: SessionUser }) {
  const now = new Date();
  const year = now.getFullYear(), month = now.getMonth();
  const today = new Date(year, month, now.getDate());
  const [sales, targets, opps, rates] = await Promise.all([
    loadYearSales(me, year),
    prisma.target.findMany({ where: { year, userId: me.id } }),
    prisma.opportunity.findMany({ where: { ownerId: me.id, stage: { type: "OPEN" } }, include: { stage: true, customer: { select: { name: true } } }, orderBy: { nextActionDue: "asc" } }),
    loadRates(),
  ]);
  const mine = sales.filter((s) => isMine(s, me));
  const actualM = byMonth(mine);
  const targetM = Array.from({ length: 12 }, (_, i) => targets.find((t) => t.month === i + 1)?.amountKrw ?? 0);
  const ytdActual = sum(actualM.slice(0, month + 1), (x) => x);
  const ytdTarget = sum(targetM.slice(0, month + 1), (x) => x);
  const annualTarget = sum(targetM, (x) => x);
  const rate = pct(ytdActual, ytdTarget);
  const withKrw = opps.map((o) => ({ ...o, krw: rates.toKrw(o.amount, o.currency) }));
  const pipeline = sum(withKrw, (o) => o.krw);
  const weighted = sum(withKrw, (o) => (o.krw * o.stage.probability) / 100);
  const { end } = weekRange();
  const todo = withKrw.filter((o) => o.nextActionDue && o.nextActionDue < end);
  const staleAt = staleDate();
  const stale = withKrw.filter((o) => o.lastActivityAt < staleAt).sort((a, b) => a.lastActivityAt.getTime() - b.lastActivityAt.getTime());
  const color = BUSINESS_COLOR[me.business ?? "CHEM"];
  const stages = await prisma.stage.findMany({ where: { business: me.business ?? "", type: "OPEN" }, orderBy: { order: "asc" } });

  return (
    <>
      <PageHeader title={`${me.name}님의 대시보드`} description={`${year}년 ${month + 1}월 기준 · ${BUSINESS_LABEL[me.business ?? ""] ?? ""} ${ROLE_LABEL[me.role]}`} />
      <div className="mb-4 grid grid-cols-2 gap-3 xl:grid-cols-4">
        <KpiCard
          label={`내 달성률 (1~${month + 1}월 누적)`} accent={color} href={`/performance?owner=${me.id}`}
          value={<span className={rateColor(rate)}>{ytdTarget ? `${rate.toFixed(1)}%` : "-"}</span>}
          sub={<><ProgressBar value={rate} color={color} /><div className="mt-1">실적 {fmtKrw(ytdActual)} / 목표 {fmtKrw(ytdTarget)} (연간 {fmtKrw(annualTarget)})</div></>}
        />
        <KpiCard label="내 파이프라인 금액" value={`${fmtKrw(pipeline)}원`} sub={`진행 ${opps.length}건 · 가중 예상 ${fmtKrw(weighted)}원`} href={`/opportunities?view=list&status=open&owner=${me.id}`} />
        <KpiCard label="이번 주 할 일" value={`${todo.length}건`} sub={`기한 경과 ${todo.filter((o) => o.nextActionDue! < today).length}건 포함`} href={`/opportunities?view=list&due=week&owner=${me.id}`} />
        <KpiCard label="30일 이상 업데이트 없는 기회" value={<span className={stale.length ? "text-amber-600" : ""}>{stale.length}건</span>} sub="활동 기록·단계 변경이 없는 진행 건" href={`/opportunities?view=list&stale=1&owner=${me.id}`} />
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <Card>
          <CardHeader><CardTitle>내 월별 실적 vs 목표</CardTitle><span className="text-xs text-muted-foreground">막대를 클릭하면 해당 월 실적 목록으로 이동</span></CardHeader>
          <CardContent>
            <ClickChart
              xKey="label"
              data={actualM.map((a, i) => ({ label: `${i + 1}월`, actual: Math.round(a), target: targetM[i], href: `/performance?owner=${me.id}&from=${monthRange(year, i).from}&to=${monthRange(year, i).to}` }))}
              series={[{ key: "actual", name: "실적", color }, { key: "target", name: "목표", color: "#94a3b8", type: "line" }]}
            />
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>내 단계별 파이프라인</CardTitle><span className="text-xs text-muted-foreground">클릭하면 해당 단계 목록으로 이동</span></CardHeader>
          <CardContent>
            <ClickChart
              xKey="name" layout="vertical"
              data={stages.map((s) => {
                const list = withKrw.filter((o) => o.stageId === s.id);
                const amount = sum(list, (o) => o.krw);
                return { name: `${s.name} (${list.length})`, amount: Math.round(amount), weighted: Math.round((amount * s.probability) / 100), href: `/opportunities?view=list&business=${s.business}&stage=${s.id}&owner=${me.id}` };
              })}
              series={[{ key: "amount", name: "예상 금액", color }, { key: "weighted", name: "가중 금액", color: "#cbd5e1" }]}
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>이번 주 할 일 <span className="text-xs font-normal text-muted-foreground">다음 액션 기한 기준</span></CardTitle><Link className="text-xs text-primary hover:underline" href={`/opportunities?view=list&due=week&owner=${me.id}`}>전체 보기</Link></CardHeader>
          <CardContent className="px-0 pb-2">
            {todo.length === 0 ? <Empty>이번 주에 기한이 도래하는 액션이 없습니다.</Empty> : (
              <Table>
                <THead><tr><TH>기한</TH><TH>다음 액션</TH><TH>기회</TH><TH>단계</TH></tr></THead>
                <TBody>
                  {todo.map((o) => {
                    const late = o.nextActionDue! < today;
                    return (
                      <TR key={o.id}>
                        <TD className={cn("tabular whitespace-nowrap", late && "font-semibold text-red-600")}>{fmtDate(o.nextActionDue).slice(5)}{late && " 경과"}</TD>
                        <TD className="font-medium">{o.nextAction || "-"}</TD>
                        <TD><Link href={`/opportunities/${o.id}`} className="text-primary hover:underline">{o.title}</Link><div className="text-xs text-muted-foreground">{o.customer.name}</div></TD>
                        <TD><StageBadge name={o.stage.name} type={o.stage.type} /></TD>
                      </TR>
                    );
                  })}
                </TBody>
              </Table>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>30일 이상 업데이트 없는 기회</CardTitle><Link className="text-xs text-primary hover:underline" href={`/opportunities?view=list&stale=1&owner=${me.id}`}>전체 보기</Link></CardHeader>
          <CardContent className="px-0 pb-2">
            {stale.length === 0 ? <Empty>정체된 기회가 없습니다.</Empty> : (
              <Table>
                <THead><tr><TH>기회</TH><TH>단계</TH><TH className="text-right">예상 금액</TH><TH className="text-right">최근 활동</TH></tr></THead>
                <TBody>
                  {stale.map((o) => (
                    <TR key={o.id}>
                      <TD><Link href={`/opportunities/${o.id}`} className="text-primary hover:underline">{o.title}</Link><div className="text-xs text-muted-foreground">{o.customer.name}</div></TD>
                      <TD><StageBadge name={o.stage.name} type={o.stage.type} /></TD>
                      <TD className="tabular whitespace-nowrap text-right">{fmtMoney(o.amount, o.currency)}</TD>
                      <TD className="tabular whitespace-nowrap text-right font-medium text-amber-600">{daysBetween(o.lastActivityAt, now)}일 전</TD>
                    </TR>
                  ))}
                </TBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>
    </>
  );
}

/* ───────────── 사업부장 / 경영진 / 관리자 ───────────── */
async function ManagerDashboard({ me }: { me: SessionUser }) {
  const now = new Date();
  const year = now.getFullYear(), month = now.getMonth();
  const biz = visibleBusinesses(me);
  const single = biz.length === 1;
  const yearStart = new Date(year, 0, 1);
  const [sales, targets, opps, stages, rates, reps] = await Promise.all([
    loadYearSales(me, year),
    prisma.target.findMany({ where: { year, business: { in: biz } } }),
    prisma.opportunity.findMany({ where: { ...oppScope(me), OR: [{ stage: { type: "OPEN" } }, { closedAt: { gte: yearStart } }] }, include: { stage: true } }),
    prisma.stage.findMany({ where: { business: { in: biz }, type: "OPEN" }, orderBy: [{ business: "asc" }, { order: "asc" }] }),
    loadRates(),
    prisma.user.findMany({ where: { role: "SALES", active: true, business: { in: biz } }, orderBy: { name: "asc" } }),
  ]);
  const bizTargets = targets.filter((t) => !t.userId);
  const ytd = (list: { month: number; amountKrw: number }[]) => sum(list.filter((t) => t.month <= month + 1), (t) => t.amountKrw);
  const perBiz = biz.map((b) => {
    const s = sales.filter((x) => x.business === b);
    const t = bizTargets.filter((x) => x.business === b);
    const actual = sum(s, (x) => x.amountKrw);
    return { b, actual, target: ytd(t), annual: sum(t, (x) => x.amountKrw), monthly: byMonth(s), monthlyTarget: Array.from({ length: 12 }, (_, i) => sum(t.filter((x) => x.month === i + 1), (x) => x.amountKrw)) };
  });
  const totalActual = sum(perBiz, (x) => x.actual), totalTarget = sum(perBiz, (x) => x.target), totalAnnual = sum(perBiz, (x) => x.annual);
  const rate = pct(totalActual, totalTarget);
  const withKrw = opps.map((o) => ({ ...o, krw: rates.toKrw(o.amount, o.currency) }));
  const open = withKrw.filter((o) => o.stage.type === "OPEN");
  const pipeline = sum(open, (o) => o.krw);
  const weighted = sum(open, (o) => (o.krw * o.stage.probability) / 100);
  const won = withKrw.filter((o) => o.stage.type === "WON");
  const lost = withKrw.filter((o) => o.stage.type === "LOST");
  const winRate = pct(won.length, won.length + lost.length);
  const staleCount = open.filter((o) => o.lastActivityAt < staleDate()).length;
  const bq = single ? `&business=${biz[0]}` : "";

  // 고객 Top 10
  const custMap = new Map<string, { name: string; amount: number; business: Record<string, number> }>();
  for (const s of sales) {
    if (!s.customerId) continue;
    const c = custMap.get(s.customerId) ?? { name: s.customerName, amount: 0, business: {} };
    c.amount += s.amountKrw;
    c.business[s.business] = (c.business[s.business] ?? 0) + s.amountKrw;
    custMap.set(s.customerId, c);
  }
  const top10 = [...custMap.entries()].sort((a, b) => b[1].amount - a[1].amount).slice(0, 10);
  // 담당자별 달성률
  const repRows = reps.map((u) => {
    const actual = sum(sales.filter((s) => isMine(s, u)), (s) => s.amountKrw);
    const target = ytd(targets.filter((t) => t.userId === u.id));
    const mine = open.filter((o) => o.ownerId === u.id);
    return { u, actual, target, rate: pct(actual, target), pipeline: sum(mine, (o) => o.krw), count: mine.length };
  }).sort((a, b) => b.rate - a.rate);

  return (
    <>
      <PageHeader title={single ? `${BUSINESS_LABEL[biz[0]]} 사업부 대시보드` : "전사 영업 대시보드"} description={`${year}년 ${month + 1}월 기준 · 누적은 1~${month + 1}월 · 차트를 클릭하면 해당 목록으로 이동합니다.`} />
      <div className="mb-4 grid grid-cols-2 gap-3 xl:grid-cols-5">
        <KpiCard label={`누적 실적 (${year})`} value={`${fmtKrw(totalActual)}원`} sub={`연간 목표 ${fmtKrw(totalAnnual)}원`} href={`/performance?${bq.slice(1)}`} accent={single ? BUSINESS_COLOR[biz[0]] : undefined} />
        <KpiCard label="목표 달성률 (누적)" value={<span className={rateColor(rate)}>{totalTarget ? `${rate.toFixed(1)}%` : "-"}</span>} sub={<><ProgressBar value={rate} color={single ? BUSINESS_COLOR[biz[0]] : undefined} /><div className="mt-1">누적 목표 {fmtKrw(totalTarget)}원</div></>} href={`/targets?year=${year}${bq}`} />
        <KpiCard label="진행 파이프라인" value={`${fmtKrw(pipeline)}원`} sub={`${open.length}건 · 30일+ 정체 ${staleCount}건`} href={`/opportunities?view=list&status=open${bq}`} />
        <KpiCard label="가중 예상 매출" value={`${fmtKrw(weighted)}원`} sub="예상 금액 × 단계별 성공확률" href={`/opportunities?view=list&status=open${bq}`} />
        <KpiCard label={`수주율 (${year} 종료 건)`} value={won.length + lost.length ? `${winRate.toFixed(0)}%` : "-"} sub={`수주 ${won.length}건 ${fmtKrw(sum(won, (o) => o.krw))}원 · 실패 ${lost.length}건`} href={`/opportunities?view=list&status=won&closedFrom=${year}-01-01${bq}`} />
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <Card>
          <CardHeader><CardTitle>{single ? "담당자별 실적 vs 목표 (누적)" : "사업별 실적 vs 목표 (누적)"}</CardTitle></CardHeader>
          <CardContent>
            {single ? (
              <ClickChart
                xKey="name" height={280}
                data={repRows.map((r) => ({ name: r.u.name, actual: Math.round(r.actual), target: Math.round(r.target), href: `/performance?owner=${r.u.id}` }))}
                series={[{ key: "actual", name: "실적", color: BUSINESS_COLOR[biz[0]] }, { key: "target", name: "목표", color: "#cbd5e1" }]}
              />
            ) : (
              <>
                <ClickChart
                  xKey="name" colorKey="color" height={200}
                  data={perBiz.map((x) => ({ name: BUSINESS_LABEL[x.b], actual: Math.round(x.actual), target: Math.round(x.target), color: BUSINESS_COLOR[x.b], href: `/performance?business=${x.b}` }))}
                  series={[{ key: "actual", name: "실적", color: "#334155" }, { key: "target", name: "목표", color: "#94a3b8", type: "line" }]}
                />
                <div className="mt-2 grid grid-cols-3 gap-2">
                  {perBiz.map((x) => {
                    const r = pct(x.actual, x.target);
                    return (
                      <Link key={x.b} href={`/performance?business=${x.b}`} className="rounded-md border p-2 hover:bg-slate-50">
                        <div className="flex items-center justify-between text-xs"><BusinessBadge business={x.b} /><b className={cn("tabular", rateColor(r))}>{r.toFixed(1)}%</b></div>
                        <div className="mt-1.5"><ProgressBar value={r} color={BUSINESS_COLOR[x.b]} /></div>
                        <div className="tabular mt-1 text-[11px] text-muted-foreground">{fmtKrw(x.actual)} / {fmtKrw(x.target)}</div>
                      </Link>
                    );
                  })}
                </div>
              </>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>월별 실적 추이</CardTitle><span className="text-xs text-muted-foreground">점선: 월 목표</span></CardHeader>
          <CardContent>
            <ClickChart
              xKey="label" height={280}
              data={Array.from({ length: 12 }, (_, i) => {
                const r = monthRange(year, i);
                const row: Record<string, string | number> = { label: `${i + 1}월`, target: sum(perBiz, (x) => x.monthlyTarget[i]) };
                for (const x of perBiz) { row[x.b] = Math.round(x.monthly[i]); row[`href_${x.b}`] = `/performance?business=${x.b}&from=${r.from}&to=${r.to}`; }
                return row;
              })}
              series={[...perBiz.map((x) => ({ key: x.b, name: BUSINESS_LABEL[x.b], color: BUSINESS_COLOR[x.b], stack: "s" })), { key: "target", name: "목표", color: "#475569", type: "line" as const }]}
            />
          </CardContent>
        </Card>

        <Card className="xl:col-span-2">
          <CardHeader><CardTitle>단계별 파이프라인 금액 · 성공확률 가중 예상 매출</CardTitle><span className="text-xs text-muted-foreground">막대를 클릭하면 해당 단계의 기회 목록으로 이동</span></CardHeader>
          <CardContent>
            <div className={cn("grid gap-4", !single && "lg:grid-cols-3")}>
              {biz.map((b) => {
                const list = open.filter((o) => o.business === b);
                const amt = sum(list, (o) => o.krw), w = sum(list, (o) => (o.krw * o.stage.probability) / 100);
                return (
                  <div key={b}>
                    <div className="mb-1 flex items-center justify-between text-xs"><BusinessBadge business={b} /><span className="tabular text-muted-foreground">{list.length}건 · {fmtKrw(amt)} → 가중 <b className="text-foreground">{fmtKrw(w)}</b></span></div>
                    <ClickChart
                      xKey="name" layout="vertical" height={stages.filter((s) => s.business === b).length * 44 + 50} yWidth={128}
                      data={stages.filter((s) => s.business === b).map((s) => {
                        const inStage = list.filter((o) => o.stageId === s.id);
                        const a = sum(inStage, (o) => o.krw);
                        return { name: `${s.name} ${s.probability}% (${inStage.length})`, amount: Math.round(a), weighted: Math.round((a * s.probability) / 100), href: `/opportunities?view=list&business=${b}&stage=${s.id}` };
                      })}
                      series={[{ key: "amount", name: "예상 금액", color: BUSINESS_COLOR[b] }, { key: "weighted", name: "가중 금액", color: "#cbd5e1" }]}
                    />
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>고객 Top 10 ({year} 누적 매출)</CardTitle></CardHeader>
          <CardContent>
            {top10.length === 0 ? <Empty /> : (
              <ClickChart
                xKey="name" layout="vertical" height={340} yWidth={170} colorKey="color"
                data={top10.map(([id, c]) => {
                  const main = Object.entries(c.business).sort((a, b) => b[1] - a[1])[0][0];
                  return { name: c.name.length > 16 ? `${c.name.slice(0, 15)}…` : c.name, amount: Math.round(c.amount), color: BUSINESS_COLOR[main], href: `/performance?customer=${id}` };
                })}
                series={[{ key: "amount", name: "매출", color: "#334155" }]}
              />
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>실패 사유 분석 ({year} 종료 건)</CardTitle><span className="text-xs text-muted-foreground">총 {lost.length}건 · {fmtKrw(sum(lost, (o) => o.krw))}원</span></CardHeader>
          <CardContent>
            {lost.length === 0 ? <Empty>올해 실패 처리된 기회가 없습니다.</Empty> : (
              <>
                <ClickChart
                  xKey="name" layout="vertical" height={220} yWidth={90}
                  data={LOST_REASONS.map((r) => {
                    const list = lost.filter((o) => o.lostReason === r);
                    const row: Record<string, string | number> = { name: `${LOST_REASON_LABEL[r]} (${list.length})` };
                    for (const b of biz) { row[b] = Math.round(sum(list.filter((o) => o.business === b), (o) => o.krw)); row[`href_${b}`] = `/opportunities?view=list&status=lost&lostReason=${r}&business=${b}`; }
                    return row;
                  })}
                  series={biz.map((b) => ({ key: b, name: BUSINESS_LABEL[b], color: BUSINESS_COLOR[b], stack: "s" }))}
                />
                <div className="mt-2 flex flex-wrap gap-2">
                  {LOST_REASONS.map((r) => {
                    const n = lost.filter((o) => o.lostReason === r).length;
                    return <Link key={r} href={`/opportunities?view=list&status=lost&lostReason=${r}${bq}`} className="rounded-full border px-2.5 py-0.5 text-xs hover:bg-slate-50">{LOST_REASON_LABEL[r]} <b className="tabular">{n}건</b> ({pct(n, lost.length).toFixed(0)}%)</Link>;
                  })}
                </div>
              </>
            )}
          </CardContent>
        </Card>

        <Card className="xl:col-span-2">
          <CardHeader><CardTitle>담당자별 현황</CardTitle></CardHeader>
          <CardContent className="px-0 pb-2">
            <Table>
              <THead><tr><TH>담당자</TH><TH>사업</TH><TH className="text-right">누적 실적</TH><TH className="text-right">누적 목표</TH><TH className="w-52">달성률</TH><TH className="text-right">진행 기회</TH><TH className="text-right">파이프라인</TH></tr></THead>
              <TBody>
                {repRows.map((r) => (
                  <TR key={r.u.id}>
                    <TD><Link href={`/opportunities?view=list&status=open&owner=${r.u.id}&business=${r.u.business}`} className="font-medium hover:underline">{r.u.name}</Link> <span className="text-xs text-muted-foreground">{r.u.title}</span></TD>
                    <TD><BusinessBadge business={r.u.business ?? ""} /></TD>
                    <TD className="tabular text-right"><Link href={`/performance?owner=${r.u.id}`} className="hover:underline">{fmtKrw(r.actual)}</Link></TD>
                    <TD className="tabular text-right">{fmtKrw(r.target)}</TD>
                    <TD><div className="flex items-center gap-2"><ProgressBar value={r.rate} color={BUSINESS_COLOR[r.u.business ?? "CHEM"]} /><span className={cn("tabular w-14 text-right text-xs font-semibold", rateColor(r.rate))}>{r.target ? `${r.rate.toFixed(0)}%` : "-"}</span></div></TD>
                    <TD className="tabular text-right">{r.count}</TD>
                    <TD className="tabular text-right">{fmtKrw(r.pipeline)}</TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          </CardContent>
        </Card>
      </div>
    </>
  );
}
