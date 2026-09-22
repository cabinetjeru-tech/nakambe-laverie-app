'use client';

import clsx from 'clsx';
import { Bike, Check, ChefHat, ClipboardList, Phone, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { MERCHANT_STATUS } from '@/components/food';
import { InstallButton, PushToggle } from '@/components/pwa';
import { Alert, Badge, Button, Card, EmptyState, Field, Pagination, Sheet, Spinner, StatusBadge, Textarea } from '@/components/ui';
import { dateTime, fcfa, PAYMENT_LABELS, timeOnly } from '@/lib/format';
import { useMerchant } from '@/lib/merchant';
import { getSocket } from '@/lib/socket';
import type { Paginated } from '@/lib/types';
import { useApi } from '@/lib/use-api';

interface MerchantOrder {
  id: string;
  reference: string;
  status: string;
  statusLabel: string;
  merchantStatus: 'PENDING' | 'ACCEPTED' | 'READY' | 'REJECTED';
  prepMinutes: number | null;
  merchantAcceptedAt: string | null;
  readyAt: string | null;
  createdAt: string;
  note: string | null;
  itemsSubtotal: number;
  merchantCommissionAmount: number;
  merchantEarning: number;
  paymentMethod: string;
  items: { label: string; quantity: number; unitPrice: number | null; options: { groupName: string; name: string }[] | null; note: string | null }[];
  clientFirstName: string;
  driver: { firstName: string; lastName: string; phone: string } | null;
}

const TABS = [
  { view: 'PENDING', label: 'Nouvelles' },
  { view: 'ACTIVE', label: 'En cours' },
  { view: 'DONE', label: 'Terminées' },
] as const;

const PREP_CHOICES = [10, 15, 20, 30, 45, 60];
const REJECT_REASONS = ['Plat épuisé', 'Trop de commandes en ce moment', 'Nous fermons bientôt'];

function OrderCard({ order, onChanged }: { order: MerchantOrder; onChanged: () => void }) {
  const { merchant, call } = useMerchant();
  const [prep, setPrep] = useState(merchant?.avgPrepMinutes ?? 20);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [rejectOpen, setRejectOpen] = useState(false);
  const [reason, setReason] = useState('');

  const act = async (action: 'accept' | 'reject' | 'ready', body: unknown = {}) => {
    setBusy(action);
    setError(null);
    try {
      await call(`orders/${order.id}/${action}`, { body });
      setRejectOpen(false);
      onChanged();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(null);
    }
  };

  const readyAtEstimate = order.merchantAcceptedAt && order.prepMinutes ? new Date(new Date(order.merchantAcceptedAt).getTime() + order.prepMinutes * 60_000) : null;
  const finished = ['DELIVERED', 'COMPLETED', 'CANCELLED', 'FAILED', 'RETURNED'].includes(order.status);
  const ms = MERCHANT_STATUS[order.merchantStatus];

  return (
    <Card className={clsx('space-y-3', order.merchantStatus === 'PENDING' && !finished && 'ring-2 ring-amber-400')}>
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="font-bold text-brand">{order.reference}</p>
          <p className="text-xs text-slate-500">
            {dateTime(order.createdAt)} · pour {order.clientFirstName} · {PAYMENT_LABELS[order.paymentMethod]}
          </p>
        </div>
        {finished ? <StatusBadge status={order.status} label={order.statusLabel} /> : <Badge tone={ms.tone}>{ms.label}</Badge>}
      </div>

      <ul className="space-y-1.5 rounded-xl bg-slate-50 p-3 text-sm">
        {order.items.map((i, idx) => (
          <li key={idx}>
            <span className="font-bold text-brand">{i.quantity} ×</span> {i.label}
            {!!i.options?.length && <span className="block pl-6 text-xs text-slate-600">{i.options.map((o) => o.name).join(', ')}</span>}
            {i.note && <span className="block pl-6 text-xs font-semibold text-amber-700">« {i.note} »</span>}
          </li>
        ))}
        {order.note && <li className="border-t border-slate-200 pt-1.5 text-xs text-slate-600">Message du client : « {order.note} »</li>}
      </ul>

      <div className="flex justify-between text-sm">
        <span className="text-slate-500">Articles {fcfa(order.itemsSubtotal)} − commission {fcfa(order.merchantCommissionAmount)}</span>
        <span className="font-bold text-brand-greenDark">{fcfa(order.merchantEarning)}</span>
      </div>

      {order.driver && !finished && (
        <div className="flex items-center justify-between rounded-xl bg-brand-sky px-3 py-2 text-sm text-brand">
          <span className="flex items-center gap-2">
            <Bike className="h-4 w-4" /> {order.driver.firstName} {order.driver.lastName} · {order.statusLabel.toLowerCase()}
          </span>
          <a href={`tel:${order.driver.phone}`} className="rounded-lg bg-white p-1.5" aria-label="Appeler le livreur">
            <Phone className="h-4 w-4" />
          </a>
        </div>
      )}
      {!order.driver && order.merchantStatus !== 'PENDING' && !finished && (
        <p className="text-xs text-slate-500">
          {order.status === 'SEARCHING_DRIVER' ? 'Un livreur sera envoyé pour arriver quand la commande sera prête.' : order.statusLabel}
        </p>
      )}

      <Alert>{error}</Alert>

      {!finished && order.merchantStatus === 'PENDING' && (
        <div className="space-y-2">
          <p className="text-sm font-medium text-slate-700">Temps de préparation</p>
          <div className="flex flex-wrap gap-2">
            {PREP_CHOICES.map((m) => (
              <button key={m} type="button" onClick={() => setPrep(m)} className={clsx('rounded-full px-3 py-1 text-sm font-semibold', prep === m ? 'bg-brand text-white' : 'bg-white text-slate-600 ring-1 ring-slate-200')}>
                {m} min
              </button>
            ))}
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => setRejectOpen(true)} disabled={!!busy}>
              <X className="h-4 w-4" /> Refuser
            </Button>
            <Button block size="lg" variant="success" loading={busy === 'accept'} onClick={() => act('accept', { prepMinutes: prep })}>
              <Check className="h-5 w-5" /> Accepter ({prep} min)
            </Button>
          </div>
        </div>
      )}
      {!finished && order.merchantStatus === 'ACCEPTED' && (
        <div className="space-y-1">
          {readyAtEstimate && <p className="text-xs text-slate-500">Prête prévue vers {timeOnly(readyAtEstimate)}</p>}
          <Button block size="lg" loading={busy === 'ready'} onClick={() => act('ready')}>
            <ChefHat className="h-5 w-5" /> Commande prête
          </Button>
        </div>
      )}

      <Sheet open={rejectOpen} onClose={() => setRejectOpen(false)} title={`Refuser ${order.reference}`}>
        <div className="space-y-3">
          <p className="text-sm text-slate-600">Le client sera prévenu et remboursé s’il a déjà payé.</p>
          <div className="flex flex-wrap gap-2">
            {REJECT_REASONS.map((r) => (
              <button key={r} type="button" onClick={() => setReason(r)} className={clsx('rounded-full px-3 py-1 text-sm', reason === r ? 'bg-brand text-white' : 'bg-slate-100 text-slate-700')}>
                {r}
              </button>
            ))}
          </div>
          <Field label="Raison">
            <Textarea rows={2} maxLength={300} value={reason} onChange={(e) => setReason(e.target.value)} />
          </Field>
          <Alert>{error}</Alert>
          <Button variant="danger" block loading={busy === 'reject'} disabled={reason.trim().length < 3} onClick={() => act('reject', { reason: reason.trim() })}>
            Confirmer le refus
          </Button>
        </div>
      </Sheet>
    </Card>
  );
}

