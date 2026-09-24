'use client';

import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { MonthlyChart } from '@/components/monthly-chart';
import { Badge, Card, ErrorMessage, PageHeader, Spinner, Stat } from '@/components/ui';
import { get } from '@/lib/api';
import { TENANT_STATUS, TICKET_PRIORITY } from '@/lib/billing';
import { date, dateTime, money, number } from '@/lib/format';

interface Home {
  mrr: number;
  arr: number;
  collectedThisMonth: number;
  overdue: { count: number; total: number };
  monthly: { month: string; total: number }[];
  tenants: { total: number; byStatus: Record<string, number>; trialConversionRate: number | null };
  users: { total: number; activeLast30d: number };
  pendingManualPayments: number;
  openTickets: number;
  recentTenants: { id: string; displayName: string; status: string; createdAt: string; plan: { name: string } }[];
  urgentTickets: { id: string; number: number; subject: string; priority: string; lastMessageAt: string; tenant: { displayName: string } }[];
}

export default function PlatformHome() {
  const home = useQuery({ queryKey: ['platform-home'], queryFn: () => get<Home>('/platform/home'), refetchInterval: 60_000 });
  if (home.isLoading) return <Spinner />;
  if (home.error || !home.data) return <ErrorMessage error={home.error} />;
  const h = home.data;
  const s = h.tenants.byStatus;

  return (
    <div className="space-y-6">
      <PageHeader title="Tableau de bord de la plateforme" description="Vue d’ensemble des salons abonnés, des revenus et des demandes à traiter." />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Revenu mensuel récurrent" value={money(h.mrr)} sub={`${money(h.arr)} sur un an`} />
        <Stat label="Encaissé ce mois-ci" value={money(h.collectedThisMonth)} />
        <Stat label="Salons" value={number(h.tenants.total)} sub={`${s.ACTIVE ?? 0} actifs · ${s.TRIAL ?? 0} en essai`} />
        <Stat
          label="Conversion des essais"
          value={h.tenants.trialConversionRate === null ? '—' : `${Math.round(h.tenants.trialConversionRate * 100)} %`}
          sub={`${number(h.users.activeLast30d)} utilisateurs actifs (30 j)`}
        />
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <Link href="/plateforme/paiements" className="rounded-xl border border-stone-200 bg-white p-4 hover:border-brand-300">
          <p className="text-sm text-stone-500">Paiements Mobile Money à valider</p>
          <p className="mt-1 text-2xl font-semibold tabular-nums text-stone-900">{h.pendingManualPayments}</p>
        </Link>
        <Link href="/plateforme/abonnements?status=PAST_DUE" className="rounded-xl border border-stone-200 bg-white p-4 hover:border-brand-300">
          <p className="text-sm text-stone-500">Factures échues impayées</p>
          <p className="mt-1 text-2xl font-semibold tabular-nums text-stone-900">
            {h.overdue.count} <span className="text-base font-normal text-stone-500">· {money(h.overdue.total)}</span>
          </p>
        </Link>
        <Link href="/plateforme/support" className="rounded-xl border border-stone-200 bg-white p-4 hover:border-brand-300">
          <p className="text-sm text-stone-500">Demandes de support ouvertes</p>
          <p className="mt-1 text-2xl font-semibold tabular-nums text-stone-900">{h.openTickets}</p>
        </Link>
      </div>

      <Card title="Encaissements des 12 derniers mois">
        <MonthlyChart kind="money" label="Encaissé" series={h.monthly.map((m) => ({ month: m.month, value: Number(m.total) }))} />
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="Derniers salons inscrits" actions={<Link href="/plateforme/salons" className="text-sm text-brand-700 hover:underline">Tous les salons</Link>}>
          <ul className="divide-y divide-stone-100">
            {h.recentTenants.map((t) => (
              <li key={t.id} className="flex items-center justify-between gap-2 py-2">
                <Link href={`/plateforme/salons/${t.id}`} className="min-w-0 truncate text-sm font-medium text-stone-900 hover:text-brand-700">
                  {t.displayName}
                </Link>
                <span className="flex shrink-0 items-center gap-2 text-xs text-stone-500">
                  {t.plan.name} · {date(t.createdAt)}
                  <Badge tone={TENANT_STATUS[t.status]?.tone}>{TENANT_STATUS[t.status]?.label}</Badge>
                </span>
              </li>
            ))}
          </ul>
        </Card>
        <Card title="Demandes à traiter en priorité" actions={<Link href="/plateforme/support" className="text-sm text-brand-700 hover:underline">File du support</Link>}>
          {h.urgentTickets.length === 0 ? (
            <p className="py-4 text-center text-sm text-stone-500">Aucune demande en attente.</p>
          ) : (
            <ul className="divide-y divide-stone-100">
              {h.urgentTickets.map((t) => (
                <li key={t.id} className="flex items-center justify-between gap-2 py-2">
                  <Link href={`/plateforme/support/${t.id}`} className="min-w-0 text-sm hover:text-brand-700">
                    <span className="block truncate font-medium text-stone-900">{t.subject}</span>
                    <span className="block text-xs text-stone-500">
                      {t.tenant.displayName} · {dateTime(t.lastMessageAt)}
                    </span>
                  </Link>
                  <Badge tone={TICKET_PRIORITY[t.priority]?.tone}>{TICKET_PRIORITY[t.priority]?.label}</Badge>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </div>
  );
}
