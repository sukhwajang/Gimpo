import Link from "next/link";
import { FileText, Mail, Phone, TestTube2, Trash2, Users } from "lucide-react";
import { ActionButton, type ActionResult } from "@/components/form-dialog";
import { Empty } from "@/components/page-header";
import { ACTIVITY_LABEL } from "@/lib/constants";
import { fmtDate } from "@/lib/format";

const ICON: Record<string, React.ComponentType<{ className?: string }>> = { MEETING: Users, EMAIL: Mail, CALL: Phone, SAMPLE: TestTube2, DOCUMENT: FileText };

export type TimelineItem = {
  id: string; type: string; subject: string; content: string; date: Date; userName: string;
  opportunity?: { id: string; title: string } | null; customer?: { id: string; name: string } | null; deletable: boolean;
};

export function Timeline({ items, onDelete }: { items: TimelineItem[]; onDelete: (fd: FormData) => Promise<ActionResult> }) {
  if (items.length === 0) return <Empty>기록된 활동이 없습니다.</Empty>;
  return (
    <ol className="relative ml-3 space-y-4 border-l pl-6">
      {items.map((a) => {
        const Icon = ICON[a.type] ?? FileText;
        return (
          <li key={a.id} className="group relative">
            <span className="absolute -left-[37px] flex h-6 w-6 items-center justify-center rounded-full border bg-white text-slate-600"><Icon className="h-3 w-3" /></span>
            <div className="flex flex-wrap items-center gap-x-2 text-xs text-muted-foreground">
              <span className="tabular">{fmtDate(a.date)}</span>
              <span className="rounded bg-slate-100 px-1.5 py-0.5 font-medium text-slate-700">{ACTIVITY_LABEL[a.type] ?? a.type}</span>
              <span>{a.userName}</span>
              {a.customer && <Link href={`/customers/${a.customer.id}`} className="hover:underline">· {a.customer.name}</Link>}
              {a.opportunity && <Link href={`/opportunities/${a.opportunity.id}`} className="text-primary hover:underline">· {a.opportunity.title}</Link>}
              {a.deletable && (
                <ActionButton action={onDelete} fields={{ id: a.id }} confirm="이 활동 기록을 삭제할까요?" size="icon" className="ml-auto h-6 w-6 opacity-0 group-hover:opacity-100" title="삭제">
                  <Trash2 className="h-3.5 w-3.5" />
                </ActionButton>
              )}
            </div>
            <div className="mt-0.5 text-sm font-medium">{a.subject}</div>
            {a.content && <p className="mt-0.5 whitespace-pre-wrap text-sm text-slate-600">{a.content}</p>}
          </li>
        );
      })}
    </ol>
  );
}
