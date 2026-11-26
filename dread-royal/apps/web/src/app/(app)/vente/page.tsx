'use client';
import clsx from 'clsx';
import { Minus, Package, Plus, Scissors, Search, Trash2, Crown, AlertTriangle } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import { computeSaleTotals, PAYMENT_METHOD_LABELS } from '@dread-royal/shared';
import { RequirePerm } from '@/components/AppShell';
import { ClientLite, ClientPicker } from '@/components/pickers';
import { Badge, Button, Card, Field, Input, MoneyInput, PageHeader, Select, Tabs, Textarea, useUi } from '@/components/ui';
import { get, post } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { formatFCFA } from '@/lib/format';
import { useApi } from '@/lib/hooks';
import { enqueue, flush, submitOrQueue } from '@/lib/offline';

interface Line { key: string; type: 'SERVICE' | 'PRODUCT' | 'PACKAGE'; refId: string; label: string; quantity: number; unitPrice: number; min: number; max: number; staffId: string; lineDiscount: number; stock?: number }
interface Pay { method: string; amount: number | ''; reference: string }

export default function VentePage() {
  return <RequirePerm perms={['sales.create']}><Pos /></RequirePerm>;
}

function Pos() {
  const { can } = useAuth();
  const { toast } = useUi();
  const router = useRouter();
  const services = useApi<any[]>('/services');
  const products = useApi<any[]>('/stock/products?sellable=true');
  const packages = useApi<any[]>('/loyalty/packages');
  const staff = useApi<any[]>('/staff?stylists=true');
  const settings = useApi<any>('/settings');
  const cash = useApi<any>(can('cash.manage') ? '/cash/current' : null);
  const [tab, setTab] = useState<'services' | 'products' | 'packages'>('services');
  const [search, setSearch] = useState('');
  const [lines, setLines] = useState<Line[]>([]);
  const [client, setClient] = useState<ClientLite | null>(null);
  const [appointmentId, setAppointmentId] = useState<string | undefined>();
  const [discount, setDiscount] = useState<number | ''>('');
  const [discountReason, setDiscountReason] = useState('');
  const [points, setPoints] = useState<number | ''>('');
  const [payments, setPayments] = useState<Pay[]>([{ method: 'CASH', amount: '', reference: '' }]);
  const [received, setReceived] = useState<number | ''>('');
  const [notes, setNotes] = useState('');
  const [busy, setBusy] = useState(false);

  // Pré-remplissage depuis un rendez-vous ou une fiche client
  useEffect(() => {
    const p = new URLSearchParams(location.search);
    const a = p.get('appointment');
    const c = p.get('client');
    if (a) get(`/appointments/${a}`).then((ap) => {
      setAppointmentId(ap.id);
      setClient(ap.client);
      setLines(ap.items.map((i: any, n: number) => ({ key: `a${n}`, type: 'SERVICE', refId: i.service.id, label: i.service.name, quantity: 1, unitPrice: i.price, min: i.price, max: i.price, staffId: ap.staff.id, lineDiscount: 0 })));
    }).catch((e) => toast('error', e.message));
    else if (c) get(`/clients/${c}`).then((r) => setClient(r.client)).catch(() => null);
  }, []); // eslint-disable-line
  // Les prix min/max des lignes issues d'un RDV : compléter depuis le catalogue
  useEffect(() => {
    if (!services.data) return;
    setLines((ls) => ls.map((l) => { const s = services.data!.find((x) => x.id === l.refId); return l.type === 'SERVICE' && s ? { ...l, min: s.price, max: s.priceMax ?? s.price } : l; }));
  }, [services.data]);

  const add = (type: Line['type'], item: any) => {
    if (type === 'PRODUCT') {
      const existing = lines.find((l) => l.type === 'PRODUCT' && l.refId === item.id);
      if (existing) return setLines(lines.map((l) => (l === existing ? { ...l, quantity: Math.min(l.quantity + 1, item.quantity) } : l)));
      if (item.quantity <= 0) return toast('error', 'Produit en rupture de stock');
    }
    const price = type === 'SERVICE' ? item.price : type === 'PRODUCT' ? item.salePrice : item.price;
    setLines([...lines, { key: `${Date.now()}${Math.random()}`, type, refId: item.id, label: type === 'PACKAGE' ? `Forfait ${item.name}` : item.name, quantity: 1, unitPrice: price, min: price, max: type === 'SERVICE' ? item.priceMax ?? price : price, staffId: '', lineDiscount: 0, stock: type === 'PRODUCT' ? item.quantity : undefined }]);
  };
  const update = (key: string, patch: Partial<Line>) => setLines(lines.map((l) => (l.key === key ? { ...l, ...patch } : l)));

  const loyalty = settings.data?.loyalty;
  const loyaltyValue = (Number(points) || 0) * (loyalty?.pointValue ?? 0);
  const totals = useMemo(() => {
    try { return computeSaleTotals(lines.map((l) => ({ quantity: l.quantity, unitPrice: l.unitPrice, lineDiscount: l.lineDiscount })), Number(discount) || 0, loyaltyValue); } catch (e: any) { return { error: e.message as string, subtotal: 0, total: 0 } as any; }
  }, [lines, discount, loyaltyValue]);
  const paid = payments.reduce((a, p) => a + (Number(p.amount) || 0), 0);
  const balance = (totals.total ?? 0) - paid;
  const cashPart = payments.filter((p) => p.method === 'CASH').reduce((a, p) => a + (Number(p.amount) || 0), 0);
  const change = received !== '' && cashPart ? Number(received) - cashPart : 0;

  const q = search.toLowerCase();
  const catalog = tab === 'services' ? (services.data ?? []).filter((s) => `${s.code} ${s.name} ${s.category.name}`.toLowerCase().includes(q)) : tab === 'products' ? (products.data ?? []).filter((p) => `${p.reference} ${p.name}`.toLowerCase().includes(q)) : (packages.data ?? []);
  const errors: string[] = [];
  if (!lines.length) errors.push('Panier vide');
  if (lines.some((l) => l.type === 'SERVICE' && !l.staffId)) errors.push('Choisissez le coiffeur de chaque prestation');
  if (lines.some((l) => l.type === 'PACKAGE') && !client) errors.push('Un forfait nécessite un client');
  if (totals.error) errors.push(totals.error);
  if (paid > (totals.total ?? 0)) errors.push('Le montant encaissé dépasse le total');
  if ((Number(discount) || 0) > 0 && !discountReason.trim()) errors.push('Motif de remise obligatoire');
  if (payments.some((p) => p.method !== 'CASH' && Number(p.amount) > 0 && !p.reference.trim())) errors.push('Référence de transaction obligatoire (Mobile Money / virement)');
  if (cashPart > 0 && can('cash.manage') && cash.data === null && !cash.loading) errors.push("La caisse est fermée : ouvrez-la avant d'encaisser des espèces");

  const submit = async () => {
    setBusy(true);
    const body = {
      clientId: client?.queued ? undefined : client?.id,
      appointmentId,
      items: lines.map((l) => ({ type: l.type, ...(l.type === 'SERVICE' ? { serviceId: l.refId, staffId: l.staffId } : l.type === 'PRODUCT' ? { productId: l.refId } : { packageId: l.refId }), quantity: l.quantity, unitPrice: l.type !== 'PACKAGE' && l.unitPrice !== l.min ? l.unitPrice : undefined, lineDiscount: l.lineDiscount || undefined })),
      discount: Number(discount) || undefined,
      discountReason: discountReason || undefined,
      loyaltyPoints: Number(points) || undefined,
      payments: payments.filter((p) => Number(p.amount) > 0).map((p) => ({ method: p.method, amount: Number(p.amount), reference: p.reference || undefined })),
      notes: notes || undefined,
    };
    try {
      const label = `Vente ${formatFCFA(totals.total)}${client ? ` — ${client.firstName} ${client.lastName}` : ''}`;
      // Client créé hors ligne : la vente référence l'opération de création (résolue par le serveur)
      const r = client?.queued
        ? { queued: true as const, op: await enqueue('sale.create', body, label, { clientId: client.id }).finally(() => flush()) }
        : await submitOrQueue('sale.create', body, label, () => post('/sales', body));
      if (r.queued) {
        toast('warning', 'Hors connexion : vente EN ATTENTE. Elle ne sera validée (et numérotée) qu’après confirmation par le serveur.');
        setLines([]); setPayments([{ method: 'CASH', amount: '', reference: '' }]); setDiscount(''); setPoints(''); setClient(null); setReceived('');
      } else {
        toast('success', `Vente ${r.result.number} enregistrée`);
        router.push(`/ventes/detail/?id=${r.result.id}`);
      }
    } catch (e: any) { toast('error', e.message); } finally { setBusy(false); }
  };

  return (
    <>
      <PageHeader title="Nouvelle vente" subtitle={appointmentId ? 'Encaissement d’un rendez-vous' : 'Prestations, produits et forfaits'} actions={can('cash.manage') && (cash.data ? <Badge tone="green">Caisse ouverte {cash.data.number}</Badge> : !cash.loading && <Badge tone="red">Caisse fermée</Badge>)} />
      <div className="grid gap-5 lg:grid-cols-5">
        <Card className="lg:col-span-2">
          <Tabs value={tab} onChange={setTab} tabs={[{ key: 'services', label: <span className="flex items-center gap-1"><Scissors className="h-3.5 w-3.5" />Prestations</span> }, { key: 'products', label: <span className="flex items-center gap-1"><Package className="h-3.5 w-3.5" />Produits</span> }, { key: 'packages', label: <span className="flex items-center gap-1"><Crown className="h-3.5 w-3.5" />Forfaits</span> }]} />
          <div className="relative mb-3"><Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-neutral-400" /><Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Rechercher…" className="pl-9" /></div>
          <div className="max-h-[60vh] space-y-1 overflow-y-auto">
            {catalog.map((it: any) => (
              <button key={it.id} onClick={() => add(tab === 'services' ? 'SERVICE' : tab === 'products' ? 'PRODUCT' : 'PACKAGE', it)} disabled={tab === 'products' && it.quantity <= 0}
                className="flex w-full items-center justify-between gap-2 rounded-lg border border-transparent px-3 py-2 text-left text-sm hover:border-royal-gold/40 hover:bg-royal-gold-light/40 disabled:opacity-40">
                <span className="min-w-0"><span className="block truncate font-medium">{it.name}</span><span className="text-xs text-neutral-500">{tab === 'services' ? it.category.name : tab === 'products' ? `${it.reference} · stock ${it.quantity}` : `${it.visits} passages / ${it.durationDays} j`}</span></span>
                <span className="whitespace-nowrap font-semibold">{formatFCFA(tab === 'products' ? it.salePrice : it.price, false)}{it.priceMax ? '+' : ''}</span>
              </button>
            ))}
          </div>
        </Card>

        <div className="space-y-4 lg:col-span-3">
          <Card title="Client">
            <ClientPicker value={client} onChange={setClient} />
            {client?.queued && <p className="mt-2 text-xs text-amber-700">Client créé hors ligne : la vente sera mise en file et rattachée au client lors de la synchronisation.</p>}
          </Card>
          <Card title={`Panier (${lines.length})`}>
            {!lines.length ? <p className="py-6 text-center text-sm text-neutral-500">Ajoutez des prestations ou des produits depuis le catalogue.</p> : (
              <div className="space-y-3">
                {lines.map((l) => (
                  <div key={l.key} className="rounded-lg border p-3">
                    <div className="flex items-start justify-between gap-2">
                      <div><p className="font-semibold">{l.label}</p><p className="text-xs text-neutral-500">{{ SERVICE: 'Prestation', PRODUCT: 'Produit', PACKAGE: 'Forfait' }[l.type]}{l.max > l.min ? ` · tarif ${formatFCFA(l.min, false)} à ${formatFCFA(l.max)}` : ''}</p></div>
                      <button onClick={() => setLines(lines.filter((x) => x.key !== l.key))} className="text-neutral-400 hover:text-red-600" aria-label="Retirer"><Trash2 className="h-4 w-4" /></button>
                    </div>
                    <div className="mt-2 grid gap-2 sm:grid-cols-4">
                      {l.type === 'SERVICE' ? (
                        <Select value={l.staffId} onChange={(e) => update(l.key, { staffId: e.target.value })} className={clsx('sm:col-span-2', !l.staffId && 'border-amber-400')}><option value="">— Coiffeur —</option>{(staff.data ?? []).map((s) => <option key={s.id} value={s.id}>{s.firstName} {s.lastName}</option>)}</Select>
                      ) : (
                        <div className="flex items-center gap-1 sm:col-span-2">
                          <Button size="sm" variant="outline" onClick={() => update(l.key, { quantity: Math.max(1, l.quantity - 1) })} aria-label="Moins"><Minus className="h-3 w-3" /></Button>
                          <span className="w-8 text-center font-semibold">{l.quantity}</span>
                          <Button size="sm" variant="outline" onClick={() => update(l.key, { quantity: l.stock !== undefined ? Math.min(l.stock, l.quantity + 1) : l.quantity + 1 })} aria-label="Plus"><Plus className="h-3 w-3" /></Button>
                        </div>
                      )}
                      <MoneyInput value={l.unitPrice} onChange={(v) => update(l.key, { unitPrice: Number(v) || 0 })} disabled={!(l.max > l.min) && !can('sales.discount')} title="Prix unitaire" />
                      {can('sales.discount') ? <MoneyInput value={l.lineDiscount || ''} onChange={(v) => update(l.key, { lineDiscount: Number(v) || 0 })} placeholder="Remise" /> : <div className="self-center text-right font-bold">{formatFCFA(l.quantity * l.unitPrice - l.lineDiscount)}</div>}
                    </div>
                    {l.max > l.min && (l.unitPrice < l.min || l.unitPrice > l.max) && !can('sales.discount') && <p className="mt-1 text-xs text-red-600">Prix hors fourchette autorisée</p>}
                  </div>
                ))}
              </div>
            )}
          </Card>
          <Card title="Règlement">
            <div className="grid gap-3 sm:grid-cols-2">
              {can('sales.discount') && <>
                <Field label="Remise globale"><MoneyInput value={discount} onChange={setDiscount} /></Field>
                <Field label="Motif de la remise"><Input value={discountReason} onChange={(e) => setDiscountReason(e.target.value)} placeholder="Ex : fidélité, promotion Tabaski" /></Field>
              </>}
              {client && !client.queued && loyalty?.enabled && (client.loyaltyPoints ?? 0) >= (loyalty.minRedeemPoints ?? 0) && (
                <Field label={`Points fidélité (solde ${client.loyaltyPoints})`} hint={`1 point = ${loyalty.pointValue} FCFA · minimum ${loyalty.minRedeemPoints} · max ${loyalty.maxRedeemPercent} % de la vente`}>
                  <Input type="number" min={0} max={client.loyaltyPoints} value={points} onChange={(e) => setPoints(e.target.value === '' ? '' : Number(e.target.value))} />
                </Field>
              )}
            </div>
            <div className="mt-4 space-y-2">
              <p className="text-xs font-semibold uppercase tracking-wide text-neutral-600">Encaissement (laisser vide pour une vente à crédit)</p>
              {payments.map((p, i) => (
                <div key={i} className="grid gap-2 sm:grid-cols-[1fr_1fr_1fr_auto]">
                  <Select value={p.method} onChange={(e) => setPayments(payments.map((x, j) => (j === i ? { ...x, method: e.target.value } : x)))}>{Object.entries(PAYMENT_METHOD_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</Select>
                  <MoneyInput value={p.amount} onChange={(v) => setPayments(payments.map((x, j) => (j === i ? { ...x, amount: v } : x)))} placeholder="Montant" />
                  {p.method !== 'CASH' ? <Input value={p.reference} onChange={(e) => setPayments(payments.map((x, j) => (j === i ? { ...x, reference: e.target.value } : x)))} placeholder="Réf. transaction" /> : <div />}
                  <div className="flex gap-1">
                    <Button size="sm" variant="outline" onClick={() => setPayments(payments.map((x, j) => (j === i ? { ...x, amount: Math.max(0, (totals.total ?? 0) - paid + (Number(x.amount) || 0)) } : x)))}>Solde</Button>
                    {payments.length > 1 && <Button size="sm" variant="ghost" onClick={() => setPayments(payments.filter((_, j) => j !== i))} aria-label="Retirer"><Trash2 className="h-4 w-4" /></Button>}
                  </div>
                </div>
              ))}
              <Button size="sm" variant="ghost" icon={<Plus className="h-3.5 w-3.5" />} onClick={() => setPayments([...payments, { method: 'ORANGE_MONEY', amount: '', reference: '' }])}>Ajouter un moyen de paiement</Button>
              {cashPart > 0 && <div className="grid gap-2 sm:grid-cols-2"><Field label="Espèces reçues du client"><MoneyInput value={received} onChange={setReceived} /></Field>{change > 0 && <p className="self-end pb-2 text-lg font-bold text-emerald-700">Monnaie à rendre : {formatFCFA(change)}</p>}</div>}
            </div>
            <Field label="Observations" className="mt-3"><Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} /></Field>
          </Card>
          <div className="sticky bottom-2 rounded-xl border-2 border-royal-gold bg-royal-black p-4 text-white shadow-2xl">
            <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm sm:grid-cols-4">
              <span className="text-neutral-400">Sous-total</span><span className="text-right sm:text-left">{formatFCFA(totals.subtotal ?? 0)}</span>
              <span className="text-neutral-400">Remises</span><span className="text-right sm:text-left">− {formatFCFA((Number(discount) || 0) + loyaltyValue + lines.reduce((a, l) => a + l.lineDiscount, 0))}</span>
              <span className="text-neutral-400">Encaissé</span><span className="text-right sm:text-left">{formatFCFA(paid)}</span>
              <span className="text-neutral-400">Reste à payer</span><span className={clsx('text-right font-semibold sm:text-left', balance > 0 && 'text-amber-300')}>{formatFCFA(Math.max(0, balance))}</span>
            </div>
            <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
              <p className="text-2xl font-bold text-royal-gold">TOTAL {formatFCFA(totals.total ?? 0)}</p>
              <Button size="lg" loading={busy} disabled={errors.length > 0} onClick={submit}>Valider la vente</Button>
            </div>
            {errors.length > 0 && lines.length > 0 && <p className="mt-2 flex items-center gap-1 text-xs text-amber-300"><AlertTriangle className="h-3.5 w-3.5" />{errors.join(' · ')}</p>}
          </div>
        </div>
      </div>
    </>
  );
}
