'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { CityFilter, useCities } from '@/components/admin/city-filter';
import { Map, MapMarker } from '@/components/map';
import { Card, PageHeader, StatusBadge } from '@/components/ui';
import { phoneDisplay, SERVICE_LABELS, timeOnly, VEHICLE_LABELS } from '@/lib/format';
import { CITY_CENTERS } from '@/lib/geo';
import { getSocket } from '@/lib/socket';
import { useApi } from '@/lib/use-api';

interface Live {
  drivers: { userId: string; vehicleType: string; employmentType: string; lastLat: number | null; lastLng: number | null; lastLocationAt: string | null; busy: boolean; user: { firstName: string; lastName: string; phone: string } }[];
  orders: { id: string; reference: string; status: string; statusLabel: string; driverId: string | null; serviceType: string; createdAt: string; stops: { kind: string; lat: number; lng: number; landmark: string }[] }[];
}

export default function LiveMapPage() {
  const cities = useCities();
  const [cityId, setCityId] = useState('');
  const { data, reload } = useApi<Live>(`/admin/live${cityId ? `?cityId=${cityId}` : ''}`, { refreshInterval: 30_000, persist: false });
  const [positions, setPositions] = useState<Record<string, { lat: number; lng: number }>>({});

  useEffect(() => {
    if (!cityId && cities[0]) setCityId(cities[0].id);
  }, [cities, cityId]);

  useEffect(() => {
    const socket = getSocket();
    const onLocation = (e: { driverId: string; lat?: number; lng?: number; online?: boolean }) => {
      if (e.online !== undefined) void reload();
      if (e.lat != null && e.lng != null) setPositions((p) => ({ ...p, [e.driverId]: { lat: e.lat!, lng: e.lng! } }));
    };
    const onOrder = () => void reload();
    socket.on('driver.location', onLocation);
    socket.on('order.updated', onOrder);
    return () => {
      socket.off('driver.location', onLocation);
      socket.off('order.updated', onOrder);
    };
  }, [reload]);

  const city = cities.find((c) => c.id === cityId);
  const center = city ? { lat: city.centerLat, lng: city.centerLng } : CITY_CENTERS.ouagadougou;
  const markers = useMemo<MapMarker[]>(() => {
    if (!data) return [];
    const drivers = data.drivers
      .map((d) => {
        const pos = positions[d.userId] ?? (d.lastLat != null && d.lastLng != null ? { lat: d.lastLat, lng: d.lastLng } : null);
        return pos ? { id: d.userId, kind: (d.busy ? 'driver-busy' : 'driver') as MapMarker['kind'], ...pos, label: `${d.user.firstName} ${d.user.lastName}${d.busy ? ' (en mission)' : ''}` } : null;
      })
      .filter(Boolean) as MapMarker[];
    const waiting = data.orders
      .filter((o) => !o.driverId)
      .map((o) => ({ id: o.id, kind: 'order' as const, lat: o.stops[0].lat, lng: o.stops[0].lng, label: `${o.reference} — ${o.statusLabel}` }));
    return [...waiting, ...drivers];
  }, [data, positions]);

  return (
    <div className="space-y-4">
      <PageHeader title="Carte en direct" subtitle="🛵 bleu : disponible · 🛵 orange : en mission · • rouge : commande sans livreur" action={<CityFilter value={cityId} onChange={setCityId} allLabel="Toutes" />} />
      <Map key={cityId} center={center} zoom={12} markers={markers} className="h-[60vh] w-full" />
      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <h2 className="mb-2 font-semibold text-brand">Livreurs en ligne ({data?.drivers.length ?? 0})</h2>
          <ul className="divide-y divide-slate-100 text-sm">
            {data?.drivers.map((d) => (
              <li key={d.userId} className="flex items-center justify-between py-2">
                <Link href={`/admin/livreurs/${d.userId}`} className="font-medium text-brand">
                  {d.user.firstName} {d.user.lastName}
                </Link>
                <span className="text-xs text-slate-500">
                  {VEHICLE_LABELS[d.vehicleType]} · {d.busy ? 'en mission' : 'disponible'} · GPS {timeOnly(d.lastLocationAt)} · {phoneDisplay(d.user.phone)}
                </span>
              </li>
            ))}
          </ul>
        </Card>
        <Card>
          <h2 className="mb-2 font-semibold text-brand">Commandes en cours ({data?.orders.length ?? 0})</h2>
          <ul className="divide-y divide-slate-100 text-sm">
            {data?.orders.map((o) => (
              <li key={o.id} className="flex items-center justify-between gap-2 py-2">
                <Link href={`/admin/commandes/${o.id}`} className="min-w-0">
                  <span className="font-medium text-brand">{o.reference}</span>
                  <span className="block truncate text-xs text-slate-500">{SERVICE_LABELS[o.serviceType]} · {o.stops[0].landmark}</span>
                </Link>
                <StatusBadge status={o.status} label={o.statusLabel} />
              </li>
            ))}
          </ul>
        </Card>
      </div>
    </div>
  );
}
