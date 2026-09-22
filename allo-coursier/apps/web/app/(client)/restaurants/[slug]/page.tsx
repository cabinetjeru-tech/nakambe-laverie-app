'use client';

import clsx from 'clsx';
import { Clock, MapPin, Plus, Star } from 'lucide-react';
import { useParams } from 'next/navigation';
import { useMemo, useState } from 'react';
import { CartBar, MerchantLogo, ProductSheet } from '@/components/food';
import { Alert, Badge, PageHeader, Spinner } from '@/components/ui';
import { Cart, MenuProduct, WEEKDAYS } from '@/lib/cart';
import { fcfa } from '@/lib/format';
import { useApi } from '@/lib/use-api';

interface MerchantMenu {
  id: string;
  slug: string;
  name: string;
  type: string;
  description: string | null;
  logoUrl: string | null;
  coverUrl: string | null;
  lat: number;
  lng: number;
  landmark: string | null;
  addressText: string | null;
  city: { id: string; name: string };
  avgPrepMinutes: number;
  minOrderAmount: number | null;
  rating: number | null;
  ratingCount: number;
  isOpen: boolean;
  openingHours: { weekday: number; opensAt: string; closesAt: string }[];
  categories: { id: string; name: string }[];
  products: MenuProduct[];
}

export default function MerchantMenuPage() {
  const { slug } = useParams<{ slug: string }>();
  const { data: m, error } = useApi<MerchantMenu>(`/merchants/${slug}`, { refreshInterval: 120_000 });
  const [selected, setSelected] = useState<MenuProduct | null>(null);

  const sections = useMemo(() => {
    if (!m) return [];
    const bySection = m.categories.map((c) => ({ id: c.id, name: c.name, products: m.products.filter((p) => p.categoryId === c.id) }));
    const other = m.products.filter((p) => !p.categoryId || !m.categories.some((c) => c.id === p.categoryId));
    if (other.length) bySection.push({ id: 'autres', name: bySection.length ? 'Autres' : 'Menu', products: other });
    return bySection.filter((s) => s.products.length);
  }, [m]);

  if (!m) return error ? <Alert>{error.message}</Alert> : <Spinner />;

  const cartMerchant: Cart['merchant'] = { id: m.id, slug: m.slug, name: m.name, minOrderAmount: m.minOrderAmount, lat: m.lat, lng: m.lng, cityId: m.city.id };
  const today = new Date().toLocaleDateString('en-US', { weekday: 'short', timeZone: 'Africa/Ouagadougou' });
  const todayIndex = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(today);
  const todayHours = m.openingHours.filter((h) => h.weekday === todayIndex).sort((a, b) => a.opensAt.localeCompare(b.opensAt));

  return (
    <div className="space-y-4 pb-16">
      <PageHeader title="" back="/restaurants" />
      <div className="-mt-4 overflow-hidden rounded-2xl bg-white shadow-card">
        {m.coverUrl && <img src={m.coverUrl} alt="" className="h-36 w-full object-cover" />}
        <div className="flex gap-3 p-4">
          <MerchantLogo name={m.name} url={m.logoUrl} className="h-16 w-16 shrink-0" />
          <div className="min-w-0 flex-1">
            <div className="flex items-start justify-between gap-2">
              <h1 className="text-lg font-bold leading-tight text-brand">{m.name}</h1>
              {m.isOpen ? <Badge tone="green">Ouvert</Badge> : <Badge tone="gray">Fermé</Badge>}
            </div>
            {m.description && <p className="mt-0.5 text-sm text-slate-600">{m.description}</p>}
            <p className="mt-1.5 flex flex-wrap gap-x-3 gap-y-1 text-xs text-slate-600">
              <span className="inline-flex items-center gap-1">
                <Clock className="h-3.5 w-3.5" /> ~{m.avgPrepMinutes} min
              </span>
              {m.rating != null && (
                <span className="inline-flex items-center gap-1">
                  <Star className="h-3.5 w-3.5 fill-amber-400 text-amber-400" /> {m.rating.toLocaleString('fr-FR')}
                </span>
              )}
              {(m.landmark || m.addressText) && (
                <span className="inline-flex items-center gap-1">
                  <MapPin className="h-3.5 w-3.5" /> {m.landmark || m.addressText}
                </span>
              )}
            </p>
            <p className="mt-1 text-xs text-slate-500">
              Aujourd’hui ({WEEKDAYS[todayIndex]?.toLowerCase()}) :{' '}
              {todayHours.length ? todayHours.map((h) => `${h.opensAt}–${h.closesAt}`).join(', ') : m.openingHours.length ? 'fermé' : 'horaires non précisés'}
              {m.minOrderAmount ? ` · minimum ${fcfa(m.minOrderAmount)}` : ''}
            </p>
          </div>
        </div>
      </div>

      {!m.isOpen && <Alert tone="amber">Ce commerce est fermé pour le moment : vous pouvez consulter le menu mais pas commander.</Alert>}

      {sections.length > 1 && (
        <nav className="sticky top-[56px] z-10 -mx-4 flex gap-2 overflow-x-auto bg-slate-50/95 px-4 py-2 backdrop-blur">
          {sections.map((s) => (
            <a key={s.id} href={`#cat-${s.id}`} className="shrink-0 rounded-full bg-white px-3 py-1 text-sm font-medium text-brand ring-1 ring-slate-200">
              {s.name}
            </a>
          ))}
        </nav>
      )}

      {sections.map((section) => (
        <section key={section.id} id={`cat-${section.id}`} className="scroll-mt-28">
          <h2 className="mb-2 font-bold text-brand">{section.name}</h2>
          <div className="divide-y divide-slate-100 overflow-hidden rounded-2xl bg-white shadow-card">
            {section.products.map((p) => (
              <button
                key={p.id}
                type="button"
                disabled={!m.isOpen}
                onClick={() => setSelected(p)}
                className={clsx('flex w-full items-center gap-3 p-3.5 text-left transition', m.isOpen && 'active:bg-slate-50')}
              >
                <span className="min-w-0 flex-1">
                  <span className="block font-semibold text-slate-800">{p.name}</span>
                  {p.description && <span className="line-clamp-2 text-xs text-slate-500">{p.description}</span>}
                  <span className="mt-1 block text-sm font-bold text-brand">
                    {p.optionGroups.some((g) => g.options.some((o) => o.extraPrice > 0)) ? 'À partir de ' : ''}
                    {fcfa(p.price)}
                  </span>
                </span>
                {p.imageUrl && <img src={p.imageUrl} alt="" className="h-16 w-16 shrink-0 rounded-xl object-cover" loading="lazy" />}
                {m.isOpen && (
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-brand-green text-white">
                    <Plus className="h-5 w-5" />
                  </span>
                )}
              </button>
            ))}
          </div>
        </section>
      ))}

      {!sections.length && <p className="text-center text-sm text-slate-500">Le menu n’est pas encore disponible.</p>}

      <ProductSheet product={selected} merchant={cartMerchant} onClose={() => setSelected(null)} />
      <CartBar />
    </div>
  );
}
