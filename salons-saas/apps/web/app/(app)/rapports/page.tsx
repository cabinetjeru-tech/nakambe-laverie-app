'use client';

import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { RevenueChart } from '@/components/revenue-chart';
import { Card, ErrorMessage, Field, Input, PageHeader, Select, Spinner, Stat, Table, Td } from '@/components/ui';
import { get, qs } from '@/lib/api';
import { money, number, PAYMENT_METHOD, shiftDate, todayIn } from '@/lib/format';
import { useSalon } from '@/lib/salon';

interface Report {
  scope: 'salon' | 'own';
  sales: {
    count: number;
    revenue: number;
    revenueServices: number;
    revenueProducts: number;
    discounts: number;
    tips: number;
    averageBasket: number;
    byPaymentMethod: Record<string, number>;
    byDay: { date: string; amount: number }[];
  };
  topServices: { label: string; count: number; revenue: number }[];
  topProducts: { label: string; quantity: number; revenue: number; margin: number }[];
  staff: { staffId: string; name: string; revenue: number; services: number; tips: number; commissions: number; appointments: number }[];
  appointments: { total: number; byStatus: Record<string, number>; noShowRate: number };
  clients: { served: number; new?: number };
  finance: null | {
    expenses: number;
    expensesByCategory: { category: string; amount: number }[];
    cashDifferences: number;
    net: number;
  };
}

const PRESETS = [
  { label: 'Aujourd’hui', days: 0 },
  { label: '7 derniers jours', days: 6 },
  { label: '30 derniers jours', days: 29 },
];

