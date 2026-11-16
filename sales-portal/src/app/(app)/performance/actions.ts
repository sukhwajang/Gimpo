"use server";
import { revalidatePath } from "next/cache";
import { audit } from "@/lib/audit";
import { fail, ok, str } from "@/lib/form";
import { canSetTargets, isAdmin } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { parseYmd, validateRows, type ImportReport, type RawRow } from "@/lib/sales-import";
import { requireUser } from "@/lib/session";

const MAX_ROWS = 20000;

/** 1단계: 미리보기용 검증 (저장하지 않음) */
export async function previewSales(rows: RawRow[]): Promise<{ ok: boolean; error?: string; report?: ImportReport }> {
  const me = await requireUser();
  if (!isAdmin(me)) return { ok: false, error: "실적 업로드 권한이 없습니다." };
  if (!Array.isArray(rows) || rows.length === 0) return { ok: false, error: "데이터 행이 없습니다." };
  if (rows.length > MAX_ROWS) return { ok: false, error: `한 번에 ${MAX_ROWS.toLocaleString()}행까지 업로드할 수 있습니다.` };
  const { rows: checked, summary } = await validateRows(rows);
  return { ok: true, report: { rows: checked, summary } };
}

/** 2단계: 서버에서 다시 검증한 뒤 정상 행만 저장 */
export async function importSales(fileName: string, rows: RawRow[]): Promise<{ ok: boolean; error?: string; saved?: number; skipped?: number }> {
  const me = await requireUser();
  if (!isAdmin(me)) return { ok: false, error: "실적 업로드 권한이 없습니다." };
  if (!Array.isArray(rows) || rows.length === 0 || rows.length > MAX_ROWS) return { ok: false, error: "업로드할 데이터가 올바르지 않습니다." };
  const { rows: checked, summary, customerIds } = await validateRows(rows);
  const good = checked.filter((r) => r.status !== "ERROR");
  if (good.length === 0) return { ok: false, error: "저장할 수 있는 정상 행이 없습니다." };
  const name = String(fileName || "upload.xlsx").slice(0, 200);
  const batch = await prisma.$transaction(async (tx) => {
    const b = await tx.uploadBatch.create({ data: { fileName: name, uploadedById: me.id, totalRows: summary.total, savedRows: good.length, errorRows: summary.error } });
    await tx.salesRecord.createMany({
      data: good.map((r) => ({
        saleDate: parseYmd(r.saleDate)!, business: r.normBusiness!, customerCode: r.customerCode, customerName: r.customerName, customerId: customerIds.get(r.customerCode) ?? null,
        productCode: r.productCode, productName: r.productName, quantity: Number(r.quantity.replace(/,/g, "")), unit: r.unit, amount: Number(r.amount.replace(/,/g, "")), currency: r.currency, amountKrw: r.amountKrw!, uploadId: b.id,
      })),
    });
    return b;
  });
  await audit(me, "UPLOAD", "SalesRecord", batch.id, `실적 업로드: ${name} (저장 ${good.length}행, 오류 제외 ${summary.error}행)`);
  revalidatePath("/", "layout");
  return { ok: true, saved: good.length, skipped: summary.error };
}

export async function deleteBatch(fd: FormData) {
  const me = await requireUser();
  if (!isAdmin(me)) return fail("권한이 없습니다.");
  const b = await prisma.uploadBatch.findUnique({ where: { id: str(fd, "id") } });
  if (!b) return fail("업로드 이력을 찾을 수 없습니다.");
  await prisma.uploadBatch.delete({ where: { id: b.id } }); // 실적 행은 cascade 삭제
  await audit(me, "DELETE", "UploadBatch", b.id, `실적 업로드 취소: ${b.fileName} (${b.savedRows}행 삭제)`);
  revalidatePath("/", "layout");
  return ok();
}

/** 목표 저장: 해당 연도·사업부의 목표를 화면 내용으로 교체 */
export async function saveTargets(year: number, business: string, items: { userId: string | null; month: number; amountKrw: number }[]) {
  const me = await requireUser();
  if (!canSetTargets(me, business)) return fail("목표를 설정할 권한이 없습니다. (소속 사업부의 사업부장 이상)");
  if (!Number.isInteger(year) || year < 2000 || year > 2100) return fail("연도가 올바르지 않습니다.");
  const users = new Set((await prisma.user.findMany({ where: { business }, select: { id: true } })).map((u) => u.id));
  const clean = [];
  for (const it of items) {
    if (!Number.isInteger(it.month) || it.month < 1 || it.month > 12) return fail("월이 올바르지 않습니다.");
    if (!Number.isFinite(it.amountKrw) || it.amountKrw < 0) return fail("목표 금액은 0 이상의 숫자여야 합니다.");
    if (it.userId && !users.has(it.userId)) return fail("해당 사업부 소속이 아닌 사용자가 포함되어 있습니다.");
    if (it.amountKrw > 0) clean.push({ year, month: it.month, business, userId: it.userId, amountKrw: it.amountKrw });
  }
  await prisma.$transaction([prisma.target.deleteMany({ where: { year, business } }), prisma.target.createMany({ data: clean })]);
  await audit(me, "UPDATE", "Target", `${year}-${business}`, `목표 설정: ${year}년 ${business} (${clean.length}건)`);
  revalidatePath("/", "layout");
  return ok();
}
