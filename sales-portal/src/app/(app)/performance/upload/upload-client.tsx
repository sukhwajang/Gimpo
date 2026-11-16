"use client";
import * as React from "react";
import { useRouter } from "next/navigation";
import { AlertCircle, CheckCircle2, FileSpreadsheet, Upload } from "lucide-react";
import * as XLSX from "xlsx";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { SALES_COLUMNS } from "@/lib/constants";
import { fmtKrw, fmtNum } from "@/lib/format";
import type { ImportReport, RawRow } from "@/lib/sales-import";
import { cn } from "@/lib/utils";
import { importSales, previewSales } from "../actions";

const FIELD: Record<(typeof SALES_COLUMNS)[number], keyof RawRow> = {
  매출일자: "saleDate", 사업구분: "business", 고객코드: "customerCode", 고객명: "customerName", 제품코드: "productCode", 제품명: "productName", 수량: "quantity", 단위: "unit", 금액: "amount", 통화: "currency",
};

function cellToString(v: unknown, isDate: boolean): string {
  if (v == null) return "";
  if (v instanceof Date) {
    const d = new Date(v.getTime() + 3600000); // 날짜 셀의 초 단위 오차 보정
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  }
  if (isDate && typeof v === "number") {
    if (v > 19000101) return String(Math.round(v)); // 20260115 형태
    const d = XLSX.SSF.parse_date_code(v); // 엑셀 일련번호
    if (d) return `${d.y}-${String(d.m).padStart(2, "0")}-${String(d.d).padStart(2, "0")}`;
  }
  return String(v).trim();
}

async function parseFile(file: File): Promise<RawRow[]> {
  const wb = XLSX.read(await file.arrayBuffer(), { cellDates: true });
  const ws = wb.Sheets[wb.SheetNames[0]];
  if (!ws) throw new Error("시트를 찾을 수 없습니다.");
  const grid = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, raw: true, defval: "" });
  const header = (grid[0] ?? []).map((h) => String(h).trim());
  const missing = SALES_COLUMNS.filter((c) => !header.includes(c));
  if (missing.length) throw new Error(`필수 컬럼이 없습니다: ${missing.join(", ")}\n(첫 행에 ${SALES_COLUMNS.join(", ")} 컬럼이 있어야 합니다)`);
  const idx = Object.fromEntries(SALES_COLUMNS.map((c) => [c, header.indexOf(c)]));
  const rows: RawRow[] = [];
  grid.slice(1).forEach((r, i) => {
    if (!r || r.every((c) => String(c ?? "").trim() === "")) return; // 빈 행 무시
    const row = { line: i + 2 } as RawRow;
    for (const c of SALES_COLUMNS) (row as Record<string, unknown>)[FIELD[c]] = cellToString(r[idx[c]], c === "매출일자");
    rows.push(row);
  });
  return rows;
}

