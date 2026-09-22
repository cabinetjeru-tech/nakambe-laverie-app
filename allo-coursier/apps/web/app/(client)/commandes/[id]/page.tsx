'use client';

import { MessageCircle, Phone, Share2, Star } from 'lucide-react';
import Link from 'next/link';
import { useParams, useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useState } from 'react';
import { ChatPanel } from '@/components/chat';
import { MerchantLogo } from '@/components/food';
import { Map, MapMarker } from '@/components/map';
import { PhoneInput } from '@/components/phone-input';
import { Timeline } from '@/components/timeline';
import { Alert, Button, Card, Field, Input, PageHeader, Select, Sheet, Spinner, StatusBadge, Textarea } from '@/components/ui';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { dateTime, fcfa, PAYMENT_LABELS, PAYMENT_STATUS_LABELS, phoneDisplay, SERVICE_LABELS, SPEED_LABELS, VEHICLE_LABELS } from '@/lib/format';
import { getSocket } from '@/lib/socket';
import type { OrderDetail } from '@/lib/types';
import { useApi } from '@/lib/use-api';

const CANCELLABLE = ['CREATED', 'PENDING_PAYMENT', 'SCHEDULED', 'SEARCHING_DRIVER', 'DRIVER_ASSIGNED'];
const LIVE = ['DRIVER_ASSIGNED', 'DRIVER_AT_PICKUP', 'PURCHASING', 'PICKED_UP', 'IN_TRANSIT', 'ARRIVED_AT_DROPOFF'];

function RatingForm({ orderId, onDone }: { orderId: string; onDone: () => void }) {
  const [score, setScore] = useState(0);
  const [comment, setComment] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const TAGS = ['Rapide', 'Poli', 'Soigneux', 'Bonne communication'];
  const [tags, setTags] = useState<string[]>([]);
  return (
    <Card className="space-y-3">
      <p className="font-semibold text-brand">Comment s’est passée la livraison ?</p>
      <div className="flex gap-1">
        {[1, 2, 3, 4, 5].map((n) => (
          <button key={n} onClick={() => setScore(n)} aria-label={`${n} étoile${n > 1 ? 's' : ''}`}>
            <Star className={`h-9 w-9 ${n <= score ? 'fill-amber-400 text-amber-400' : 'text-slate-300'}`} />
          </button>
        ))}
      </div>
      {score > 0 && (
        <>
          <div className="flex flex-wrap gap-2">
            {TAGS.map((t) => (
              <button key={t} onClick={() => setTags((x) => (x.includes(t) ? x.filter((y) => y !== t) : [...x, t]))} className={`rounded-full px-3 py-1 text-xs font-medium ${tags.includes(t) ? 'bg-brand text-white' : 'bg-slate-100 text-slate-600'}`}>
                {t}
              </button>
            ))}
          </div>
          <Textarea rows={2} placeholder="Un commentaire ? (facultatif)" value={comment} maxLength={500} onChange={(e) => setComment(e.target.value)} />
          <Alert>{error}</Alert>
          <Button
            loading={busy}
            onClick={async () => {
              setBusy(true);
              try {
                await api(`/orders/${orderId}/rating`, { body: { score, tags, comment: comment || undefined } });
                onDone();
              } catch (err) {
                setError((err as Error).message);
              } finally {
                setBusy(false);
              }
            }}
          >
            Envoyer ma note
          </Button>
        </>
      )}
    </Card>
  );
}

