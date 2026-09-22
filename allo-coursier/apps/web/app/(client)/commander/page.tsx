'use client';

import clsx from 'clsx';
import { Bike, CalendarClock, Check, Minus, Plus, Truck, Zap } from 'lucide-react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useMemo, useState } from 'react';
import { LocationPicker } from '@/components/map/location-picker';
import { PhoneInput } from '@/components/phone-input';
import { Alert, Button, Card, Field, Input, Select, Spinner, Textarea } from '@/components/ui';
import { api, newId } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { fcfa, phoneDisplay } from '@/lib/format';
import { CITY_CENTERS, distanceMeters, LatLng } from '@/lib/geo';
import { isPurchaseService, SERVICES } from '@/lib/services';
import type { City, OrderDetail, Quote } from '@/lib/types';
import { useApi } from '@/lib/use-api';

type ServiceCode = (typeof SERVICES)[number]['code'];

interface StopDraft {
  point: LatLng | null;
  landmark: string;
  contactName: string;
  contactPhone: string;
  save: boolean;
  saveLabel: string;
}

interface Draft {
  service: ServiceCode;
  step: number;
  citySlug: string;
  pickup: StopDraft;
  dropoff: StopDraft;
  packageDescription: string;
  packageSize: 'SMALL' | 'MEDIUM' | 'LARGE';
  isFragile: boolean;
  items: { label: string; quantity: number }[];
  purchaseBudget: string;
  vehicleType: 'MOTO' | 'TRICYCLE';
  scheduled: boolean;
  scheduledAt: string;
  note: string;
  speed: 'STANDARD' | 'EXPRESS';
  paymentMethod: 'CASH' | 'WALLET' | 'MANUAL_MOBILE_MONEY';
  cashCollectAt: 'PICKUP' | 'DROPOFF';
  mmOperator: 'ORANGE' | 'MOOV';
  mmReference: string;
  mmPhone: string;
  promoCode: string;
  idempotencyKey: string;
}

interface SavedAddress {
  id: string;
  label: string;
  lat: number;
  lng: number;
  landmark: string;
  contactName: string | null;
  contactPhone: string | null;
}

interface PaymentMethod {
  code: string;
  label: string;
  enabled: boolean;
  instructions?: string;
  accounts?: { operator: string; number: string }[];
}

const DRAFT_KEY = 'ac.order-draft';
const STEPS = ['Départ', 'Arrivée', 'Détails', 'Prix'];

const emptyStop = (): StopDraft => ({ point: null, landmark: '', contactName: '', contactPhone: '', save: false, saveLabel: '' });

function newDraft(service: ServiceCode, me: { firstName: string; lastName: string; phone: string } | null): Draft {
  const myPhone = me ? me.phone.replace(/^\+226/, '').replace(/(\d{2})(?=\d)/g, '$1 ') : '';
  const myName = me ? `${me.firstName} ${me.lastName}` : '';
  const purchase = isPurchaseService(service);
  return {
    service,
    step: 0,
    citySlug: 'ouagadougou',
    // Pour un colis, l'expéditeur est souvent le client ; pour des courses, c'est le client qui reçoit.
    pickup: { ...emptyStop(), contactName: purchase ? '' : myName, contactPhone: purchase ? '' : myPhone },
    dropoff: { ...emptyStop(), contactName: purchase ? myName : '', contactPhone: purchase ? myPhone : '' },
    packageDescription: '',
    packageSize: 'SMALL',
    isFragile: false,
    items: purchase ? [{ label: '', quantity: 1 }] : [],
    purchaseBudget: '',
    vehicleType: 'MOTO',
    scheduled: false,
    scheduledAt: '',
    note: '',
    speed: 'STANDARD',
    paymentMethod: 'CASH',
    cashCollectAt: purchase ? 'DROPOFF' : 'PICKUP',
    mmOperator: 'ORANGE',
    mmReference: '',
    mmPhone: myPhone,
    promoCode: '',
    idempotencyKey: newId('ord-'),
  };
}

