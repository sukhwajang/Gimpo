"use client";
import * as React from "react";
import { useRouter } from "next/navigation";
import { Button, type ButtonProps } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTitle, DialogTrigger } from "@/components/ui/dialog";

export type ActionResult = { ok: boolean; error?: string; redirect?: string };
type Action = (fd: FormData) => Promise<ActionResult>;

/** 서버 액션을 호출하는 폼 다이얼로그. 성공하면 닫고 화면을 새로 고친다. */
export function FormDialog({
  trigger, title, action, children, submitLabel = "저장", variant = "default", size = "default", wide, triggerClassName,
}: {
  trigger: React.ReactNode; title: string; action: Action; children: React.ReactNode; submitLabel?: string;
  variant?: ButtonProps["variant"]; size?: ButtonProps["size"]; wide?: boolean; triggerClassName?: string;
}) {
  const [open, setOpen] = React.useState(false);
  const [error, setError] = React.useState("");
  const [pending, start] = React.useTransition();
  const router = useRouter();
  return (
    <Dialog open={open} onOpenChange={(v) => { setOpen(v); setError(""); }}>
      <DialogTrigger asChild>
        <Button variant={variant} size={size} className={triggerClassName}>{trigger}</Button>
      </DialogTrigger>
      <DialogContent className={wide ? "max-w-3xl" : undefined}>
        <DialogTitle>{title}</DialogTitle>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            const fd = new FormData(e.currentTarget);
            start(async () => {
              const res = await action(fd);
              if (!res.ok) return setError(res.error ?? "저장에 실패했습니다.");
              setOpen(false);
              if (res.redirect) router.push(res.redirect);
              router.refresh();
            });
          }}
          className="space-y-4"
        >
          {children}
          {error && <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>취소</Button>
            <Button type="submit" disabled={pending}>{pending ? "처리 중…" : submitLabel}</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/** 확인 후 서버 액션을 실행하는 버튼(삭제 등) */
export function ActionButton({
  action, fields, confirm, children, variant = "ghost", size = "sm", className, title,
}: {
  action: Action; fields: Record<string, string>; confirm?: string; children: React.ReactNode;
  variant?: ButtonProps["variant"]; size?: ButtonProps["size"]; className?: string; title?: string;
}) {
  const [pending, start] = React.useTransition();
  const router = useRouter();
  return (
    <Button
      type="button" variant={variant} size={size} className={className} disabled={pending} title={title}
      onClick={() => {
        if (confirm && !window.confirm(confirm)) return;
        const fd = new FormData();
        Object.entries(fields).forEach(([k, v]) => fd.set(k, v));
        start(async () => {
          const res = await action(fd);
          if (!res.ok) return alert(res.error ?? "처리에 실패했습니다.");
          if (res.redirect) router.push(res.redirect);
          router.refresh();
        });
      }}
    >
      {children}
    </Button>
  );
}
