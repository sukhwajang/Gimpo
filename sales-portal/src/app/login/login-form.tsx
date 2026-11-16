"use client";
import * as React from "react";
import { signIn } from "next-auth/react";
import { Button } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/input";
import { BUSINESS_LABEL, ROLE_LABEL } from "@/lib/constants";

type Account = { email: string; name: string; role: string; business: string | null; title: string };

const ERROR_TEXT: Record<string, string> = {
  NotRegistered: "포탈에 등록되지 않았거나 비활성화된 계정입니다. 관리자에게 문의하세요.",
  CredentialsSignin: "등록되지 않았거나 비활성화된 이메일입니다.",
  AccessDenied: "접근이 거부되었습니다.",
};

export function LoginForm({ azureEnabled, demoEnabled, accounts, error, callbackUrl }: { azureEnabled: boolean; demoEnabled: boolean; accounts: Account[]; error?: string; callbackUrl?: string }) {
  const [email, setEmail] = React.useState("");
  const [pending, setPending] = React.useState(false);
  const target = callbackUrl && callbackUrl.startsWith("/") ? callbackUrl : "/";
  const login = (e: string) => {
    if (!e) return;
    setPending(true);
    signIn("demo", { email: e, callbackUrl: target });
  };
  const quick = ["ADMIN", "EXEC", "HEAD", "SALES"].map((role) => ({ role, list: accounts.filter((a) => a.role === role) }));
  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-lg font-semibold">로그인</h1>
        <p className="text-sm text-muted-foreground">회사 계정으로 로그인하세요.</p>
      </div>
      {error && <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{ERROR_TEXT[error] ?? "로그인에 실패했습니다."}</p>}

      {azureEnabled ? (
        <Button className="w-full" size="lg" onClick={() => signIn("azure-ad", { callbackUrl: target })}>
          <span className="grid grid-cols-2 gap-0.5"><i className="h-1.5 w-1.5 bg-[#f25022]" /><i className="h-1.5 w-1.5 bg-[#7fba00]" /><i className="h-1.5 w-1.5 bg-[#00a4ef]" /><i className="h-1.5 w-1.5 bg-[#ffb900]" /></span>
          Microsoft 계정으로 로그인
        </Button>
      ) : (
        <p className="rounded-md border border-dashed px-3 py-2 text-xs text-muted-foreground">
          Microsoft Entra ID SSO는 환경변수(AZURE_AD_*)를 설정하면 활성화됩니다. (README 참고)
        </p>
      )}

      {demoEnabled && (
        <div className="space-y-3 border-t pt-4">
          <div className="text-xs font-semibold text-muted-foreground">시연용 로그인 (비밀번호 없음)</div>
          <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); login(email); }}>
            <Input type="email" placeholder="이메일" value={email} onChange={(e) => setEmail(e.target.value)} required />
            <Button type="submit" disabled={pending}>로그인</Button>
          </form>
          <div className="grid grid-cols-2 gap-2">
            {quick.map(({ role, list }) => (
              <Select key={role} value="" disabled={pending} onChange={(e) => login(e.target.value)} aria-label={`${ROLE_LABEL[role]} 계정 선택`}>
                <option value="">{ROLE_LABEL[role]} 계정 선택 ({list.length})</option>
                {list.map((a) => (
                  <option key={a.email} value={a.email}>
                    {a.name} · {a.business ? `${BUSINESS_LABEL[a.business]} · ` : ""}{a.email}
                  </option>
                ))}
              </Select>
            ))}
          </div>
        </div>
      )}
      {!azureEnabled && !demoEnabled && <p className="text-sm text-red-700">활성화된 로그인 수단이 없습니다. 환경변수를 확인하세요.</p>}
    </div>
  );
}
