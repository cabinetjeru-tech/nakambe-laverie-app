"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, type ReactNode } from "react";
import clsx from "clsx";
import {
  Award, BarChart3, Bell, BookOpen, Bot, Briefcase, CalendarDays, Circle, ClipboardCheck, CreditCard, FileText, Flag, FolderTree, Gauge,
  GraduationCap, Heart, HelpCircle, LayoutDashboard, LifeBuoy, Mail, Menu, MessageSquare, Newspaper, NotebookPen, Package, Radio, Receipt,
  ScrollText, Settings, ShieldCheck, Sparkles, Star, Tag, TrendingUp, User, Users, Wallet, X, type LucideIcon,
} from "lucide-react";

// Liste explicite (et non `import *`) pour ne pas embarquer toute la bibliothèque d'icônes côté client.
const iconMap: Record<string, LucideIcon> = {
  Award, BarChart3, Bell, BookOpen, Bot, Briefcase, CalendarDays, ClipboardCheck, CreditCard, FileText, Flag, FolderTree, Gauge, GraduationCap,
  Heart, HelpCircle, LayoutDashboard, LifeBuoy, Mail, MessageSquare, Newspaper, NotebookPen, Package, Radio, Receipt, ScrollText, Settings,
  ShieldCheck, Sparkles, Star, Tag, TrendingUp, User, Users, Wallet,
};

export type NavItem = { href: string; label: string; icon: string; section?: string };

export function SideNav({ nav, title, header }: { nav: NavItem[]; title: string; header: ReactNode }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const isActive = (href: string) => (href.split("/").length <= 2 ? pathname === href : pathname === href || pathname.startsWith(href + "/"));
  let lastSection: string | undefined;
  const content = (
    <nav className="flex h-full flex-col" aria-label={title}>
      <div className="flex h-16 items-center border-b border-line px-5">{header}</div>
      <div className="px-5 pt-4 text-[11px] font-semibold uppercase tracking-wider text-muted">{title}</div>
      <ul className="flex-1 space-y-0.5 overflow-y-auto px-3 py-2">
        {nav.map((item) => {
          const Icon = iconMap[item.icon] ?? Circle;
          const showSection = item.section && item.section !== lastSection;
          lastSection = item.section ?? lastSection;
          return (
            <li key={item.href}>
              {showSection && <div className="px-3 pb-1 pt-4 text-[11px] font-semibold uppercase tracking-wider text-muted">{item.section}</div>}
              <Link
                href={item.href}
                onClick={() => setOpen(false)}
                aria-current={isActive(item.href) ? "page" : undefined}
                className={clsx(
                  "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition",
                  isActive(item.href) ? "bg-navy text-white" : "text-ink hover:bg-sky-50 hover:text-navy",
                )}
              >
                <Icon className="h-4 w-4 shrink-0" aria-hidden />
                {item.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
  return (
    <>
      <aside className="sticky top-0 hidden h-dvh border-r border-line bg-white lg:block">{content}</aside>
      <button
        onClick={() => setOpen(true)}
        className="fixed left-3 top-3 z-40 grid h-10 w-10 place-items-center rounded-lg border border-line bg-white text-navy shadow-sm lg:hidden"
        aria-label="Ouvrir le menu"
      >
        <Menu className="h-5 w-5" />
      </button>
      {open && (
        <div className="fixed inset-0 z-50 lg:hidden" role="dialog" aria-modal="true">
          <div className="absolute inset-0 bg-navy/40" onClick={() => setOpen(false)} />
          <aside className="absolute inset-y-0 left-0 w-72 bg-white shadow-xl">
            <button onClick={() => setOpen(false)} className="absolute right-3 top-3 grid h-9 w-9 place-items-center rounded-lg text-muted" aria-label="Fermer le menu">
              <X className="h-5 w-5" />
            </button>
            {content}
          </aside>
        </div>
      )}
    </>
  );
}