export function UploadClient() {
  const router = useRouter();
  const inputRef = React.useRef<HTMLInputElement>(null);
  const [fileName, setFileName] = React.useState("");
  const [raw, setRaw] = React.useState<RawRow[]>([]);
  const [report, setReport] = React.useState<ImportReport | null>(null);
  const [error, setError] = React.useState("");
  const [done, setDone] = React.useState<{ saved: number; skipped: number } | null>(null);
  const [filter, setFilter] = React.useState<"ALL" | "ERROR" | "OK">("ALL");
  const [pending, start] = React.useTransition();
  const [dragging, setDragging] = React.useState(false);

  const handleFile = (file: File | undefined) => {
    if (!file) return;
    setError(""); setReport(null); setDone(null); setFilter("ALL"); setFileName(file.name);
    start(async () => {
      try {
        const rows = await parseFile(file);
        if (rows.length === 0) throw new Error("데이터 행이 없습니다.");
        setRaw(rows);
        const res = await previewSales(rows);
        if (!res.ok || !res.report) throw new Error(res.error ?? "검증에 실패했습니다.");
        setReport(res.report);
      } catch (e) {
        setError(e instanceof Error ? e.message : "파일을 읽을 수 없습니다.");
      }
    });
  };
  const save = () =>
    start(async () => {
      const res = await importSales(fileName, raw);
      if (!res.ok) return setError(res.error ?? "저장에 실패했습니다.");
      setDone({ saved: res.saved ?? 0, skipped: res.skipped ?? 0 });
      setReport(null); setRaw([]);
      if (inputRef.current) inputRef.current.value = "";
      router.refresh();
    });

  const s = report?.summary;
  const shown = report ? report.rows.filter((r) => (filter === "ALL" ? true : filter === "ERROR" ? r.status === "ERROR" : r.status !== "ERROR")) : [];
  const savable = s ? s.ok + s.warn : 0;

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="pt-5">
          <label
            onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
            onDragLeave={() => setDragging(false)}
            onDrop={(e) => { e.preventDefault(); setDragging(false); handleFile(e.dataTransfer.files[0]); }}
            className={cn("flex cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed px-4 py-8 text-center transition-colors hover:bg-slate-50", dragging && "border-primary bg-blue-50")}
          >
            <Upload className="h-6 w-6 text-muted-foreground" />
            <div className="text-sm font-medium">{pending && !report ? "파일을 읽고 검증하는 중…" : "SAP 매출 엑셀 파일을 선택하거나 여기로 끌어다 놓으세요"}</div>
            <div className="text-xs text-muted-foreground">.xlsx / .xls / .csv · 첫 행 컬럼: {SALES_COLUMNS.join(", ")}</div>
            <input ref={inputRef} type="file" accept=".xlsx,.xls,.csv" className="sr-only" onChange={(e) => handleFile(e.target.files?.[0])} />
          </label>
          <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
            <span>저장 전에 미리보기와 검증 결과를 먼저 보여 줍니다. 오류 행은 제외하고 정상 행만 저장됩니다.</span>
            <a href="/samples/sap_sales_sample.xlsx" download className="inline-flex items-center gap-1 font-medium text-primary hover:underline"><FileSpreadsheet className="h-3.5 w-3.5" /> 테스트용 샘플 엑셀 내려받기</a>
          </div>
        </CardContent>
      </Card>

      {error && <div className="flex items-start gap-2 whitespace-pre-wrap rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700"><AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />{error}</div>}
      {done && (
        <div className="flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
          <CheckCircle2 className="h-4 w-4" /> <b>{fmtNum(done.saved)}행</b>을 저장했습니다{done.skipped ? ` (오류 ${fmtNum(done.skipped)}행 제외)` : ""}. 대시보드와 실적 화면에 바로 반영됩니다.
          <a href="/" className="ml-auto font-medium underline">대시보드 보기</a>
        </div>
      )}

      {report && s && (
        <Card>
          <CardHeader>
            <CardTitle>검증 결과 리포트 — {fileName}</CardTitle>
            <Button onClick={save} disabled={pending || savable === 0}>{pending ? "저장 중…" : `정상 ${fmtNum(savable)}행 저장`}</Button>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 gap-2 md:grid-cols-4 xl:grid-cols-7">
              {[
                ["전체 행", s.total, ""], ["정상", s.ok + s.warn, "text-emerald-600"], ["오류", s.error, s.error ? "text-red-600" : ""],
                ["필수값 누락", s.missing, s.missing ? "text-red-600" : ""], ["미등록 고객코드", s.unknownCustomer, s.unknownCustomer ? "text-red-600" : ""], ["중복 행", s.duplicate, s.duplicate ? "text-red-600" : ""], ["형식 등 기타", s.other, s.other ? "text-red-600" : ""],
              ].map(([label, value, cls]) => (
                <div key={label as string} className="rounded-md border px-3 py-2">
                  <div className="text-[11px] text-muted-foreground">{label}</div>
                  <div className={cn("tabular text-lg font-bold", cls as string)}>{fmtNum(value as number)}</div>
                </div>
              ))}
            </div>
            <p className="mt-2 text-xs text-muted-foreground">저장 예정 금액(원화 환산, 매출월 환율 적용): <b className="text-foreground">{fmtKrw(s.totalKrw)}원</b>{s.warn > 0 && ` · 경고 ${s.warn}행은 저장됩니다(제품 마스터 미등록).`}</p>
            <div className="mt-3 flex gap-1">
              {([["ALL", `전체 ${s.total}`], ["ERROR", `오류 ${s.error}`], ["OK", `정상 ${savable}`]] as const).map(([k, label]) => (
                <button key={k} onClick={() => setFilter(k)} className={cn("rounded-full border px-3 py-1 text-xs", filter === k ? "border-primary bg-primary text-white" : "bg-white")}>{label}</button>
              ))}
            </div>
            <div className="mt-2 max-h-[480px] overflow-auto rounded-md border">
              <Table>
                <THead><tr><TH>행</TH><TH>결과</TH>{SALES_COLUMNS.map((c) => <TH key={c}>{c}</TH>)}<TH className="text-right">원화 환산</TH></tr></THead>
                <TBody>
                  {shown.slice(0, 500).map((r) => (
                    <TR key={r.line} className={r.status === "ERROR" ? "bg-red-50/60" : r.status === "WARN" ? "bg-amber-50/60" : ""}>
                      <TD className="tabular text-xs text-muted-foreground">{r.line}</TD>
                      <TD className="min-w-[200px] text-xs">{r.status === "OK" ? <span className="text-emerald-600">정상</span> : <span className={r.status === "ERROR" ? "font-medium text-red-600" : "text-amber-700"}>{r.messages.join(" / ")}</span>}</TD>
                      {SALES_COLUMNS.map((c) => <TD key={c} className={cn("whitespace-nowrap text-xs", (c === "수량" || c === "금액") && "tabular text-right")}>{r[FIELD[c]] || <span className="text-red-500">(비어 있음)</span>}</TD>)}
                      <TD className="tabular text-right text-xs">{r.amountKrw != null ? fmtNum(r.amountKrw) : "-"}</TD>
                    </TR>
                  ))}
                </TBody>
              </Table>
            </div>
            {shown.length > 500 && <p className="mt-1 text-xs text-muted-foreground">미리보기는 500행까지 표시합니다. (전체 {fmtNum(shown.length)}행)</p>}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
