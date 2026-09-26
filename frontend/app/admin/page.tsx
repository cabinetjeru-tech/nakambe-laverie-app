'use client';

import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { formatFcfa, formatDateTime } from '@/lib/format';
import { useRequireAuth } from '@/lib/use-require-auth';
import { PushNotificationCard } from '@/components/push-notification-card';
import { SERVICE_DOMAIN_LABELS } from '@/lib/constants';

interface PeriodStats {
  revenue: number;
  ordersCount: number;
  ordersInProgress: number;
  ordersDone: number;
  newClients: number;
  deliveries: number;
  appointments: number;
}

interface PendingAppointment {
  id: string;
  domain: string;
  scheduledDate: string;
  client: { fullName: string; phone: string };
}

interface Overview {
  today: PeriodStats;
  week: PeriodStats;
  month: PeriodStats & { expenses: number; estimatedProfit: number };
  lowStockAlerts: { id: string; name: string; currentStock: string; minThreshold: string; unit: string }[];
  topServices: { label: string; quantity: number; total: number }[];
  pendingAppointments: PendingAppointment[];
}

function StatCard({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className={`card ${accent ? 'border-brand-gold bg-brand-gold-light' : ''}`}>
      <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</div>
      <div className={`mt-1 text-2xl font-extrabold ${accent ? 'text-brand-blue-dark' : 'text-brand-blue'}`}>{value}</div>
    </div>
  );
}

function PeriodBlock({ title, stats }: { title: string; stats: PeriodStats }) {
  return (
    <div>
      <h3 className="mb-3 text-sm font-bold uppercase tracking-wide text-slate-500">{title}</h3>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        <StatCard label="Chiffre d'affaires" value={formatFcfa(stats.revenue)} accent />
        <StatCard label="Demandes" value={String(stats.appointments)} />
        <StatCard label="Commandes" value={String(stats.ordersCount)} />
        <StatCard label="En cours" value={String(stats.ordersInProgress)} />
        <StatCard label="Nouveaux clients" value={String(stats.newClients)} />
      </div>
    </div>
  );
}

export default function AdminDashboardPage() {
  const { user, loading: authLoading } = useRequireAuth(['ADMIN', 'GERANT']);
  const { data, isLoading, isError } = useQuery<Overview>({
    queryKey: ['dashboard-overview'],
    queryFn: async () => (await api.get('/dashboard/overview')).data,
    enabled: !!user,
  });

  if (authLoading || !user) return <p className="text-slate-400">Chargement...</p>;
  if (isError) {
    return (
      <p className="text-red-600">
        Impossible de charger le tableau de bord. Vérifiez votre connexion et réessayez.
      </p>
    );
  }
  if (isLoading || !data) return <p className="text-slate-400">Chargement du tableau de bord...</p>;

  return (
    <div className="flex flex-col gap-10">
      <div>
        <h1 className="text-2xl font-bold text-brand-blue">Tableau de bord</h1>
        <p className="text-sm text-slate-500">Vue d&apos;ensemble de l&apos;activité de l&apos;agence.</p>
      </div>

      <PushNotificationCard />

      <div className="card border-brand-blue">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-sm font-bold uppercase tracking-wide text-slate-500">
            Nouvelles demandes en attente de confirmation
          </h3>
          <Link href="/admin/rendez-vous" className="text-sm font-semibold text-brand-blue underline">
            Voir tout
          </Link>
        </div>
        {data.pendingAppointments.length ? (
          <ul className="flex flex-col gap-2">
            {data.pendingAppointments.map((a) => (
              <li key={a.id} className="flex items-center justify-between text-sm">
                <div>
                  <span className="font-semibold text-brand-blue">{a.client.fullName}</span>
                  <span className="text-slate-500"> — {SERVICE_DOMAIN_LABELS[a.domain] ?? a.domain}</span>
                </div>
                <span className="text-xs text-slate-400">{formatDateTime(a.scheduledDate)}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-slate-400">Aucune demande en attente pour le moment.</p>
        )}
      </div>

      <PeriodBlock title="Aujourd'hui" stats={data.today} />
      <PeriodBlock title="Cette semaine" stats={data.week} />

      <div>
        <h3 className="mb-3 text-sm font-bold uppercase tracking-wide text-slate-500">Ce mois</h3>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <StatCard label="Chiffre d'affaires" value={formatFcfa(data.month.revenue)} accent />
          <StatCard label="Dépenses" value={formatFcfa(data.month.expenses)} />
          <StatCard label="Bénéfice estimé" value={formatFcfa(data.month.estimatedProfit)} />
          <StatCard label="Nouveaux clients" value={String(data.month.newClients)} />
        </div>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        <div className="card">
          <h3 className="mb-3 text-sm font-bold uppercase tracking-wide text-slate-500">
            Alertes de stock (seuil atteint)
          </h3>
          {data.lowStockAlerts.length ? (
            <ul className="flex flex-col gap-2">
              {data.lowStockAlerts.map((p) => (
                <li key={p.id} className="flex items-center justify-between text-sm">
                  <span>{p.name}</span>
                  <span className="badge bg-red-100 text-red-700">
                    {p.currentStock} / {p.minThreshold} {p.unit}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-slate-400">Aucune alerte, tout est sous contrôle.</p>
          )}
        </div>

        <div className="card">
          <h3 className="mb-3 text-sm font-bold uppercase tracking-wide text-slate-500">
            Services les plus demandés (ce mois)
          </h3>
          {data.topServices.length ? (
            <ul className="flex flex-col gap-2">
              {data.topServices.map((s) => (
                <li key={s.label} className="flex items-center justify-between text-sm">
                  <span>{s.label}</span>
                  <span className="font-semibold text-brand-blue">{formatFcfa(s.total)}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-slate-400">Pas encore de données ce mois-ci.</p>
          )}
        </div>
      </div>
    </div>
  );
}
