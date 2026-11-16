import { loadRates } from "./fx";
import { prisma } from "./prisma";

export type RawRow = {
  line: number; // 엑셀 행 번호
  saleDate: string; business: string; customerCode: string; customerName: string; productCode: string; productName: string;
  quantity: string; unit: string; amount: string; currency: string;
};
export type CheckedRow = RawRow & { status: "OK" | "WARN" | "ERROR"; messages: string[]; amountKrw: number | null; normBusiness: string | null };
export type ImportReport = {
  rows: CheckedRow[];
  summary: { total: number; ok: number; warn: number; error: number; missing: number; unknownCustomer: number; duplicate: number; other: number; totalKrw: number };
};

const BIZ_MAP: Record<string, string> = { 케미컬: "CHEM", 케미칼: "CHEM", CHEM: "CHEM", CHEMICAL: "CHEM", API: "API", 원료의약품: "API", CDMO: "CDMO" };
const LABELS: [keyof RawRow, string][] = [["saleDate", "매출일자"], ["business", "사업구분"], ["customerCode", "고객코드"], ["customerName", "고객명"], ["productCode", "제품코드"], ["productName", "제품명"], ["quantity", "수량"], ["unit", "단위"], ["amount", "금액"], ["currency", "통화"]];

export function parseYmd(s: string): Date | null {
  const m = /^(\d{4})[-./]?(\d{1,2})[-./]?(\d{1,2})$/.exec(s.trim());
  if (!m) return null;
  const y = Number(m[1]), mo = Number(m[2]), d = Number(m[3]);
  const dt = new Date(y, mo - 1, d, 12);
  if (dt.getFullYear() !== y || dt.getMonth() !== mo - 1 || dt.getDate() !== d) return null;
  return dt;
}
const toNum = (s: string) => (s.trim() === "" ? NaN : Number(s.replace(/,/g, "")));
const ymd = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const keyOf = (date: string, cc: string, pc: string, qty: number, amt: number, cur: string) => `${date}|${cc}|${pc}|${qty}|${amt}|${cur}`;

/** 업로드 행 검증: 필수값 누락, 형식 오류, 미등록 고객코드, 중복(파일 내 / 기존 실적) */
export async function validateRows(input: RawRow[]): Promise<ImportReport & { customerIds: Map<string, string> }> {
  const [customers, products, rates] = await Promise.all([
    prisma.customer.findMany({ select: { id: true, code: true } }),
    prisma.product.findMany({ select: { code: true } }),
    loadRates(),
  ]);
  const customerIds = new Map(customers.map((c) => [c.code, c.id]));
  const productCodes = new Set(products.map((p) => p.code));

  const dates = input.map((r) => parseYmd(String(r.saleDate ?? ""))).filter((d): d is Date => !!d);
  const existing = new Set<string>();
  if (dates.length) {
    const min = new Date(Math.min(...dates.map((d) => d.getTime())) - 86400000);
    const max = new Date(Math.max(...dates.map((d) => d.getTime())) + 86400000);
    const recs = await prisma.salesRecord.findMany({ where: { saleDate: { gte: min, lte: max } }, select: { saleDate: true, customerCode: true, productCode: true, quantity: true, amount: true, currency: true } });
    for (const r of recs) existing.add(keyOf(ymd(r.saleDate), r.customerCode, r.productCode, r.quantity, r.amount, r.currency));
  }

  const seen = new Map<string, number>();
  const summary = { total: input.length, ok: 0, warn: 0, error: 0, missing: 0, unknownCustomer: 0, duplicate: 0, other: 0, totalKrw: 0 };
  const rows: CheckedRow[] = input.map((raw) => {
    const r: RawRow = { ...raw };
    for (const [k] of LABELS) (r as Record<string, unknown>)[k] = String(r[k] ?? "").trim();
    r.customerCode = r.customerCode.toUpperCase();
    r.productCode = r.productCode.toUpperCase();
    r.currency = r.currency.toUpperCase();
    const errors: string[] = [];
    const warns: string[] = [];
    let kind: "missing" | "unknownCustomer" | "duplicate" | "other" | null = null;

    const missing = LABELS.filter(([k]) => r[k] === "").map(([, label]) => label);
    if (missing.length) { errors.push(`필수값 누락: ${missing.join(", ")}`); kind = "missing"; }

    const date = r.saleDate ? parseYmd(r.saleDate) : null;
    if (r.saleDate && !date) { errors.push(`매출일자 형식 오류: ${r.saleDate}`); kind ??= "other"; }
    const normBusiness = BIZ_MAP[r.business.toUpperCase()] ?? BIZ_MAP[r.business] ?? null;
    if (r.business && !normBusiness) { errors.push(`사업구분 오류: ${r.business} (케미컬/API/CDMO)`); kind ??= "other"; }
    const qty = toNum(r.quantity), amt = toNum(r.amount);
    if (r.quantity && !Number.isFinite(qty)) { errors.push(`수량이 숫자가 아님: ${r.quantity}`); kind ??= "other"; }
    if (r.amount && !Number.isFinite(amt)) { errors.push(`금액이 숫자가 아님: ${r.amount}`); kind ??= "other"; }
    if (r.currency && !["KRW", "USD", "EUR"].includes(r.currency)) { errors.push(`지원하지 않는 통화: ${r.currency}`); kind ??= "other"; }
    if (r.customerCode && !customerIds.has(r.customerCode)) { errors.push(`미등록 고객코드: ${r.customerCode}`); kind ??= "unknownCustomer"; }
    if (r.productCode && !productCodes.has(r.productCode)) warns.push(`제품 마스터에 없는 제품코드: ${r.productCode}`);

    let amountKrw: number | null = null;
    if (errors.length === 0 && date) {
      const key = keyOf(ymd(date), r.customerCode, r.productCode, qty, amt, r.currency);
      if (seen.has(key)) { errors.push(`파일 내 중복 행 (${seen.get(key)}행과 동일)`); kind = "duplicate"; }
      else if (existing.has(key)) { errors.push("이미 업로드된 실적과 중복"); kind = "duplicate"; }
      else {
        seen.set(key, r.line);
        const rate = rates.rate(r.currency, date);
        if (!rate) { errors.push(`${r.currency} 환율이 등록되어 있지 않음`); kind = "other"; }
        else amountKrw = Math.round(amt * rate);
      }
    }
    const status = errors.length ? "ERROR" : warns.length ? "WARN" : "OK";
    if (status === "ERROR") { summary.error++; if (kind) summary[kind]++; }
    else { if (status === "WARN") summary.warn++; else summary.ok++; summary.totalKrw += amountKrw ?? 0; }
    return { ...r, saleDate: date ? ymd(date) : r.saleDate, status, messages: [...errors, ...warns], amountKrw, normBusiness };
  });
  return { rows, summary, customerIds };
}
