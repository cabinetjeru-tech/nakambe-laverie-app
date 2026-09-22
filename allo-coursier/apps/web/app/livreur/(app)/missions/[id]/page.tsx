'use client';

import { CheckCircle2, MessageCircle, Navigation, Phone, Star } from 'lucide-react';
import { useParams } from 'next/navigation';
import { ReactNode, useEffect, useState } from 'react';
import { ChatPanel } from '@/components/chat';
import { Map, MapMarker } from '@/components/map';
import { PhotoInput } from '@/components/photo-input';
import { Timeline } from '@/components/timeline';
import { Alert, Button, Card, Field, Input, PageHeader, Sheet, Spinner, StatusBadge, Textarea } from '@/components/ui';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useDriver } from '@/lib/driver-runtime';
import { fcfa, phoneDisplay, SERVICE_LABELS, STATUS_LABELS } from '@/lib/format';
import { googleMapsDirections } from '@/lib/geo';
import { offlineQueue } from '@/lib/offline-queue';
import { isPurchaseService } from '@/lib/services';
import { getSocket } from '@/lib/socket';
import type { OrderDetail, Stop } from '@/lib/types';
import { useApi } from '@/lib/use-api';

type Action = 'ARRIVED_PICKUP' | 'START_PURCHASE' | 'PICKED_UP' | 'ARRIVED_DROPOFF' | 'FAIL' | 'RETURN';
const OPTIMISTIC: Record<Action, string> = {
  ARRIVED_PICKUP: 'DRIVER_AT_PICKUP',
  START_PURCHASE: 'PURCHASING',
  PICKED_UP: 'IN_TRANSIT',
  ARRIVED_DROPOFF: 'ARRIVED_AT_DROPOFF',
  FAIL: 'FAILED',
  RETURN: 'RETURNED',
};

function StopCard({ stop, title, children }: { stop: Stop; title: string; children?: ReactNode }) {
  return (
    <Card className="space-y-3">
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{title}</p>
      <p className="text-lg font-bold leading-snug text-brand">{stop.landmark}</p>
      {stop.addressText && <p className="text-sm text-slate-500">{stop.addressText}</p>}
      <div className="grid grid-cols-2 gap-2">
        <a href={googleMapsDirections(stop)} target="_blank" rel="noreferrer" className="flex items-center justify-center gap-2 rounded-xl bg-brand-sky px-3 py-3 font-semibold text-brand">
          <Navigation className="h-5 w-5" /> Itinéraire
        </a>
        {stop.contactPhone && (
          <a href={`tel:${stop.contactPhone}`} className="flex items-center justify-center gap-2 rounded-xl bg-green-50 px-3 py-3 font-semibold text-brand-greenDark">
            <Phone className="h-5 w-5" /> {stop.contactName.split(' ')[0]}
          </a>
        )}
      </div>
      {stop.contactPhone && <p className="text-xs text-slate-500">Contact : {stop.contactName} · {phoneDisplay(stop.contactPhone)}</p>}
      {!!stop.amountToCollect && stop.amountToCollect > 0 && (
        <div className="rounded-xl bg-amber-50 px-3 py-2.5 text-amber-900">
          Espèces à encaisser ici : <strong className="text-lg">{fcfa(stop.amountToCollect)}</strong>
        </div>
      )}
      {children}
    </Card>
  );
}