export default function ReportsPage() {
  const { salon, salons } = useSalon();
  const today = salon ? todayIn(salon.timezone) : '';
  const [fromInput, setFrom] = useState('');
  const [toInput, setTo] = useState('');
  const [scope, setScope] = useState<'current' | 'all'>('current');
  const from = fromInput || (today ? shiftDate(today, -6) : '');
  const to = toInput || today;

  const { data, isLoading, error } = useQuery({
    queryKey: ['report', scope === 'all' ? 'all' : salon?.id, from, to],
    queryFn: () => get<Report>(`/reports/summary${qs({ salonId: scope === 'all' ? undefined : salon!.id, from, to })}`),
    enabled: Boolean(salon && from && to),
  });

  if (!salon) return <Spinner />;
  return (
    <>
      <PageHeader title="Rapports" description={data?.scope === 'own' ? 'Vos propres résultats' : 'Activité et résultats sur la période'} />
      <div className="mb-5 flex flex-wrap items-end gap-3">
        {PRESETS.map((p) => (
          <button
            key={p.label}
            onClick={() => { setFrom(shiftDate(today, -p.days)); setTo(today); }}
            className={`h-10 rounded-lg border px-3 text-sm ${from === shiftDate(today, -p.days) && to === today ? 'border-brand-600 bg-brand-50 text-brand-700' : 'border-stone-300 bg-white'}`}
          >
            {p.label}
          </button>
        ))}
        <Field label="Du">{(id) => <Input id={id} type="date" value={from} max={to} onChange={(e) => setFrom(e.target.value)} />}</Field>
        <Field label="Au">{(id) => <Input id={id} type="date" value={to} min={from} onChange={(e) => setTo(e.target.value)} />}</Field>
        {salons.length > 1 && (
          <Field label="Périmètre">
            {(id) => (
              <Select id={id} value={scope} onChange={(e) => setScope(e.target.value as 'current' | 'all')}>
                <option value="current">{salon.name}</option>
                <option value="all">Tous mes salons</option>
              </Select>
            )}
          </Field>
        )}
      </div>
      <ErrorMessage error={error} />
      {isLoading || !data ? (
        <Spinner />
      ) : (
        <div className="space-y-6">
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Stat label="Chiffre d’affaires" value={money(data.sales.revenue)} sub={`Prestations ${money(data.sales.revenueServices)} · produits ${money(data.sales.revenueProducts)}`} />
            <Stat label="Ventes" value={data.sales.count} sub={`Panier moyen ${money(data.sales.averageBasket)}`} />
            <Stat label="Pourboires" value={money(data.sales.tips)} />
            <Stat label="Rendez-vous" value={data.appointments.total} sub={`Absences : ${number(data.appointments.noShowRate, 1)} %`} />
          </div>

          <Card title="Chiffre d’affaires par jour">
            <RevenueChart from={from} to={to} series={data.sales.byDay} />
          </Card>

          {data.finance && (
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
              <Stat label="Dépenses" value={money(data.finance.expenses)} />
              <Stat label="Résultat simplifié" value={<span className={data.finance.net < 0 ? 'text-red-700' : ''}>{money(data.finance.net)}</span>} sub="Chiffre d’affaires − dépenses" />
              <Stat label="Écarts de caisse" value={money(data.finance.cashDifferences)} />
              <Stat label="Nouveaux clients" value={data.clients.new ?? 0} sub={`${data.clients.served} client${data.clients.served > 1 ? 's' : ''} servi${data.clients.served > 1 ? 's' : ''}`} />
            </div>
          )}

          <div className="grid gap-4 lg:grid-cols-2">
            <Card title="Prestations les plus vendues">
              <Table head={['Prestation', 'Nombre', 'Chiffre d’affaires']} empty={data.topServices.length === 0}>
                {data.topServices.map((s) => (
                  <tr key={s.label}>
                    <Td>{s.label}</Td>
                    <Td className="tabular-nums">{s.count}</Td>
                    <Td className="tabular-nums">{money(s.revenue)}</Td>
                  </tr>
                ))}
              </Table>
            </Card>
            {data.scope === 'salon' && (
              <Card title="Encaissements par moyen de paiement">
                <Table head={['Moyen', 'Montant']} empty={Object.keys(data.sales.byPaymentMethod).length === 0}>
                  {Object.entries(data.sales.byPaymentMethod).map(([method, amount]) => (
                    <tr key={method}>
                      <Td>{PAYMENT_METHOD[method] ?? method}</Td>
                      <Td className="tabular-nums">{money(amount)}</Td>
                    </tr>
                  ))}
                </Table>
              </Card>
            )}
          </div>

          <Card title={data.scope === 'own' ? 'Mes résultats' : 'Équipe'}>
            <Table head={['Employé', 'Chiffre d’affaires', 'Prestations', 'RDV terminés', 'Pourboires', 'Commissions']} empty={data.staff.length === 0}>
              {data.staff.map((s) => (
                <tr key={s.staffId}>
                  <Td>{s.name}</Td>
                  <Td className="tabular-nums">{money(s.revenue)}</Td>
                  <Td className="tabular-nums">{s.services}</Td>
                  <Td className="tabular-nums">{s.appointments}</Td>
                  <Td className="tabular-nums">{money(s.tips)}</Td>
                  <Td className="tabular-nums">{money(s.commissions)}</Td>
                </tr>
              ))}
            </Table>
          </Card>

          <div className="grid gap-4 lg:grid-cols-2">
            {data.topProducts.length > 0 && (
              <Card title="Produits vendus">
                <Table head={['Produit', 'Quantité', 'Ventes', 'Marge']}>
                  {data.topProducts.map((p) => (
                    <tr key={p.label}>
                      <Td>{p.label}</Td>
                      <Td className="tabular-nums">{p.quantity}</Td>
                      <Td className="tabular-nums">{money(p.revenue)}</Td>
                      <Td className="tabular-nums">{money(p.margin)}</Td>
                    </tr>
                  ))}
                </Table>
              </Card>
            )}
            {data.finance && data.finance.expensesByCategory.length > 0 && (
              <Card title="Dépenses par catégorie">
                <Table head={['Catégorie', 'Montant']}>
                  {data.finance.expensesByCategory.map((e) => (
                    <tr key={e.category}>
                      <Td>{e.category}</Td>
                      <Td className="tabular-nums">{money(e.amount)}</Td>
                    </tr>
                  ))}
                </Table>
              </Card>
            )}
          </div>
        </div>
      )}
    </>
  );
}
