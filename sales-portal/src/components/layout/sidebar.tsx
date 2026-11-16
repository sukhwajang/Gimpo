"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut } from "next-auth/react";
import { BarChart3, Building2, ClipboardList, Coins, FileUp, History, KanbanSquare, LayoutDashboard, LogOut, Package, Settings2, Target, Users } from "lucide-react";
import { cn } from "@/lib/utils";
import { BUSINESS_COLOR, BUSINESS_LABEL, ROLE_LABEL } from "@/lib/constants";

type Me = { name: string; email: string; role: string; business: string | null; title: string };

const MAIN = [
  { href: "/", label: "대시보드", icon: LayoutDashboard },
  { href: "/customers", label: "고객사", icon: Building2 },
  { href: "/opportunities", label: "영업기회", icon: KanbanSquare },
  { href: "/activities", label: "활동 기록", icon: ClipboardList },
  { href: "/performance", label: "실적", icon: BarChart3 },
  { href: "/targets", label: "목표", icon: Target },
];
const ADMIN = [
  { href: "/performance/upload", label: "실적 업로드", icon: FileUp },
  { href: "/admin/users", label: "사용자·역할", icon: Users },
  { href: "/admin/stages", label: "단계·확률", icon: Settings2 },
  { href: "/admin/products", label: "제품 마스터", icon: Package },
  { href: "/admin/rates", label: "환율", icon: Coins },
  { href: "/admin/audit", label: "감사 로그", icon: History },
];

export function Sidebar({ me }: { me: Me }) {
  const path = usePathname();
  const admin = me.role === "ADMIN" || me.role === "EXEC";
  const all = [...MAIN, ...ADMIN];
  // 가장 길게 일치하는 메뉴 하나만 활성 표시
  const active = all.filter((i) => (i.href === "/" ? path === "/" : path === i.href || path.startsWith(i.href + "/"))).sort((a, b) => b.href.length - a.href.length)[0]?.href;
  const item = (i: (typeof MAIN)[number]) => (
    <Link
      key={i.href} href={i.href}
      className={cn("flex items-center gap-2.5 rounded-md px-3 py-2 text-sm text-slate-300 hover:bg-white/10 hover:text-white md:justify-center lg:justify-start", active === i.href && "bg-white/15 font-semibold text-white")}
      title={i.label}
    >
      <i.icon className="h-4 w-4 shrink-0" />
      <span className="md:hidden lg:inline">{i.label}</span>
    </Link>
  );
  return (
    <aside className="flex shrink-0 flex-col bg-[#14213d] text-white md:sticky md:top-0 md:h-screen md:w-16 lg:w-56">
      <div className="flex items-center gap-2 px-4 py-4">
        <span className="flex h-8 w-8 items-center justify-center rounded-md bg-white/15 text-sm font-bold">영</span>
        <span className="text-base font-bold md:hidden lg:inline">영업포탈</span>
      </div>
      <nav className="flex flex-1 gap-1 overflow-x-auto px-2 pb-2 md:flex-col md:overflow-y-auto md:overflow-x-hidden">
        {MAIN.map(item)}
        {admin && (
          <>
            <div className="mt-3 hidden px-3 pb-1 text-[11px] font-semibold uppercase tracking-wider text-slate-400 lg:block">관리</div>
            {ADMIN.map(item)}
          </>
        )}
      </nav>
      <div className="hidden border-t border-white/10 p-3 md:block">
        <div className="hidden lg:block">
          <div className="flex items-center gap-1.5 text-sm font-semibold">
            {me.business && <span className="h-2 w-2 rounded-full" style={{ background: BUSINESS_COLOR[me.business] }} />}
            {me.name}
          </div>
          <div className="truncate text-xs text-slate-400">{ROLE_LABEL[me.role]}{me.business ? ` · ${BUSINESS_LABEL[me.business]}` : ""}</div>
          <div className="truncate text-xs text-slate-500">{me.email}</div>
        </div>
        <button onClick={() => signOut({ callbackUrl: "/login" })} className="mt-2 flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-xs text-slate-300 hover:bg-white/10 md:justify-center lg:justify-start">
          <LogOut className="h-3.5 w-3.5" /> <span className="md:hidden lg:inline">로그아웃</span>
        </button>
      </div>
      <button onClick={() => signOut({ callbackUrl: "/login" })} className="absolute right-3 top-4 flex items-center gap-1 text-xs text-slate-300 md:hidden">
        {me.name} <LogOut className="h-3.5 w-3.5" />
      </button>
    </aside>
  );
}
