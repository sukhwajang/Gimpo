"use client";
import * as React from "react";
import Link from "next/link";
import { AlertTriangle, CalendarClock, Lock } from "lucide-react";
import type { ActionResult } from "@/components/form-dialog";
import { useStageMove, type StageLite } from "@/components/stage-move";
import { fmtKrw, fmtMoney } from "@/lib/format";
import { cn } from "@/lib/utils";

export type KanbanCard = {
  id: string; title: string; customerName: string; amount: number; currency: string; amountKrw: number; ownerName: string;
  stageId: string; nextAction: string; nextActionDue: string | null; overdue: boolean; stale: boolean; editable: boolean;
};

export function Kanban({ stages, cards: initial, color, move }: { stages: StageLite[]; cards: KanbanCard[]; color: string; move: (fd: FormData) => Promise<ActionResult> }) {
  const [cards, setCards] = React.useState(initial);
  React.useEffect(() => setCards(initial), [initial]);
  const [dragId, setDragId] = React.useState<string | null>(null);
  const [over, setOver] = React.useState<string | null>(null);
  const { request, dialog } = useStageMove(move);

  const drop = (stage: StageLite) => {
    setOver(null);
    const card = cards.find((c) => c.id === dragId);
    setDragId(null);
    if (!card || card.stageId === stage.id || !card.editable) return;
    if (stage.type === "LOST") return request(card, stage); // 사유 입력 후 서버 반영
    const prev = cards;
    setCards(cards.map((c) => (c.id === card.id ? { ...c, stageId: stage.id } : c))); // 낙관적 이동
    request(card, stage, () => setCards(prev));
  };

  return (
    <>
      <div className="flex gap-3 overflow-x-auto pb-3">
        {stages.map((s) => {
          const list = cards.filter((c) => c.stageId === s.id);
          const sum = list.reduce((a, c) => a + c.amountKrw, 0);
          return (
            <div
              key={s.id}
              onDragOver={(e) => { if (dragId) { e.preventDefault(); setOver(s.id); } }}
              onDragLeave={() => setOver((o) => (o === s.id ? null : o))}
              onDrop={(e) => { e.preventDefault(); drop(s); }}
              className={cn("flex w-64 shrink-0 flex-col rounded-lg border bg-slate-50", over === s.id && "ring-2 ring-primary", s.type === "LOST" && "bg-slate-100/70")}
              data-stage={s.name}
            >
              <div className="rounded-t-lg border-b bg-white px-3 py-2" style={{ borderTop: `3px solid ${s.type === "WON" ? "#059669" : s.type === "LOST" ? "#94a3b8" : color}` }}>
                <div className="flex items-center justify-between text-sm font-semibold">
                  <span>{s.name}</span>
                  <span className="text-xs font-normal text-muted-foreground">{s.probability}%</span>
                </div>
                <div className="tabular mt-0.5 text-xs text-muted-foreground">{list.length}건 · {fmtKrw(sum)}원</div>
              </div>
              <div className="flex min-h-[120px] flex-1 flex-col gap-2 p-2">
                {list.map((c) => (
                  <div
                    key={c.id} draggable={c.editable}
                    onDragStart={(e) => { setDragId(c.id); e.dataTransfer.effectAllowed = "move"; e.dataTransfer.setData("text/plain", c.id); }}
                    onDragEnd={() => { setDragId(null); setOver(null); }}
                    className={cn("rounded-md border bg-white p-2.5 shadow-sm", c.editable ? "cursor-grab active:cursor-grabbing" : "opacity-80", dragId === c.id && "opacity-40")}
                    data-card={c.title}
                  >
                    <Link href={`/opportunities/${c.id}`} className="line-clamp-2 text-sm font-medium leading-snug hover:text-primary hover:underline" draggable={false}>{c.title}</Link>
                    <div className="mt-0.5 truncate text-xs text-muted-foreground">{c.customerName}</div>
                    <div className="mt-1.5 flex items-center justify-between text-xs">
                      <span className="tabular font-semibold">{fmtMoney(c.amount, c.currency)}</span>
                      <span className="flex items-center gap-1 text-muted-foreground">{!c.editable && <Lock className="h-3 w-3" />}{c.ownerName}</span>
                    </div>
                    {(c.nextActionDue || c.stale) && (
                      <div className="mt-1.5 flex flex-wrap gap-x-2 gap-y-0.5 border-t pt-1.5 text-[11px]">
                        {c.nextActionDue && <span className={cn("flex items-center gap-0.5", c.overdue ? "font-semibold text-red-600" : "text-muted-foreground")} title={c.nextAction}><CalendarClock className="h-3 w-3" />{c.nextActionDue.slice(5)} {c.nextAction.slice(0, 12)}</span>}
                        {c.stale && <span className="flex items-center gap-0.5 text-amber-600"><AlertTriangle className="h-3 w-3" />30일+ 정체</span>}
                      </div>
                    )}
                  </div>
                ))}
                {list.length === 0 && <div className="flex flex-1 items-center justify-center rounded-md border border-dashed text-xs text-muted-foreground">여기로 끌어다 놓기</div>}
              </div>
            </div>
          );
        })}
      </div>
      {dialog}
    </>
  );
}