export default function MerchantOrdersPage() {
  const { merchantId, path } = useMerchant();
  const [view, setView] = useState<(typeof TABS)[number]['view']>('PENDING');
  const [page, setPage] = useState(1);
  const orders = useApi<Paginated<MerchantOrder>>(merchantId ? `${path('orders')}?view=${view}&page=${page}&pageSize=20` : null, { refreshInterval: 30_000, persist: false });
  const { reload } = orders;

  useEffect(() => {
    const socket = getSocket();
    const onOrder = () => void reload();
    socket.on('merchant.order', onOrder);
    return () => {
      socket.off('merchant.order', onOrder);
    };
  }, [reload]);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-3 gap-1 rounded-2xl bg-white p-1 shadow-card">
        {TABS.map((t) => (
          <button
            key={t.view}
            type="button"
            onClick={() => {
              setView(t.view);
              setPage(1);
            }}
            className={clsx('rounded-xl py-2 text-sm font-semibold', view === t.view ? 'bg-brand text-white' : 'text-slate-600')}
          >
            {t.label}
          </button>
        ))}
      </div>

      {!orders.data && <Spinner />}
      {orders.data?.items.length === 0 && (
        <EmptyState icon={<ClipboardList className="h-8 w-8" />} title={view === 'PENDING' ? 'Aucune nouvelle commande' : view === 'ACTIVE' ? 'Aucune commande en préparation' : 'Aucune commande terminée'}>
          {view === 'PENDING' && 'Gardez cet écran ouvert : une sonnerie retentit à chaque nouvelle commande.'}
        </EmptyState>
      )}
      <div className="space-y-3">
        {orders.data?.items.map((o) => (
          <OrderCard key={o.id} order={o} onChanged={reload} />
        ))}
      </div>
      {orders.data && <Pagination page={page} pageSize={20} total={orders.data.total} onChange={setPage} />}

      {view === 'PENDING' && (
        <Card className="space-y-2">
          <p className="text-sm font-semibold text-brand">Ne manquez aucune commande</p>
          <p className="text-sm text-slate-600">Activez les notifications et installez l’application sur le téléphone du commerce.</p>
          <div className="flex flex-wrap gap-2">
            <PushToggle compact />
            <InstallButton variant="primary" />
          </div>
        </Card>
      )}
    </div>
  );
}
