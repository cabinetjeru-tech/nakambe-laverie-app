'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useState } from 'react';
import { CityFilter } from '@/components/admin/city-filter';
import { DataTable } from '@/components/admin/table';
import { Input, PageHeader, Pagination, Select, Spinner, StatusBadge } from '@/components/ui';
import { dateTime, fcfa, PAYMENT_LABELS, phoneDisplay, SERVICE_LABELS, STATUS_LABELS } from '@/lib/format';
import type { Paginated } from '@/lib/types';
import { useApi } from '@/lib/use-api';

interface Row {
  id: string;
  reference: string;
  status: string;
  statusLabel: string;
  serviceType: string;
  speed: string;
  totalAmount: number;
  paymentMethod: string;
  createdAt: string;
  scheduledAt: string | null;
  dispatchAttempts: number;
  city: { name: string };
  client: { firstName: string; lastName: string; phone: string };
  driver: { firstName: string; lastName: string } | null;
  stops: { kind: string; landmark: string }[];
}

const FILTERS: [string, string][] = [
  ['', 'Tous les statuts'],
  ['ACTIVE', 'En cours'],
  ['SEARCHING_DRIVER', 'Recherche de livreur'],
  ['PENDING_PAYMENT', 'Paiement à vérifier'],
  ['SCHEDULED', 'Programmées'],
  ['DELIVERED', 'Livrées'],
  ['COMPLETED', 'Terminées'],
  ['CANCELLED', 'Annulées'],
  ['FAILED', 'Échecs'],
];
const ACTIVE = ['SEARCHING_DRIVER', 'DRIVER_ASSIGNED', 'DRIVER_AT_PICKUP', 'PURCHASING', 'PICKED_UP', 'IN_TRANSIT', 'ARRIVED_AT_DROPOFF'];

function OrdersList() {
  const router = useRouter();
  const params = useSearchParams();
  const driverId = params.get('driverId');
  const clientId = params.get('clientId');
  const [status, setStatus] = useState(driverId || clientId ? '' : 'ACTIVE');
  const [cityId, setCityId] = useState('');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const statuses = status === 'ACTIVE' ? ACTIVE : status ? [status] : [];
  const query = [
    ...statuses.map((s) => `status=${s}`),
    cityId && `cityId=${cityId}`,
    driverId && `driverId=${driverId}`,
    clientId && `clientId=${clientId}`,
    search.trim().length >= 2 && `search=${encodeURIComponent(search.trim())}`,
    `page=${page}`,
    'pageSize=25',
  ]
    .filter(Boolean)
    .join('&');
  const { data } = useApi<Paginated<Row>>(`/admin/orders?${query}`, { refreshInterval: 20_000, persist: false });

  return (
    <div className="space-y-4">
      <PageHeader title="Commandes" subtitle={data ? `${data.total} commande(s)` : undefined} />
      <div className="flex flex-wrap gap-2">
        <Select className="w-auto" value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }}>
          {FILTERS.map(([v, l]) => (
            <option key={v} value={v}>{l}</option>
          ))}
        </Select>
        <CityFilter value={cityId} onChange={(v) => { setCityId(v); setPage(1); }} />
        <Input className="w-64" placeholder="Référence, nom ou téléphone" value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} />
      </div>
      <DataTable
        rows={data?.items}
        rowKey={(r) => r.id}
        onRowClick={(r) => router.push(`/admin/commandes/${r.id}`)}
        columns={[
          {
            header: 'Commande',
            cell: (r) => (
              <>
                <span className="font-semibold text-brand">{r.reference}</span>
                <span className="block text-xs text-slate-500">
                  {SERVICE_LABELS[r.serviceType]} {r.speed === 'EXPRESS' && '· express'} · {r.city.name}
                </span>
              </>
            ),
          },
          { header: 'Statut', cell: (r) => (<><StatusBadge status={r.status} label={STATUS_LABELS[r.status] ?? r.statusLabel} />{r.status === 'SEARCHING_DRIVER' && r.dispatchAttempts > 0 && <span className="block text-xs text-slate-500">{r.dispatchAttempts} livreur(s) sollicité(s)</span>}</>) },
          { header: 'Trajet', cell: (r) => <span className="line-clamp-2 max-w-xs text-xs text-slate-600">{r.stops[0]?.landmark} → {r.stops[1]?.landmark}</span> },
          { header: 'Client', cell: (r) => (<>{r.client.firstName} {r.client.lastName}<span className="block text-xs text-slate-500">{phoneDisplay(r.client.phone)}</span></>) },
          { header: 'Livreur', cell: (r) => (r.driver ? `${r.driver.firstName} ${r.driver.lastName}` : '—') },
          { header: 'Montant', cell: (r) => (<>{fcfa(r.totalAmount)}<span className="block text-xs text-slate-500">{PAYMENT_LABELS[r.paymentMethod]}</span></>) },
          { header: 'Date', cell: (r) => dateTime(r.scheduledAt ?? r.createdAt) },
        ]}
      />
      {data && <Pagination page={page} pageSize={data.pageSize} total={data.total} onChange={setPage} />}
    </div>
  );
}

export default function AdminOrdersPage() {
  return (
    <Suspense fallback={<Spinner />}>
      <OrdersList />
    </Suspense>
  );
}
