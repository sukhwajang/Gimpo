import { Sidebar } from "@/components/layout/sidebar";
import { requireUser } from "@/lib/session";

export const dynamic = "force-dynamic";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const me = await requireUser();
  return (
    <div className="relative flex min-h-screen flex-col md:flex-row">
      <Sidebar me={{ name: me.name, email: me.email, role: me.role, business: me.business, title: me.title }} />
      <main className="min-w-0 flex-1 p-4 lg:p-6">{children}</main>
    </div>
  );
}
