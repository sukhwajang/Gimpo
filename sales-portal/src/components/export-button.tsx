"use client";
import { Download } from "lucide-react";
import * as XLSX from "xlsx";
import { Button } from "@/components/ui/button";

/** 현재 목록(필터 적용 결과)을 엑셀로 내려받는다. rows 의 키가 그대로 컬럼 헤더가 된다. */
export function ExportButton({ rows, fileName, sheetName = "목록" }: { rows: Record<string, string | number | null>[]; fileName: string; sheetName?: string }) {
  return (
    <Button
      variant="outline" size="sm" type="button"
      onClick={() => {
        const ws = XLSX.utils.json_to_sheet(rows);
        const keys = rows[0] ? Object.keys(rows[0]) : [];
        ws["!cols"] = keys.map((k) => ({ wch: Math.min(40, Math.max(k.length * 2, ...rows.slice(0, 200).map((r) => String(r[k] ?? "").length)) + 2) }));
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, sheetName.slice(0, 31));
        const d = new Date();
        const stamp = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}${String(d.getDate()).padStart(2, "0")}`;
        XLSX.writeFile(wb, `${fileName}_${stamp}.xlsx`);
      }}
    >
      <Download /> 엑셀 다운로드 <span className="text-muted-foreground">({rows.length})</span>
    </Button>
  );
}
