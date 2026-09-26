'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import { ChatPanel } from '@/components/chat';
import { MERCHANT_STATUS } from '@/components/food';
import { Map, MapMarker } from '@/components/map';
import { Timeline } from '@/components/timeline';
import { Alert, Badge, Button, Card, Field, PageHeader, Select, Sheet, Spinner, StatusBadge, Textarea } from '@/components/ui';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { dateTime, fcfa, PAYMENT_LABELS, PAYMENT_STATUS_LABELS, phoneDisplay, SERVICE_LABELS, SPEED_LABELS, statusTone, VEHICLE_LABELS } from '@/lib/format';
import { getSocket } from '@/lib/socket';
import type { OrderDetail, Paginated } from '@/lib/types';
import { useApi } from '@/lib/use-api';

interface AdminOrder extends OrderDetail {
  client: { id: string; firstName: string; lastName: string; phone: string };
  commissionAmount: number;
  driverEarning: number;
  merchantCommissionAmount: number;
  merchantEarning: number;
  dispatchAttempts: number;
  offers: { id: string; attempt: number; status: string; driver: { firstName: string; lastName: string; phone: string }; distanceMeters: number | null; offeredAt: string; rejectReason: string | null }[];
  payments: { id: string; provider: string; operator: string | null; amount: number; status: string; providerReference: string | null; failureReason: string | null; createdAt: string }[];
  trail: { lat: number; lng: number; recordedAt: string }[];
}

interface DriverRow {
  userId: string;
  isOnline: boolean;
  vehicleType: string;
  user: { firstName: string; lastName: string; phone: string };
}

const OFFER_LABELS: Record<string, string> = { OFFERED: 'Proposée', ACCEPTED: 'Acceptée', REJECTED: 'Refusée', EXPIRED: 'Sans réponse', CANCELLED: 'Annulée' };
const FINAL = ['DELIVERED', 'COMPLETED', 'CANCELLED', 'FAILED', 'RETURNED'];
const ACTIVE = ['DRIVER_ASSIGNED', 'DRIVER_AT_PICKUP', 'PURCHASING', 'PICKED_UP', 'IN_TRANSIT', 'ARRIVED_AT_DROPOFF'];

