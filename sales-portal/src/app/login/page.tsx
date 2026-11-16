import { redirect } from "next/navigation";
import { azureEnabled, demoLoginEnabled } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getUser } from "@/lib/session";
import { LoginForm } from "./login-form";

export const dynamic = "force-dynamic";

export default async function LoginPage({ searchParams }: { searchParams: { error?: string; callbackUrl?: string } }) {
  if (await getUser()) redirect("/");
  // 시연용 계정 목록은 DEMO_LOGIN 이 켜져 있을 때만 노출한다.
  const accounts = demoLoginEnabled
    ? await prisma.user.findMany({ where: { active: true }, orderBy: [{ role: "asc" }, { business: "asc" }, { email: "asc" }], select: { email: true, name: true, role: true, business: true, title: true } })
    : [];
  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-100 p-4">
      <div className="w-full max-w-3xl overflow-hidden rounded-xl border bg-white shadow-lg md:grid md:grid-cols-5">
        <div className="flex flex-col justify-between bg-primary p-8 text-primary-foreground md:col-span-2">
          <div>
            <div className="text-2xl font-bold">영업포탈</div>
            <p className="mt-2 text-sm opacity-80">케미컬 · API · CDMO<br />영업 파이프라인과 실적을 한 곳에서</p>
          </div>
          <div className="mt-8 flex gap-1.5">
            <span className="h-1.5 w-8 rounded-full bg-chem" />
            <span className="h-1.5 w-8 rounded-full bg-api" />
            <span className="h-1.5 w-8 rounded-full bg-cdmo" />
          </div>
        </div>
        <div className="p-8 md:col-span-3">
          <LoginForm azureEnabled={azureEnabled} demoEnabled={demoLoginEnabled} accounts={accounts} error={searchParams.error} callbackUrl={searchParams.callbackUrl} />
        </div>
      </div>
    </main>
  );
}
