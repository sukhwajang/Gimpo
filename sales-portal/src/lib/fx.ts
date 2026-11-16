import { prisma } from "./prisma";

export type RateTable = {
  /** 해당 월 환율. 없으면 그 이전 가장 가까운 월, 그것도 없으면 가장 오래된 환율 */
  rate(currency: string, date: Date): number;
  latest(currency: string): number;
  toKrw(amount: number, currency: string, date?: Date): number;
};

export async function loadRates(): Promise<RateTable> {
  const rows = await prisma.exchangeRate.findMany({ orderBy: [{ year: "asc" }, { month: "asc" }] });
  const byCur = new Map<string, { ym: number; rate: number }[]>();
  for (const r of rows) {
    if (!byCur.has(r.currency)) byCur.set(r.currency, []);
    byCur.get(r.currency)!.push({ ym: r.year * 100 + r.month, rate: r.rate });
  }
  const rate = (currency: string, date: Date) => {
    if (currency === "KRW") return 1;
    const list = byCur.get(currency);
    if (!list || list.length === 0) return 0;
    const ym = date.getFullYear() * 100 + date.getMonth() + 1;
    let found = list[0].rate;
    for (const x of list) {
      if (x.ym <= ym) found = x.rate;
      else break;
    }
    return found;
  };
  const latest = (currency: string) => rate(currency, new Date());
  return { rate, latest, toKrw: (amount, currency, date) => amount * rate(currency, date ?? new Date()) };
}