function PaymentDeclaration({ order, onDone }: { order: OrderDetail; onDone: () => void }) {
  const methods = useApi<{ code: string; accounts?: { operator: string; number: string }[] }[]>('/payments/methods');
  const accounts = methods.data?.find((m) => m.code === 'MANUAL_MOBILE_MONEY')?.accounts ?? [];
  const [operator, setOperator] = useState<'ORANGE' | 'MOOV'>('ORANGE');
  const [reference, setReference] = useState('');
  const [phone, setPhone] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const pending = order.payments?.find((p) => p.status === 'PENDING');
  const rejected = order.payments?.find((p) => p.status === 'FAILED');
  if (pending) return <Alert tone="amber">Paiement déclaré (réf. {pending.providerReference}) : vérification en cours par notre équipe. Vous serez notifié.</Alert>;
  return (
    <Card className="space-y-3">
      <p className="font-semibold text-brand">Payer {fcfa(order.totalAmount)} par Mobile Money</p>
      {rejected && <Alert>Référence {rejected.providerReference} non reconnue : {rejected.failureReason}</Alert>}
      <p className="text-sm text-slate-600">
        Envoyez le montant exact au {accounts.map((a) => `${a.operator === 'ORANGE' ? 'Orange Money' : 'Moov Money'} ${phoneDisplay(a.number)}`).join(' ou ')}, puis saisissez la référence reçue par SMS.
      </p>
      <div className="grid grid-cols-2 gap-2">
        <Select value={operator} onChange={(e) => setOperator(e.target.value as 'ORANGE' | 'MOOV')}>
          <option value="ORANGE">Orange Money</option>
          <option value="MOOV">Moov Money</option>
        </Select>
        <Input placeholder="Référence" value={reference} maxLength={60} onChange={(e) => setReference(e.target.value)} />
      </div>
      <Field label="Numéro qui a payé">
        <PhoneInput value={phone} onChange={setPhone} />
      </Field>
      <Alert>{error}</Alert>
      <Button
        loading={busy}
        disabled={reference.trim().length < 4 || phone.replace(/\D/g, '').length !== 8}
        onClick={async () => {
          setBusy(true);
          setError(null);
          try {
            await api(`/orders/${order.id}/payment`, { body: { operator, reference: reference.trim(), payerPhone: phone } });
            onDone();
          } catch (err) {
            setError((err as Error).message);
          } finally {
            setBusy(false);
          }
        }}
      >
        J’ai payé — envoyer la référence
      </Button>
    </Card>
  );
}

