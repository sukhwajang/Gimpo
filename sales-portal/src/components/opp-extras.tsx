"use client";
import * as React from "react";
import { useRouter } from "next/navigation";
import type { ActionResult } from "@/components/form-dialog";

/** API 요청 문서 체크리스트의 체크박스 (즉시 저장) */
export function DocCheckbox({ id, field, checked, disabled, action, label }: { id: string; field: "requested" | "provided"; checked: boolean; disabled: boolean; action: (fd: FormData) => Promise<ActionResult>; label: string }) {
  const [pending, start] = React.useTransition();
  const router = useRouter();
  return (
    <input
      type="checkbox" className="h-4 w-4" aria-label={label} checked={checked} disabled={disabled || pending}
      onChange={(e) => {
        const fd = new FormData();
        fd.set("id", id); fd.set("field", field); fd.set("value", String(e.target.checked));
        start(async () => {
          const res = await action(fd);
          if (!res.ok) alert(res.error);
          router.refresh();
        });
      }}
    />
  );
}
