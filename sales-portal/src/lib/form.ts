export const str = (fd: FormData, k: string) => String(fd.get(k) ?? "").trim();
export const num = (fd: FormData, k: string) => {
  const v = String(fd.get(k) ?? "").replace(/,/g, "").trim();
  if (v === "") return NaN;
  return Number(v);
};
export const fail = (error: string) => ({ ok: false as const, error });
export const ok = (redirect?: string) => ({ ok: true as const, redirect });
