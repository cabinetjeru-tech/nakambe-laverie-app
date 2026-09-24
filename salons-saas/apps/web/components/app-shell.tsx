'use client';

import clsx from 'clsx';
import {
  BarChart3,
  CalendarDays,
  CreditCard,
  LayoutDashboard,
  LifeBuoy,
  LogOut,
  Menu,
  Package,
  Receipt,
  Scissors,
  ShieldCheck,
  UserRound,
  Users,
  Wallet,
  X,
} from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { ReactNode, useState } from 'react';
import { useAuth } from '@/lib/auth';
import { BillingBanner } from './billing-banner';
import { NotificationBell } from './notification-bell';
import { useSalon } from '@/lib/salon';

/** Chaque entrée n'apparaît qu'avec l'une des permissions listées (l'API reste seule juge). */
export const NAVIGATION = [
  { href: '/tableau-de-bord', label: 'Tableau de bord', icon: LayoutDashboard, any: ['salons.read'] },
  { href: '/rendez-vous', label: 'Rendez-vous', icon: CalendarDays, any: ['appointments.read', 'appointments.read.own'] },
  { href: '/clients', label: 'Clients', icon: UserRound, any: ['clients.read.basic'] },
  { href: '/prestations', label: 'Prestations', icon: Scissors, any: ['services.read'] },
  { href: '/equipe', label: 'Employés', icon: Users, any: ['staff.read'] },
  { href: '/caisse', label: 'Caisse', icon: Wallet, any: ['sales.create', 'cash.read', 'cash.session.open_close'] },
  { href: '/depenses', label: 'Dépenses', icon: Receipt, any: ['expenses.create', 'expenses.manage'] },
  { href: '/stock', label: 'Stock', icon: Package, any: ['stock.read'] },
  { href: '/rapports', label: 'Rapports', icon: BarChart3, any: ['reports.read', 'reports.finance.read', 'reports.read.own'] },
  { href: '/abonnement', label: 'Abonnement', icon: CreditCard, any: ['billing.manage'] },
  // Tout membre peut écrire au support de la plateforme.
  { href: '/support', label: 'Aide et support', icon: LifeBuoy, any: [] as string[] },
];

export function AppShell({ children }: { children: ReactNode }) {
  const { me, can, logout, switchTenant } = useAuth();
  const { salons, salon, setSalonId } = useSalon();
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const items = NAVIGATION.filter((item) => item.any.length === 0 || can(...item.any));
  const activeTenant = me?.memberships.find((m) => m.tenantId === me.activeTenant?.tenantId);

  const nav = (
    <nav className="flex h-full flex-col">
      <div className="px-4 py-4">
        <p className="text-xs font-semibold uppercase tracking-wider text-brand-600">Salon</p>
        <p className="truncate text-base font-semibold text-stone-900">{activeTenant?.name ?? '—'}</p>
      </div>
      {salons.length > 1 && (
        <div className="px-4 pb-3">
          <label htmlFor="salon-picker" className="sr-only">
            Salon de travail
          </label>
          <select
            id="salon-picker"
            value={salon?.id ?? ''}
            onChange={(e) => setSalonId(e.target.value)}
            className="w-full rounded-lg border border-stone-300 bg-white px-2 py-1.5 text-sm"
          >
            {salons.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </div>
      )}
      <ul className="flex-1 space-y-0.5 px-2">
        {items.map((item) => {
          const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
          const Icon = item.icon;
          return (
            <li key={item.href}>
              <Link
                href={item.href}
                onClick={() => setOpen(false)}
                aria-current={active ? 'page' : undefined}
                className={clsx(
                  'flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium',
                  active ? 'bg-brand-50 text-brand-700' : 'text-stone-700 hover:bg-stone-100',
                )}
              >
                <Icon className="h-4 w-4 shrink-0" aria-hidden />
                {item.label}
              </Link>
            </li>
          );
        })}
      </ul>
      <div className="border-t border-stone-200 p-3">
        {me?.platformRole && (
          <Link href="/plateforme" className="mb-2 flex items-center gap-2 rounded-lg bg-stone-900 px-3 py-2 text-sm font-medium text-white hover:bg-stone-800">
            <ShieldCheck className="h-4 w-4" aria-hidden /> Console super admin
          </Link>
        )}
        {me && me.memberships.length > 1 && (
          <select
            aria-label="Changer d'entreprise"
            value={me.activeTenant?.tenantId ?? ''}
            onChange={(e) => switchTenant(e.target.value)}
            className="mb-2 w-full rounded-lg border border-stone-300 bg-white px-2 py-1.5 text-sm"
          >
            {me.memberships.map((m) => (
              <option key={m.tenantId} value={m.tenantId}>
                {m.name}
              </option>
            ))}
          </select>
        )}
        <p className="truncate px-1 text-sm font-medium text-stone-800">{me?.user.fullName}</p>
        <button onClick={() => logout()} className="mt-1 flex w-full items-center gap-2 rounded-lg px-1 py-1.5 text-sm text-stone-600 hover:text-stone-900">
          <LogOut className="h-4 w-4" aria-hidden /> Se déconnecter
        </button>
      </div>
    </nav>
  );

  return (
    <div className="min-h-screen bg-stone-50">
      <aside className="fixed inset-y-0 left-0 hidden w-60 border-r border-stone-200 bg-white lg:block print:hidden">{nav}</aside>
      {open && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div className="absolute inset-0 bg-stone-900/40" onClick={() => setOpen(false)} />
          <aside className="absolute inset-y-0 left-0 w-64 bg-white shadow-xl">
            <button onClick={() => setOpen(false)} className="absolute right-2 top-3 rounded-lg p-1 text-stone-500" aria-label="Fermer le menu">
              <X className="h-5 w-5" />
            </button>
            {nav}
          </aside>
        </div>
      )}
      <div className="lg:pl-60 print:pl-0">
        <header className="sticky top-0 z-30 flex items-center gap-3 border-b border-stone-200 bg-white/90 px-4 py-2 backdrop-blur lg:px-8 print:hidden">
          <button onClick={() => setOpen(true)} className="rounded-lg p-1 text-stone-700 lg:hidden" aria-label="Ouvrir le menu">
            <Menu className="h-6 w-6" />
          </button>
          <span className="flex-1 truncate font-semibold text-stone-900">{salon?.name ?? activeTenant?.name}</span>
          <NotificationBell />
        </header>
        <BillingBanner />
        <main className="mx-auto max-w-6xl px-4 py-6 lg:px-8">{children}</main>
      </div>
    </div>
  );
}
