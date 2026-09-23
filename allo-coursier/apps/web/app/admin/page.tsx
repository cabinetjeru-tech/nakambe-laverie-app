'use client';

import { AlertCircle, ChevronRight } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';
import { BarChart } from '@/components/admin/bar-chart';
import { CityFilter } from '@/components/admin/city-filter';
import { Card, PageHeader, Spinner, Stat } from '@/components/ui';
import type { StatsOverview } from '@/lib/admin-types';
import { useAuth } from '@/lib/auth';
import { fcfa } from '@/lib/format';
import { useApi } from '@/lib/use-api';

const shortDay = (d: string) => new Date(`${d}T00:00:00Z`).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', timeZone: 'UTC' });

export default function AdminDashboard() {
  const { can, user } = useAuth();
  const [cityId, setCityId] = useState('');
  const { data } = useApi<StatsOverview>(can('stats.read') ? `/admin/stats/overview${cityId ? `?cityId=${cityId}` : ''}` : null, { refreshInterval: 60_000, persist: false });

  if (!can('stats.read')) {
    return (
      <div>
        <PageHeader title={`Bonjour ${user?.firstName}`} />
        <Card>Utilisez le menu pour accéder à vos outils.</Card>
      </div>
    );
  }

  const todo = data
    ? [
        { n: data.todo.pendingPayments, label: 'paiement(s) Mobile Money à vérifier', href: '/admin/paiements' },
        { n: data.todo.driversPending, label: 'livreur(s) à valider', href: '/admin/livreurs?status=PENDING' },
        { n: data.todo.openComplaints, label: 'réclamation(s) ouverte(s)', href: '/admin/reclamations' },
        { n: data.todo.pendingPayouts, label: 'demande(s) de retrait', href: '/admin/finances' },
      ].filter((t) => t.n > 0)
    : [];

  return (
    <div className="space-y-5">
      <PageHeader title="Tableau de bord" subtitle="30 derniers jours" action={<CityFilter value={cityId} onChange={setCityId} />} />
      {!data && <Spinner />}
      {data && (
        <>
          {todo.length > 0 && (
            <div className="grid gap-2 sm:grid-cols-2">
              {todo.map((t) => (
                <Link key={t.href} href={t.href} className="flex items-center gap-3 rounded-2xl bg-amber-50 px-4 py-3 text-sm text-amber-900 ring-1 ring-amber-200">
                  <AlertCircle className="h-5 w-5 shrink-0" />
                  <span className="flex-1">
                    <strong>{t.n}</strong> {t.label}
                  </span>
                  <ChevronRight className="h-4 w-4" />
                </Link>
              ))}
            </div>
          )}
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Stat label="En cours maintenant" value={data.orders.inProgressNow} hint={`${data.people.driversOnline} livreur(s) en ligne`} />
            <Stat label="Livraisons" value={data.orders.delivered} hint={`${data.orders.created} commandes créées`} tone="green" />
            <Stat label="Chiffre d’affaires livraison" value={fcfa(data.money.deliveryRevenue)} hint={`Panier moyen ${fcfa(data.money.averageBasket)}`} />
            <Stat label="Commissions plateforme" value={fcfa(data.money.commissions)} hint={`Gains livreurs ${fcfa(data.money.driverEarnings)}`} />
            <Stat label="Annulées / échecs" value={`${data.orders.cancelled} / ${data.orders.failed}`} tone={data.orders.failed > 0 ? 'amber' : undefined} />
            <Stat label="Délai d’acceptation" value={data.timings.averageAcceptMinutes != null ? `${data.timings.averageAcceptMinutes} min` : '—'} />
            <Stat label="Durée de livraison" value={data.timings.averageDeliveryMinutes != null ? `${data.timings.averageDeliveryMinutes} min` : '—'} hint="de l’acceptation à la remise" />
            <Stat label="Nouveaux clients" value={data.people.newClients} hint={`${data.people.driversApproved} livreurs validés`} />
          </div>
          <div className="grid gap-4 lg:grid-cols-2">
            <Card>
              <h2 className="mb-3 font-semibold text-brand">Livraisons par jour</h2>
              <BarChart label="Livraisons par jour" data={data.daily.map((d) => ({ key: d.day, label: shortDay(d.day), value: d.delivered }))} format={(v) => `${v} livraison${v > 1 ? 's' : ''}`} />
            </Card>
            <Card>
              <h2 className="mb-3 font-semibold text-brand">Chiffre d’affaires livraison par jour</h2>
              <BarChart label="Chiffre d’affaires par jour" data={data.daily.map((d) => ({ key: d.day, label: shortDay(d.day), value: d.revenue }))} format={fcfa} />
            </Card>
          </div>
        </>
      )}
    </div>
  );
}
