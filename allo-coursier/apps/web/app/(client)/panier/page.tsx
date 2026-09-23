'use client';

import clsx from 'clsx';
import { Bike, Check, ShoppingBag, Trash2, Zap } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { QuantityStepper } from '@/components/food';
import { LocationPicker } from '@/components/map/location-picker';
import { PhoneInput } from '@/components/phone-input';
import { Alert, Button, Card, EmptyState, Field, Input, LinkButton, PageHeader, Select, Spinner, Textarea } from '@/components/ui';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { cartStore, cartSubtotal, useCart } from '@/lib/cart';
import { fcfa, phoneDisplay } from '@/lib/format';
import { LatLng } from '@/lib/geo';
import type { OrderDetail, PriceLine } from '@/lib/types';
import { useApi } from '@/lib/use-api';

interface FoodQuote {
  merchant: { id: string; name: string; isOpen: boolean; minOrderAmount: number | null };
  lines: { productId: string; label: string; quantity: number; unitPrice: number }[];
  itemsSubtotal: number;
  distanceKm: number;
  standard: { deliveryFee: number; total: number; lines: PriceLine[] };
  express: { deliveryFee: number; total: number; lines: PriceLine[] };
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
  enabled: boolean;
  accounts?: { operator: string; number: string }[];
}

interface Checkout {
  point: LatLng | null;
  landmark: string;
  contactName: string;
  contactPhone: string;
  note: string;
  speed: 'STANDARD' | 'EXPRESS';
  paymentMethod: 'CASH' | 'WALLET' | 'MANUAL_MOBILE_MONEY';
  mmOperator: 'ORANGE' | 'MOOV';
  mmReference: string;
  mmPhone: string;
  promoCode: string;
}

const CHECKOUT_KEY = 'ac.food-checkout';
const localPhone = (phone?: string | null) => (phone ? phone.replace(/^\+226/, '').replace(/(\d{2})(?=\d)/g, '$1 ') : '');

