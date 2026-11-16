import * as React from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";

/** GET 방식 필터 폼. 조회 조건이 URL에 남아 대시보드 차트에서 바로 연결할 수 있다. */
export function FilterBar({ children, resetHref }: { children: React.ReactNode; resetHref: string }) {
  return (
    <form method="get" className="mb-3 flex flex-wrap items-end gap-2 rounded-lg border bg-white p-3">
      {children}
      <Button type="submit" size="sm" variant="secondary">조회</Button>
      <Button asChild size="sm" variant="ghost"><Link href={resetHref}>초기화</Link></Button>
    </form>
  );
}

export function FilterItem({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-[11px] font-medium text-muted-foreground">{label}</span>
      {children}
    </label>
  );
}