function StopStep({ title, kind, stop, onChange, addresses, center, citySlug }: { title: string; kind: 'pickup' | 'dropoff'; stop: StopDraft; onChange: (s: StopDraft) => void; addresses: SavedAddress[]; center: LatLng; citySlug: string }) {
  const [pickerKey, setPickerKey] = useState(0);
  return (
    <div className="space-y-4">
      <h2 className="text-lg font-bold text-brand">{title}</h2>
      {addresses.length > 0 && (
        <div className="flex gap-2 overflow-x-auto pb-1">
          {addresses.map((a) => (
            <button
              key={a.id}
              type="button"
              onClick={() => {
                onChange({ ...stop, point: { lat: a.lat, lng: a.lng }, landmark: a.landmark, contactName: a.contactName ?? stop.contactName, contactPhone: a.contactPhone ? a.contactPhone.replace(/^\+226/, '').replace(/(\d{2})(?=\d)/g, '$1 ') : stop.contactPhone });
                setPickerKey((k) => k + 1);
              }}
              className="shrink-0 rounded-full bg-brand-sky px-3 py-1.5 text-sm font-medium text-brand"
            >
              📍 {a.label}
            </button>
          ))}
        </div>
      )}
      <LocationPicker key={`${citySlug}-${pickerKey}`} value={stop.point} onChange={(p) => onChange({ ...stop, point: p })} fallbackCenter={center} color={kind} />
      <Field label="Repère pour trouver le lieu" hint="Ex. : « Derrière la pharmacie du Progrès, portail bleu »">
        <Textarea rows={2} value={stop.landmark} maxLength={200} onChange={(e) => onChange({ ...stop, landmark: e.target.value })} />
      </Field>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Nom du contact sur place">
          <Input value={stop.contactName} maxLength={80} onChange={(e) => onChange({ ...stop, contactName: e.target.value })} />
        </Field>
        <Field label="Téléphone du contact">
          <PhoneInput value={stop.contactPhone} onChange={(v) => onChange({ ...stop, contactPhone: v })} />
        </Field>
      </div>
      <label className="flex items-center gap-2 text-sm text-slate-700">
        <input type="checkbox" checked={stop.save} onChange={(e) => onChange({ ...stop, save: e.target.checked })} className="h-4 w-4 accent-brand" />
        Enregistrer cette adresse
      </label>
      {stop.save && (
        <Input placeholder="Nom de l’adresse (ex. Maison, Bureau)" value={stop.saveLabel} maxLength={40} onChange={(e) => onChange({ ...stop, saveLabel: e.target.value })} />
      )}
    </div>
  );
}

