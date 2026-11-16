export function fmtNum(n: number, digits = 0) {
  return n.toLocaleString("ko-KR", { maximumFractionDigits: digits, minimumFractionDigits: 0 });
}

/** 원화 금액을 억/백만 단위로 축약 */
export function fmtKrw(n: number) {
  const abs = Math.abs(n);
  if (abs >= 1e12) return `${fmtNum(n / 1e12, 2)}조`;
  if (abs >= 1e8) return `${fmtNum(n / 1e8, 1)}억`;
  if (abs >= 1e4) return `${fmtNum(n / 1e4)}만`;
  return fmtNum(n);
}

export function fmtMoney(n: number, currency: string) {
  if (currency === "KRW") return `₩${fmtNum(n)}`;
  if (currency === "USD") return `$${fmtNum(n)}`;
  if (currency === "EUR") return `€${fmtNum(n)}`;
  return `${fmtNum(n)} ${currency}`;
}

const pad = (n: number) => String(n).padStart(2, "0");

export function fmtDate(d: Date | string | null | undefined) {
  if (!d) return "-";
  const x = typeof d === "string" ? new Date(d) : d;
  return `${x.getFullYear()}-${pad(x.getMonth() + 1)}-${pad(x.getDate())}`;
}

export function fmtDateTime(d: Date | string | null | undefined) {
  if (!d) return "-";
  const x = typeof d === "string" ? new Date(d) : d;
  return `${fmtDate(x)} ${pad(x.getHours())}:${pad(x.getMinutes())}`;
}

export function pct(a: number, b: number) {
  if (!b) return 0;
  return (a / b) * 100;
}

export function daysBetween(a: Date, b: Date) {
  return Math.floor((b.getTime() - a.getTime()) / 86400000);
}

/** 폼 입력(yyyy-mm-dd) → Date | null */
export function parseDate(v: FormDataEntryValue | string | null | undefined): Date | null {
  if (!v || typeof v !== "string") return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(v.trim());
  if (!m) return null;
  return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 12, 0, 0);
}
