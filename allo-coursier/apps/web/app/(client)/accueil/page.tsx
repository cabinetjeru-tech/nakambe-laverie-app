'use client';

import { UtensilsCrossed } from 'lucide-react';
import Link from 'next/link';
import { OrderCard, OrderSummary } from '@/components/order-card';
import { InstallButton, PushToggle } from '@/components/pwa';
import { Card } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { fcfa } from '@/lib/format';
import { SERVICES } from '@/lib/services';
import type { Paginated } from '@/lib/types';
import { useApi } from '@/lib/use-api';

const ACTIVE = ['CREATED', 'PENDING_PAYMENT', 'SCHEDULED', 'SEARCHING_DRIVER', 'DRIVER_ASSIGNED', 'DRIVER_AT_PICKUP', 'PURCHASING', 'PICKED_UP', 'IN_TRANSIT', 'ARRIVED_AT_DROPOFF'];

export default function ClientHome() {
  const { user } = useAuth();
  const active = useApi<Paginated<OrderSummary>>(`/orders?${ACTIVE.map((s) => `status=${s}`).join('&')}&pageSize=10`, { refreshInterval: 30_000 });
  const wallet = useApi<{ balance: number }>('/wallet');

  return (
    <div className="space-y-5">
      <div>
        <p className="text-sm text-slate-500">Bonjour {user?.firstName} 👋</p>
        <h1 className="text-2xl font-bold text-brand">Que doit-on livrer aujourd’hui ?</h1>
      </div>

      <Link href="/restaurants" className="flex items-center gap-3 rounded-2xl bg-gradient-to-r from-brand-green to-emerald-500 p-4 text-white shadow-card transition active:scale-[0.98]">
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-white/20">
          <UtensilsCrossed className="h-6 w-6" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block font-bold leading-tight">Repas & commerces</span>
          <span className="block text-xs text-green-50">Restaurants, maquis et boutiques livrés chez vous.</span>
        </span>
        <span className="rounded-xl bg-white/20 px-3 py-1.5 text-sm font-semibold">Commander</span>
      </Link>

      <div className="grid grid-cols-2 gap-3">
        {SERVICES.map((s) => (
          <Link key={s.code} href={`/commander?service=${s.code}`} className="rounded-2xl bg-white p-4 shadow-card transition active:scale-[0.98]">
            <span className={`flex h-11 w-11 items-center justify-center rounded-xl ${s.color}`}>
              <s.icon className="h-6 w-6" />
            </span>
            <span className="mt-3 block font-bold leading-tight text-brand">{s.title}</span>
            <span className="mt-0.5 block text-xs text-slate-500">{s.description}</span>
          </Link>
        ))}
      </div>

      {!!active.data?.items.length && (
        <section>
          <h2 className="mb-2 font-bold text-brand">En cours</h2>
          <div className="space-y-3">
            {active.data.items.map((o) => (
              <OrderCard key={o.id} order={o} href={`/commandes/${o.id}`} />
            ))}
          </div>
        </section>
      )}

      <Link href="/portefeuille" className="flex items-center justify-between rounded-2xl bg-gradient-to-r from-brand to-[#1C4F9C] p-4 text-white shadow-card">
        <span>
          <span className="block text-xs text-blue-200">Mon portefeuille</span>
          <span className="text-xl font-bold">{fcfa(wallet.data?.balance)}</span>
        </span>
        <span className="rounded-xl bg-white/15 px-3 py-1.5 text-sm font-semibold">Recharger</span>
      </Link>

      <Card className="space-y-3">
        <p className="text-sm font-semibold text-brand">Soyez prévenu à chaque étape</p>
        <p className="text-sm text-slate-600">Activez les notifications et installez l’application sur votre téléphone.</p>
        <div className="flex flex-wrap gap-2">
          <PushToggle compact />
          <InstallButton variant="primary" />
        </div>
      </Card>
    </div>
  );
}
