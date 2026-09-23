'use client';

import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { Badge, Card, Empty, ErrorMessage, PageHeader, Spinner, Stat } from '@/components/ui';
import { get, qs } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { APPOINTMENT_STATUS, longDay, money, time } from '@/lib/format';
import { useSalon } from '@/lib/salon';

interface Dashboard {
  date: string;
  salon: { name: string; timezone: string; currency: string };
  appointments?: {
    total: number;
    byStatus: Record<string, number>;
    upcoming: { id: string; status: string; startsAt: string; client: { fullName: string } | null; items: { serviceName: string; staff: { displayName: string; calendarColor: string } }[] }[];
  };
  sales?: { count: number; revenue: number; tips: number };
  cash?: { status: 'OPEN' | 'CLOSED'; expectedCash?: number };
  pendingPayments?: number;
  lowStock?: { count: number; items: { id: string; name: string; quantity: string }[] };
  expensesToday?: number;
  myCommissionsThisMonth?: number;
}

export default function DashboardPage() {
  const { salon } = useSalon();
  const { me } = useAuth();
  const { data, isLoading, error } = useQuery({
    queryKey: ['dashboard', salon?.id],
    queryFn: () => get<Dashboard>(`/dashboard${qs({ salonId: salon!.id })}`),
    enabled: Boolean(salon),
    refetchInterval: 60_000,
  });

  if (!salon || isLoading) return <Spinner />;
  if (error) return <ErrorMessage error={error} />;
  if (!data) return null;
  const tz = data.salon.timezone;
  const done = data.appointments?.byStatus.COMPLETED ?? 0;

  return (
    <>
      <PageHeader title={`Bonjour ${me?.user.fullName.split(' ')[0] ?? ''}`} description={`${data.salon.name} — ${longDay(data.date)}`} />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {data.appointments && <Stat label="Rendez-vous du jour" value={data.appointments.total} sub={`${done} terminé${done > 1 ? 's' : ''}`} />}
        {data.sales && <Stat label="Chiffre d’affaires du jour" value={money(data.sales.revenue, data.salon.currency)} sub={`${data.sales.count} vente${data.sales.count > 1 ? 's' : ''} · pourboires ${money(data.sales.tips)}`} />}
        {data.cash && (
          <Stat
            label="Caisse"
            value={data.cash.status === 'OPEN' ? 'Ouverte' : 'Fermée'}
            sub={data.cash.status === 'OPEN' ? `Attendu : ${money(data.cash.expectedCash)}` : 'Ouvrez-la pour encaisser en espèces'}
          />
        )}
        {data.myCommissionsThisMonth !== undefined && <Stat label="Mes commissions du mois" value={money(data.myCommissionsThisMonth)} />}
        {data.expensesToday !== undefined && <Stat label="Dépenses du jour" value={money(data.expensesToday)} />}
      </div>

      {(data.pendingPayments ?? 0) > 0 && (
        <p className="mt-4 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
          {data.pendingPayments} paiement(s) Mobile Money à vérifier.{' '}
          <Link href="/caisse" className="font-medium underline">
            Ouvrir la caisse
          </Link>
        </p>
      )}

      <div className="mt-6 grid gap-4 lg:grid-cols-3">
        {data.appointments && (
          <Card title="Prochains rendez-vous" className="lg:col-span-2" actions={<Link href="/rendez-vous" className="text-sm text-brand-700 hover:underline">Agenda</Link>}>
            {data.appointments.upcoming.length === 0 ? (
              <Empty title="Plus de rendez-vous aujourd’hui." />
            ) : (
              <ul className="divide-y divide-stone-100">
                {data.appointments.upcoming.map((a) => (
                  <li key={a.id} className="flex items-center gap-3 py-2">
                    <span className="w-12 shrink-0 text-sm font-semibold tabular-nums text-stone-900">{time(a.startsAt, tz)}</span>
                    <span className="h-8 w-1 shrink-0 rounded-full" style={{ background: a.items[0]?.staff.calendarColor }} aria-hidden />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-stone-900">{a.client?.fullName ?? 'Client de passage'}</p>
                      <p className="truncate text-xs text-stone-500">
                        {a.items.map((i) => i.serviceName).join(', ')} · {a.items[0]?.staff.displayName}
                      </p>
                    </div>
                    <Badge tone={APPOINTMENT_STATUS[a.status]?.tone}>{APPOINTMENT_STATUS[a.status]?.label}</Badge>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        )}
        {data.lowStock && (
          <Card title="Stock à réapprovisionner" actions={<Link href="/stock" className="text-sm text-brand-700 hover:underline">Stock</Link>}>
            {data.lowStock.count === 0 ? (
              <p className="text-sm text-stone-500">Aucun produit sous son seuil d’alerte.</p>
            ) : (
              <ul className="space-y-1 text-sm">
                {data.lowStock.items.map((p) => (
                  <li key={p.id} className="flex justify-between">
                    <span>{p.name}</span>
                    <span className="tabular-nums text-red-700">{p.quantity}</span>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        )}
      </div>
    </>
  );
}
