'use client';

import clsx from 'clsx';
import { Clock, Search, Star, Store, UtensilsCrossed } from 'lucide-react';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { CartBar, MerchantLogo } from '@/components/food';
import { Badge, EmptyState, Input, PageHeader, Spinner } from '@/components/ui';
import { MERCHANT_TYPES } from '@/lib/cart';
import { fcfa } from '@/lib/format';
import type { City } from '@/lib/types';
import { useApi } from '@/lib/use-api';

interface MerchantCard {
  id: string;
  slug: string;
  name: string;
  type: string;
  description: string | null;
  logoUrl: string | null;
  coverUrl: string | null;
  landmark: string | null;
  city: { id: string; name: string };
  avgPrepMinutes: number;
  minOrderAmount: number | null;
  rating: number | null;
  ratingCount: number;
  isOpen: boolean;
}

const CITY_KEY = 'ac.city';

export default function RestaurantsPage() {
  const cities = useApi<City[]>('/cities');
  const [cityId, setCityId] = useState<string | null>(null);
  const [type, setType] = useState<string>('');
  const [search, setSearch] = useState('');
  const [query, setQuery] = useState('');

  useEffect(() => {
    if (cityId || !cities.data?.length) return;
    let saved: string | null = null;
    try {
      saved = localStorage.getItem(CITY_KEY);
    } catch {
      /* rien */
    }
    setCityId(cities.data.find((c) => c.id === saved)?.id ?? cities.data[0].id);
  }, [cities.data, cityId]);

  // Recherche lancée après une courte pause de frappe (moins de requêtes sur réseau lent).
  useEffect(() => {
    const t = setTimeout(() => setQuery(search.trim()), 400);
    return () => clearTimeout(t);
  }, [search]);

  const params = new URLSearchParams();
  if (cityId) params.set('cityId', cityId);
  if (type) params.set('type', type);
  if (query) params.set('search', query);
  const merchants = useApi<MerchantCard[]>(cityId ? `/merchants?${params}` : null, { refreshInterval: 120_000 });

  return (
    <div className="space-y-4">
      <PageHeader title="Repas & commerces" subtitle="Commandez chez nos partenaires, un livreur vous l’apporte." back="/accueil" />

      {cities.data && cities.data.length > 1 && (
        <div className="flex gap-2">
          {cities.data.map((c) => (
            <button
              key={c.id}
              type="button"
              onClick={() => {
                setCityId(c.id);
                try {
                  localStorage.setItem(CITY_KEY, c.id);
                } catch {
                  /* rien */
                }
              }}
              className={clsx('rounded-full px-3 py-1 text-sm font-medium', cityId === c.id ? 'bg-brand text-white' : 'bg-white text-slate-600 ring-1 ring-slate-200')}
            >
              {c.name}
            </button>
          ))}
        </div>
      )}

      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
        <Input className="pl-9" placeholder="Un plat, un restaurant, une boutique…" value={search} onChange={(e) => setSearch(e.target.value)} />
      </div>

      <div className="flex gap-2 overflow-x-auto pb-1">
        {[['', 'Tout'], ...Object.entries(MERCHANT_TYPES).filter(([k]) => k !== 'ENTREPRISE')].map(([code, label]) => (
          <button key={code} type="button" onClick={() => setType(code)} className={clsx('shrink-0 rounded-full px-3 py-1 text-sm font-medium', type === code ? 'bg-brand-green text-white' : 'bg-white text-slate-600 ring-1 ring-slate-200')}>
            {label}
          </button>
        ))}
      </div>

      {!merchants.data && merchants.loading && <Spinner />}
      {merchants.error && !merchants.data && <p className="text-sm text-red-600">{merchants.error.message}</p>}
      {merchants.data?.length === 0 && (
        <EmptyState icon={<UtensilsCrossed className="h-8 w-8" />} title="Aucun commerce trouvé">
          De nouveaux partenaires arrivent bientôt dans votre ville.
        </EmptyState>
      )}

      <div className="space-y-3">
        {merchants.data?.map((m) => (
          <Link key={m.id} href={`/restaurants/${m.slug}`} className={clsx('block overflow-hidden rounded-2xl bg-white shadow-card transition active:scale-[0.99]', !m.isOpen && 'opacity-70')}>
            {m.coverUrl && <img src={m.coverUrl} alt="" className="h-28 w-full object-cover" loading="lazy" />}
            <div className="flex gap-3 p-3.5">
              <MerchantLogo name={m.name} url={m.logoUrl} className="h-14 w-14 shrink-0" />
              <div className="min-w-0 flex-1">
                <div className="flex items-start justify-between gap-2">
                  <p className="truncate font-bold text-brand">{m.name}</p>
                  {m.isOpen ? <Badge tone="green">Ouvert</Badge> : <Badge tone="gray">Fermé</Badge>}
                </div>
                <p className="truncate text-xs text-slate-500">
                  {MERCHANT_TYPES[m.type]}
                  {m.landmark ? ` · ${m.landmark}` : ''}
                </p>
                <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-slate-600">
                  <span className="inline-flex items-center gap-1">
                    <Clock className="h-3.5 w-3.5" /> ~{m.avgPrepMinutes} min de préparation
                  </span>
                  {m.rating != null && (
                    <span className="inline-flex items-center gap-1">
                      <Star className="h-3.5 w-3.5 fill-amber-400 text-amber-400" /> {m.rating.toLocaleString('fr-FR')} ({m.ratingCount})
                    </span>
                  )}
                  {!!m.minOrderAmount && <span>Minimum {fcfa(m.minOrderAmount)}</span>}
                </p>
              </div>
            </div>
          </Link>
        ))}
      </div>

      <Link href="/partenaires/inscription" className="flex items-center gap-3 rounded-2xl border border-dashed border-brand-light/50 bg-white/60 p-4 text-sm">
        <Store className="h-6 w-6 shrink-0 text-brand-light" />
        <span>
          <span className="block font-semibold text-brand">Vous avez un restaurant ou une boutique ?</span>
          <span className="text-slate-500">Devenez partenaire et recevez des commandes livrées par Allô-Coursier.</span>
        </span>
      </Link>

      <CartBar />
    </div>
  );
}
