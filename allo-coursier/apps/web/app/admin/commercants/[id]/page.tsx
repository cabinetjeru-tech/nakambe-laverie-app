'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useState } from 'react';
import { MerchantLogo } from '@/components/food';
import { Map } from '@/components/map';
import { Alert, Badge, Button, Card, Field, Input, PageHeader, Spinner, Stat } from '@/components/ui';
import { api } from '@/lib/api';
import { MERCHANT_TYPES, WEEKDAYS } from '@/lib/cart';
import { dateOnly, dateTime, fcfa, phoneDisplay } from '@/lib/format';
import { MEMBER_ROLES, MERCHANT_STATUS_LABELS } from '@/lib/merchant';
import { useApi } from '@/lib/use-api';

interface AdminMerchant {
  id: string;
  name: string;
  slug: string;
  type: string;
  status: 'PENDING' | 'ACTIVE' | 'SUSPENDED';
  phone: string;
  description: string | null;
  logoUrl: string | null;
  lat: number;
  lng: number;
  landmark: string | null;
  addressText: string | null;
  avgPrepMinutes: number;
  minOrderAmount: number | null;
  commissionPercent: number | null;
  effectiveCommissionPercent: number;
  isOpen: boolean;
  isOpenOverride: boolean | null;
  createdAt: string;
  city: { id: string; name: string };
  openingHours: { weekday: number; opensAt: string; closesAt: string }[];
  closures: { id: string; startsAt: string; endsAt: string; reason: string | null }[];
  members: { role: string; user: { id: string; firstName: string; lastName: string; phone: string } }[];
  wallets: { id: string; balance: number }[];
  _count: { orders: number; products: number };
}

