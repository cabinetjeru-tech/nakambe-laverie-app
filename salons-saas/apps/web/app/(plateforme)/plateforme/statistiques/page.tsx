'use client';

import { useQuery } from '@tanstack/react-query';
import { MonthlyChart } from '@/components/monthly-chart';
import { Badge, Card, ErrorMessage, PageHeader, Spinner, Stat } from '@/components/ui';
import { get } from '@/lib/api';
import { TENANT_STATUS } from '@/lib/billing';
import { number } from '@/lib/format';

interface Statistics {
  tenants: {
    total: number;
    byStatus: Record<string, number>;
    byPlan: { code: string; name: string; count: number }[];
    signupsMonthly: { month: string; count: number }[];
    trialConversionRate: number | null;
    cancelledLast30d: number;
    suspendedLast30d: number;
  };
  users: { total: number; activeLast30d: number; newLast30d: number };
  usage: { salons: number; appointmentsLast30d: number; salesLast30d: number };
  support: { openTickets: number };
}

export default function PlatformStatisticsPage() {
  const stats = useQuery({ queryKey: ['platform-statistics'], queryFn: () => get<Statistics>('/platform/statistics') });
  if (stats.isLoading) return <Spinner />;
  if (stats.error || !stats.data) return <ErrorMessage error={stats.error} />;
  const s = stats.data;
  const total = Math.max(1, s.tenants.total);

  return (
    <div className="space-y-6">
      <PageHeader title="Statistiques" description="Croissance, rétention et usage de la plateforme (agrégats, aucune donnée d’un salon en particulier)." />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Entreprises" value={number(s.tenants.total)} sub={`${number(s.usage.salons)} salons ouverts`} />
        <Stat
          label="Conversion des essais"
          value={s.tenants.trialConversionRate === null ? '—' : `${Math.round(s.tenants.trialConversionRate * 100)} %`}
          sub="essais terminés ayant payé"
        />
        <Stat label="Utilisateurs" value={number(s.users.total)} sub={`${number(s.users.activeLast30d)} actifs · ${number(s.users.newLast30d)} nouveaux (30 j)`} />
        <Stat label="Départs (30 j)" value={number(s.tenants.cancelledLast30d)} sub={`${number(s.tenants.suspendedLast30d)} suspension(s)`} />
      </div>

      <Card title="Nouvelles inscriptions par mois">
        <MonthlyChart kind="count" label="Inscriptions" series={s.tenants.signupsMonthly.map((m) => ({ month: m.month, value: m.count }))} />
      </Card>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card title="Entreprises par statut">
          <ul className="space-y-2">
            {Object.entries(TENANT_STATUS).map(([status, meta]) => {
              const count = s.tenants.byStatus[status] ?? 0;
              return (
                <li key={status} className="flex items-center justify-between gap-2 text-sm">
                  <Badge tone={meta.tone}>{meta.label}</Badge>
                  <span className="tabular-nums text-stone-900">
                    {number(count)} <span className="text-stone-500">({Math.round((count / total) * 100)} %)</span>
                  </span>
                </li>
              );
            })}
          </ul>
        </Card>
        <Card title="Entreprises par offre">
          <ul className="space-y-2">
            {s.tenants.byPlan.map((p) => (
              <li key={p.code} className="flex items-center justify-between text-sm">
                <span className="text-stone-700">{p.name}</span>
                <span className="tabular-nums text-stone-900">{number(p.count)}</span>
              </li>
            ))}
          </ul>
        </Card>
        <Card title="Usage sur 30 jours">
          <dl className="space-y-2 text-sm">
            <div className="flex justify-between">
              <dt className="text-stone-600">Rendez-vous</dt>
              <dd className="tabular-nums text-stone-900">{number(s.usage.appointmentsLast30d)}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-stone-600">Ventes encaissées</dt>
              <dd className="tabular-nums text-stone-900">{number(s.usage.salesLast30d)}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-stone-600">Demandes de support ouvertes</dt>
              <dd className="tabular-nums text-stone-900">{number(s.support.openTickets)}</dd>
            </div>
          </dl>
        </Card>
      </div>
    </div>
  );
}
