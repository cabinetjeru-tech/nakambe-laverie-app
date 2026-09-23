'use client';

import { useState } from 'react';
import { CityFilter } from '@/components/admin/city-filter';
import { DataTable } from '@/components/admin/table';
import { Card, Field, Input, PageHeader, Stat } from '@/components/ui';
import type { StatsOverview } from '@/lib/admin-types';
import { fcfa, SERVICE_LABELS, VEHICLE_LABELS } from '@/lib/format';
import { useApi } from '@/lib/use-api';

interface DriverRow {
  driverId: string;
  name: string;
  employmentType: string;
  vehicleType: string;
  rating: number | null;
  deliveries: number;
  earnings: number;
  deliveryFees: number;
}

const iso = (d: Date) => d.toISOString().slice(0, 10);

export default function StatsPage() {
  const [cityId, setCityId] = useState('');
  const [from, setFrom] = useState(iso(new Date(Date.now() - 30 * 86400_000)));
  const [to, setTo] = useState(iso(new Date()));
  const q = `from=${from}T00:00:00Z&to=${to}T23:59:59Z${cityId ? `&cityId=${cityId}` : ''}`;
  const overview = useApi<StatsOverview>(`/admin/stats/overview?${q}`, { persist: false });
  const drivers = useApi<DriverRow[]>(`/admin/stats/drivers?${q}`, { persist: false });
  const d = overview.data;
  return (
    <div className="space-y-4">
      <PageHeader title="Statistiques" />
      <div className="flex flex-wrap items-end gap-3">
        <Field label="Du">
          <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
        </Field>
        <Field label="Au">
          <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
        </Field>
        <CityFilter value={cityId} onChange={setCityId} />
      </div>
      {d && (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Stat label="Commandes créées" value={d.orders.created} />
            <Stat label="Livrées" value={d.orders.delivered} tone="green" />
            <Stat label="Chiffre d’affaires" value={fcfa(d.money.deliveryRevenue)} />
            <Stat label="Commissions" value={fcfa(d.money.commissions)} />
            <Stat label="Remises accordées" value={fcfa(d.money.discounts)} />
            <Stat label="Achats avancés" value={fcfa(d.money.purchasesAdvanced)} />
            <Stat label="Taux d’annulation" value={d.orders.created ? `${Math.round((d.orders.cancelled / d.orders.created) * 100)} %` : '—'} />
            <Stat label="Nouveaux clients" value={d.people.newClients} />
          </div>
          <Card>
            <h2 className="mb-2 font-semibold text-brand">Par service</h2>
            <table className="w-full text-sm">
              <tbody>
                {d.orders.byService.map((s) => (
                  <tr key={s.serviceType} className="border-t border-slate-100">
                    <td className="py-2">{SERVICE_LABELS[s.serviceType]}</td>
                    <td className="py-2 text-right tabular-nums">{s.delivered} livraisons</td>
                    <td className="py-2 text-right tabular-nums">{fcfa(s.deliveryFees)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        </>
      )}
      <h2 className="font-semibold text-brand">Classement des livreurs</h2>
      <DataTable
        rows={drivers.data}
        rowKey={(r) => r.driverId}
        columns={[
          { header: 'Livreur', cell: (r) => r.name },
          { header: 'Statut', cell: (r) => `${r.employmentType === 'SALARIE' ? 'Salarié' : 'Indépendant'} · ${VEHICLE_LABELS[r.vehicleType] ?? ''}` },
          { header: 'Note', cell: (r) => (r.rating ? `★ ${r.rating}` : '—') },
          { header: 'Livraisons', cell: (r) => r.deliveries, className: 'text-right' },
          { header: 'Frais générés', cell: (r) => fcfa(r.deliveryFees), className: 'text-right' },
          { header: 'Gains', cell: (r) => fcfa(r.earnings), className: 'text-right' },
        ]}
      />
    </div>
  );
}
