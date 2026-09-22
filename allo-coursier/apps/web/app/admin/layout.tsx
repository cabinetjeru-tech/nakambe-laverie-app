'use client';

import clsx from 'clsx';
import {
  BarChart3,
  Bell,
  Bike,
  CreditCard,
  FileClock,
  Landmark,
  LayoutDashboard,
  LogOut,
  Map as MapIcon,
  Menu,
  MessageSquareWarning,
  Package,
  Percent,
  Settings,
  ShieldCheck,
  Store,
  Tags,
  Users,
  X,
} from 'lucide-react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { ReactNode, useEffect, useState } from 'react';
import { Logo } from '@/components/logo';
import { RequireAuth } from '@/components/require-auth';
import { useAuth } from '@/lib/auth';
import { getSocket } from '@/lib/socket';

const NAV: { href: string; label: string; icon: typeof LayoutDashboard; perm?: string }[] = [
  { href: '/admin', label: 'Tableau de bord', icon: LayoutDashboard, perm: 'stats.read' },
  { href: '/admin/carte', label: 'Carte en direct', icon: MapIcon, perm: 'orders.read' },
  { href: '/admin/commandes', label: 'Commandes', icon: Package, perm: 'orders.read' },
  { href: '/admin/livreurs', label: 'Livreurs', icon: Bike, perm: 'drivers.read' },
  { href: '/admin/commercants', label: 'Commerçants', icon: Store, perm: 'merchants.manage' },
  { href: '/admin/clients', label: 'Clients', icon: Users, perm: 'users.read' },
  { href: '/admin/paiements', label: 'Paiements', icon: CreditCard, perm: 'payments.read' },
  { href: '/admin/finances', label: 'Finances', icon: Landmark, perm: 'wallets.manage' },
  { href: '/admin/tarifs', label: 'Tarifs', icon: Tags, perm: 'pricing.read' },
  { href: '/admin/zones', label: 'Villes et zones', icon: MapIcon, perm: 'cities.manage' },
  { href: '/admin/promotions', label: 'Promotions', icon: Percent, perm: 'promotions.manage' },
  { href: '/admin/reclamations', label: 'Réclamations', icon: MessageSquareWarning, perm: 'complaints.manage' },
  { href: '/admin/notifications', label: 'Notifications', icon: Bell, perm: 'notifications.send' },
  { href: '/admin/statistiques', label: 'Statistiques', icon: BarChart3, perm: 'stats.read' },
  { href: '/admin/equipe', label: 'Équipe et rôles', icon: ShieldCheck, perm: 'staff.manage' },
  { href: '/admin/parametres', label: 'Paramètres', icon: Settings, perm: 'settings.manage' },
  { href: '/admin/journal', label: 'Journal d’audit', icon: FileClock, perm: 'audit.read' },
];

function Sidebar({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();
  const { user, can, logout } = useAuth();
  const router = useRouter();
  return (
    <div className="flex h-full flex-col">
      <div className="px-4 py-4">
        <Logo light />
      </div>
      <nav className="flex-1 space-y-0.5 overflow-y-auto px-2">
        {NAV.filter((n) => !n.perm || can(n.perm)).map((n) => {
          const active = n.href === '/admin' ? pathname === '/admin' : pathname.startsWith(n.href);
          return (
            <Link key={n.href} href={n.href} onClick={onNavigate} className={clsx('flex items-center gap-3 rounded-xl px-3 py-2 text-sm font-medium', active ? 'bg-white/15 text-white' : 'text-blue-100 hover:bg-white/10')}>
              <n.icon className="h-4 w-4" /> {n.label}
            </Link>
          );
        })}
      </nav>
      <div className="border-t border-white/10 p-3 text-sm text-blue-100">
        <p className="truncate font-semibold text-white">
          {user?.firstName} {user?.lastName}
        </p>
        <button
          onClick={async () => {
            await logout();
            router.replace('/connexion?next=/admin');
          }}
          className="mt-1 flex items-center gap-2 text-xs hover:text-white"
        >
          <LogOut className="h-3.5 w-3.5" /> Se déconnecter
        </button>
      </div>
    </div>
  );
}

function Toasts() {
  const [items, setItems] = useState<{ id: number; title: string; body: string; url?: string }[]>([]);
  useEffect(() => {
    const socket = getSocket();
    const onNotification = (n: { title: string; body: string; url?: string; type: string }) => {
      if (n.type !== 'ADMIN_ALERT') return;
      const id = Date.now();
      setItems((prev) => [...prev.slice(-3), { id, ...n }]);
      setTimeout(() => setItems((prev) => prev.filter((i) => i.id !== id)), 12_000);
    };
    socket.on('notification', onNotification);
    return () => {
      socket.off('notification', onNotification);
    };
  }, []);
  return (
    <div className="fixed bottom-4 right-4 z-[1300] w-80 space-y-2">
      {items.map((t) => (
        <div key={t.id} className="rounded-xl bg-brand p-3 text-sm text-white shadow-xl">
          <p className="font-semibold">{t.title}</p>
          <p className="text-blue-100">{t.body}</p>
          {t.url && (
            <Link href={t.url} className="mt-1 inline-block text-xs font-semibold text-brand-green">
              Ouvrir →
            </Link>
          )}
        </div>
      ))}
    </div>
  );
}

export default function AdminLayout({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <RequireAuth staff>
      <div className="min-h-screen lg:pl-60">
        <aside className="fixed inset-y-0 left-0 z-[900] hidden w-60 bg-brand lg:block">
          <Sidebar />
        </aside>
        {open && (
          <div className="fixed inset-0 z-[1100] bg-black/40 lg:hidden" onClick={() => setOpen(false)}>
            <aside className="h-full w-64 bg-brand" onClick={(e) => e.stopPropagation()}>
              <Sidebar onNavigate={() => setOpen(false)} />
            </aside>
          </div>
        )}
        <header className="sticky top-0 z-[800] flex items-center justify-between bg-brand px-4 py-2.5 lg:hidden">
          <Logo light />
          <button onClick={() => setOpen((v) => !v)} className="rounded-lg p-2 text-white" aria-label="Menu">
            {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
        </header>
        <main className="mx-auto max-w-6xl p-4 lg:p-6">{children}</main>
        <Toasts />
      </div>
    </RequireAuth>
  );
}
