'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus, Trash2 } from 'lucide-react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useMemo, useState } from 'react';
import { ClientOption, ClientPicker } from '@/components/pickers/client-picker';
import { Badge, Button, Card, Empty, ErrorMessage, Field, Input, Modal, PageHeader, Select, Spinner, Stat } from '@/components/ui';
import { get, post, qs } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { localToIso, money, PAYMENT_METHOD, time, todayIn } from '@/lib/format';
import { useSalon } from '@/lib/salon';

interface Session {
  id: string;
  status: string;
  openingFloat: number;
  expectedCash: number;
  salesCount: number;
  revenue: number;
  paymentsByMethod: Record<string, number>;
  cashExpenses: number;
  openedAt: string;
  movements: { id: string; type: string; amount: number; reason: string; createdAt: string }[];
}
interface Sale {
  id: string;
  number: string;
  status: string;
  total: number;
  tipTotal: number;
  discountTotal: number;
  createdAt: string;
  client: { fullName: string } | null;
  items: { id: string; label: string; quantity: number; lineTotal: number; staff: { displayName: string } | null }[];
  payments: { method: string; status: string; amount: number; providerReference: string | null }[];
}
interface Line {
  key: string;
  type: 'SERVICE' | 'PRODUCT';
  refId: string;
  variantId?: string;
  appointmentItemId?: string;
  staffId: string;
  label: string;
  unitPrice: number;
  quantity: number;
  priceIsFrom?: boolean;
}
interface PaymentRow {
  method: 'CASH' | 'MOBILE_MONEY_MANUAL' | 'CARD' | 'BANK_TRANSFER';
  amount: number;
  reference: string;
}

export default function CashPage() {
  return (
    <Suspense fallback={<Spinner />}>
      <CashRegister />
    </Suspense>
  );
}

function CashRegister() {
  const { salon } = useSalon();
  const { can } = useAuth();
  const params = useSearchParams();
  const appointmentId = params.get('rdv');
  const [closing, setClosing] = useState(false);
  const [moving, setMoving] = useState(false);
  const { data: session, isLoading } = useQuery({
    queryKey: ['cash', salon?.id],
    queryFn: () => get<Session | null>(`/cash/current${qs({ salonId: salon!.id })}`),
    enabled: Boolean(salon),
  });

  if (!salon || isLoading) return <Spinner />;
  return (
    <>
      <PageHeader
        title="Caisse"
        description={session ? `Ouverte depuis ${time(session.openedAt, salon.timezone)}` : 'Caisse fermée'}
        actions={
          session && (
            <>
              {can('cash.movements.manage') && <Button variant="secondary" onClick={() => setMoving(true)}>Entrée / sortie d’espèces</Button>}
              {can('cash.session.open_close') && <Button variant="secondary" onClick={() => setClosing(true)}>Clôturer la caisse</Button>}
            </>
          )
        }
      />
      {session ? (
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Stat label="Espèces attendues" value={money(session.expectedCash)} sub={`Fond de caisse ${money(session.openingFloat)}`} />
          <Stat label="Ventes" value={session.salesCount} sub={money(session.revenue)} />
          <Stat label="Mobile Money" value={money(session.paymentsByMethod.MOBILE_MONEY_MANUAL ?? 0)} />
          <Stat label="Dépenses en espèces" value={money(session.cashExpenses)} />
        </div>
      ) : (
        can('cash.session.open_close') && <OpenSession />
      )}
      {can('payments.validate') && <PendingPayments />}
      {can('sales.create') && <NewSale key={appointmentId ?? 'free'} appointmentId={appointmentId} cashOpen={Boolean(session)} />}
      <TodaySales />
      {closing && session && <CloseSession session={session} onClose={() => setClosing(false)} />}
      {moving && <CashMovement onClose={() => setMoving(false)} />}
    </>
  );
}

function OpenSession() {
  const { salon } = useSalon();
  const queryClient = useQueryClient();
  const [float, setFloat] = useState(0);
  const open = useMutation({ mutationFn: () => post('/cash/sessions', { salonId: salon!.id, openingFloat: float }), onSuccess: () => queryClient.invalidateQueries({ queryKey: ['cash'] }) });
  return (
    <Card title="Ouvrir la caisse">
      <div className="flex flex-wrap items-end gap-2">
        <Field label="Fond de caisse (espèces présentes)">{(id) => <Input id={id} type="number" min={0} step={50} value={float} onChange={(e) => setFloat(Number(e.target.value))} className="w-48" />}</Field>
        <Button loading={open.isPending} onClick={() => open.mutate()}>Ouvrir</Button>
      </div>
      <ErrorMessage error={open.error} />
    </Card>
  );
}

