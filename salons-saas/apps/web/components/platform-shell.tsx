'use client';

import clsx from 'clsx';
import {
  BarChart3,
  Building2,
  CreditCard,
  Home,
  LifeBuoy,
  LogOut,
  Menu,
  Repeat,
  Settings,
  Store,
  TrendingUp,
  Users,
  X,
} from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { ReactNode, useState } from 'react';
import { useAuth } from '@/lib/auth';
import { PLATFORM_ROLE } from '@/lib/billing';

type Role = 'PLATFORM_OWNER' | 'PLATFORM_BILLING' | 'PLATFORM_SUPPORT';

/** Rubriques du super administrateur ; `roles` vide = toute l'équipe (l'API reste seule juge). */
export const PLATFORM_NAVIGATION: { href: string; label: string; icon: typeof Home; roles: Role[] }[] = [
  { href: '/plateforme', label: 'Accueil', icon: Home, roles: [] },
  { href: '/plateforme/salons', label: 'Salons', icon: Store, roles: [] },
  { href: '/plateforme/utilisateurs', label: 'Utilisateurs', icon: Users, roles: ['PLATFORM_SUPPORT'] },
  { href: '/plateforme/abonnements', label: 'Abonnements', icon: Repeat, roles: ['PLATFORM_BILLING'] },
  { href: '/plateforme/paiements', label: 'Paiements', icon: CreditCard, roles: ['PLATFORM_BILLING'] },
  { href: '/plateforme/revenus', label: 'Revenus', icon: TrendingUp, roles: ['PLATFORM_BILLING'] },
  { href: '/plateforme/statistiques', label: 'Statistiques', icon: BarChart3, roles: [] },
  { href: '/plateforme/support', label: 'Support', icon: LifeBuoy, roles: ['PLATFORM_SUPPORT'] },
  { href: '/plateforme/parametres', label: 'Paramètres', icon: Settings, roles: [] },
];

export function canPlatform(role: Role | null | undefined, roles: Role[]): boolean {
  if (!role) return false;
  return role === 'PLATFORM_OWNER' || roles.length === 0 || roles.includes(role);
}

export function PlatformShell({ children }: { children: ReactNode }) {
  const { me, logout } = useAuth();
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const role = me?.platformRole;
  const items = PLATFORM_NAVIGATION.filter((item) => canPlatform(role, item.roles));

  const nav = (
    <nav className="flex h-full flex-col text-stone-300">
      <div className="px-4 py-4">
        <p className="text-xs font-semibold uppercase tracking-wider text-violet-300">Super admin</p>
        <p className="text-base font-semibold text-white">Console plateforme</p>
      </div>
      <ul className="flex-1 space-y-0.5 px-2">
        {items.map((item) => {
          const active = item.href === '/plateforme' ? pathname === item.href : pathname === item.href || pathname.startsWith(`${item.href}/`);
          const Icon = item.icon;
          return (
            <li key={item.href}>
              <Link
                href={item.href}
                onClick={() => setOpen(false)}
                aria-current={active ? 'page' : undefined}
                className={clsx('flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium', active ? 'bg-white/10 text-white' : 'hover:bg-white/5 hover:text-white')}
              >
                <Icon className="h-4 w-4 shrink-0" aria-hidden />
                {item.label}
              </Link>
            </li>
          );
        })}
      </ul>
      <div className="border-t border-white/10 p-3">
        {me && me.memberships.length > 0 && (
          <Link href="/tableau-de-bord" className="mb-2 flex items-center gap-2 rounded-lg px-1 py-1.5 text-sm hover:text-white">
            <Building2 className="h-4 w-4" aria-hidden /> Mon salon
          </Link>
        )}
        <p className="truncate px-1 text-sm font-medium text-white">{me?.user.fullName}</p>
        <p className="px-1 text-xs text-stone-400">{role ? PLATFORM_ROLE[role] : ''}</p>
        <button onClick={() => logout()} className="mt-2 flex w-full items-center gap-2 rounded-lg px-1 py-1.5 text-sm hover:text-white">
          <LogOut className="h-4 w-4" aria-hidden /> Se déconnecter
        </button>
      </div>
    </nav>
  );

  return (
    <div className="min-h-screen bg-stone-50">
      <aside className="fixed inset-y-0 left-0 hidden w-60 bg-stone-900 lg:block">{nav}</aside>
      {open && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div className="absolute inset-0 bg-stone-900/50" onClick={() => setOpen(false)} />
          <aside className="absolute inset-y-0 left-0 w-64 bg-stone-900 shadow-xl">
            <button onClick={() => setOpen(false)} className="absolute right-2 top-3 rounded-lg p-1 text-stone-300" aria-label="Fermer le menu">
              <X className="h-5 w-5" />
            </button>
            {nav}
          </aside>
        </div>
      )}
      <div className="lg:pl-60">
        <header className="sticky top-0 z-30 flex items-center gap-3 border-b border-stone-200 bg-white/90 px-4 py-3 backdrop-blur lg:hidden">
          <button onClick={() => setOpen(true)} className="rounded-lg p-1 text-stone-700" aria-label="Ouvrir le menu">
            <Menu className="h-6 w-6" />
          </button>
          <span className="font-semibold text-stone-900">Console plateforme</span>
        </header>
        <main className="mx-auto max-w-7xl px-4 py-6 lg:px-8">{children}</main>
      </div>
    </div>
  );
}