export default function MissionPage() {
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();
  const { reloadMission } = useDriver();
  const { data: mission, reload, mutate, error } = useApi<OrderDetail>(`/driver/missions/${id}`, { refreshInterval: 30_000 });
  const quick = useApi<{ DRIVER: string[] }>('/chat/quick-replies');
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [chatOpen, setChatOpen] = useState(false);
  const [failOpen, setFailOpen] = useState(false);
  const [failReason, setFailReason] = useState('');
  const [purchaseAmount, setPurchaseAmount] = useState('');
  const [receiptKey, setReceiptKey] = useState<string | null>(null);
  const [code, setCode] = useState('');
  const [photoKey, setPhotoKey] = useState<string | null>(null);
  const [myPos, setMyPos] = useState<{ lat: number; lng: number } | null>(null);
  const [score, setScore] = useState(0);

  useEffect(() => {
    if (!('geolocation' in navigator)) return;
    const w = navigator.geolocation.watchPosition((p) => setMyPos({ lat: p.coords.latitude, lng: p.coords.longitude }), () => undefined, { enableHighAccuracy: true, maximumAge: 10_000 });
    return () => navigator.geolocation.clearWatch(w);
  }, []);

  // Mise à jour immédiate quand le commerçant déclare la commande prête (ou toute autre modification).
  useEffect(() => {
    const socket = getSocket();
    const onUpdate = (e: { id: string }) => e.id === id && void reload();
    socket.on('order.updated', onUpdate);
    return () => {
      socket.off('order.updated', onUpdate);
    };
  }, [id, reload]);

  if (!mission) return error ? <Alert>{error.message}</Alert> : <Spinner />;

  const pickup = mission.stops.find((s) => s.kind === 'PICKUP')!;
  const dropoff = mission.stops.find((s) => s.kind === 'DROPOFF')!;
  const purchase = isPurchaseService(mission.serviceType);
  const food = mission.serviceType === 'FOOD';
  const foodReady = mission.merchantStatus === 'READY';
  const markers: MapMarker[] = [
    { kind: 'pickup', lat: pickup.lat, lng: pickup.lng, label: 'Ramassage' },
    { kind: 'dropoff', lat: dropoff.lat, lng: dropoff.lng, label: 'Livraison' },
    ...(myPos ? [{ kind: 'driver' as const, ...myPos, label: 'Moi' }] : []),
  ];

  const act = async (action: Action, extra: Record<string, unknown> = {}) => {
    setBusy(true);
    setActionError(null);
    setInfo(null);
    try {
      const result = await offlineQueue.send<OrderDetail>(`/driver/missions/${id}/action`, { action, lat: myPos?.lat, lng: myPos?.lng, ...extra });
      if (result) mutate(result);
      else {
        // Pas de réseau : l'étape est enregistrée sur le téléphone et sera envoyée plus tard.
        mutate({ ...mission, status: OPTIMISTIC[action], statusLabel: STATUS_LABELS[OPTIMISTIC[action]] });
        setInfo('Pas de réseau : étape enregistrée, elle sera envoyée automatiquement.');
      }
      void reloadMission();
    } catch (err) {
      setActionError((err as Error).message);
      void reload();
    } finally {
      setBusy(false);
    }
  };

  const post = async (path: string, body: Record<string, unknown>) => {
    setBusy(true);
    setActionError(null);
    try {
      const result = await api<OrderDetail>(path, { body });
      mutate(result);
      void reloadMission();
      return true;
    } catch (err) {
      setActionError((err as Error).message);
      return false;
    } finally {
      setBusy(false);
    }
  };

  const status = mission.status;
  return (
    <div className="space-y-4">
      <PageHeader
        back="/livreur"
        title={SERVICE_LABELS[mission.serviceType]}
        subtitle={`${mission.reference}${mission.speed === 'EXPRESS' ? ' · EXPRESS' : ''}`}
        action={<StatusBadge status={status} label={STATUS_LABELS[status] ?? mission.statusLabel} />}
      />
      <Map center={pickup} markers={markers} fit={markers.slice(0, 2)} className="h-56 w-full" />

      <div className="flex gap-2">
        <Button variant="secondary" onClick={() => setChatOpen(true)} className="flex-1">
          <MessageCircle className="h-4 w-4" /> Messages
        </Button>
        {mission.client && (
          <a href={`tel:${mission.client.phone}`} className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-white px-4 py-2.5 font-semibold text-brand shadow-card">
            <Phone className="h-4 w-4" /> Client ({mission.client.firstName})
          </a>
        )}
      </div>

      {info && <Alert tone="amber">{info}</Alert>}
      <Alert>{actionError}</Alert>

      {status === 'DRIVER_ASSIGNED' && (
        <StopCard stop={pickup} title={food ? `1. Allez chez ${mission.merchant?.name ?? 'le commerçant'}` : purchase ? '1. Allez au lieu des achats' : '1. Allez au point de ramassage'}>
          {food && (
            <p className={`rounded-xl px-3 py-2 text-sm font-semibold ${foodReady ? 'bg-green-50 text-brand-greenDark' : 'bg-amber-50 text-amber-800'}`}>
              {foodReady ? 'Commande prête ✅' : `En préparation${mission.prepMinutes ? ` (≈ ${mission.prepMinutes} min annoncées)` : ''}`}
            </p>
          )}
          <Button variant="success" size="lg" block loading={busy} onClick={() => act('ARRIVED_PICKUP')}>
            Je suis arrivé
          </Button>
        </StopCard>
      )}

      {status === 'DRIVER_AT_PICKUP' && (
        <StopCard stop={pickup} title={food ? '2. Récupérez la commande' : purchase ? '2. Faites les achats' : '2. Récupérez le colis'}>
          {food ? (
            <>
              <ul className="space-y-1 rounded-xl bg-slate-50 p-3 text-sm">
                {mission.items.map((i) => (
                  <li key={i.id}>
                    <strong>{i.quantity} ×</strong> {i.label}
                    {!!i.options?.length && <span className="text-slate-500"> ({i.options.map((o) => o.name).join(', ')})</span>}
                  </li>
                ))}
              </ul>
              <p className="text-sm text-slate-600">Vérifiez que tous les articles sont dans le sac. {mission.paymentMethod === 'CASH' ? 'Ne payez rien au commerçant : le client paie à la livraison.' : 'Commande déjà payée.'}</p>
              {!foodReady && <Alert tone="amber">Le commerçant n’a pas encore indiqué que la commande est prête. Patientez sur place : l’écran se met à jour.</Alert>}
              <Button variant="success" size="lg" block loading={busy} disabled={!foodReady} onClick={() => act('PICKED_UP')}>
                Commande récupérée, je pars
              </Button>
            </>
          ) : purchase ? (
            <>
              <ul className="list-inside list-disc rounded-xl bg-slate-50 p-3 text-sm">
                {mission.items.map((i) => (
                  <li key={i.id}>
                    {i.quantity > 1 && `${i.quantity} × `}
                    {i.label}
                    {i.note && <span className="text-slate-500"> — {i.note}</span>}
                  </li>
                ))}
              </ul>
              <p className="text-sm text-slate-600">Budget maximum : <strong>{fcfa(mission.purchaseBudget)}</strong>. Gardez le ticket de caisse.</p>
              <Button variant="success" size="lg" block loading={busy} onClick={() => act('START_PURCHASE')}>
                Commencer les achats
              </Button>
            </>
          ) : (
            <>
              {mission.packageDescription && <p className="text-sm text-slate-600">Colis : {mission.packageDescription}{mission.isFragile && ' — FRAGILE'}</p>}
              <Button variant="success" size="lg" block loading={busy} onClick={() => act('PICKED_UP')}>
                Colis récupéré, je pars
              </Button>
            </>
          )}
        </StopCard>
      )}

      {status === 'PURCHASING' && (
        <Card className="space-y-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">3. Montant des achats</p>
          {mission.purchaseActualAmount == null ? (
            <>
              <Field label="Montant total payé (FCFA)" hint={`Budget du client : ${fcfa(mission.purchaseBudget)}`}>
                <Input type="number" inputMode="numeric" value={purchaseAmount} onChange={(e) => setPurchaseAmount(e.target.value)} />
              </Field>
              <PhotoInput purpose="RECEIPT" label="Photographier le ticket" onUploaded={setReceiptKey} />
              <Button
                block
                size="lg"
                loading={busy}
                disabled={!(Number(purchaseAmount) > 0) || !receiptKey}
                onClick={() => post(`/driver/missions/${id}/purchase`, { actualAmount: Number(purchaseAmount), receiptFileKey: receiptKey })}
              >
                Valider le montant
              </Button>
            </>
          ) : (
            <>
              <p className="rounded-xl bg-green-50 px-3 py-2 text-sm text-green-800">
                Achats enregistrés : <strong>{fcfa(mission.purchaseActualAmount)}</strong> (ticket envoyé au client).
              </p>
              <Button variant="success" size="lg" block loading={busy} onClick={() => act('PICKED_UP')}>
                J’ai les achats, je pars
              </Button>
            </>
          )}
        </Card>
      )}

      {status === 'IN_TRANSIT' && (
        <StopCard stop={dropoff} title="Livrez au destinataire">
          <Button variant="success" size="lg" block loading={busy} onClick={() => act('ARRIVED_DROPOFF')}>
            Je suis arrivé à destination
          </Button>
        </StopCard>
      )}

      {status === 'ARRIVED_AT_DROPOFF' && (
        <StopCard stop={dropoff} title="Remise du colis">
          {!!mission.liveWaitingFee && <p className="text-xs text-slate-500">Dont attente facturée : {fcfa(mission.liveWaitingFee)}</p>}
          <Field label="Code de livraison du destinataire (4 chiffres)">
            <Input inputMode="numeric" maxLength={4} value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))} className="text-center text-2xl font-bold tracking-[0.5em]" />
          </Field>
          <PhotoInput purpose="DELIVERY_PROOF" label="Photo de la remise (conseillé)" onUploaded={setPhotoKey} />
          <Button
            variant="success"
            size="lg"
            block
            loading={busy}
            disabled={code.length !== 4 && !photoKey}
            onClick={() => post(`/driver/missions/${id}/deliver`, { code: code.length === 4 ? code : undefined, photoFileKey: photoKey ?? undefined, lat: myPos?.lat, lng: myPos?.lng })}
          >
            <CheckCircle2 className="h-5 w-5" /> Valider la livraison
          </Button>
        </StopCard>
      )}

      {status === 'FAILED' && (
        <Card className="space-y-3">
          <p className="font-semibold text-red-700">Livraison impossible</p>
          <p className="text-sm text-slate-600">Rapportez le colis au point de ramassage, puis confirmez le retour. L’équipe a été prévenue.</p>
          <StopCard stop={pickup} title="Retour au point de ramassage" />
          <Button block loading={busy} onClick={() => act('RETURN')}>
            Colis rapporté à l’expéditeur
          </Button>
        </Card>
      )}

      {(status === 'DELIVERED' || status === 'COMPLETED') && (
        <Card className="space-y-3 text-center">
          <CheckCircle2 className="mx-auto h-14 w-14 text-brand-green" />
          <p className="text-xl font-bold text-brand">Mission terminée !</p>
          {!!mission.driverEarning && <p className="text-slate-600">Votre gain : <strong className="text-brand-greenDark">{fcfa(mission.driverEarning)}</strong></p>}
          {!mission.myRating && (
            <div>
              <p className="text-sm text-slate-600">Notez le client</p>
              <div className="mt-1 flex justify-center gap-1">
                {[1, 2, 3, 4, 5].map((n) => (
                  <button
                    key={n}
                    aria-label={`${n} étoile(s)`}
                    onClick={async () => {
                      setScore(n);
                      await api(`/orders/${id}/rating`, { body: { score: n } }).catch(() => undefined);
                      void reload();
                    }}
                  >
                    <Star className={`h-8 w-8 ${n <= score ? 'fill-amber-400 text-amber-400' : 'text-slate-300'}`} />
                  </button>
                ))}
              </div>
            </div>
          )}
        </Card>
      )}

      {['DRIVER_AT_PICKUP', 'IN_TRANSIT', 'ARRIVED_AT_DROPOFF'].includes(status) && (
        <button onClick={() => setFailOpen(true)} className="w-full text-center text-sm font-medium text-red-600 underline">
          Signaler une livraison impossible
        </button>
      )}

      <Card>
        <Timeline items={mission.history} />
      </Card>

      <Sheet open={chatOpen} onClose={() => setChatOpen(false)} title="Messages avec le client">
        {user && <ChatPanel orderId={mission.id} meId={user.id} quickReplies={quick.data?.DRIVER} />}
      </Sheet>
      <Sheet open={failOpen} onClose={() => setFailOpen(false)} title="Livraison impossible">
        <div className="space-y-3">
          <p className="text-sm text-slate-600">Avant de déclarer l’échec, appelez le client et le destinataire.</p>
          <Field label="Que s’est-il passé ?">
            <Textarea rows={3} value={failReason} maxLength={300} onChange={(e) => setFailReason(e.target.value)} placeholder="Ex. destinataire injoignable après 3 appels" />
          </Field>
          <Button
            variant="danger"
            block
            loading={busy}
            disabled={failReason.trim().length < 5}
            onClick={async () => {
              await act('FAIL', { note: failReason.trim() });
              setFailOpen(false);
            }}
          >
            Confirmer l’échec
          </Button>
        </div>
      </Sheet>
    </div>
  );
}