function OrderTracking() {
  const { id } = useParams<{ id: string }>();
  const params = useSearchParams();
  const { user } = useAuth();
  const { data: order, reload, error } = useApi<OrderDetail>(`/orders/${id}`, { refreshInterval: 45_000 });
  const [driverPos, setDriverPos] = useState<{ lat: number; lng: number } | null>(null);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [chatOpen, setChatOpen] = useState(false);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const quick = useApi<{ CLIENT: string[] }>('/chat/quick-replies');

  useEffect(() => {
    const socket = getSocket();
    const join = () => socket.emit('order:subscribe', { orderId: id });
    join();
    socket.on('connect', join);
    const onUpdate = (e: { id: string }) => e.id === id && void reload();
    const onLocation = (e: { orderId: string; lat: number; lng: number }) => e.orderId === id && setDriverPos({ lat: e.lat, lng: e.lng });
    socket.on('order.updated', onUpdate);
    socket.on('driver.location', onLocation);
    return () => {
      socket.off('connect', join);
      socket.off('order.updated', onUpdate);
      socket.off('driver.location', onLocation);
      socket.emit('order:unsubscribe', { orderId: id });
    };
  }, [id, reload]);

  if (!order) return error ? <Alert>{error.message}</Alert> : <Spinner />;

  const pickup = order.stops.find((s) => s.kind === 'PICKUP')!;
  const dropoff = order.stops.find((s) => s.kind === 'DROPOFF')!;
  const live = LIVE.includes(order.status);
  const driverLocation = driverPos ?? order.driver?.location ?? null;
  const markers: MapMarker[] = [
    { kind: 'pickup', lat: pickup.lat, lng: pickup.lng, label: order.merchant?.name ?? 'Départ' },
    { kind: 'dropoff', lat: dropoff.lat, lng: dropoff.lng, label: 'Arrivée' },
    ...(live && driverLocation ? [{ kind: 'driver' as const, lat: driverLocation.lat, lng: driverLocation.lng, label: order.driver?.firstName }] : []),
  ];
  const food = order.serviceType === 'FOOD';
  // Repas : annulable seulement tant que le commerçant n'a pas commencé la préparation.
  const cancellable = CANCELLABLE.includes(order.status) && (!food || order.merchantStatus === 'PENDING');
  const trackingUrl = typeof window !== 'undefined' && order.trackingToken ? `${window.location.origin}/suivi/${order.trackingToken}` : '';
  const shareText = `Allô-Coursier : votre colis ${order.reference} arrive. Code de livraison à donner au livreur : ${order.deliveryCode}. Suivi : ${trackingUrl}`;

  return (
    <div className="space-y-4">
      <PageHeader
        back="/commandes"
        title={SERVICE_LABELS[order.serviceType]}
        subtitle={`${order.reference} · ${dateTime(order.createdAt)}`}
        action={<StatusBadge status={order.status} label={order.statusLabel} />}
      />
      {params.get('nouvelle') && order.status === 'SEARCHING_DRIVER' && <Alert tone="green">Commande envoyée ! Nous cherchons le livreur le plus proche.</Alert>}
      {params.get('nouvelle') && order.status === 'CREATED' && <Alert tone="green">Commande envoyée à {order.merchant?.name} ! Vous serez prévenu dès qu’elle est acceptée.</Alert>}

      <Map center={pickup} markers={markers} fit={markers} className="h-64 w-full" line={[pickup, dropoff]} />

      {food && order.merchant && !['DELIVERED', 'COMPLETED', 'CANCELLED', 'FAILED', 'RETURNED'].includes(order.status) && (
        <Card className="flex items-center gap-3">
          <MerchantLogo name={order.merchant.name} url={order.merchant.logoUrl} className="h-11 w-11 shrink-0" />
          <div className="min-w-0 flex-1">
            <p className="font-semibold text-brand">{order.merchant.name}</p>
            <p className="text-sm text-slate-600">
              {order.merchantStatus === 'PENDING' && 'Attend la confirmation du commerçant…'}
              {order.merchantStatus === 'ACCEPTED' && `En préparation${order.prepMinutes ? ` (environ ${order.prepMinutes} min)` : ''} 👨‍🍳`}
              {order.merchantStatus === 'READY' && (['IN_TRANSIT', 'ARRIVED_AT_DROPOFF'].includes(order.status) ? 'Récupérée par le livreur' : 'Prête, le livreur vient la chercher')}
            </p>
          </div>
          <a href={`tel:${order.merchant.phone}`} className="rounded-xl bg-brand-sky p-2.5 text-brand" aria-label="Appeler le commerce">
            <Phone className="h-4 w-4" />
          </a>
        </Card>
      )}

      {order.status === 'SEARCHING_DRIVER' && (
        <Card className="flex items-center gap-3">
          <span className="relative flex h-10 w-10 items-center justify-center">
            <span className="absolute h-10 w-10 animate-pulse-ring rounded-full bg-brand-green/40" />
            <span className="h-4 w-4 rounded-full bg-brand-green" />
          </span>
          <p className="text-sm text-slate-700">Recherche d’un livreur disponible près du point de départ…</p>
        </Card>
      )}

      {order.status === 'PENDING_PAYMENT' && <PaymentDeclaration order={order} onDone={reload} />}

      {order.driver && (
        <Card className="flex items-center gap-3">
          <span className="flex h-12 w-12 items-center justify-center rounded-full bg-brand text-lg font-bold text-white">{order.driver.firstName.charAt(0)}</span>
          <div className="min-w-0 flex-1">
            <p className="font-semibold text-brand">
              {order.driver.firstName} {order.driver.lastName}
            </p>
            <p className="text-xs text-slate-500">
              {VEHICLE_LABELS[order.driver.vehicleType ?? 'MOTO']} {order.driver.plateNumber && `· ${order.driver.plateNumber}`} {order.driver.rating && `· ★ ${order.driver.rating}`}
            </p>
          </div>
          {live && order.driver.phone && (
            <>
              <Button variant="secondary" size="sm" onClick={() => setChatOpen(true)} aria-label="Messages">
                <MessageCircle className="h-4 w-4" />
              </Button>
              <a href={`tel:${order.driver.phone}`} className="rounded-xl bg-brand-green p-2.5 text-white" aria-label="Appeler le livreur">
                <Phone className="h-4 w-4" />
              </a>
            </>
          )}
        </Card>
      )}

      {order.deliveryCode && (
        <Card className="flex items-center justify-between gap-3 bg-brand text-white">
          <div>
            <p className="text-xs text-blue-200">Code de livraison (à donner au destinataire)</p>
            <p className="text-3xl font-extrabold tracking-[0.3em]">{order.deliveryCode}</p>
          </div>
          <a href={`https://wa.me/?text=${encodeURIComponent(shareText)}`} target="_blank" rel="noreferrer" className="flex items-center gap-1.5 rounded-xl bg-brand-green px-3 py-2 text-sm font-semibold">
            <Share2 className="h-4 w-4" /> WhatsApp
          </a>
        </Card>
      )}

      {(order.status === 'DELIVERED' || order.status === 'COMPLETED') && !order.myRating && order.driver && (
        <RatingForm orderId={order.id} onDone={reload} />
      )}

      <Card>
        <h2 className="mb-3 font-semibold text-brand">Suivi</h2>
        <Timeline items={order.history} />
      </Card>

      <Card className="space-y-2 text-sm">
        <h2 className="font-semibold text-brand">Détails</h2>
        <p>
          <span className="font-semibold text-brand-light">A</span> {pickup.landmark} — {pickup.contactName} {pickup.contactPhone && `(${phoneDisplay(pickup.contactPhone)})`}
        </p>
        <p>
          <span className="font-semibold text-brand-green">B</span> {dropoff.landmark} — {dropoff.contactName} {dropoff.contactPhone && `(${phoneDisplay(dropoff.contactPhone)})`}
        </p>
        <p className="text-slate-600">
          {SPEED_LABELS[order.speed]} · {VEHICLE_LABELS[order.vehicleType]} · {order.distanceKm.toLocaleString('fr-FR')} km
          {order.scheduledAt && ` · programmée le ${dateTime(order.scheduledAt)}`}
        </p>
        {order.packageDescription && <p className="text-slate-600">Colis : {order.packageDescription}{order.isFragile && ' (fragile)'}</p>}
        {order.items.length > 0 && !food && (
          <ul className="list-inside list-disc text-slate-600">
            {order.items.map((i) => (
              <li key={i.id}>
                {i.quantity > 1 && `${i.quantity} × `}
                {i.label}
              </li>
            ))}
          </ul>
        )}
        {food && (
          <div className="space-y-1 border-t border-slate-100 pt-2">
            {order.items.map((i) => (
              <div key={i.id} className="flex justify-between gap-2 text-slate-700">
                <span>
                  {i.quantity} × {i.label}
                  {!!i.options?.length && <span className="block text-xs text-slate-500">{i.options.map((o) => o.name).join(', ')}</span>}
                  {i.note && <span className="block text-xs italic text-slate-500">« {i.note} »</span>}
                </span>
                <span className="shrink-0 tabular-nums">{fcfa((i.unitPrice ?? 0) * i.quantity)}</span>
              </div>
            ))}
            <div className="flex justify-between font-semibold text-slate-700">
              <span>Articles</span>
              <span>{fcfa(order.itemsSubtotal)}</span>
            </div>
          </div>
        )}
        <div className="border-t border-slate-100 pt-2">
          {order.priceBreakdown?.lines.map((l) => (
            <div key={l.code} className="flex justify-between text-slate-600">
              <span>{l.label}</span>
              <span>{fcfa(l.amount)}</span>
            </div>
          ))}
          {order.waitingFee > 0 && (
            <div className="flex justify-between text-slate-600">
              <span>Attente</span>
              <span>{fcfa(order.waitingFee)}</span>
            </div>
          )}
          {order.discountAmount > 0 && (
            <div className="flex justify-between text-brand-greenDark">
              <span>Réduction</span>
              <span>−{fcfa(order.discountAmount)}</span>
            </div>
          )}
          {order.purchaseActualAmount != null && (
            <div className="flex justify-between text-slate-600">
              <span>Achats (ticket)</span>
              <span>{fcfa(order.purchaseActualAmount)}</span>
            </div>
          )}
          <div className="mt-1 flex justify-between font-bold text-brand">
            <span>Total</span>
            <span>{fcfa(order.totalAmount)}</span>
          </div>
          <p className="mt-1 text-xs text-slate-500">
            {PAYMENT_LABELS[order.paymentMethod]}
            {order.paymentMethod === 'CASH' && order.cashCollectAt && ` (${order.cashCollectAt === 'PICKUP' ? 'au départ' : 'à l’arrivée'})`} · {PAYMENT_STATUS_LABELS[order.paymentStatus]}
          </p>
        </div>
        {order.proofs.filter((p) => p.url).length > 0 && (
          <div className="flex gap-2 pt-1">
            {order.proofs.filter((p) => p.url).map((p) => (
              <a key={p.url} href={p.url!} target="_blank" rel="noreferrer">
                <img src={p.url!} alt={p.type === 'RECEIPT' ? 'Ticket de caisse' : 'Photo de la remise'} className="h-20 w-20 rounded-xl object-cover ring-1 ring-slate-200" />
              </a>
            ))}
          </div>
        )}
      </Card>

      <div className="flex flex-wrap gap-3">
        {cancellable && (
          <Button variant="outline" onClick={() => setCancelOpen(true)}>
            Annuler la commande
          </Button>
        )}
        <Link href={`/reclamations/nouvelle?commande=${order.id}`} className="rounded-xl px-4 py-2.5 text-sm font-semibold text-slate-600 hover:bg-white">
          Signaler un problème
        </Link>
      </div>

      <Sheet open={chatOpen} onClose={() => setChatOpen(false)} title={`Messages — ${order.driver?.firstName ?? 'livreur'}`}>
        {user && <ChatPanel orderId={order.id} meId={user.id} quickReplies={quick.data?.CLIENT} />}
      </Sheet>

      <Sheet open={cancelOpen} onClose={() => setCancelOpen(false)} title="Annuler la commande">
        <div className="space-y-3">
          {order.paymentStatus === 'SUCCEEDED' && <p className="text-sm text-slate-600">Le montant payé sera remboursé sur votre portefeuille Allô-Coursier.</p>}
          <Field label="Raison">
            <Textarea rows={2} value={reason} maxLength={300} onChange={(e) => setReason(e.target.value)} />
          </Field>
          <Alert>{actionError}</Alert>
          <Button
            variant="danger"
            block
            loading={busy}
            disabled={reason.trim().length < 3}
            onClick={async () => {
              setBusy(true);
              setActionError(null);
              try {
                await api(`/orders/${order.id}/cancel`, { body: { reason } });
                setCancelOpen(false);
                await reload();
              } catch (err) {
                setActionError((err as Error).message);
              } finally {
                setBusy(false);
              }
            }}
          >
            Confirmer l’annulation
          </Button>
        </div>
      </Sheet>
    </div>
  );
}

export default function OrderTrackingPage() {
  return (
    <Suspense fallback={<Spinner />}>
      <OrderTracking />
    </Suspense>
  );
}
