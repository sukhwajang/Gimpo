import { ArrowDown, ArrowUp, Pencil, Plus, Trash2 } from "lucide-react";
import { ExportButton } from "@/components/export-button";
import { ActionButton, FormDialog } from "@/components/form-dialog";
import { PageHeader } from "@/components/page-header";
import { StageBadge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, Input } from "@/components/ui/input";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { BUSINESSES, BUSINESS_COLOR, BUSINESS_LABEL, STAGE_TYPE_LABEL } from "@/lib/constants";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/session";
import { deleteStage, reorderStage, saveStage } from "../actions";

export default async function StagesPage() {
  await requireAdmin();
  const stages = await prisma.stage.findMany({ orderBy: [{ business: "asc" }, { order: "asc" }], include: { _count: { select: { opportunities: true } } } });
  return (
    <>
      <PageHeader title="단계·확률 설정" description="사업별 파이프라인 단계와 기본 성공확률입니다. 변경하면 칸반·가중 예상 매출에 바로 반영됩니다.">
        <ExportButton fileName="단계설정" rows={stages.map((s) => ({ 사업: BUSINESS_LABEL[s.business], 순서: s.order, 단계: s.name, "성공확률(%)": s.probability, 구분: STAGE_TYPE_LABEL[s.type], 기회수: s._count.opportunities }))} />
      </PageHeader>
      <div className="grid gap-4 xl:grid-cols-3">
        {BUSINESSES.map((b) => {
          const list = stages.filter((s) => s.business === b);
          const open = list.filter((s) => s.type === "OPEN");
          return (
            <Card key={b} style={{ borderTop: `3px solid ${BUSINESS_COLOR[b]}` }}>
              <CardHeader>
                <CardTitle>{BUSINESS_LABEL[b]}</CardTitle>
                <FormDialog trigger={<><Plus /> 단계 추가</>} title={`${BUSINESS_LABEL[b]} 진행 단계 추가`} action={saveStage} size="sm" variant="outline">
                  <input type="hidden" name="business" value={b} />
                  <Field label="단계명" required><Input name="name" required /></Field>
                  <Field label="성공확률 (%)" required><Input name="probability" type="number" min={0} max={100} step={1} required /></Field>
                  <p className="text-xs text-muted-foreground">마지막 진행 단계 뒤에 추가됩니다. 화살표로 순서를 바꿀 수 있습니다.</p>
                </FormDialog>
              </CardHeader>
              <CardContent className="px-0 pb-2">
                <Table>
                  <THead><tr><TH>단계</TH><TH className="text-right">확률</TH><TH className="text-right">기회</TH><TH /></tr></THead>
                  <TBody>
                    {list.map((s) => {
                      const i = open.findIndex((x) => x.id === s.id);
                      return (
                        <TR key={s.id}>
                          <TD><StageBadge name={s.name} type={s.type} /></TD>
                          <TD className="tabular text-right font-semibold">{s.probability}%</TD>
                          <TD className="tabular text-right">{s._count.opportunities}</TD>
                          <TD>
                            <div className="flex justify-end">
                              {s.type === "OPEN" && (
                                <>
                                  <ActionButton action={reorderStage} fields={{ id: s.id, dir: "up" }} size="icon" title="위로" className={i === 0 ? "invisible" : ""}><ArrowUp /></ActionButton>
                                  <ActionButton action={reorderStage} fields={{ id: s.id, dir: "down" }} size="icon" title="아래로" className={i === open.length - 1 ? "invisible" : ""}><ArrowDown /></ActionButton>
                                </>
                              )}
                              <FormDialog trigger={<Pencil />} title={`단계 수정 — ${BUSINESS_LABEL[b]}`} action={saveStage} size="icon" variant="ghost">
                                <input type="hidden" name="id" value={s.id} />
                                <Field label="단계명" required><Input name="name" defaultValue={s.name} required /></Field>
                                {s.type === "OPEN" ? (
                                  <Field label="성공확률 (%)" required><Input name="probability" type="number" min={0} max={100} step={1} defaultValue={s.probability} required /></Field>
                                ) : (
                                  <p className="text-xs text-muted-foreground">{STAGE_TYPE_LABEL[s.type]} 단계의 확률은 {s.probability}%로 고정입니다.</p>
                                )}
                              </FormDialog>
                              {s.type === "OPEN" && <ActionButton action={deleteStage} fields={{ id: s.id }} confirm={`'${s.name}' 단계를 삭제할까요?`} size="icon" title="삭제"><Trash2 /></ActionButton>}
                            </div>
                          </TD>
                        </TR>
                      );
                    })}
                  </TBody>
                </Table>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </>
  );
}
