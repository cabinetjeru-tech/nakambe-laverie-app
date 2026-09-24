'use client';

import { useQuery } from '@tanstack/react-query';
import { MonthlyChart } from '@/components/monthly-chart';
import { Card, ErrorMessage, PageHeader, Spinner, Stat, Table, Td } from '@/components/ui';
import { get } from '@/lib/api';
import { SAAS_PAYMENT_METHOD } from '@/lib/billing';
import { money, number } from '@/lib/format';

interface Revenue {
  mrr: number;
  arr: number;
  mrrAtRisk: number;
  payingTenants: number;
  arpa: number;
  collectedThisMonth: number;
  collectedLastMonth: number;
  outstanding: { count: number; total: number };
  overdue: { count: number; total: number };
  monthly: { month: string; total: number; payments: number }[];
  byPlan: { code: string; name: string; subscriptions: number; mrr: number }[];
  byMethod: { method: string; total: number; count: number }[];
}

export default function PlatformRevenuePage() {
  const revenue = useQuery({ queryKey: ['platform-revenue'], queryFn: () => get<Revenue>('/platform/revenue') });
  if (revenue.isLoading) return <Spinner />;
  if (revenue.error || !revenue.data) return <ErrorMessage error={revenue.error} />;
  const r = revenue.data;
  const mrr = Number(r.mrr);
  const trend = Number(r.collectedLastMonth) > 0 ? (Number(r.collectedThisMonth) - Number(r.collectedLastMonth)) / Number(r.collectedLastMonth) : null;
  const yearTotal = r.monthly.reduce((sum, m) => sum + Number(m.total), 0);

  return (
    <div className="space-y-6">
      <PageHeader title="Revenus" description="Revenu récurrent des abonnements payants et encaissements réels (montants en FCFA)." />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Revenu mensuel récurrent" value={money(r.mrr)} sub={`${r.payingTenants} salon(s) payant(s)`} />
        <Stat label="Revenu annuel récurrent" value={money(r.arr)} sub={`Panier moyen ${money(r.arpa)} / mois`} />
        <Stat
          label="Encaissé ce mois-ci"
          value={money(r.collectedThisMonth)}
          sub={trend === null ? `Mois dernier : ${money(r.collectedLastMonth)}` : `${trend >= 0 ? '+' : ''}${Math.round(trend * 100)} % vs mois dernier`}
        />
        <Stat label="Reste à encaisser" value={money(r.outstanding.total)} sub={`dont ${money(r.overdue.total)} échu (${r.overdue.count} facture(s))`} />
      </div>
      {Number(r.mrrAtRisk) > 0 && (
        <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900">
          {money(r.mrrAtRisk)} de revenu mensuel concerné par des résiliations programmées.
        </p>
      )}

      <Card title={`Encaissements des 12 derniers mois · ${money(yearTotal)}`}>
        <MonthlyChart kind="money" label="Encaissé" series={r.monthly.map((m) => ({ month: m.month, value: Number(m.total) }))} />
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="Revenu récurrent par offre">
          <Table head={['Offre', 'Abonnements', 'Revenu mensuel', 'Part']} empty={r.byPlan.length === 0}>
            {r.byPlan.map((p) => {
              const share = mrr > 0 ? Number(p.mrr) / mrr : 0;
              return (
                <tr key={p.code}>
                  <Td className="font-medium">{p.name}</Td>
                  <Td className="tabular-nums">{number(p.subscriptions)}</Td>
                  <Td className="tabular-nums">{money(p.mrr)}</Td>
                  <Td>
                    <div className="flex items-center gap-2">
                      <div className="h-2 w-24 overflow-hidden rounded-full bg-stone-100" aria-hidden>
                        <div className="h-full rounded-full bg-[#2a78d6]" style={{ width: `${Math.round(share * 100)}%` }} />
                      </div>
                      <span className="tabular-nums text-stone-600">{Math.round(share * 100)} %</span>
                    </div>
                  </Td>
                </tr>
              );
            })}
          </Table>
        </Card>
        <Card title="Encaissements par moyen de paiement (12 mois)">
          <Table head={['Moyen', 'Paiements', 'Montant']} empty={r.byMethod.length === 0}>
            {r.byMethod.map((m) => (
              <tr key={m.method}>
                <Td>{SAAS_PAYMENT_METHOD[m.method] ?? m.method}</Td>
                <Td className="tabular-nums">{number(m.count)}</Td>
                <Td className="tabular-nums">{money(m.total)}</Td>
              </tr>
            ))}
          </Table>
        </Card>
      </div>
    </div>
  );
}
