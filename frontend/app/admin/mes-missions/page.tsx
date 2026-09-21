'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';
import { formatFcfa, whatsappLink } from '@/lib/format';
import { ORDER_STATUS_LABELS, SERVICE_DOMAIN_LABELS } from '@/lib/constants';

const MIN_SECONDS_BETWEEN_UPDATES = 20;

export default function MesMissionsPage() {
  const { user } = useAuth();
  const router = useRouter();
  const isDriver = user?.role === 'CHAUFFEUR';
  const endpoint = isDriver ? '/orders/missions' : '/orders/assigned';

  const { data, isLoading } = useQuery({
    queryKey: ['mes-missions', endpoint],
    queryFn: async () => (await api.get(endpoint)).data,
    enabled: !!user,
  });

  const [sharing, setSharing] = useState(false);
  const [locationError, setLocationError] = useState<string | null>(null);
  const [lastSentAt, setLastSentAt] = useState<Date | null>(null);
  const watchIdRef = useRef<number | null>(null);
  const lastSendRef = useRef(0);

  const activeVehicleIds: string[] = Array.from(
    new Set(
      (data ?? [])
        .filter((o: any) => o.vehicleId && !['TERMINE', 'ANNULE'].includes(o.status))
        .map((o: any) => o.vehicleId as string),
    ),
  );

  useEffect(() => {
    if (!sharing) {
      if (watchIdRef.current !== null) {
        navigator.geolocation.clearWatch(watchIdRef.current);
        watchIdRef.current = null;
      }
      return;
    }
    if (!navigator.geolocation) {
      setLocationError("La géolocalisation n'est pas disponible sur cet appareil.");
      setSharing(false);
      return;
    }
    if (activeVehicleIds.length === 0) {
      // Plus aucune mission en cours : on coupe le GPS pour économiser la batterie.
      setSharing(false);
      return;
    }

    watchIdRef.current = navigator.geolocation.watchPosition(
      async (position) => {
        setLocationError(null);
        const now = Date.now();
        if (now - lastSendRef.current < MIN_SECONDS_BETWEEN_UPDATES * 1000) return;
        lastSendRef.current = now;

        const { latitude, longitude, accuracy } = position.coords;
        await Promise.all(
          activeVehicleIds.map((vehicleId) =>
            api.patch(`/vehicles/${vehicleId}/location`, { lat: latitude, lng: longitude, accuracy }).catch(() => null),
          ),
        );
        setLastSentAt(new Date());
      },
      () => setLocationError('Position indisponible. Vérifiez que la localisation est activée.'),
      { enableHighAccuracy: true, maximumAge: 10000 },
    );

    return () => {
      if (watchIdRef.current !== null) {
        navigator.geolocation.clearWatch(watchIdRef.current);
        watchIdRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sharing, activeVehicleIds.join(',')]);

  return (
    <div>
      <h1 className="text-2xl font-bold text-brand-blue">Mes missions</h1>
      <p className="text-sm text-slate-500">Commandes qui vous sont affectées.</p>

      {isDriver && (
        <div className="card mt-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <div className="font-semibold text-slate-700">Partage de position GPS</div>
              <p className="text-xs text-slate-500">
                Permet aux clients de voir où en est le tricycle pendant une collecte ou une livraison. Se coupe
                automatiquement dès qu&apos;il n&apos;y a plus de mission en cours.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setSharing((v) => !v)}
              disabled={activeVehicleIds.length === 0}
              className={`shrink-0 rounded-full px-4 py-2 text-sm font-semibold disabled:opacity-50 ${
                sharing ? 'bg-red-600 text-white' : 'btn-primary'
              }`}
            >
              {sharing ? 'Arrêter le partage' : 'Activer le partage de position'}
            </button>
          </div>
          {activeVehicleIds.length === 0 && (
            <p className="mt-2 text-xs text-slate-400">Aucun véhicule affecté à une mission en cours.</p>
          )}
          {sharing && lastSentAt && (
            <p className="mt-2 text-xs text-brand-blue">Position envoyée à {lastSentAt.toLocaleTimeString('fr-FR')}</p>
          )}
          {locationError && <p className="mt-2 text-xs text-red-600">{locationError}</p>}
        </div>
      )}

      <div className="mt-6 flex flex-col gap-3">
        {isLoading && <p className="text-slate-400">Chargement...</p>}
        {data?.length === 0 && <p className="text-slate-400">Aucune mission en cours.</p>}
        {data?.map((o: any) => (
          <div
            key={o.id}
            role="link"
            tabIndex={0}
            onClick={() => router.push(`/admin/commandes/${o.id}`)}
            onKeyDown={(e) => e.key === 'Enter' && router.push(`/admin/commandes/${o.id}`)}
            className="card flex cursor-pointer items-center justify-between hover:shadow-md"
          >
            <div>
              <div className="font-semibold text-brand-blue">{o.orderNumber}</div>
              <div className="text-xs text-slate-500">
                {o.client?.fullName} · {SERVICE_DOMAIN_LABELS[o.domain] ?? o.domain}
              </div>
            </div>
            <div className="flex items-center gap-3">
              <span className="badge bg-brand-gold-light text-brand-blue-dark">
                {ORDER_STATUS_LABELS[o.status] ?? o.status}
              </span>
              <span className="text-sm font-semibold">{formatFcfa(o.total)}</span>
              <a
                onClick={(e) => e.stopPropagation()}
                href={whatsappLink(o.client?.whatsapp ?? o.client?.phone ?? '', `Bonjour, je suis en route pour votre commande ${o.orderNumber}.`)}
                target="_blank"
                rel="noreferrer"
                className="text-lg"
              >
                💬
              </a>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
