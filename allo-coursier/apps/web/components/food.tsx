'use client';

import clsx from 'clsx';
import { Minus, Plus, ShoppingBag } from 'lucide-react';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { Cart, cartCount, cartStore, cartSubtotal, MenuProduct, useCart } from '@/lib/cart';
import { fcfa } from '@/lib/format';
import { Alert, Button, Input, Sheet } from './ui';

export function MerchantLogo({ name, url, className }: { name: string; url: string | null; className?: string }) {
  return url ? (
    <img src={url} alt="" className={clsx('rounded-xl object-cover', className)} loading="lazy" />
  ) : (
    <span className={clsx('flex items-center justify-center rounded-xl bg-brand-sky text-lg font-bold text-brand', className)}>{name.slice(0, 1).toUpperCase()}</span>
  );
}

/** Barre « Panier » au-dessus du menu du bas, visible dès qu'un article est ajouté. */
export function CartBar() {
  const cart = useCart();
  if (!cart || !cart.lines.length) return null;
  return (
    <div className="fixed inset-x-0 bottom-[calc(64px+env(safe-area-inset-bottom))] z-[790] px-4">
      <Link href="/panier" className="mx-auto flex max-w-2xl items-center justify-between rounded-2xl bg-brand-green px-4 py-3 text-white shadow-lg">
        <span className="flex items-center gap-2 font-semibold">
          <ShoppingBag className="h-5 w-5" /> Panier · {cartCount(cart)} article{cartCount(cart) > 1 ? 's' : ''}
        </span>
        <span className="font-bold">{fcfa(cartSubtotal(cart))}</span>
      </Link>
    </div>
  );
}

export function QuantityStepper({ value, onChange, min = 1 }: { value: number; onChange: (v: number) => void; min?: number }) {
  return (
    <div className="flex items-center rounded-xl border border-slate-300 bg-white">
      <button type="button" className="px-2.5 py-2" aria-label="Moins" onClick={() => onChange(Math.max(min, value - 1))}>
        <Minus className="h-4 w-4" />
      </button>
      <span className="w-7 text-center text-sm font-semibold tabular-nums">{value}</span>
      <button type="button" className="px-2.5 py-2" aria-label="Plus" onClick={() => onChange(Math.min(50, value + 1))}>
        <Plus className="h-4 w-4" />
      </button>
    </div>
  );
}

/** Choix des options d'un produit (accompagnement, suppléments...) puis ajout au panier. */
export function ProductSheet({ product, merchant, onClose }: { product: MenuProduct | null; merchant: Cart['merchant']; onClose: () => void }) {
  const [chosen, setChosen] = useState<Record<string, string[]>>({});
  const [quantity, setQuantity] = useState(1);
  const [note, setNote] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [confirmReplace, setConfirmReplace] = useState(false);

  useEffect(() => {
    setChosen({});
    setQuantity(1);
    setNote('');
    setError(null);
    setConfirmReplace(false);
  }, [product?.id]);

  if (!product) return null;

  const toggle = (groupId: string, optionId: string, max: number) =>
    setChosen((c) => {
      const current = c[groupId] ?? [];
      if (current.includes(optionId)) return { ...c, [groupId]: current.filter((id) => id !== optionId) };
      if (max === 1) return { ...c, [groupId]: [optionId] };
      if (current.length >= max) return c;
      return { ...c, [groupId]: [...current, optionId] };
    });

  const options = product.optionGroups.flatMap((g) => g.options.filter((o) => chosen[g.id]?.includes(o.id)).map((o) => ({ ...o, group: g.name })));
  const unitPrice = product.price + options.reduce((s, o) => s + o.extraPrice, 0);

  const add = () => {
    for (const g of product.optionGroups) {
      if ((chosen[g.id]?.length ?? 0) < g.minChoices) return setError(`Choisissez : ${g.name.toLowerCase()}.`);
    }
    const current = cartStore.get();
    if (current && current.merchant.id !== merchant.id && !confirmReplace) {
      setConfirmReplace(true);
      return setError(`Votre panier contient des articles de ${current.merchant.name}. Ils seront remplacés : appuyez à nouveau pour confirmer.`);
    }
    cartStore.add(merchant, {
      productId: product.id,
      name: product.name,
      quantity,
      optionIds: options.map((o) => o.id),
      optionLabels: options.map((o) => o.name),
      unitPrice,
      note: note.trim() || undefined,
    });
    onClose();
  };

  return (
    <Sheet open onClose={onClose} title={product.name}>
      <div className="space-y-4">
        {product.imageUrl && <img src={product.imageUrl} alt="" className="h-44 w-full rounded-2xl object-cover" />}
        {product.description && <p className="text-sm text-slate-600">{product.description}</p>}
        {product.optionGroups.map((g) => (
          <fieldset key={g.id}>
            <legend className="mb-1.5 flex w-full items-center justify-between text-sm font-semibold text-brand">
              {g.name}
              <span className="text-xs font-normal text-slate-500">
                {g.minChoices > 0 ? 'Obligatoire' : 'Facultatif'}
                {g.maxChoices > 1 ? ` · jusqu’à ${g.maxChoices}` : ''}
              </span>
            </legend>
            <div className="space-y-1.5">
              {g.options.map((o) => {
                const selected = chosen[g.id]?.includes(o.id) ?? false;
                return (
                  <label key={o.id} className={clsx('flex cursor-pointer items-center justify-between rounded-xl border px-3 py-2.5 text-sm', selected ? 'border-brand-light bg-brand-sky' : 'border-slate-200')}>
                    <span className="flex items-center gap-2">
                      <input type={g.maxChoices === 1 ? 'radio' : 'checkbox'} name={g.id} checked={selected} onChange={() => toggle(g.id, o.id, g.maxChoices)} className="accent-brand" />
                      {o.name}
                    </span>
                    {o.extraPrice > 0 && <span className="text-slate-500">+ {fcfa(o.extraPrice)}</span>}
                  </label>
                );
              })}
            </div>
          </fieldset>
        ))}
        <Input placeholder="Précision pour le commerçant (facultatif)" value={note} maxLength={200} onChange={(e) => setNote(e.target.value)} />
        <Alert tone={confirmReplace ? 'amber' : 'red'}>{error}</Alert>
        <div className="flex items-center gap-3">
          <QuantityStepper value={quantity} onChange={setQuantity} />
          <Button block size="lg" variant="success" onClick={add}>
            Ajouter · {fcfa(unitPrice * quantity)}
          </Button>
        </div>
      </div>
    </Sheet>
  );
}

export const MERCHANT_STATUS: Record<string, { label: string; tone: 'amber' | 'blue' | 'green' | 'red' }> = {
  PENDING: { label: 'En attente du commerçant', tone: 'amber' },
  ACCEPTED: { label: 'En préparation', tone: 'blue' },
  READY: { label: 'Prête', tone: 'green' },
  REJECTED: { label: 'Refusée', tone: 'red' },
};