export default function AdminOrderPage() {
  const { id } = useParams<{ id: string }>();
  const { user, can } = useAuth();
  const { data: order, reload, mutate } = useApi<AdminOrder>(`/admin/orders/${id}`, { persist: false, refreshInterval: 30_000 });
  const [sheet, setSheet] = useState<'assign' | 'cancel' | 'status' | null>(null);
  const [driverId, setDriverId] = useState('');
  const [reason, setReason] = useState('');
  const [forced, setForced] = useState('DELIVERED');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const drivers = useApi<Paginated<DriverRow>>(sheet === 'assign' && order ? `/admin/drivers?status=APPROVED&cityId=${order.city.id}&pageSize=100` : null, { persist: false });

  useEffect(() => {
    const socket = getSocket();
    socket.emit('order:subscribe', { orderId: id });
    const onUpdate = (e: { id: string }) => e.id === id && void reload();
    socket.on('order.updated', onUpdate);
    return () => {
      socket.off('order.updated', onUpdate);
    };
  }, [id, reload]);

  if (!order) return <Spinner />;

  const run = async (path: string, body: Record<string, unknown> = {}) => {
    setBusy(true);
    setError(null);
    try {
      mutate(await api<AdminOrder>(path, { body }));
      setSheet(null);
      setReason('');
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const pickup = order.stops.find((s) => s.kind === 'PICKUP')!;
  const dropoff = order.stops.find((s) => s.kind === 'DROPOFF')!;
  const markers: MapMarker[] = [
    { kind: 'pickup', lat: pickup.lat, lng: pickup.lng, label: 'Ramassage' },
    { kind: 'dropoff', lat: dropoff.lat, lng: dropoff.lng, label: 'Livraison' },
    ...(order.driver?.location && ACTIVE.includes(order.status) ? [{ kind: 'driver' as const, ...order.driver.location, label: order.driver.firstName }] : []),
  ];

  return (
    <div className="space-y-4">
      <PageHeader
        back="/admin/commandes"
        title={order.reference}
        subtitle={`${SERVICE_LABELS[order.serviceType]} · ${SPEED_LABELS[order.speed]} · ${VEHICLE_LABELS[order.vehicleType]} · ${order.city.name} · ${dateTime(order.createdAt)}`}
        action={<StatusBadge status={order.status} label={order.statusLabel} />}
      />
      {!FINAL.includes(order.status) && (
        <div className="flex flex-wrap gap-2">
          {can('orders.assign') && (
            <Button onClick={() => setSheet('assign')}>{order.driver ? 'Réaffecter' : 'Affecter un livreur'}</Button>
          )}
          {can('orders.assign') && ['SEARCHING_DRIVER', 'DRIVER_ASSIGNED', 'DRIVER_AT_PICKUP'].includes(order.status) && (
            <Button variant="secondary" loading={busy} onClick={() => run(`/admin/orders/${id}/redispatch`)}>
              Relancer la recherche
            </Button>
          )}
          {can('orders.manage') && ACTIVE.includes(order.status) && (
            <Button variant="outline" onClick={() => setSheet('status')}>
              Corriger le statut
            </Button>
          )}
          {can('orders.manage') && (
            <Button variant="danger" onClick={() => setSheet('cancel')}>
              Annuler
            </Button>
          )}
        </div>
      )}
      {order.status === 'FAILED' && can('orders.manage') && (
        <Button variant="outline" onClick={() => { setForced('RETURNED'); setSheet('status'); }}>
          Marquer comme retournée
        </Button>
      )}
      <Alert>{error}</Alert>

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          <Map center={pickup} markers={markers} fit={markers} line={order.trail.length > 1 ? order.trail : [pickup, dropoff]} className="h-80 w-full" />
          <div className="grid gap-4 sm:grid-cols-2">
            {[pickup, dropoff].map((s) => (
              <Card key={s.id} className="text-sm">
                <p className="text-xs font-semibold uppercase text-slate-500">{s.kind === 'PICKUP' ? 'Ramassage' : 'Livraison'}</p>
                <p className="mt-1 font-semibold text-brand">{s.landmark}</p>
                <p className="text-slate-600">
                  {s.contactName} · <a className="text-brand-light" href={`tel:${s.contactPhone}`}>{phoneDisplay(s.contactPhone)}</a>
                </p>
                <p className="mt-1 text-xs text-slate-500">
                  Arrivée {dateTime(s.arrivedAt)} · Fin {dateTime(s.completedAt)}
                </p>
              </Card>
            ))}
          </div>
          <Card>
            <h2 className="mb-2 font-semibold text-brand">Chat de la commande</h2>
            {user && <ChatPanel orderId={order.id} meId={user.id} />}
          </Card>
        </div>
        <div className="space-y-4">
          <Card className="space-y-1 text-sm">
            <h2 className="mb-1 font-semibold text-brand">Personnes</h2>
            <p>
              Client : <strong>{order.client.firstName} {order.client.lastName}</strong> · <a className="text-brand-light" href={`tel:${order.client.phone}`}>{phoneDisplay(order.client.phone)}</a>
            </p>
            <p>
              Livreur :{' '}
              {order.driver ? (
                <>
                  <strong>{order.driver.firstName} {order.driver.lastName}</strong> · <a className="text-brand-light" href={`tel:${order.driver.phone}`}>{phoneDisplay(order.driver.phone)}</a>
                </>
              ) : (
                '—'
              )}
            </p>
            <p>Code de livraison : <strong className="tracking-widest">{order.deliveryCode ?? '—'}</strong></p>
          </Card>
          <Card className="space-y-1 text-sm">
            <h2 className="mb-1 font-semibold text-brand">Argent</h2>
            {order.priceBreakdown?.lines.map((l) => (
              <div key={l.code} className="flex justify-between text-slate-600">
                <span>{l.label}</span>
                <span>{fcfa(l.amount)}</span>
              </div>
            ))}
            {order.waitingFee > 0 && <div className="flex justify-between text-slate-600"><span>Attente</span><span>{fcfa(order.waitingFee)}</span></div>}
            {order.discountAmount > 0 && <div className="flex justify-between text-brand-greenDark"><span>Remise</span><span>−{fcfa(order.discountAmount)}</span></div>}
            {order.purchaseActualAmount != null && <div className="flex justify-between text-slate-600"><span>Achats</span><span>{fcfa(order.purchaseActualAmount)}</span></div>}
            {!!order.itemsSubtotal && <div className="flex justify-between text-slate-600"><span>Articles du commerçant</span><span>{fcfa(order.itemsSubtotal)}</span></div>}
            <div className="flex justify-between border-t border-slate-100 pt-1 font-bold text-brand"><span>Total client</span><span>{fcfa(order.totalAmount)}</span></div>
            <div className="flex justify-between text-slate-600"><span>Commission</span><span>{fcfa(order.commissionAmount)}</span></div>
            <div className="flex justify-between text-slate-600"><span>Gain livreur</span><span>{fcfa(order.driverEarning)}</span></div>
            {order.merchant && (
              <>
                <div className="flex justify-between text-slate-600"><span>Commission commerçant</span><span>{fcfa(order.merchantCommissionAmount)}</span></div>
                <div className="flex justify-between text-slate-600"><span>Part du commerçant</span><span>{fcfa(order.itemsSubtotal! - order.merchantCommissionAmount)}</span></div>
              </>
            )}
            <p className="pt-1 text-xs text-slate-500">
              {PAYMENT_LABELS[order.paymentMethod]} · {PAYMENT_STATUS_LABELS[order.paymentStatus]}
              {order.cashCollectAt && ` · espèces ${order.cashCollectAt === 'PICKUP' ? 'au départ' : 'à l’arrivée'}`}
            </p>
            {order.payments.map((p) => (
              <p key={p.id} className="text-xs text-slate-500">
                {PAYMENT_LABELS[p.provider]} {p.operator ?? ''} {fcfa(p.amount)} · {PAYMENT_STATUS_LABELS[p.status]} {p.providerReference && `· réf. ${p.providerReference}`}
              </p>
            ))}
          </Card>
          {(order.items.length > 0 || order.packageDescription || order.note) && (
            <Card className="text-sm">
              <h2 className="mb-1 font-semibold text-brand">Contenu</h2>
              {order.merchant && (
                <p className="mb-1">
                  <Link href={`/admin/commercants/${order.merchant.id}`} className="font-semibold text-brand-light">🏪 {order.merchant.name}</Link>
                  {order.merchantStatus && <span className="text-slate-500"> · {MERCHANT_STATUS[order.merchantStatus].label}{order.prepMinutes ? ` (${order.prepMinutes} min)` : ''}</span>}
                </p>
              )}
              {order.packageDescription && <p>{order.packageDescription}{order.isFragile && ' — fragile'}</p>}
              {order.items.map((i) => (
                <p key={i.id}>
                  • {i.quantity > 1 && `${i.quantity} × `}{i.label}
                  {!!i.options?.length && <span className="text-slate-500"> ({i.options.map((o) => o.name).join(', ')})</span>}
                  {i.unitPrice != null && <span className="text-slate-500"> — {fcfa(i.unitPrice * i.quantity)}</span>}
                </p>
              ))}
              {order.note && <p className="mt-1 text-slate-500">Note : {order.note}</p>}
            </Card>
          )}
          {order.proofs.some((p) => p.url) && (
            <Card>
              <h2 className="mb-2 font-semibold text-brand">Preuves</h2>
              <div className="flex flex-wrap gap-2">
                {order.proofs.filter((p) => p.url).map((p) => (
                  <a key={p.url} href={p.url!} target="_blank" rel="noreferrer"><img src={p.url!} alt={p.type} className="h-20 w-20 rounded-lg object-cover" /></a>
                ))}
              </div>
            </Card>
          )}
          <Card>
            <h2 className="mb-2 font-semibold text-brand">Historique</h2>
            <Timeline items={order.history} />
          </Card>
          {order.offers.length > 0 && (
            <Card className="text-sm">
              <h2 className="mb-2 font-semibold text-brand">Livreurs sollicités</h2>
              <ul className="space-y-1.5">
                {order.offers.map((o) => (
                  <li key={o.id} className="flex items-center justify-between gap-2">
                    <span>
                      {o.driver.firstName} {o.driver.lastName}
                      <span className="block text-xs text-slate-500">
                        {o.distanceMeters != null && `${(o.distanceMeters / 1000).toFixed(1)} km · `}
                        {dateTime(o.offeredAt)} {o.rejectReason && `· ${o.rejectReason}`}
                      </span>
                    </span>
                    <Badge tone={statusTone(o.status === 'ACCEPTED' ? 'SUCCEEDED' : o.status === 'OFFERED' ? 'PENDING' : 'REJECTED')}>{OFFER_LABELS[o.status]}</Badge>
                  </li>
                ))}
              </ul>
            </Card>
          )}
        </div>
      </div>

      <Sheet open={sheet === 'assign'} onClose={() => setSheet(null)} title="Affecter un livreur">
        <div className="space-y-3">
          <Field label="Livreur validé de la ville">
            <Select value={driverId} onChange={(e) => setDriverId(e.target.value)}>
              <option value="">Choisir…</option>
              {drivers.data?.items.map((d) => (
                <option key={d.userId} value={d.userId}>
                  {d.isOnline ? '🟢' : '⚪'} {d.user.firstName} {d.user.lastName} · {VEHICLE_LABELS[d.vehicleType]} · {phoneDisplay(d.user.phone)}
                </option>
              ))}
            </Select>
          </Field>
          <Alert>{error}</Alert>
          <Button block disabled={!driverId} loading={busy} onClick={() => run(`/admin/orders/${id}/assign`, { driverId })}>
            Affecter
          </Button>
        </div>
      </Sheet>
      <Sheet open={sheet === 'cancel'} onClose={() => setSheet(null)} title="Annuler la commande">
        <div className="space-y-3">
          <p className="text-sm text-slate-600">Un paiement déjà reçu sera remboursé sur le portefeuille du client.</p>
          <Field label="Motif (visible dans l’historique)">
            <Textarea rows={2} value={reason} onChange={(e) => setReason(e.target.value)} />
          </Field>
          <Alert>{error}</Alert>
          <Button variant="danger" block disabled={reason.trim().length < 3} loading={busy} onClick={() => run(`/admin/orders/${id}/cancel`, { reason })}>
            Confirmer l’annulation
          </Button>
        </div>
      </Sheet>
      <Sheet open={sheet === 'status'} onClose={() => setSheet(null)} title="Corriger le statut">
        <div className="space-y-3">
          <Field label="Nouveau statut">
            <Select value={forced} onChange={(e) => setForced(e.target.value)}>
              {order.status === 'FAILED' ? (
                <option value="RETURNED">Retournée à l’expéditeur</option>
              ) : (
                <>
                  <option value="DELIVERED">Livrée (confirmée par l’équipe)</option>
                  <option value="FAILED">Échec de livraison</option>
                </>
              )}
            </Select>
          </Field>
          <Field label="Justification">
            <Textarea rows={2} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Ex. destinataire a confirmé la réception par téléphone" />
          </Field>
          <Alert>{error}</Alert>
          <Button block disabled={reason.trim().length < 3} loading={busy} onClick={() => run(`/admin/orders/${id}/status`, { status: forced, reason })}>
            Enregistrer
          </Button>
        </div>
      </Sheet>
    </div>
  );
}
