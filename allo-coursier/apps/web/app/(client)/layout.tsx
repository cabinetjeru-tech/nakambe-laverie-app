'use client';

import clsx from 'clsx';
import { Bell, Home, ListOrdered, Plus, User, Wallet } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { ReactNode, useEffect, useState } from 'react';
import { Logo } from '@/components/logo';
import { RequireAuth } from '@/components/require-auth';
import { getSocket } from '@/lib/socket';
import { useApi } from '@/lib/use-api';

const NAV = [
  { href: '/accueil', label: 'Accueil', icon: Home },
  { href: '/commandes', label: 'Commandes', icon: ListOrdered },
  { href: '/commander', label: 'Commander', icon: Plus, primary: true },
  { href: '/portefeuille', label: 'Portefeuille', icon: Wallet },
  { href: '/profil', label: 'Profil', icon: User },
];

function NotificationBell() {
  const { data, reload } = useApi<{ unread: number }>('/notifications', { persist: false, refreshInterval: 60_000 });
  const [unread, setUnread] = useState(0);
  useEffect(() => setUnread(data?.unread ?? 0), [data]);
  useEffect(() => {
    const socket = getSocket();
    const onNotification = () => {
      setUnread((n) => n + 1);
      void reload();
    };
    socket.on('notification', onNotification);
    return () => {
      socket.off('notification', onNotification);
    };
  }, [reload]);
  return (
    <Link href="/notifications" className="relative rounded-full p-2 text-white hover:bg-white/10" aria-label="Notifications">
      <Bell className="h-5 w-5" />
      {unread > 0 && <span className="absolute right-1 top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-brand-green px-1 text-[10px] font-bold">{unread > 9 ? '9+' : unread}</span>}
    </Link>
  );
}

export default function ClientLayout({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  return (
    <RequireAuth roles={['CLIENT']}>
      <div className="min-h-screen pb-nav">
        <header className="sticky top-0 z-[800] bg-brand px-4 py-2.5" style={{ paddingTop: 'max(10px, env(safe-area-inset-top))' }}>
          <div className="mx-auto flex max-w-2xl items-center justify-between">
            <Link href="/accueil">
              <Logo light />
            </Link>
            <NotificationBell />
          </div>
        </header>
        <main className="mx-auto max-w-2xl px-4 py-4">{children}</main>
        <nav className="fixed inset-x-0 bottom-0 z-[800] border-t border-slate-200 bg-white" style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}>
          <div className="mx-auto grid max-w-2xl grid-cols-5">
            {NAV.map((item) => {
              const active = pathname === item.href || (item.href !== '/accueil' && pathname.startsWith(item.href + '/'));
              return (
                <Link key={item.href} href={item.href} className="flex flex-col items-center gap-0.5 py-2 text-[11px] font-medium">
                  {item.primary ? (
                    <span className="-mt-5 flex h-12 w-12 items-center justify-center rounded-full bg-brand-green text-white shadow-lg ring-4 ring-white">
                      <item.icon className="h-6 w-6" />
                    </span>
                  ) : (
                    <item.icon className={clsx('h-5 w-5', active ? 'text-brand' : 'text-slate-400')} />
                  )}
                  <span className={clsx(active ? 'text-brand' : 'text-slate-500')}>{item.label}</span>
                </Link>
              );
            })}
          </div>
        </nav>
      </div>
    </RequireAuth>
  );
}
