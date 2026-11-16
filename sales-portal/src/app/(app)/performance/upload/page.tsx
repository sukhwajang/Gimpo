import { Trash2 } from "lucide-react";
import { ActionButton } from "@/components/form-dialog";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { fmtDateTime, fmtNum } from "@/lib/format";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/session";
import { deleteBatch } from "../actions";
import { UploadClient } from "./upload-client";

export default async function UploadPage() {
  await requireAdmin();
  const batches = await prisma.uploadBatch.findMany({ orderBy: { createdAt: "desc" }, take: 30, include: { uploadedBy: { select: { name: true } } } });
  return (
    <>
      <PageHeader title="실적 업로드" description="SAP에서 내려받은 매출 엑셀을 올리면 검증 후 실적에 반영합니다." />
      <UploadClient />
      <Card className="mt-4">
        <CardHeader><CardTitle>업로드 이력</CardTitle></CardHeader>
        <CardContent className="px-0 pb-2">
          <Table>
            <THead><tr><TH>업로드 일시</TH><TH>파일명</TH><TH>업로드한 사람</TH><TH className="text-right">전체 행</TH><TH className="text-right">저장</TH><TH className="text-right">오류 제외</TH><TH /></tr></THead>
            <TBody>
              {batches.map((b) => (
                <TR key={b.id}>
                  <TD className="tabular whitespace-nowrap">{fmtDateTime(b.createdAt)}</TD>
                  <TD>{b.fileName}</TD>
                  <TD>{b.uploadedBy.name}</TD>
                  <TD className="tabular text-right">{fmtNum(b.totalRows)}</TD>
                  <TD className="tabular text-right">{fmtNum(b.savedRows)}</TD>
                  <TD className="tabular text-right">{b.errorRows ? <span className="text-red-600">{fmtNum(b.errorRows)}</span> : "-"}</TD>
                  <TD className="text-right"><ActionButton action={deleteBatch} fields={{ id: b.id }} confirm={`'${b.fileName}' 업로드를 취소할까요? 저장된 ${b.savedRows}행이 삭제됩니다.`} size="icon" title="업로드 취소(삭제)"><Trash2 /></ActionButton></TD>
                </TR>
              ))}
            </TBody>
          </Table>
        </CardContent>
      </Card>
    </>
  );
}
