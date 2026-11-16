import * as React from "react";
import { cn } from "@/lib/utils";
import { BUSINESS_BADGE, BUSINESS_LABEL } from "@/lib/constants";

export function Badge({ className, ...p }: React.HTMLAttributes<HTMLSpanElement>) {
  return <span className={cn("inline-flex items-center whitespace-nowrap rounded border px-1.5 py-0.5 text-xs font-medium", className)} {...p} />;
}

export function BusinessBadge({ business }: { business: string }) {
  return <Badge className={BUSINESS_BADGE[business] ?? ""}>{BUSINESS_LABEL[business] ?? business}</Badge>;
}

export function StageBadge({ name, type }: { name: string; type: string }) {
  const cls = type === "WON" ? "bg-emerald-600 text-white border-emerald-600" : type === "LOST" ? "bg-slate-200 text-slate-600 border-slate-300" : "bg-white text-slate-700 border-slate-300";
  return <Badge className={cls}>{name}</Badge>;
}

export function GradeBadge({ grade }: { grade: string }) {
  const cls = grade === "A" ? "bg-amber-50 text-amber-700 border-amber-200" : grade === "B" ? "bg-slate-50 text-slate-700 border-slate-200" : "bg-white text-slate-500 border-slate-200";
  return <Badge className={cls}>{grade}</Badge>;
}