function OrderWizard() {
  const params = useSearchParams();
  const router = useRouter();
  const { user } = useAuth();
  const serviceParam = (params.get('service') as ServiceCode) || 'PARCEL';
  const [draft, setDraft] = useState<Draft | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [quote, setQuote] = useState<Quote | null>(null);
  const [quoting, setQuoting] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const cities = useApi<City[]>('/cities');
  const addresses = useApi<SavedAddress[]>('/me/addresses');
  const methods = useApi<PaymentMethod[]>('/payments/methods');
  const wallet = useApi<{ balance: number }>('/wallet');

  // Reprise d'un brouillon interrompu (coupure réseau, appel...) pour le même service.
  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(DRAFT_KEY) ?? 'null') as Draft | null;
      if (saved && saved.service === serviceParam && !params.get('service')?.includes('new')) return setDraft(saved);
    } catch {
      /* rien */
    }
    setDraft(newDraft(SERVICES.some((s) => s.code === serviceParam) ? serviceParam : 'PARCEL', user));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [serviceParam]);

  useEffect(() => {
    if (draft) localStorage.setItem(DRAFT_KEY, JSON.stringify(draft));
  }, [draft]);

  const city = cities.data?.find((c) => c.slug === draft?.citySlug);
  const center = city ? { lat: city.centerLat, lng: city.centerLng } : CITY_CENTERS[draft?.citySlug ?? 'ouagadougou'] ?? CITY_CENTERS.ouagadougou;
  const purchase = draft ? isPurchaseService(draft.service) : false;
  const serviceInfo = SERVICES.find((s) => s.code === draft?.service);

  const update = (patch: Partial<Draft>) => setDraft((d) => (d ? { ...d, ...patch } : d));

  const stepError = useMemo(() => {
    if (!draft) return null;
    const checkStop = (s: StopDraft, label: string) => {
      if (!s.point) return `Placez le point de ${label} sur la carte (ou utilisez « Ma position »).`;
      if (s.landmark.trim().length < 3) return `Indiquez un repère pour le lieu de ${label}.`;
      if (s.contactName.trim().length < 2) return `Indiquez le nom du contact au lieu de ${label}.`;
      if (s.contactPhone.replace(/\D/g, '').length !== 8) return `Le téléphone du contact (${label}) doit comporter 8 chiffres.`;
      return null;
    };
    if (draft.step === 0) return checkStop(draft.pickup, purchase ? 'achat' : 'départ');
    if (draft.step === 1) {
      const err = checkStop(draft.dropoff, 'livraison');
      if (err) return err;
      if (draft.pickup.point && distanceMeters(draft.pickup.point, draft.dropoff.point!) < 50) {
        return 'Le lieu de livraison est au même endroit que le départ : déplacez la carte sur le lieu de livraison.';
      }
      return null;
    }
    if (draft.step === 2) {
      if (purchase) {
        if (!draft.items.some((i) => i.label.trim())) return 'Ajoutez au moins un article à acheter.';
        if (!(Number(draft.purchaseBudget) >= 500)) return 'Indiquez le budget maximum des achats (500 FCFA minimum).';
      }
      if (draft.scheduled && !draft.scheduledAt) return 'Choisissez la date et l’heure de la livraison programmée.';
    }
    return null;
  }, [draft, purchase]);

  const loadQuote = async (d: Draft) => {
    setQuoting(true);
    setError(null);
    try {
      const q = await api<Quote>('/pricing/quote', {
        auth: false,
        body: {
          pickup: d.pickup.point,
          dropoff: d.dropoff.point,
          serviceType: d.service,
          vehicleType: d.vehicleType,
          scheduledAt: d.scheduled && d.scheduledAt ? new Date(d.scheduledAt).toISOString() : undefined,
          purchaseAmount: purchase ? Number(d.purchaseBudget) : undefined,
        },
      });
      setQuote(q);
    } catch (err) {
      setQuote(null);
      setError((err as Error).message);
    } finally {
      setQuoting(false);
    }
  };

  const next = () => {
    if (!draft) return;
    if (stepError) return setError(stepError);
    setError(null);
    const step = Math.min(3, draft.step + 1);
    update({ step });
    if (step === 3) void loadQuote({ ...draft, step });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const submit = async () => {
    if (!draft || !quote) return;
    setSubmitting(true);
    setError(null);
    const stopBody = (s: StopDraft) => ({ lat: s.point!.lat, lng: s.point!.lng, landmark: s.landmark.trim(), contactName: s.contactName.trim(), contactPhone: s.contactPhone });
    try {
      const order = await api<OrderDetail>('/orders', {
        headers: { 'Idempotency-Key': draft.idempotencyKey },
        body: {
          serviceType: draft.service,
          speed: draft.speed,
          vehicleType: draft.vehicleType,
          pickup: stopBody(draft.pickup),
          dropoff: stopBody(draft.dropoff),
          packageDescription: purchase ? undefined : draft.packageDescription || undefined,
          packageSize: purchase ? undefined : draft.packageSize,
          isFragile: purchase ? undefined : draft.isFragile,
          items: purchase ? draft.items.filter((i) => i.label.trim()).map((i) => ({ label: i.label.trim(), quantity: i.quantity })) : undefined,
          purchaseBudget: purchase ? Number(draft.purchaseBudget) : undefined,
          scheduledAt: draft.scheduled && draft.scheduledAt ? new Date(draft.scheduledAt).toISOString() : undefined,
          paymentMethod: draft.paymentMethod,
          cashCollectAt: draft.paymentMethod === 'CASH' ? draft.cashCollectAt : undefined,
          mobileMoney:
            draft.paymentMethod === 'MANUAL_MOBILE_MONEY' && draft.mmReference.trim()
              ? { operator: draft.mmOperator, reference: draft.mmReference.trim(), payerPhone: draft.mmPhone }
              : undefined,
          promoCode: draft.promoCode.trim() || undefined,
          note: draft.note.trim() || undefined,
        },
      });
      for (const s of [draft.pickup, draft.dropoff]) {
        if (s.save && s.point) {
          await api('/me/addresses', { body: { label: s.saveLabel.trim() || 'Adresse', ...stopBody(s) } }).catch(() => undefined);
        }
      }
      localStorage.removeItem(DRAFT_KEY);
      router.replace(`/commandes/${order.id}?nouvelle=1`);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSubmitting(false);
    }
  };

  if (!draft) return <Spinner />;
  const option = quote ? (draft.speed === 'EXPRESS' ? quote.express : quote.standard) : null;
  const mm = methods.data?.find((m) => m.code === 'MANUAL_MOBILE_MONEY');
  const walletBalance = wallet.data?.balance ?? 0;

  return (
    <div className="space-y-4">
      <div>
        <div className="flex items-center justify-between">
          <h1 className="text-xl font-bold text-brand">{serviceInfo?.title}</h1>
          <Select
            className="w-auto py-1.5 text-sm"
            value={draft.service}
            onChange={(e) => {
              const code = e.target.value as ServiceCode;
              router.replace(`/commander?service=${code}`);
            }}
          >
            {SERVICES.map((s) => (
              <option key={s.code} value={s.code}>{s.title}</option>
            ))}
          </Select>
        </div>
        <ol className="mt-3 grid grid-cols-4 gap-1.5">
          {STEPS.map((label, i) => (
            <li key={label}>
              <button type="button" disabled={i > draft.step} onClick={() => update({ step: i })} className="w-full text-left">
                <span className={clsx('block h-1.5 rounded-full', i <= draft.step ? 'bg-brand-green' : 'bg-slate-200')} />
                <span className={clsx('mt-1 block text-[11px] font-medium', i === draft.step ? 'text-brand' : 'text-slate-400')}>{label}</span>
              </button>
            </li>
          ))}
        </ol>
      </div>

      {draft.step <= 1 && cities.data && cities.data.length > 1 && (
        <div className="flex gap-2">
          {cities.data.map((c) => (
            <button key={c.id} type="button" onClick={() => update({ citySlug: c.slug })} className={clsx('rounded-full px-3 py-1 text-sm font-medium', draft.citySlug === c.slug ? 'bg-brand text-white' : 'bg-white text-slate-600 ring-1 ring-slate-200')}>
              {c.name}
            </button>
          ))}
        </div>
      )}

      <Card>
        {draft.step === 0 && (
          <StopStep title={purchase ? 'Où faire les achats ?' : 'Où récupérer le colis ?'} kind="pickup" stop={draft.pickup} onChange={(pickup) => update({ pickup })} addresses={addresses.data ?? []} center={center} citySlug={draft.citySlug} />
        )}
        {draft.step === 1 && (
          <StopStep title="Où livrer ?" kind="dropoff" stop={draft.dropoff} onChange={(dropoff) => update({ dropoff })} addresses={addresses.data ?? []} center={draft.pickup.point ?? center} citySlug={draft.citySlug} />
        )}
        {draft.step === 2 && (
          <div className="space-y-4">
            <h2 className="text-lg font-bold text-brand">{purchase ? 'Liste des achats' : 'Le colis'}</h2>
            {purchase ? (
              <>
                {draft.items.map((item, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <Input placeholder={`Article ${i + 1} (ex. 2 kg de riz)`} value={item.label} maxLength={120} onChange={(e) => update({ items: draft.items.map((it, j) => (j === i ? { ...it, label: e.target.value } : it)) })} />
                    <div className="flex items-center rounded-xl border border-slate-300">
                      <button type="button" className="px-2 py-2.5" aria-label="Moins" onClick={() => update({ items: draft.items.map((it, j) => (j === i ? { ...it, quantity: Math.max(1, it.quantity - 1) } : it)) })}>
                        <Minus className="h-4 w-4" />
                      </button>
                      <span className="w-6 text-center text-sm font-semibold">{item.quantity}</span>
                      <button type="button" className="px-2 py-2.5" aria-label="Plus" onClick={() => update({ items: draft.items.map((it, j) => (j === i ? { ...it, quantity: it.quantity + 1 } : it)) })}>
                        <Plus className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                ))}
                <Button type="button" variant="ghost" size="sm" onClick={() => update({ items: [...draft.items, { label: '', quantity: 1 }] })}>
                  <Plus className="h-4 w-4" /> Ajouter un article
                </Button>
                <Field label="Budget maximum des achats (FCFA)" hint="Le livreur avance l’argent ; vous le remboursez à la livraison, sur présentation du ticket.">
                  <Input type="number" inputMode="numeric" min={500} step={100} value={draft.purchaseBudget} onChange={(e) => update({ purchaseBudget: e.target.value })} />
                </Field>
              </>
            ) : (
              <>
                <Field label="Que faut-il transporter ?">
                  <Input placeholder="Ex. : enveloppe de documents, carton de vêtements" value={draft.packageDescription} maxLength={300} onChange={(e) => update({ packageDescription: e.target.value })} />
                </Field>
                <Field label="Taille">
                  <div className="grid grid-cols-3 gap-2">
                    {(
                      [
                        ['SMALL', 'Petit', 'Enveloppe, sac'],
                        ['MEDIUM', 'Moyen', 'Carton moyen'],
                        ['LARGE', 'Grand', 'Volumineux'],
                      ] as const
                    ).map(([code, label, hint]) => (
                      <button
                        key={code}
                        type="button"
                        onClick={() => update({ packageSize: code, vehicleType: code === 'LARGE' ? 'TRICYCLE' : draft.vehicleType })}
                        className={clsx('rounded-xl border p-2.5 text-left text-sm', draft.packageSize === code ? 'border-brand-light bg-brand-sky' : 'border-slate-200')}
                      >
                        <span className="block font-semibold text-brand">{label}</span>
                        <span className="text-xs text-slate-500">{hint}</span>
                      </button>
                    ))}
                  </div>
                </Field>
                <label className="flex items-center gap-2 text-sm text-slate-700">
                  <input type="checkbox" checked={draft.isFragile} onChange={(e) => update({ isFragile: e.target.checked })} className="h-4 w-4 accent-brand" />
                  Fragile — à manipuler avec soin
                </label>
              </>
            )}
            <Field label="Véhicule">
              <div className="grid grid-cols-2 gap-2">
                {(
                  [
                    ['MOTO', 'Moto', 'Rapide, petits colis', Bike],
                    ['TRICYCLE', 'Tricycle', 'Gros volumes', Truck],
                  ] as const
                ).map(([code, label, hint, Icon]) => (
                  <button key={code} type="button" onClick={() => update({ vehicleType: code })} className={clsx('flex items-center gap-2.5 rounded-xl border p-3 text-left', draft.vehicleType === code ? 'border-brand-light bg-brand-sky' : 'border-slate-200')}>
                    <Icon className="h-6 w-6 text-brand" />
                    <span>
                      <span className="block text-sm font-semibold text-brand">{label}</span>
                      <span className="text-xs text-slate-500">{hint}</span>
                    </span>
                  </button>
                ))}
              </div>
            </Field>
            <div>
              <label className="flex items-center gap-2 text-sm font-medium text-slate-700">
                <input type="checkbox" checked={draft.scheduled} onChange={(e) => update({ scheduled: e.target.checked })} className="h-4 w-4 accent-brand" />
                <CalendarClock className="h-4 w-4" /> Programmer pour plus tard
              </label>
              {draft.scheduled && (
                <Input className="mt-2" type="datetime-local" value={draft.scheduledAt} min={new Date(Date.now() + 20 * 60_000).toISOString().slice(0, 16)} onChange={(e) => update({ scheduledAt: e.target.value })} />
              )}
            </div>
            <Field label="Instructions pour le livreur (facultatif)">
              <Textarea rows={2} maxLength={500} value={draft.note} onChange={(e) => update({ note: e.target.value })} />
            </Field>
          </div>
        )}
        {draft.step === 3 && (
          <div className="space-y-5">
            <h2 className="text-lg font-bold text-brand">Prix et paiement</h2>
            {quoting && <Spinner label="Calcul du prix…" />}
            {quote && (
              <>
                <p className="text-sm text-slate-500">
                  {quote.city.name}
                  {quote.zone ? ` · ${quote.zone.name}` : ''} · environ {quote.distanceKm.toLocaleString('fr-FR')} km
                </p>
                <div className="grid grid-cols-2 gap-3">
                  {(['STANDARD', 'EXPRESS'] as const).map((speed) => {
                    const o = speed === 'EXPRESS' ? quote.express : quote.standard;
                    return (
                      <button key={speed} type="button" onClick={() => update({ speed })} className={clsx('rounded-2xl border-2 p-3 text-left transition', draft.speed === speed ? 'border-brand-green bg-green-50' : 'border-slate-200')}>
                        <span className="flex items-center gap-1 text-sm font-semibold text-brand">
                          {speed === 'EXPRESS' ? <Zap className="h-4 w-4 text-amber-500" /> : <Bike className="h-4 w-4" />}
                          {speed === 'EXPRESS' ? 'Express' : 'Standard'}
                        </span>
                        <span className="mt-1 block text-xl font-extrabold text-brand">{fcfa(o.deliveryFee)}</span>
                        <span className="text-xs text-slate-500">{speed === 'EXPRESS' ? 'Priorité, départ immédiat' : 'Meilleur prix'}</span>
                      </button>
                    );
                  })}
                </div>
                {option && (
                  <div className="rounded-xl bg-slate-50 p-3 text-sm">
                    {option.lines.map((l) => (
                      <div key={l.code} className="flex justify-between py-0.5 text-slate-600">
                        <span>{l.label}</span>
                        <span className="tabular-nums">{fcfa(l.amount)}</span>
                      </div>
                    ))}
                    {purchase && (
                      <div className="flex justify-between py-0.5 text-slate-600">
                        <span>Achats (maximum, remboursés sur ticket)</span>
                        <span className="tabular-nums">{fcfa(Number(draft.purchaseBudget))}</span>
                      </div>
                    )}
                    <div className="mt-1 flex justify-between border-t border-slate-200 pt-1.5 font-bold text-brand">
                      <span>{purchase ? 'Total maximum' : 'Total'}</span>
                      <span className="tabular-nums">{fcfa(option.totalToPay)}</span>
                    </div>
                  </div>
                )}
                <Field label="Code promo (facultatif)">
                  <Input value={draft.promoCode} maxLength={20} onChange={(e) => update({ promoCode: e.target.value.toUpperCase() })} placeholder="Ex. BIENVENUE" />
                </Field>

                <Field label="Paiement">
                  <div className="space-y-2">
                    <label className={clsx('flex cursor-pointer items-start gap-3 rounded-xl border p-3', draft.paymentMethod === 'CASH' ? 'border-brand-light bg-brand-sky' : 'border-slate-200')}>
                      <input type="radio" name="pay" checked={draft.paymentMethod === 'CASH'} onChange={() => update({ paymentMethod: 'CASH' })} className="mt-1 accent-brand" />
                      <span className="flex-1 text-sm">
                        <span className="block font-semibold text-brand">Espèces</span>
                        {draft.paymentMethod === 'CASH' && !purchase && (
                          <span className="mt-2 flex gap-2">
                            {(['PICKUP', 'DROPOFF'] as const).map((k) => (
                              <button key={k} type="button" onClick={() => update({ cashCollectAt: k })} className={clsx('rounded-lg px-2.5 py-1 text-xs font-semibold', draft.cashCollectAt === k ? 'bg-brand text-white' : 'bg-white text-slate-600 ring-1 ring-slate-200')}>
                                {k === 'PICKUP' ? 'Payé au départ' : 'Payé à l’arrivée'}
                              </button>
                            ))}
                          </span>
                        )}
                        {purchase && <span className="text-xs text-slate-500">Courses et livraison payées à l’arrivée.</span>}
                      </span>
                    </label>
                    {!purchase && (
                      <label className={clsx('flex cursor-pointer items-start gap-3 rounded-xl border p-3', draft.paymentMethod === 'WALLET' ? 'border-brand-light bg-brand-sky' : 'border-slate-200', option && walletBalance < option.deliveryFee && 'opacity-60')}>
                        <input type="radio" name="pay" disabled={!!option && walletBalance < option.deliveryFee} checked={draft.paymentMethod === 'WALLET'} onChange={() => update({ paymentMethod: 'WALLET' })} className="mt-1 accent-brand" />
                        <span className="text-sm">
                          <span className="block font-semibold text-brand">Portefeuille Allô-Coursier</span>
                          <span className="text-xs text-slate-500">Solde : {fcfa(walletBalance)}</span>
                        </span>
                      </label>
                    )}
                    {!purchase && mm?.enabled && (
                      <label className={clsx('flex cursor-pointer items-start gap-3 rounded-xl border p-3', draft.paymentMethod === 'MANUAL_MOBILE_MONEY' ? 'border-brand-light bg-brand-sky' : 'border-slate-200')}>
                        <input type="radio" name="pay" checked={draft.paymentMethod === 'MANUAL_MOBILE_MONEY'} onChange={() => update({ paymentMethod: 'MANUAL_MOBILE_MONEY' })} className="mt-1 accent-brand" />
                        <span className="flex-1 text-sm">
                          <span className="block font-semibold text-brand">Orange Money / Moov Money</span>
                          {draft.paymentMethod === 'MANUAL_MOBILE_MONEY' && option && (
                            <span className="mt-2 block space-y-2">
                              <span className="block text-xs text-slate-600">
                                Envoyez <strong>{fcfa(option.deliveryFee)}</strong> au{' '}
                                {mm.accounts?.map((a) => `${a.operator === 'ORANGE' ? 'Orange' : 'Moov'} : ${phoneDisplay(a.number)}`).join(' ou ')}, puis saisissez la référence reçue par SMS
                                (vous pourrez aussi le faire après). Ne donnez jamais votre code secret Mobile Money.
                              </span>
                              <span className="grid grid-cols-2 gap-2">
                                <Select value={draft.mmOperator} onChange={(e) => update({ mmOperator: e.target.value as 'ORANGE' | 'MOOV' })}>
                                  {mm.accounts?.map((a) => (
                                    <option key={a.operator} value={a.operator}>{a.operator === 'ORANGE' ? 'Orange Money' : 'Moov Money'}</option>
                                  ))}
                                </Select>
                                <Input placeholder="Référence" value={draft.mmReference} maxLength={60} onChange={(e) => update({ mmReference: e.target.value })} />
                              </span>
                              <PhoneInput value={draft.mmPhone} onChange={(v) => update({ mmPhone: v })} />
                            </span>
                          )}
                        </span>
                      </label>
                    )}
                  </div>
                </Field>
              </>
            )}
          </div>
        )}
      </Card>

      <Alert>{error}</Alert>

      <div className="flex gap-3">
        {draft.step > 0 && (
          <Button variant="outline" onClick={() => update({ step: draft.step - 1 })}>
            Retour
          </Button>
        )}
        {draft.step < 3 ? (
          <Button block size="lg" onClick={next}>
            Continuer
          </Button>
        ) : (
          <Button block size="lg" variant="success" onClick={submit} loading={submitting} disabled={!quote}>
            <Check className="h-5 w-5" /> Confirmer — {option ? fcfa(option.totalToPay) : ''}
          </Button>
        )}
      </div>
      <button
        type="button"
        className="w-full text-center text-xs text-slate-400 underline"
        onClick={() => {
          localStorage.removeItem(DRAFT_KEY);
          setDraft(newDraft(draft.service, user));
          setQuote(null);
        }}
      >
        Recommencer la commande
      </button>
    </div>
  );
}

export default function OrderPage() {
  return (
    <Suspense fallback={<Spinner />}>
      <OrderWizard />
    </Suspense>
  );
}
