'use client';

import { MapPin, Navigation } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { useDriver } from '@/lib/driver-runtime';
import { fcfa, SERVICE_LABELS } from '@/lib/format';
import { Button } from './ui';

/** Fenêtre d'offre de mission, avec compte à rebours, affichée par-dessus toutes les pages livreur. */
export function OfferSheet() {
  const { offers, respond } = useDriver();
  const router = useRouter();
  const offer = offers[0];
  const [now, setNow] = useState(Date.now());
  const [busy, setBusy] = useState<'accept' | 'reject' | null>(null);
  const [initial, setInitial] = useState<{ id: string; ms: number } | null>(null);

  useEffect(() => {
    if (offer && initial?.id !== offer.offerId) {
      setInitial({ id: offer.offerId, ms: Math.max(1000, new Date(offer.expiresAt).getTime() - Date.now()) });
    }
  }, [offer, initial]);

  useEffect(() => {
    if (!offer) return;
    const t = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(t);
  }, [offer]);

  if (!offer) return null;
  const total = initial?.id === offer.offerId ? initial.ms : 30_000;
  const remaining = Math.max(0, new Date(offer.expiresAt).getTime() - now);
  const pct = Math.min(100, (remaining / total) * 100);

  return (
    <div className="fixed inset-0 z-[1200] flex items-end justify-center bg-black/50 sm:items-center">
      <div className="w-full max-w-md rounded-t-3xl bg-white p-5 pb-8 shadow-2xl sm:rounded-3xl" role="alertdialog" aria-label="Nouvelle mission">
        <div className="mb-3 h-2 overflow-hidden rounded-full bg-slate-100">
          <div className="h-full rounded-full bg-brand-green transition-all" style={{ width: `${pct}%` }} />
        </div>
        <div className="flex items-start justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-brand-green">Nouvelle mission · {Math.ceil(remaining / 1000)} s</p>
            <p className="text-lg font-bold text-brand">
              {SERVICE_LABELS[offer.serviceType]} {offer.speed === 'EXPRESS' && <span className="ml-1 rounded bg-amber-100 px-1.5 py-0.5 text-xs text-amber-700">EXPRESS</span>}
            </p>
          </div>
          <div className="text-right">
            <p className="text-xs text-slate-500">Votre gain</p>
            <p className="text-2xl font-extrabold text-brand-greenDark">{fcfa(offer.driverEarning)}</p>
          </div>
        </div>
        <div className="mt-4 space-y-2 text-sm">
          <p className="flex gap-2">
            <Navigation className="h-4 w-4 shrink-0 text-brand-light" />
            <span>
              <strong>{offer.distanceToPickupKm.toLocaleString('fr-FR')} km</strong> jusqu’au ramassage
            </span>
          </p>
          <p className="flex gap-2">
            <MapPin className="h-4 w-4 shrink-0 text-brand-light" />
            <span>
              <strong>A.</strong> {offer.pickup.landmark}
            </span>
          </p>
          <p className="flex gap-2">
            <MapPin className="h-4 w-4 shrink-0 text-brand-green" />
            <span>
              <strong>B.</strong> {offer.dropoff.landmark} <span className="text-slate-500">({offer.tripDistanceKm.toLocaleString('fr-FR')} km)</span>
            </span>
          </p>
          {offer.amountToCollect > 0 && <p className="rounded-lg bg-amber-50 px-3 py-2 text-amber-800">Espèces à encaisser : {fcfa(offer.amountToCollect)}</p>}
          {offer.purchaseBudget && <p className="rounded-lg bg-blue-50 px-3 py-2 text-blue-800">Achats à avancer : jusqu’à {fcfa(offer.purchaseBudget)}</p>}
        </div>
        <div className="mt-5 grid grid-cols-3 gap-3">
          <Button variant="outline" loading={busy === 'reject'} onClick={async () => { setBusy('reject'); await respond(offer.offerId, false); setBusy(null); }}>
            Refuser
          </Button>
          <Button
            variant="success"
            size="lg"
            className="col-span-2"
            loading={busy === 'accept'}
            onClick={async () => {
              setBusy('accept');
              const orderId = await respond(offer.offerId, true);
              setBusy(null);
              if (orderId) router.push(`/livreur/missions/${orderId}`);
            }}
          >
            Accepter
          </Button>
        </div>
      </div>
    </div>
  );
}
