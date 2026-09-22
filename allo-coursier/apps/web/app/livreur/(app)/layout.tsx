'use client';

import clsx from 'clsx';
import { History, Home, User, Wallet } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { ReactNode } from 'react';
import { Logo } from '@/components/logo';
import { OfferSheet } from '@/components/offer-sheet';
import { RequireAuth } from '@/components/require-auth';
import { DriverProvider, useDriver } from '@/lib/driver-runtime';

const NAV = [
  { href: '/livreur', label: 'Missions', icon: Home },
  { href: '/livreur/gains', label: 'Gains', icon: Wallet },
  { href: '/livreur/historique', label: 'Historique', icon: History },
  { href: '/livreur/profil', label: 'Profil', icon: User },
];

function Shell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const { online, queued, gpsStatus } = useDriver();
  return (
    <div className="min-h-screen pb-nav">
      <header className="sticky top-0 z-[800] bg-brand px-4 py-2.5" style={{ paddingTop: 'max(10px, env(safe-area-inset-top))' }}>
        <div className="mx-auto flex max-w-2xl items-center justify-between">
          <Logo light suffix="LIVREUR" />
          <span className={clsx('flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-bold', online ? 'bg-brand-green text-white' : 'bg-white/15 text-blue-100')}>
            <span className={clsx('h-2 w-2 rounded-full', online ? 'bg-white' : 'bg-blue-200')} />
            {online ? 'En ligne' : 'Hors ligne'}
          </span>
        </div>
        {(queued > 0 || gpsStatus === 'denied') && (
          <p className="mx-auto mt-1.5 max-w-2xl rounded-lg bg-amber-500 px-2 py-1 text-center text-xs font-semibold text-white">
            {gpsStatus === 'denied' ? 'GPS bloqué : autorisez la localisation dans le navigateur.' : `${queued} action(s) en attente de réseau — envoi automatique.`}
          </p>
        )}
      </header>
      <main className="mx-auto max-w-2xl px-4 py-4">{children}</main>
      <OfferSheet />
      <nav className="fixed inset-x-0 bottom-0 z-[800] border-t border-slate-200 bg-white" style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}>
        <div className="mx-auto grid max-w-2xl grid-cols-4">
          {NAV.map((item) => {
            const active = item.href === '/livreur' ? pathname === '/livreur' || pathname.startsWith('/livreur/missions') : pathname.startsWith(item.href);
            return (
              <Link key={item.href} href={item.href} className="flex flex-col items-center gap-0.5 py-2.5 text-[11px] font-medium">
                <item.icon className={clsx('h-5 w-5', active ? 'text-brand' : 'text-slate-400')} />
                <span className={active ? 'text-brand' : 'text-slate-500'}>{item.label}</span>
              </Link>
            );
          })}
        </div>
      </nav>
    </div>
  );
}

export default function DriverAppLayout({ children }: { children: ReactNode }) {
  return (
    <RequireAuth roles={['DRIVER']}>
      <DriverProvider>
        <Shell>{children}</Shell>
      </DriverProvider>
    </RequireAuth>
  );
}
