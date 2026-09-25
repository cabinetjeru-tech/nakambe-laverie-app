import Link from "next/link";
import { Bell, LogOut } from "lucide-react";
import { prisma } from "@/lib/db";
import { getBrand } from "@/lib/settings";
import type { SessionUser } from "@/lib/auth/session";
import { initials, roleLabels } from "@/lib/format";
import { logoutAction } from "@/app/actions/auth";
import { Logo } from "./logo";
import { SideNav, type NavItem } from "./side-nav";

export async function DashboardShell({ user, nav, title, children }: { user: SessionUser; nav: NavItem[]; title: string; children: React.ReactNode }) {
  const [brand, unread] = await Promise.all([getBrand(), prisma.notification.count({ where: { userId: user.id, readAt: null } })]);
  return (
    <div className="min-h-dvh bg-surface lg:grid lg:grid-cols-[260px_1fr]">
      <SideNav nav={nav} title={title} header={<Logo name={brand.name} logoUrl={brand.logoUrl} href="/" />} />
      <div className="min-w-0">
        <header className="sticky top-0 z-30 flex h-16 items-center justify-end gap-2 border-b border-line bg-white/90 px-4 backdrop-blur sm:px-6">
          <Link href="/espace/notifications" className="relative grid h-10 w-10 place-items-center rounded-lg text-navy hover:bg-sky-50" aria-label={`Notifications (${unread} non lues)`}>
            <Bell className="h-5 w-5" />
            {unread > 0 && <span className="absolute right-1.5 top-1.5 grid h-4 min-w-4 place-items-center rounded-full bg-red-600 px-1 text-[10px] font-bold text-white">{unread > 9 ? "9+" : unread}</span>}
          </Link>
          <Link href="/espace/profil" className="flex items-center gap-2 rounded-lg px-2 py-1.5 hover:bg-sky-50">
            <span className="grid h-8 w-8 place-items-center rounded-full bg-navy text-xs font-bold text-white">{initials(user.name)}</span>
            <span className="hidden text-left leading-tight sm:block">
              <span className="block text-sm font-semibold text-navy">{user.name}</span>
              <span className="block text-[11px] text-muted">{roleLabels[user.role]}</span>
            </span>
          </Link>
          <form action={logoutAction}>
            <button className="grid h-10 w-10 place-items-center rounded-lg text-muted hover:bg-sky-50 hover:text-navy" aria-label="Se déconnecter" title="Se déconnecter">
              <LogOut className="h-5 w-5" />
            </button>
          </form>
        </header>
        <main id="contenu" className="mx-auto max-w-7xl px-4 py-6 sm:px-6 sm:py-8">{children}</main>
      </div>
    </div>
  );
}
