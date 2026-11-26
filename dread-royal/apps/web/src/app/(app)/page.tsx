'use client';
import { AlertTriangle, Banknote, CalendarCheck, Package, Receipt, Scissors, TrendingDown, TrendingUp, Users, Wallet } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';
import { APPOINTMENT_STATUS_LABELS } from '@dread-royal/shared';
import { RequirePerm } from '@/components/AppShell';
import { CountLines, MoneyLines, RankBars } from '@/components/charts';
import { Badge, Card, ErrorBox, Input, PageHeader, Spinner, StatCard, Table, Tabs } from '@/components/ui';
import { qs } from '@/lib/api';
import { fmtDateTime, fmtTime, formatFCFA, todayISO } from '@/lib/format';
import { useApi } from '@/lib/hooks';

type Period = 'day' | 'week' | 'month' | 'year';

export default function DashboardPage() {
  return <RequirePerm perms={['dashboard.view']}><Dashboard /></RequirePerm>;
}

function Dashboard() {
  const [period, setPeriod] = useState<Period>('month');
  const [date, setDate] = useState(todayISO());
  const { data, error, loading, reload } = useApi<any>(`/dashboard${qs({ period, date })}`);
  const xFormat = (k: string) => (k.length === 7 ? new Date(`${k}-01T00:00:00Z`).toLocaleDateString('fr-FR', { month: 'short', timeZone: 'UTC' }) : new Date(`${k}T00:00:00Z`).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', timeZone: 'UTC' }));

  return (
    <>
      <PageHeader title="Tableau de bord" subtitle={data ? `Période : ${data.period.label}` : 'Activité du salon'} actions={<Input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="w-40" />} />
      <Tabs tabs={[{ key: 'day', label: 'Jour' }, { key: 'week', label: 'Semaine' }, { key: 'month', label: 'Mois' }, { key: 'year', label: 'Année' }]} value={period} onChange={setPeriod} />
      {error && <ErrorBox error={error} onRetry={reload} />}
      {loading && !data && <Spinner />}
      {data && (
        <div className="space-y-5">
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <StatCard tone="dark" label="CA du jour" value={formatFCFA(data.kpis.revenueToday)} icon={<TrendingUp className="h-4 w-4" />} hint="Ventes validées" />
            <StatCard tone="dark" label="CA du mois" value={formatFCFA(data.kpis.revenueMonth)} icon={<TrendingUp className="h-4 w-4" />} />
            <StatCard label="Dépenses du jour" value={formatFCFA(data.kpis.expensesToday)} icon={<TrendingDown className="h-4 w-4" />} />
            <StatCard label="Dépenses du mois" value={formatFCFA(data.kpis.expensesMonth)} icon={<TrendingDown className="h-4 w-4" />} />
            <StatCard tone="gold" label="Résultat comptable (période)" value={<span className={data.kpis.accountingResult < 0 ? 'text-red-600' : ''}>{formatFCFA(data.kpis.accountingResult)}</span>} hint={<>Bénéfice estimé : <b>{formatFCFA(data.kpis.estimatedProfit)}</b> (après commissions dues)</>} icon={<Banknote className="h-4 w-4" />} />
            <StatCard label="Caisse (solde théorique)" value={data.kpis.cash.open ? formatFCFA(data.kpis.cash.theoretical) : 'Fermée'} hint={data.kpis.cash.open ? `Session ${data.kpis.cash.number}` : data.kpis.cash.lastCounted != null ? `Dernière clôture : ${formatFCFA(data.kpis.cash.lastCounted)}` : 'Aucune session'} icon={<Wallet className="h-4 w-4" />} />
            <StatCard label="Encaissements (période)" value={formatFCFA(data.kpis.cashInPeriod)} hint={`Reste à encaisser (total) : ${formatFCFA(data.kpis.receivables)}`} icon={<Receipt className="h-4 w-4" />} />
            <StatCard label="Alertes de stock" value={data.kpis.stockAlerts} tone={data.kpis.stockAlerts ? 'red' : 'green'} hint={`Valeur du stock : ${formatFCFA(data.kpis.stockValue)}`} icon={<Package className="h-4 w-4" />} />
          </div>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <StatCard label="Clients" value={data.kpis.clientsTotal} hint={`+${data.kpis.newClients} nouveaux sur la période`} icon={<Users className="h-4 w-4" />} />
            <StatCard label="Rendez-vous" value={data.kpis.appointments} hint={`${data.kpis.appointmentsDone} terminés · ${data.kpis.appointmentsCancelled} annulés/absents`} icon={<CalendarCheck className="h-4 w-4" />} />
            <StatCard label="Prestations réalisées" value={data.kpis.servicesDone} icon={<Scissors className="h-4 w-4" />} />
            <StatCard label="Ventes" value={data.kpis.salesCount} hint={`CA période : ${formatFCFA(data.kpis.revenuePeriod)}`} icon={<Receipt className="h-4 w-4" />} />
          </div>

          <div className="grid gap-5 lg:grid-cols-2">
            <Card title={`Recettes et dépenses ${period === 'day' ? '(14 derniers jours)' : ''}`}>
              <MoneyLines data={data.charts.finance} xFormat={xFormat} series={[{ key: 'revenue', label: "Chiffre d'affaires" }, { key: 'expenses', label: 'Dépenses' }]} />
            </Card>
            <Card title="Évolution de la clientèle">
              <CountLines data={data.charts.clients} xFormat={xFormat} series={[{ key: 'served', label: 'Clients servis' }, { key: 'new', label: 'Nouveaux clients' }]} />
            </Card>
            <Card title="Prestations les plus vendues">
              {data.charts.topServices.length ? <RankBars data={data.charts.topServices} labelKey="name" valueKey="count" /> : <p className="py-8 text-center text-sm text-neutral-500">Aucune prestation sur la période.</p>}
            </Card>
            <Card title="Performance des collaborateurs (CA prestations)">
              {data.charts.staff.length ? (
                <>
                  <RankBars data={data.charts.staff} labelKey="name" valueKey="amount" money />
                  <Table rows={data.charts.staff} columns={[
                    { key: 'name', label: 'Collaborateur', render: (s: any) => <span className="flex items-center gap-2"><span className="h-2.5 w-2.5 rounded-full" style={{ background: s.color }} />{s.name}</span> },
                    { key: 'services', label: 'Prest.', align: 'right' },
                    { key: 'clients', label: 'Clients', align: 'right' },
                    { key: 'amount', label: 'CA', align: 'right', render: (s: any) => formatFCFA(s.amount) },
                    { key: 'commissions', label: 'Commissions', align: 'right', render: (s: any) => formatFCFA(s.commissions) },
                  ]} />
                </>
              ) : <p className="py-8 text-center text-sm text-neutral-500">Aucune prestation sur la période.</p>}
            </Card>
          </div>

          <div className="grid gap-5 lg:grid-cols-2">
            <Card title="Prochains rendez-vous" actions={<Link href="/rendez-vous/" className="text-xs font-semibold text-royal-gold-dark hover:underline">Planning →</Link>}>
              {data.upcoming.length ? (
                <ul className="divide-y">
                  {data.upcoming.map((a: any) => (
                    <li key={a.id} className="flex items-center gap-3 py-2 text-sm">
                      <span className="w-14 font-bold tabular-nums">{fmtTime(a.startAt)}</span>
                      <span className="h-8 w-1 rounded" style={{ background: a.staff.color }} />
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-semibold">{a.client.firstName} {a.client.lastName}</p>
                        <p className="truncate text-xs text-neutral-500">{a.items.map((i: any) => i.service.name).join(', ')} — {a.staff.firstName}</p>
                      </div>
                      <Badge tone={a.status === 'CONFIRMED' ? 'green' : 'orange'}>{APPOINTMENT_STATUS_LABELS[a.status]}</Badge>
                    </li>
                  ))}
                </ul>
              ) : <p className="py-6 text-center text-sm text-neutral-500">Aucun rendez-vous à venir aujourd&apos;hui ou demain.</p>}
            </Card>
            <Card title="Dernières ventes" actions={<Link href="/ventes/" className="text-xs font-semibold text-royal-gold-dark hover:underline">Toutes →</Link>}>
              <ul className="divide-y">
                {data.recentSales.map((s: any) => (
                  <li key={s.id}><Link href={`/ventes/detail/?id=${s.id}`} className="flex items-center gap-3 py-2 text-sm hover:bg-neutral-50">
                    <span className="w-32 font-mono text-xs">{s.number}</span>
                    <span className="min-w-0 flex-1 truncate">{s.client ? `${s.client.firstName} ${s.client.lastName}` : 'Client de passage'}<br /><span className="text-xs text-neutral-500">{fmtDateTime(s.saleDate)}</span></span>
                    <span className="font-semibold tabular-nums">{formatFCFA(s.total)}</span>
                    {s.status === 'CANCELLED' ? <Badge tone="red">Annulée</Badge> : s.balance > 0 ? <Badge tone="orange">Reste {formatFCFA(s.balance, false)}</Badge> : <Badge tone="green">Payée</Badge>}
                  </Link></li>
                ))}
              </ul>
            </Card>
          </div>
          {data.kpis.stockAlerts > 0 && (
            <Link href="/stock/?alertes=1" className="flex items-center gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-800"><AlertTriangle className="h-4 w-4" />{data.kpis.stockAlerts} produit(s) sous le seuil minimum — voir le stock</Link>
          )}
        </div>
      )}
    </>
  );
}