function PendingPayments() {
  const { salon } = useSalon();
  const queryClient = useQueryClient();
  const { data = [] } = useQuery({
    queryKey: ['pending-payments', salon?.id],
    queryFn: () => get<{ id: string; amount: number; operator: string | null; providerReference: string; createdAt: string; sale: { number: string; client: { fullName: string } | null } }[]>(`/payments/pending${qs({ salonId: salon!.id })}`),
    enabled: Boolean(salon),
  });
  const act = useMutation({
    mutationFn: ({ id, accept }: { id: string; accept: boolean }) => post(`/payments/${id}/${accept ? 'validate' : 'reject'}`),
    onSuccess: () => queryClient.invalidateQueries(),
  });
  if (data.length === 0) return null;
  return (
    <Card title="Mobile Money à vérifier" className="mt-4">
      <p className="mb-2 text-xs text-stone-500">Vérifiez la réception sur le téléphone du salon avant de valider.</p>
      <ul className="divide-y divide-stone-100 text-sm">
        {data.map((p) => (
          <li key={p.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
            <span>
              {p.sale.number} · {p.sale.client?.fullName ?? 'Passage'} · <strong>{money(p.amount)}</strong> · {p.operator ?? 'Mobile Money'} réf. <code>{p.providerReference}</code>
            </span>
            <span className="flex gap-2">
              <Button size="sm" onClick={() => act.mutate({ id: p.id, accept: true })}>Reçu</Button>
              <Button size="sm" variant="ghost" onClick={() => window.confirm('Paiement introuvable ? La vente sera annulée.') && act.mutate({ id: p.id, accept: false })}>Introuvable</Button>
            </span>
          </li>
        ))}
      </ul>
      <ErrorMessage error={act.error} />
    </Card>
  );
}

interface ServiceOption {
  id: string;
  name: string;
  basePrice: number;
  priceIsFrom: boolean;
  variants: { id: string; name: string; price: number }[];
}
interface ProductOption {
  id: string;
  name: string;
  salePrice: number | null;
  kind: string;
}

function NewSale({ appointmentId, cashOpen }: { appointmentId: string | null; cashOpen: boolean }) {
  const { salon } = useSalon();
  const { can } = useAuth();
  const router = useRouter();
  const queryClient = useQueryClient();
  const [client, setClient] = useState<ClientOption | null>(null);
  const [lines, setLines] = useState<Line[]>([]);
  const [discount, setDiscount] = useState(0);
  const [tip, setTip] = useState({ staffId: '', amount: 0 });
  const [payments, setPayments] = useState<PaymentRow[]>([{ method: 'CASH', amount: 0, reference: '' }]);
  const [tendered, setTendered] = useState(0);
  const [picker, setPicker] = useState({ kind: 'SERVICE', id: '', variantId: '', staffId: '', quantity: 1 });

  const { data: services = [] } = useQuery({ queryKey: ['services'], queryFn: () => get<ServiceOption[]>('/services') });
  const { data: products = [] } = useQuery({ queryKey: ['products', 'retail'], queryFn: () => get<ProductOption[]>('/products'), enabled: can('stock.read', 'sales.create') });
  const { data: staff = [] } = useQuery({ queryKey: ['staff'], queryFn: () => get<{ id: string; displayName: string }[]>('/staff') });
  const { data: appointment } = useQuery({
    queryKey: ['appointment', appointmentId],
    queryFn: () =>
      get<{ id: string; reference: string; client: ClientOption | null; items: { id: string; serviceId: string; serviceName: string; price: number; staff: { id: string } }[] }>(`/appointments/${appointmentId}`),
    enabled: Boolean(appointmentId),
  });

  useEffect(() => {
    if (!appointment) return;
    setClient(appointment.client);
    setLines(
      appointment.items.map((item) => ({
        key: item.id,
        type: 'SERVICE',
        refId: item.serviceId,
        appointmentItemId: item.id,
        staffId: item.staff.id,
        label: item.serviceName,
        unitPrice: item.price,
        quantity: 1,
        priceIsFrom: services.find((s) => s.id === item.serviceId)?.priceIsFrom,
      })),
    );
  }, [appointment, services]);

  const subtotal = lines.reduce((t, l) => t + l.unitPrice * l.quantity, 0);
  const total = Math.max(0, subtotal - discount);
  const due = total + (tip.amount || 0);
  const paid = payments.reduce((t, p) => t + (p.amount || 0), 0);
  const cashAmount = payments.filter((p) => p.method === 'CASH').reduce((t, p) => t + p.amount, 0);

  // Un seul moyen de paiement : il prend automatiquement le montant dû.
  useEffect(() => {
    setPayments((current) => (current.length === 1 ? [{ ...current[0], amount: due }] : current));
  }, [due]);

  const saleable = useMemo(() => products.filter((p) => p.kind !== 'PROFESSIONAL' && p.salePrice !== null), [products]);

  function addLine() {
    if (picker.kind === 'SERVICE') {
      const service = services.find((s) => s.id === picker.id);
      if (!service) return;
      const variant = service.variants.find((v) => v.id === picker.variantId);
      setLines([...lines, { key: crypto.randomUUID(), type: 'SERVICE', refId: service.id, variantId: variant?.id, staffId: picker.staffId, label: variant ? `${service.name} — ${variant.name}` : service.name, unitPrice: variant?.price ?? service.basePrice, quantity: 1, priceIsFrom: service.priceIsFrom }]);
    } else {
      const product = saleable.find((p) => p.id === picker.id);
      if (!product) return;
      setLines([...lines, { key: crypto.randomUUID(), type: 'PRODUCT', refId: product.id, staffId: picker.staffId, label: product.name, unitPrice: product.salePrice ?? 0, quantity: picker.quantity }]);
    }
    setPicker({ ...picker, id: '', variantId: '', quantity: 1 });
  }

  const submit = useMutation({
    mutationFn: () =>
      post<{ number: string; status: string }>('/sales', {
        salonId: salon!.id,
        clientId: client?.id,
        appointmentId: appointment?.id,
        offlineId: `web-${crypto.randomUUID()}`,
        items: lines.map((l) =>
          l.type === 'SERVICE'
            ? {
                type: 'SERVICE',
                ...(l.appointmentItemId ? { appointmentItemId: l.appointmentItemId } : { serviceId: l.refId }),
                ...(l.variantId ? { variantId: l.variantId } : {}),
                ...(l.staffId ? { staffId: l.staffId } : {}),
                ...(l.priceIsFrom || can('prices.manage') ? { unitPrice: l.unitPrice } : {}),
              }
            : { type: 'PRODUCT', productId: l.refId, quantity: l.quantity, ...(l.staffId ? { staffId: l.staffId } : {}) },
        ),
        ...(discount > 0 ? { discount } : {}),
        ...(tip.staffId && tip.amount > 0 ? { tips: [{ staffId: tip.staffId, amount: tip.amount }] } : {}),
        payments: payments.filter((p) => p.amount > 0).map((p) => ({ method: p.method, amount: p.amount, ...(p.method === 'MOBILE_MONEY_MANUAL' ? { reference: p.reference } : {}) })),
      }),
    onSuccess: () => {
      setLines([]);
      setDiscount(0);
      setTip({ staffId: '', amount: 0 });
      setPayments([{ method: 'CASH', amount: 0, reference: '' }]);
      setTendered(0);
      setClient(null);
      queryClient.invalidateQueries();
      if (appointmentId) router.replace('/caisse');
    },
  });

  return (
    <Card title={appointment ? `Encaisser le rendez-vous ${appointment.reference}` : 'Nouvelle vente'} className="mt-6">
      <div className="grid gap-6 lg:grid-cols-2">
        <div className="space-y-4">
          <div>
            <p className="mb-1 text-sm font-medium">Client</p>
            <ClientPicker value={client} onChange={setClient} />
          </div>
          {!appointment && (
            <div className="space-y-2 rounded-lg border border-stone-200 p-3">
              <div className="flex gap-2">
                <Select value={picker.kind} onChange={(e) => setPicker({ ...picker, kind: e.target.value, id: '', variantId: '' })} className="w-36" aria-label="Type de ligne">
                  <option value="SERVICE">Prestation</option>
                  {saleable.length > 0 && <option value="PRODUCT">Produit</option>}
                </Select>
                <Select value={picker.id} onChange={(e) => setPicker({ ...picker, id: e.target.value, variantId: '' })} aria-label="Article">
                  <option value="">Choisir…</option>
                  {picker.kind === 'SERVICE'
                    ? services.map((s) => <option key={s.id} value={s.id}>{s.name} — {money(s.basePrice)}</option>)
                    : saleable.map((p) => <option key={p.id} value={p.id}>{p.name} — {money(p.salePrice)}</option>)}
                </Select>
              </div>
              {picker.kind === 'SERVICE' && (services.find((s) => s.id === picker.id)?.variants.length ?? 0) > 0 && (
                <Select value={picker.variantId} onChange={(e) => setPicker({ ...picker, variantId: e.target.value })} aria-label="Variante">
                  <option value="">Standard</option>
                  {services.find((s) => s.id === picker.id)!.variants.map((v) => <option key={v.id} value={v.id}>{v.name} — {money(v.price)}</option>)}
                </Select>
              )}
              <div className="flex gap-2">
                <Select value={picker.staffId} onChange={(e) => setPicker({ ...picker, staffId: e.target.value })} aria-label="Employé crédité">
                  <option value="">Employé (commission)…</option>
                  {staff.map((s) => <option key={s.id} value={s.id}>{s.displayName}</option>)}
                </Select>
                {picker.kind === 'PRODUCT' && <Input type="number" min={1} className="w-20" value={picker.quantity} onChange={(e) => setPicker({ ...picker, quantity: Number(e.target.value) })} aria-label="Quantité" />}
                <Button variant="secondary" disabled={!picker.id} onClick={addLine}><Plus className="h-4 w-4" /> Ajouter</Button>
              </div>
            </div>
          )}
          {lines.length === 0 ? (
            <Empty title="Ticket vide" />
          ) : (
            <ul className="divide-y divide-stone-100 rounded-lg border border-stone-200 text-sm">
              {lines.map((l) => (
                <li key={l.key} className="flex items-center gap-2 px-3 py-2">
                  <span className="flex-1">
                    {l.quantity > 1 && `${l.quantity} × `}
                    {l.label}
                    {l.staffId && <span className="text-stone-500"> · {staff.find((s) => s.id === l.staffId)?.displayName}</span>}
                  </span>
                  {l.type === 'SERVICE' && (l.priceIsFrom || can('prices.manage')) ? (
                    <Input type="number" min={0} step={50} className="w-28 text-right" value={l.unitPrice} aria-label={`Prix de ${l.label}`} onChange={(e) => setLines(lines.map((x) => (x.key === l.key ? { ...x, unitPrice: Number(e.target.value) } : x)))} />
                  ) : (
                    <span className="tabular-nums">{money(l.unitPrice * l.quantity)}</span>
                  )}
                  {!appointment && <button onClick={() => setLines(lines.filter((x) => x.key !== l.key))} aria-label="Retirer" className="text-stone-400 hover:text-red-600"><Trash2 className="h-4 w-4" /></button>}
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="space-y-3">
          {can('sales.discount') && (
            <Field label="Remise sur le ticket" hint={can('prices.manage') ? undefined : 'Plafonnée selon votre rôle'}>
              {(id) => <Input id={id} type="number" min={0} step={50} value={discount} onChange={(e) => setDiscount(Number(e.target.value))} />}
            </Field>
          )}
          <div className="flex gap-2">
            <Select value={tip.staffId} onChange={(e) => setTip({ ...tip, staffId: e.target.value })} aria-label="Pourboire pour">
              <option value="">Pourboire pour…</option>
              {staff.map((s) => <option key={s.id} value={s.id}>{s.displayName}</option>)}
            </Select>
            <Input type="number" min={0} step={50} className="w-32" value={tip.amount} onChange={(e) => setTip({ ...tip, amount: Number(e.target.value) })} aria-label="Montant du pourboire" />
          </div>
          <div className="rounded-lg bg-stone-50 p-3 text-sm">
            <p className="flex justify-between"><span>Sous-total</span><span className="tabular-nums">{money(subtotal)}</span></p>
            {discount > 0 && <p className="flex justify-between text-stone-600"><span>Remise</span><span className="tabular-nums">− {money(discount)}</span></p>}
            {tip.amount > 0 && <p className="flex justify-between text-stone-600"><span>Pourboire</span><span className="tabular-nums">{money(tip.amount)}</span></p>}
            <p className="mt-1 flex justify-between border-t border-stone-200 pt-1 text-base font-semibold"><span>À encaisser</span><span className="tabular-nums">{money(due)}</span></p>
          </div>
          <div className="space-y-2">
            {payments.map((p, i) => (
              <div key={i} className="flex flex-wrap gap-2">
                <Select className="w-40" value={p.method} onChange={(e) => setPayments(payments.map((x, j) => (j === i ? { ...x, method: e.target.value as PaymentRow['method'] } : x)))} aria-label="Moyen de paiement">
                  {Object.entries({ CASH: 'Espèces', MOBILE_MONEY_MANUAL: 'Mobile Money', CARD: 'Carte', BANK_TRANSFER: 'Virement' }).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                </Select>
                <Input type="number" min={0} className="w-32" value={p.amount} onChange={(e) => setPayments(payments.map((x, j) => (j === i ? { ...x, amount: Number(e.target.value) } : x)))} aria-label="Montant" />
                {p.method === 'MOBILE_MONEY_MANUAL' && (
                  <Input className="w-40" value={p.reference} placeholder="Réf. transaction" onChange={(e) => setPayments(payments.map((x, j) => (j === i ? { ...x, reference: e.target.value } : x)))} aria-label="Référence de la transaction" />
                )}
                {payments.length > 1 && <button onClick={() => setPayments(payments.filter((_, j) => j !== i))} aria-label="Retirer le paiement" className="text-stone-400 hover:text-red-600"><Trash2 className="h-4 w-4" /></button>}
              </div>
            ))}
            <button className="text-sm text-brand-700 hover:underline" onClick={() => setPayments([...payments, { method: 'MOBILE_MONEY_MANUAL', amount: Math.max(0, due - paid), reference: '' }])}>
              + Paiement mixte
            </button>
          </div>
          {cashAmount > 0 && (
            <div className="flex items-center gap-2 text-sm">
              <label htmlFor="tendered">Espèces reçues</label>
              <Input id="tendered" type="number" min={0} step={50} className="w-32" value={tendered} onChange={(e) => setTendered(Number(e.target.value))} />
              {tendered > cashAmount && <span className="font-semibold">Rendu : {money(tendered - cashAmount)}</span>}
            </div>
          )}
          {cashAmount > 0 && !cashOpen && <p className="text-sm text-amber-800">Ouvrez la caisse pour encaisser en espèces.</p>}
          {paid !== due && lines.length > 0 && <p className="text-sm text-amber-800">Les paiements ({money(paid)}) doivent égaler le montant à encaisser.</p>}
          <ErrorMessage error={submit.error} />
          {submit.data && (
            <p className="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-900">
              Vente {submit.data.number} {submit.data.status === 'PAID' ? 'encaissée' : 'enregistrée — Mobile Money en attente de vérification'}.
            </p>
          )}
          <Button className="w-full" disabled={lines.length === 0 || paid !== due || (cashAmount > 0 && !cashOpen)} loading={submit.isPending} onClick={() => submit.mutate()}>
            Encaisser {money(due)}
          </Button>
        </div>
      </div>
    </Card>
  );
}

function TodaySales() {
  const { salon } = useSalon();
  const { can } = useAuth();
  const queryClient = useQueryClient();
  const from = salon ? localToIso(todayIn(salon.timezone), '00:00', salon.timezone) : '';
  const { data: sales = [] } = useQuery({
    queryKey: ['sales', salon?.id, from],
    queryFn: () => get<Sale[]>(`/sales${qs({ salonId: salon!.id, from })}`),
    enabled: Boolean(salon),
  });
  const voidSale = useMutation({
    mutationFn: ({ id, reason }: { id: string; reason: string }) => post(`/sales/${id}/void`, { reason }),
    onSuccess: () => queryClient.invalidateQueries(),
  });
  return (
    <Card title="Ventes du jour" className="mt-6">
      {sales.length === 0 ? (
        <p className="text-sm text-stone-500">Aucune vente aujourd’hui.</p>
      ) : (
        <ul className="divide-y divide-stone-100 text-sm">
          {sales.map((s) => (
            <li key={s.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
              <div className="min-w-0">
                <p className={s.status === 'VOIDED' ? 'text-stone-400 line-through' : 'font-medium'}>
                  {s.number} · {time(s.createdAt, salon?.timezone)} · {s.client?.fullName ?? 'Passage'}
                </p>
                <p className="truncate text-xs text-stone-500">
                  {s.items.map((i) => i.label).join(', ')} · {s.payments.map((p) => PAYMENT_METHOD[p.method]).join(' + ')}
                </p>
              </div>
              <div className="flex items-center gap-2">
                {s.status === 'OPEN' && <Badge tone="amber">À vérifier</Badge>}
                {s.status === 'VOIDED' && <Badge>Annulée</Badge>}
                <span className="tabular-nums font-semibold">{money(s.total + s.tipTotal)}</span>
                {can('sales.void') && s.status !== 'VOIDED' && (
                  <Button size="sm" variant="ghost" onClick={() => { const reason = window.prompt('Motif de l’annulation ?'); if (reason && reason.trim().length >= 3) voidSale.mutate({ id: s.id, reason }); }}>
                    Annuler
                  </Button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
      <ErrorMessage error={voidSale.error} />
    </Card>
  );
}

function CloseSession({ session, onClose }: { session: Session; onClose: () => void }) {
  const queryClient = useQueryClient();
  const [counted, setCounted] = useState(session.expectedCash);
  const [reason, setReason] = useState('');
  const difference = counted - session.expectedCash;
  const close = useMutation({
    mutationFn: () => post(`/cash/sessions/${session.id}/close`, { countedCash: counted, ...(reason ? { differenceReason: reason } : {}) }),
    onSuccess: () => {
      queryClient.invalidateQueries();
      onClose();
    },
  });
  return (
    <Modal open title="Clôturer la caisse" onClose={onClose} footer={<><Button variant="secondary" onClick={onClose}>Annuler</Button><Button loading={close.isPending} onClick={() => close.mutate()}>Clôturer</Button></>}>
      <div className="space-y-3 text-sm">
        <p>Espèces attendues : <strong>{money(session.expectedCash)}</strong></p>
        <Field label="Espèces comptées">{(id) => <Input id={id} type="number" min={0} step={25} value={counted} onChange={(e) => setCounted(Number(e.target.value))} />}</Field>
        {difference !== 0 && (
          <>
            <p className={difference < 0 ? 'text-red-700' : 'text-amber-800'}>Écart : {difference > 0 ? '+' : ''}{money(difference)}</p>
            <Field label="Explication de l’écart (obligatoire)">{(id) => <Input id={id} value={reason} onChange={(e) => setReason(e.target.value)} />}</Field>
          </>
        )}
        <ErrorMessage error={close.error} />
      </div>
    </Modal>
  );
}

function CashMovement({ onClose }: { onClose: () => void }) {
  const { salon } = useSalon();
  const queryClient = useQueryClient();
  const [form, setForm] = useState({ type: 'BANK_DEPOSIT', amount: 0, reason: '' });
  const save = useMutation({
    mutationFn: () => post('/cash/movements', { salonId: salon!.id, ...form }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['cash'] });
      onClose();
    },
  });
  return (
    <Modal open title="Entrée / sortie d’espèces" onClose={onClose} footer={<><Button variant="secondary" onClick={onClose}>Annuler</Button><Button loading={save.isPending} onClick={() => save.mutate()}>Enregistrer</Button></>}>
      <div className="space-y-3">
        <Select value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })} aria-label="Type">
          <option value="BANK_DEPOSIT">Dépôt en banque</option>
          <option value="CASH_OUT">Retrait (propriétaire)</option>
          <option value="CASH_IN">Apport d’espèces</option>
        </Select>
        <Field label="Montant">{(id) => <Input id={id} type="number" min={1} step={50} value={form.amount} onChange={(e) => setForm({ ...form, amount: Number(e.target.value) })} />}</Field>
        <Field label="Motif">{(id) => <Input id={id} value={form.reason} onChange={(e) => setForm({ ...form, reason: e.target.value })} />}</Field>
        <p className="text-xs text-stone-500">Les dépenses (électricité, produits…) se saisissent dans « Dépenses ».</p>
        <ErrorMessage error={save.error} />
      </div>
    </Modal>
  );
}

