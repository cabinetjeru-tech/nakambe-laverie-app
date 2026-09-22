'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import { Logo } from '@/components/logo';
import { Map, MapMarker } from '@/components/map';
import { Timeline } from '@/components/timeline';
import { Alert, Card, Spinner, StatusBadge } from '@/components/ui';
import { VEHICLE_LABELS } from '@/lib/format';
import { getSocket } from '@/lib/socket';
import { useApi } from '@/lib/use-api';

interface Tracking {
  reference: string;
  status: string;
  statusLabel: string;
  city: string;
  stops: { kind: string; lat: number; lng: number; landmark: string; contactName: string }[];
  driver: { firstName: string; vehicleType: string; location: { lat: number; lng: number } | null } | null;
  history: { status: string; label: string; at: string; note: string | null }[];
}

export default function PublicTrackingPage() {
  const { token } = useParams<{ token: string }>();
  const { data, error, reload } = useApi<Tracking>(`/track/${token}`, { refreshInterval: 30_000, persist: false });
  const [pos, setPos] = useState<{ lat: number; lng: number } | null>(null);

  useEffect(() => {
    const socket = getSocket();
    const join = () => socket.emit('track:subscribe', { token });
    join();
    socket.on('connect', join);
    const onUpdate = () => void reload();
    const onLocation = (e: { lat: number; lng: number }) => setPos({ lat: e.lat, lng: e.lng });
    socket.on('order.updated', onUpdate);
    socket.on('driver.location', onLocation);
    return () => {
      socket.off('connect', join);
      socket.off('order.updated', onUpdate);
      socket.off('driver.location', onLocation);
    };
  }, [token, reload]);

  const pickup = data?.stops.find((s) => s.kind === 'PICKUP');
  const dropoff = data?.stops.find((s) => s.kind === 'DROPOFF');
  const driverPos = pos ?? data?.driver?.location ?? null;
  const markers: MapMarker[] = [
    ...(pickup ? [{ kind: 'pickup' as const, lat: pickup.lat, lng: pickup.lng, label: 'Départ' }] : []),
    ...(dropoff ? [{ kind: 'dropoff' as const, lat: dropoff.lat, lng: dropoff.lng, label: 'Arrivée' }] : []),
    ...(driverPos ? [{ kind: 'driver' as const, lat: driverPos.lat, lng: driverPos.lng, label: data?.driver?.firstName }] : []),
  ];

  return (
    <main className="mx-auto min-h-screen max-w-xl space-y-4 px-4 py-5">
      <Link href="/">
        <Logo tagline />
      </Link>
      {error && !data && <Alert>{error.message}</Alert>}
      {!data && !error && <Spinner />}
      {data && (
        <>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-slate-500">Colis {data.reference}</p>
              <h1 className="text-xl font-bold text-brand">Pour {dropoff?.contactName}</h1>
            </div>
            <StatusBadge status={data.status} label={data.statusLabel} />
          </div>
          {pickup && <Map center={pickup} markers={markers} fit={markers} className="h-72 w-full" />}
          {data.driver && (
            <Card className="text-sm text-slate-700">
              Livreur : <strong>{data.driver.firstName}</strong> ({VEHICLE_LABELS[data.driver.vehicleType]})
            </Card>
          )}
          {['ARRIVED_AT_DROPOFF', 'IN_TRANSIT'].includes(data.status) && (
            <Alert tone="blue">Préparez le code de livraison à 4 chiffres reçu de l’expéditeur : le livreur vous le demandera.</Alert>
          )}
          <Card>
            <Timeline items={data.history} />
          </Card>
          <p className="text-center text-xs text-slate-400">Livraison assurée par Allô-Coursier — GROUPE AKAMBI SARL</p>
        </>
      )}
    </main>
  );
}