export default function AdminMerchantPage() {
  const { id } = useParams<{ id: string }>();
  const { data: m, mutate, error: loadError } = useApi<AdminMerchant>(`/admin/merchants/${id}`, { persist: false });
  const [commission, setCommission] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (!m) return loadError ? <Alert>{loadError.message}</Alert> : <Spinner />;

  const update = async (key: string, body: Record<string, unknown>) => {
    setBusy(key);
    setError(null);
    try {
      mutate(await api<AdminMerchant>(`/admin/merchants/${id}`, { method: 'PATCH', body }));
      setCommission(null);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(null);
    }
  };

  const status = MERCHANT_STATUS_LABELS[m.status];
  const wallet = m.wallets[0];
  const commissionValue = commission ?? (m.commissionPercent == null ? '' : String(m.commissionPercent));

  return (
    <div className="space-y-4">
      <PageHeader
        back="/admin/commercants"
        title={m.name}
        subtitle={`${MERCHANT_TYPES[m.type]} · ${m.city.name} · inscrit le ${dateOnly(m.createdAt)}`}
        action={<Badge tone={status.tone}>{status.label}</Badge>}
      />
      <Alert>{error}</Alert>

      <div className="flex flex-wrap gap-2">
        {m.status !== 'ACTIVE' && (
          <Button variant="success" loading={busy === 'status'} onClick={() => update('status', { status: 'ACTIVE' })}>
            {m.status === 'PENDING' ? 'Valider et mettre en ligne' : 'Réactiver'}
          </Button>
        )}
        {m.status !== 'SUSPENDED' && (
          <Button variant="outline" loading={busy === 'status'} onClick={() => confirm(`Suspendre ${m.name} ? Il n’apparaîtra plus aux clients.`) && update('status', { status: 'SUSPENDED' })}>
            Suspendre
          </Button>
        )}
        {m.status === 'ACTIVE' && (
          <Link href={`/restaurants/${m.slug}`} target="_blank" className="rounded-xl px-4 py-2.5 text-sm font-semibold text-brand-light hover:bg-white">
            Voir la page publique ↗
          </Link>
        )}
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Commandes" value={m._count.orders} />
        <Stat label="Produits au menu" value={m._count.products} />
        <Stat label="À reverser" value={fcfa(wallet?.balance ?? 0)} tone={(wallet?.balance ?? 0) > 0 ? 'amber' : undefined} />
        <Stat label="Aujourd’hui" value={m.isOpen ? 'Ouvert' : 'Fermé'} hint={m.isOpenOverride === null ? 'selon les horaires' : 'forcé par le commerçant'} tone={m.isOpen ? 'green' : 'red'} />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="space-y-2 text-sm">
          <div className="flex items-center gap-3">
            <MerchantLogo name={m.name} url={m.logoUrl} className="h-12 w-12" />
            <div>
              <p className="font-semibold text-brand">{m.name}</p>
              <p className="text-slate-500">{phoneDisplay(m.phone)}</p>
            </div>
          </div>
          {m.description && <p className="text-slate-600">{m.description}</p>}
          <p>
            <span className="text-slate-500">Repère : </span>
            {m.landmark || m.addressText || '—'}
          </p>
          <p>
            <span className="text-slate-500">Préparation habituelle : </span>
            {m.avgPrepMinutes} min · <span className="text-slate-500">minimum : </span>
            {m.minOrderAmount ? fcfa(m.minOrderAmount) : 'aucun'}
          </p>
          {wallet && (
            <Link href={`/admin/finances/portefeuilles/${wallet.id}`} className="inline-block font-semibold text-brand-light">
              Voir les mouvements du portefeuille →
            </Link>
          )}
        </Card>
        <Map center={m} markers={[{ kind: 'pickup', lat: m.lat, lng: m.lng, label: m.name }]} className="h-56 w-full rounded-2xl" />
      </div>

      <Card className="space-y-3">
        <h2 className="font-semibold text-brand">Commission sur les ventes</h2>
        <p className="text-sm text-slate-600">
          Taux appliqué : <strong>{m.effectiveCommissionPercent} %</strong> {m.commissionPercent == null && '(taux par défaut, modifiable dans Paramètres → merchants.defaultCommissionPercent)'}
        </p>
        <div className="flex flex-wrap items-end gap-2">
          <Field label="Taux propre à ce commerce (%)" hint="Vide = taux par défaut">
            <Input className="w-40" type="number" min={0} max={100} step={0.5} value={commissionValue} onChange={(e) => setCommission(e.target.value)} />
          </Field>
          <Button
            variant="secondary"
            loading={busy === 'commission'}
            disabled={commission === null}
            onClick={() => update('commission', { commissionPercent: commissionValue === '' ? null : Number(commissionValue) })}
          >
            Enregistrer
          </Button>
        </div>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <h2 className="mb-2 font-semibold text-brand">Équipe du commerce</h2>
          <div className="divide-y divide-slate-100 text-sm">
            {m.members.map((mb) => (
              <Link key={mb.user.id} href={`/admin/utilisateurs/${mb.user.id}`} className="flex justify-between py-2 hover:text-brand">
                <span>
                  {mb.user.firstName} {mb.user.lastName}
                  <span className="block text-xs text-slate-500">{phoneDisplay(mb.user.phone)}</span>
                </span>
                <Badge tone="gray">{MEMBER_ROLES[mb.role]}</Badge>
              </Link>
            ))}
          </div>
        </Card>
        <Card className="text-sm">
          <h2 className="mb-2 font-semibold text-brand">Horaires</h2>
          {m.openingHours.length === 0 && <p className="text-slate-500">Aucun horaire : considéré comme toujours ouvert.</p>}
          {[1, 2, 3, 4, 5, 6, 0].map((d) => {
            const slots = m.openingHours.filter((h) => h.weekday === d);
            if (!m.openingHours.length) return null;
            return (
              <div key={d} className="flex justify-between py-0.5">
                <span className="text-slate-500">{WEEKDAYS[d]}</span>
                <span>{slots.length ? slots.map((s) => `${s.opensAt}–${s.closesAt}`).join(', ') : 'Fermé'}</span>
              </div>
            );
          })}
          {m.closures.filter((c) => new Date(c.endsAt) > new Date()).map((c) => (
            <p key={c.id} className="mt-2 text-xs text-amber-700">
              Fermeture : {dateTime(c.startsAt)} → {dateTime(c.endsAt)} {c.reason && `(${c.reason})`}
            </p>
          ))}
        </Card>
      </div>
    </div>
  );
}