export default function CartPage() {
  const cart = useCart();
  const router = useRouter();
  const { user } = useAuth();
  const addresses = useApi<SavedAddress[]>('/me/addresses');
  const methods = useApi<PaymentMethod[]>('/payments/methods');
  const wallet = useApi<{ balance: number }>('/wallet');
  const [form, setForm] = useState<Checkout | null>(null);
  const [pickerKey, setPickerKey] = useState(0);
  const [quote, setQuote] = useState<FoodQuote | null>(null);
  const [quoting, setQuoting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const quoteSeq = useRef(0);

  // Formulaire gardé sur le téléphone (coupure réseau, appel entrant...).
  useEffect(() => {
    let saved: Checkout | null = null;
    try {
      saved = JSON.parse(localStorage.getItem(CHECKOUT_KEY) ?? 'null');
    } catch {
      /* rien */
    }
    setForm(
      saved ?? {
        point: null,
        landmark: '',
        contactName: user ? `${user.firstName} ${user.lastName}` : '',
        contactPhone: localPhone(user?.phone),
        note: '',
        speed: 'STANDARD',
        paymentMethod: 'CASH',
        mmOperator: 'ORANGE',
        mmReference: '',
        mmPhone: localPhone(user?.phone),
        promoCode: '',
      },
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (form) localStorage.setItem(CHECKOUT_KEY, JSON.stringify(form));
  }, [form]);

  const update = (patch: Partial<Checkout>) => setForm((f) => (f ? { ...f, ...patch } : f));

  // Prix recalculé par le serveur à chaque changement du panier ou du lieu de livraison.
  const cartSignature = cart ? JSON.stringify(cart.lines.map((l) => [l.productId, l.quantity, l.optionIds])) : '';
  useEffect(() => {
    if (!cart || !form?.point) return setQuote(null);
    const seq = ++quoteSeq.current;
    setQuoting(true);
    const t = setTimeout(async () => {
      try {
        const q = await api<FoodQuote>('/orders/food/quote', {
          auth: false,
          body: {
            merchantId: cart.merchant.id,
            items: cart.lines.map((l) => ({ productId: l.productId, quantity: l.quantity, optionIds: l.optionIds })),
            dropoff: form.point,
          },
        });
        if (seq === quoteSeq.current) {
          setQuote(q);
          setError(null);
        }
      } catch (err) {
        if (seq === quoteSeq.current) {
          setQuote(null);
          setError((err as Error).message);
        }
      } finally {
        if (seq === quoteSeq.current) setQuoting(false);
      }
    }, 300);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cartSignature, cart?.merchant.id, form?.point?.lat, form?.point?.lng]);

  if (!form) return <Spinner />;
  if (!cart || !cart.lines.length) {
    return (
      <div className="space-y-4">
        <PageHeader title="Mon panier" back="/restaurants" />
        <EmptyState icon={<ShoppingBag className="h-8 w-8" />} title="Votre panier est vide">
          Choisissez un restaurant ou une boutique pour commencer.
        </EmptyState>
        <LinkButton href="/restaurants" block>
          Voir les commerces
        </LinkButton>
      </div>
    );
  }

  const subtotal = quote?.itemsSubtotal ?? cartSubtotal(cart);
  const option = quote ? (form.speed === 'EXPRESS' ? quote.express : quote.standard) : null;
  const mm = methods.data?.find((m) => m.code === 'MANUAL_MOBILE_MONEY');
  const walletBalance = wallet.data?.balance ?? 0;
  const belowMinimum = !!cart.merchant.minOrderAmount && subtotal < cart.merchant.minOrderAmount;

  const validate = () => {
    if (!form.point) return 'Placez le lieu de livraison sur la carte (ou utilisez « Ma position »).';
    if (form.landmark.trim().length < 3) return 'Indiquez un repère pour trouver le lieu de livraison.';
    if (form.contactName.trim().length < 2) return 'Indiquez le nom de la personne qui reçoit.';
    if (form.contactPhone.replace(/\D/g, '').length !== 8) return 'Le téléphone de la personne qui reçoit doit comporter 8 chiffres.';
    if (belowMinimum) return `Commande minimum : ${fcfa(cart.merchant.minOrderAmount)} d’articles.`;
    if (!quote) return 'Le prix n’a pas encore été calculé.';
    return null;
  };

  const submit = async () => {
    const problem = validate();
    if (problem) return setError(problem);
    setSubmitting(true);
    setError(null);
    try {
      const order = await api<OrderDetail>('/orders/food', {
        headers: { 'Idempotency-Key': cart.idempotencyKey },
        body: {
          merchantId: cart.merchant.id,
          items: cart.lines.map((l) => ({ productId: l.productId, quantity: l.quantity, optionIds: l.optionIds, note: l.note })),
          dropoff: { lat: form.point!.lat, lng: form.point!.lng, landmark: form.landmark.trim(), contactName: form.contactName.trim(), contactPhone: form.contactPhone },
          speed: form.speed,
          paymentMethod: form.paymentMethod,
          mobileMoney:
            form.paymentMethod === 'MANUAL_MOBILE_MONEY' && form.mmReference.trim()
              ? { operator: form.mmOperator, reference: form.mmReference.trim(), payerPhone: form.mmPhone }
              : undefined,
          promoCode: form.promoCode.trim() || undefined,
          note: form.note.trim() || undefined,
        },
      });
      cartStore.clear();
      localStorage.setItem(CHECKOUT_KEY, JSON.stringify({ ...form, note: '', mmReference: '', promoCode: '' }));
      router.replace(`/commandes/${order.id}?nouvelle=1`);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-4">
      <PageHeader title="Mon panier" subtitle={cart.merchant.name} back={`/restaurants/${cart.merchant.slug}`} />

      <Card className="space-y-3">
        {cart.lines.map((l) => (
          <div key={l.key} className="flex items-start gap-3">
            <div className="min-w-0 flex-1">
              <p className="font-semibold text-slate-800">{l.name}</p>
              {!!l.optionLabels.length && <p className="text-xs text-slate-500">{l.optionLabels.join(', ')}</p>}
              {l.note && <p className="text-xs italic text-slate-500">« {l.note} »</p>}
              <p className="text-sm font-semibold text-brand">{fcfa(l.unitPrice * l.quantity)}</p>
            </div>
            <QuantityStepper value={l.quantity} min={0} onChange={(q) => cartStore.setQuantity(l.key, q)} />
          </div>
        ))}
        <div className="flex items-center justify-between border-t border-slate-100 pt-2 text-sm">
          <Link href={`/restaurants/${cart.merchant.slug}`} className="font-semibold text-brand-light">
            + Ajouter des articles
          </Link>
          <button type="button" className="inline-flex items-center gap-1 text-slate-400" onClick={() => cartStore.clear()}>
            <Trash2 className="h-4 w-4" /> Vider
          </button>
        </div>
        {belowMinimum && <Alert tone="amber">Commande minimum chez {cart.merchant.name} : {fcfa(cart.merchant.minOrderAmount)} d’articles.</Alert>}
      </Card>

      <Card className="space-y-4">
        <h2 className="text-lg font-bold text-brand">Où livrer ?</h2>
        {!!addresses.data?.length && (
          <div className="flex gap-2 overflow-x-auto pb-1">
            {addresses.data.map((a) => (
              <button
                key={a.id}
                type="button"
                onClick={() => {
                  update({ point: { lat: a.lat, lng: a.lng }, landmark: a.landmark, contactName: a.contactName ?? form.contactName, contactPhone: a.contactPhone ? localPhone(a.contactPhone) : form.contactPhone });
                  setPickerKey((k) => k + 1);
                }}
                className="shrink-0 rounded-full bg-brand-sky px-3 py-1.5 text-sm font-medium text-brand"
              >
                📍 {a.label}
              </button>
            ))}
          </div>
        )}
        <LocationPicker key={pickerKey} value={form.point} onChange={(point) => update({ point })} fallbackCenter={{ lat: cart.merchant.lat, lng: cart.merchant.lng }} color="dropoff" />
        <Field label="Repère pour trouver le lieu" hint="Ex. : « Derrière la pharmacie du Progrès, portail bleu »">
          <Textarea rows={2} value={form.landmark} maxLength={200} onChange={(e) => update({ landmark: e.target.value })} />
        </Field>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Personne qui reçoit">
            <Input value={form.contactName} maxLength={80} onChange={(e) => update({ contactName: e.target.value })} />
          </Field>
          <Field label="Son téléphone">
            <PhoneInput value={form.contactPhone} onChange={(v) => update({ contactPhone: v })} />
          </Field>
        </div>
        <Field label="Message pour le commerçant et le livreur (facultatif)">
          <Textarea rows={2} maxLength={500} value={form.note} onChange={(e) => update({ note: e.target.value })} />
        </Field>
      </Card>

      <Card className="space-y-4">
        <h2 className="text-lg font-bold text-brand">Livraison et paiement</h2>
        {!form.point && <p className="text-sm text-slate-500">Placez le lieu de livraison pour voir le prix.</p>}
        {quoting && !quote && <Spinner label="Calcul du prix…" />}
        {quote && option && (
          <>
            <div className="grid grid-cols-2 gap-3">
              {(['STANDARD', 'EXPRESS'] as const).map((speed) => {
                const o = speed === 'EXPRESS' ? quote.express : quote.standard;
                return (
                  <button key={speed} type="button" onClick={() => update({ speed })} className={clsx('rounded-2xl border-2 p-3 text-left transition', form.speed === speed ? 'border-brand-green bg-green-50' : 'border-slate-200')}>
                    <span className="flex items-center gap-1 text-sm font-semibold text-brand">
                      {speed === 'EXPRESS' ? <Zap className="h-4 w-4 text-amber-500" /> : <Bike className="h-4 w-4" />}
                      {speed === 'EXPRESS' ? 'Express' : 'Standard'}
                    </span>
                    <span className="mt-1 block text-lg font-extrabold text-brand">{fcfa(o.deliveryFee)}</span>
                    <span className="text-xs text-slate-500">livraison</span>
                  </button>
                );
              })}
            </div>
            <div className={clsx('rounded-xl bg-slate-50 p-3 text-sm', quoting && 'opacity-60')}>
              <div className="flex justify-between py-0.5 text-slate-600">
                <span>Articles</span>
                <span className="tabular-nums">{fcfa(quote.itemsSubtotal)}</span>
              </div>
              <div className="flex justify-between py-0.5 text-slate-600">
                <span>Livraison (~{quote.distanceKm.toLocaleString('fr-FR')} km)</span>
                <span className="tabular-nums">{fcfa(option.deliveryFee)}</span>
              </div>
              <div className="mt-1 flex justify-between border-t border-slate-200 pt-1.5 font-bold text-brand">
                <span>Total</span>
                <span className="tabular-nums">{fcfa(option.total)}</span>
              </div>
            </div>
            <Field label="Code promo (facultatif)" hint="La réduction s’applique à la livraison.">
              <Input value={form.promoCode} maxLength={20} onChange={(e) => update({ promoCode: e.target.value.toUpperCase() })} placeholder="Ex. BIENVENUE" />
            </Field>
            <div className="space-y-2">
              <label className={clsx('flex cursor-pointer items-start gap-3 rounded-xl border p-3', form.paymentMethod === 'CASH' ? 'border-brand-light bg-brand-sky' : 'border-slate-200')}>
                <input type="radio" name="pay" checked={form.paymentMethod === 'CASH'} onChange={() => update({ paymentMethod: 'CASH' })} className="mt-1 accent-brand" />
                <span className="text-sm">
                  <span className="block font-semibold text-brand">Espèces à la livraison</span>
                  <span className="text-xs text-slate-500">Vous payez le repas et la livraison au livreur.</span>
                </span>
              </label>
              <label className={clsx('flex cursor-pointer items-start gap-3 rounded-xl border p-3', form.paymentMethod === 'WALLET' ? 'border-brand-light bg-brand-sky' : 'border-slate-200', walletBalance < option.total && 'opacity-60')}>
                <input type="radio" name="pay" disabled={walletBalance < option.total} checked={form.paymentMethod === 'WALLET'} onChange={() => update({ paymentMethod: 'WALLET' })} className="mt-1 accent-brand" />
                <span className="text-sm">
                  <span className="block font-semibold text-brand">Portefeuille Allô-Coursier</span>
                  <span className="text-xs text-slate-500">Solde : {fcfa(walletBalance)}</span>
                </span>
              </label>
              {mm?.enabled && (
                <label className={clsx('flex cursor-pointer items-start gap-3 rounded-xl border p-3', form.paymentMethod === 'MANUAL_MOBILE_MONEY' ? 'border-brand-light bg-brand-sky' : 'border-slate-200')}>
                  <input type="radio" name="pay" checked={form.paymentMethod === 'MANUAL_MOBILE_MONEY'} onChange={() => update({ paymentMethod: 'MANUAL_MOBILE_MONEY' })} className="mt-1 accent-brand" />
                  <span className="flex-1 text-sm">
                    <span className="block font-semibold text-brand">Orange Money / Moov Money</span>
                    {form.paymentMethod === 'MANUAL_MOBILE_MONEY' && (
                      <span className="mt-2 block space-y-2">
                        <span className="block text-xs text-slate-600">
                          Envoyez <strong>{fcfa(option.total)}</strong> au{' '}
                          {mm.accounts?.map((a) => `${a.operator === 'ORANGE' ? 'Orange' : 'Moov'} : ${phoneDisplay(a.number)}`).join(' ou ')}, puis saisissez la référence reçue par SMS.
                          La commande part chez le commerçant dès que le paiement est vérifié. Ne donnez jamais votre code secret Mobile Money.
                        </span>
                        <span className="grid grid-cols-2 gap-2">
                          <Select value={form.mmOperator} onChange={(e) => update({ mmOperator: e.target.value as 'ORANGE' | 'MOOV' })}>
                            {mm.accounts?.map((a) => (
                              <option key={a.operator} value={a.operator}>{a.operator === 'ORANGE' ? 'Orange Money' : 'Moov Money'}</option>
                            ))}
                          </Select>
                          <Input placeholder="Référence" value={form.mmReference} maxLength={60} onChange={(e) => update({ mmReference: e.target.value })} />
                        </span>
                        <PhoneInput value={form.mmPhone} onChange={(v) => update({ mmPhone: v })} />
                      </span>
                    )}
                  </span>
                </label>
              )}
            </div>
          </>
        )}
      </Card>

      <Alert>{error}</Alert>

      <Button block size="lg" variant="success" onClick={submit} loading={submitting} disabled={!quote || quoting || belowMinimum}>
        <Check className="h-5 w-5" /> Commander{option ? ` — ${fcfa(option.total)}` : ''}
      </Button>
      <p className="text-center text-xs text-slate-500">Le commerçant confirme votre commande, puis un livreur l’apporte dès qu’elle est prête.</p>
    </div>
  );
}
