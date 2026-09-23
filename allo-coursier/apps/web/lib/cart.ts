'use client';

import { useSyncExternalStore } from 'react';
import { newId } from './api';

/** Produit tel qu'affiché dans le menu public d'un commerce. */
export interface MenuProduct {
  id: string;
  categoryId: string | null;
  name: string;
  description: string | null;
  price: number;
  imageUrl: string | null;
  optionGroups: { id: string; name: string; minChoices: number; maxChoices: number; options: { id: string; name: string; extraPrice: number }[] }[];
}

export interface CartLine {
  key: string;
  productId: string;
  name: string;
  quantity: number;
  optionIds: string[];
  optionLabels: string[];
  /** Prix unitaire affiché ; le serveur recalcule toujours le vrai prix. */
  unitPrice: number;
  note?: string;
}

export interface Cart {
  merchant: { id: string; slug: string; name: string; minOrderAmount: number | null; lat: number; lng: number; cityId: string };
  lines: CartLine[];
  idempotencyKey: string;
}

const KEY = 'ac.cart';
const listeners = new Set<() => void>();
let cached: { raw: string | null; value: Cart | null } = { raw: null, value: null };

function read(): Cart | null {
  let raw: string | null = null;
  try {
    raw = localStorage.getItem(KEY);
  } catch {
    return null;
  }
  if (raw === cached.raw) return cached.value;
  let value: Cart | null = null;
  try {
    value = raw ? (JSON.parse(raw) as Cart) : null;
  } catch {
    value = null;
  }
  cached = { raw, value };
  return value;
}

function write(cart: Cart | null) {
  try {
    if (cart && cart.lines.length) localStorage.setItem(KEY, JSON.stringify(cart));
    else localStorage.removeItem(KEY);
  } catch {
    /* stockage indisponible */
  }
  listeners.forEach((l) => l());
}

export const cartStore = {
  get: read,
  subscribe(listener: () => void) {
    listeners.add(listener);
    const onStorage = (e: StorageEvent) => e.key === KEY && listener();
    window.addEventListener('storage', onStorage);
    return () => {
      listeners.delete(listener);
      window.removeEventListener('storage', onStorage);
    };
  },
  /** Ajoute une ligne ; un panier ne contient qu'un seul commerce (le précédent est remplacé). */
  add(merchant: Cart['merchant'], line: Omit<CartLine, 'key'>) {
    const current = read();
    const cart: Cart = current && current.merchant.id === merchant.id ? { ...current, merchant } : { merchant, lines: [], idempotencyKey: newId('food-') };
    const same = cart.lines.find((l) => l.productId === line.productId && l.optionIds.join() === line.optionIds.join() && (l.note ?? '') === (line.note ?? ''));
    const lines = same
      ? cart.lines.map((l) => (l === same ? { ...l, quantity: Math.min(50, l.quantity + line.quantity) } : l))
      : [...cart.lines, { ...line, key: newId('l-') }];
    write({ ...cart, lines });
  },
  setQuantity(key: string, quantity: number) {
    const cart = read();
    if (!cart) return;
    write({ ...cart, lines: quantity <= 0 ? cart.lines.filter((l) => l.key !== key) : cart.lines.map((l) => (l.key === key ? { ...l, quantity: Math.min(50, quantity) } : l)) });
  },
  clear() {
    write(null);
  },
};

export function useCart(): Cart | null {
  return useSyncExternalStore(cartStore.subscribe, read, () => null);
}

export const cartCount = (cart: Cart | null) => cart?.lines.reduce((s, l) => s + l.quantity, 0) ?? 0;
export const cartSubtotal = (cart: Cart | null) => cart?.lines.reduce((s, l) => s + l.quantity * l.unitPrice, 0) ?? 0;

export const MERCHANT_TYPES: Record<string, string> = {
  RESTAURANT: 'Restaurant',
  BOUTIQUE: 'Boutique',
  SUPERMARCHE: 'Supermarché',
  PHARMACIE: 'Pharmacie',
  ENTREPRISE: 'Entreprise',
  AUTRE: 'Autre',
};

export const WEEKDAYS = ['Dimanche', 'Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi'];
