'use client';

import clsx from 'clsx';
import { BookOpen, Clock, ClipboardList, Store, Wallet } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { ReactNode, useEffect, useState } from 'react';
import { Logo } from '@/components/logo';
import { RequireAuth } from '@/components/require-auth';
import { Alert, LinkButton, Select, Spinner } from '@/components/ui';
import { api } from '@/lib/api';
import { MerchantProvider, useMerchant } from '@/lib/merchant';
import { getSocket } from '@/lib/socket';
import { ring } from '@/lib/sound';

const NAV = [
  { href: '/commercant', label: 'Commandes', icon: ClipboardList },
  { href: '/commercant/menu', label: 'Menu', icon: BookOpen },
  { href: '/commercant/horaires', label: 'Horaires', icon: Clock },
  { href: '/commercant/finances', label: 'Ventes', icon: Wallet },
  { href: '/commercant/profil', label: 'Commerce', icon: Store },
];

function OpenToggle() {
  const { merchant, call, setMerchant } = useMerchant();
  const [busy, setBusy] = useState(false);
  if (!merchant || merchant.status !== 'ACTIVE') return null;
  const toggle = async () => {
    setBusy(true);
    try {
      // Ouvert → fermé manuellement ; fermé manuellement → retour aux horaires.
      const next = merchant.isOpen ? false : merchant.isOpenOverride === false ? null : true;
      setMerchant(await call('open', { method: 'PUT', body: { isOpenOverride: next } }));
    } finally {
      setBusy(false);
    }
  };
  return (
    <button type="button" onClick={toggle} disabled={busy} className={clsx('flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-bold', merchant.isOpen ? 'bg-brand-green text-white' : 'bg-white/15 text-blue-100')}>
      <span className={clsx('h-2 w-2 rounded-full', merchant.isOpen ? 'bg-white' : 'bg-blue-200')} />
      {merchant.isOpen ? 'Ouvert' : 'Fermé'}
    </button>
  );
}

function Shell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const { memberships, merchant, merchantId, select } = useMerchant();
  const [pending, setPending] = useState(0);

  // Nouvelles commandes : sonnerie + pastille, même quand un autre écran est ouvert.
  useEffect(() => {
    if (!merchantId) return;
    const refresh = () =>
      api<{ total: number }>(`/merchant/${merchantId}/orders?view=PENDING&pageSize=1`)
        .then((r) => setPending(r.total))
        .catch(() => undefined);
    void refresh();
    const socket = getSocket();
    const onOrder = (e: { isNew?: boolean }) => {
      if (e.isNew) ring();
      void refresh();
    };
    socket.on('merchant.order', onOrder);
    socket.on('connect', refresh);
    const timer = setInterval(refresh, 60_000);
    return () => {
      socket.off('merchant.order', onOrder);
      socket.off('connect', refresh);
      clearInterval(timer);
    };
  }, [merchantId]);

  if (memberships && memberships.length === 0) {
    return (
      <div className="mx-auto max-w-md space-y-4 p-6 text-center">
        <p className="font-semibold text-brand">Aucun commerce n’est rattaché à votre compte.</p>
        <LinkButton href="/partenaires/inscription">Inscrire mon commerce</LinkButton>
      </div>
    );
  }

  return (
    <div className="min-h-screen pb-nav">
      <header className="sticky top-0 z-[800] bg-brand px-4 py-2.5" style={{ paddingTop: 'max(10px, env(safe-area-inset-top))' }}>
        <div className="mx-auto flex max-w-3xl items-center justify-between gap-3">
          <Logo light suffix="PARTENAIRE" />
          <OpenToggle />
        </div>
        {memberships && memberships.length > 1 && (
          <div className="mx-auto mt-2 max-w-3xl">
            <Select className="border-white/20 bg-white/10 py-1.5 text-sm text-white" value={merchantId ?? ''} onChange={(e) => select(e.target.value)}>
              {memberships.map((m) => (
                <option key={m.id} value={m.id} className="text-slate-900">{m.name}</option>
              ))}
            </Select>
          </div>
        )}
      </header>
      <main className="mx-auto max-w-3xl px-4 py-4">
        {merchant?.status === 'PENDING' && (
          <Alert tone="amber" className="mb-4">
            Votre commerce est en attente de validation par l’équipe Allô-Coursier. Préparez votre menu et vos horaires : il sera visible des clients dès sa validation.
          </Alert>
        )}
        {merchant?.status === 'SUSPENDED' && <Alert className="mb-4">Votre commerce est suspendu : il n’apparaît plus aux clients. Contactez l’équipe Allô-Coursier.</Alert>}
        {merchant ? children : <Spinner />}
      </main>
      <nav className="fixed inset-x-0 bottom-0 z-[800] border-t border-slate-200 bg-white" style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}>
        <div className="mx-auto grid max-w-3xl grid-cols-5">
          {NAV.map((item) => {
            const active = item.href === '/commercant' ? pathname === '/commercant' : pathname.startsWith(item.href);
            return (
              <Link key={item.href} href={item.href} className="relative flex flex-col items-center gap-0.5 py-2.5 text-[11px] font-medium">
                <item.icon className={clsx('h-5 w-5', active ? 'text-brand' : 'text-slate-400')} />
                <span className={active ? 'text-brand' : 'text-slate-500'}>{item.label}</span>
                {item.href === '/commercant' && pending > 0 && (
                  <span className="absolute left-1/2 top-1 ml-2 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-600 px-1 text-[10px] font-bold text-white">{pending}</span>
                )}
              </Link>
            );
          })}
        </div>
      </nav>
    </div>
  );
}

export default function MerchantAppLayout({ children }: { children: ReactNode }) {
  return (
    <RequireAuth roles={['MERCHANT']}>
      <MerchantProvider>
        <Shell>{children}</Shell>
      </MerchantProvider>
    </RequireAuth>
  );
}
