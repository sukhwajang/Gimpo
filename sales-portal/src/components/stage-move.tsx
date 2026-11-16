"use client";
import * as React from "react";
import { useRouter } from "next/navigation";
import { Check } from "lucide-react";
import type { ActionResult } from "@/components/form-dialog";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Field, Select, Textarea } from "@/components/ui/input";
import { LOST_REASONS, LOST_REASON_LABEL } from "@/lib/constants";
import { cn } from "@/lib/utils";

export type StageLite = { id: string; name: string; probability: number; type: string; order: number };
type Move = (fd: FormData) => Promise<ActionResult>;

/** 실패 단계로 옮길 때 사유를 반드시 입력받는 다이얼로그 */
export function LostDialog({ open, title, onCancel, onSubmit, pending, error }: { open: boolean; title: string; onCancel: () => void; onSubmit: (reason: string, note: string) => void; pending: boolean; error: string }) {
  const [reason, setReason] = React.useState("");
  const [note, setNote] = React.useState("");
  React.useEffect(() => { if (open) { setReason(""); setNote(""); } }, [open]);
  return (
    <Dialog open={open} onOpenChange={(v) => !v && onCancel()}>
      <DialogContent className="max-w-md">
        <DialogTitle>실패 처리 — 사유 입력</DialogTitle>
        <p className="-mt-2 mb-3 text-sm text-muted-foreground">{title}</p>
        <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); onSubmit(reason, note); }}>
          <Field label="실패 사유" required>
            <Select value={reason} onChange={(e) => setReason(e.target.value)} required>
              <option value="" disabled>사유 선택</option>
              {LOST_REASONS.map((r) => <option key={r} value={r}>{LOST_REASON_LABEL[r]}</option>)}
            </Select>
          </Field>
          <Field label={reason === "OTHER" ? "상세 내용 (필수)" : "상세 내용"}><Textarea value={note} onChange={(e) => setNote(e.target.value)} required={reason === "OTHER"} placeholder="예: 경쟁사 대비 단가 10% 높음" /></Field>
          {error && <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={onCancel}>취소</Button>
            <Button type="submit" variant="destructive" disabled={pending}>{pending ? "처리 중…" : "실패 처리"}</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/** 단계 이동 공통 로직 (칸반·상세 화면 공용) */
export function useStageMove(move: Move, onDone?: () => void) {
  const router = useRouter();
  const [pending, start] = React.useTransition();
  const [lost, setLost] = React.useState<{ id: string; title: string; stageId: string } | null>(null);
  const [error, setError] = React.useState("");
  const run = (id: string, stageId: string, extra?: { lostReason: string; lostNote: string }, onFail?: () => void) => {
    const fd = new FormData();
    fd.set("id", id);
    fd.set("stageId", stageId);
    if (extra) { fd.set("lostReason", extra.lostReason); fd.set("lostNote", extra.lostNote); }
    start(async () => {
      const res = await move(fd);
      if (!res.ok) {
        if (extra) setError(res.error ?? "실패");
        else alert(res.error ?? "단계 변경에 실패했습니다.");
        onFail?.();
        return;
      }
      setLost(null);
      setError("");
      onDone?.();
      router.refresh();
    });
  };
  const request = (opp: { id: string; title: string }, stage: StageLite, onFail?: () => void) => {
    if (stage.type === "LOST") { setError(""); setLost({ id: opp.id, title: opp.title, stageId: stage.id }); }
    else run(opp.id, stage.id, undefined, onFail);
  };
  const dialog = (
    <LostDialog
      open={!!lost} title={lost?.title ?? ""} pending={pending} error={error}
      onCancel={() => setLost(null)}
      onSubmit={(lostReason, lostNote) => lost && run(lost.id, lost.stageId, { lostReason, lostNote })}
    />
  );
  return { request, dialog, pending };
}

/** 상세 화면의 단계 진행 표시 + 클릭 이동 */
export function StageStepper({ opp, stages, currentId, editable, move }: { opp: { id: string; title: string }; stages: StageLite[]; currentId: string; editable: boolean; move: Move }) {
  const { request, dialog, pending } = useStageMove(move);
  const current = stages.find((s) => s.id === currentId);
  const open = stages.filter((s) => s.type === "OPEN");
  const closed = stages.filter((s) => s.type !== "OPEN");
  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="flex flex-1 flex-wrap gap-1">
        {open.map((s) => {
          const done = current && (current.type === "WON" || (current.type === "OPEN" && s.order < current.order));
          const active = s.id === currentId;
          return (
            <button
              key={s.id} type="button" disabled={!editable || pending || active}
              onClick={() => request(opp, s)}
              className={cn(
                "flex min-w-[96px] flex-1 items-center justify-center gap-1 rounded-md border px-2 py-2 text-xs font-medium transition-colors",
                active ? "border-primary bg-primary text-white" : done ? "border-emerald-200 bg-emerald-50 text-emerald-700" : "bg-white text-slate-600",
                editable && !active && "hover:border-primary hover:text-primary", !editable && "cursor-default"
              )}
              title={editable ? `${s.name} 단계로 이동` : undefined}
            >
              {done && <Check className="h-3 w-3" />} {s.name} <span className="opacity-70">{s.probability}%</span>
            </button>
          );
        })}
      </div>
      <div className="flex gap-1">
        {closed.map((s) => {
          const active = s.id === currentId;
          return (
            <Button
              key={s.id} type="button" size="sm" disabled={!editable || pending || active}
              variant={active ? (s.type === "WON" ? "default" : "destructive") : "outline"}
              className={cn(active && s.type === "WON" && "bg-emerald-600 hover:bg-emerald-600", "disabled:opacity-100", !active && !editable && "disabled:opacity-40")}
              onClick={() => request(opp, s)}
            >
              {s.name}
            </Button>
          );
        })}
      </div>
      {dialog}
    </div>
  );
}
