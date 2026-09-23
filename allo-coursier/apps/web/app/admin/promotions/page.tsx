'use client';

import { useState } from 'react';
import { useCities } from '@/components/admin/city-filter';
import { DataTable } from '@/components/admin/table';
import { Alert, Badge, Button, Field, Input, PageHeader, Select, Sheet } from '@/components/ui';
import { api } from '@/lib/api';
import { dateOnly, fcfa, SERVICE_LABELS } from '@/lib/format';
import { useApi } from '@/lib/use-api';

interface Promo {
  id: string;
  code: string | null;
  name: string;
  type: 'PERCENT' | 'FIXED' | 'FREE_DELIVERY';
  value: number;
  maxDiscount: number | null;
  minOrderAmount: number | null;
  usageLimit: number | null;
  perUserLimit: number | null;
  firstOrderOnly: boolean;
  startsAt: string;
  endsAt: string | null;
  isActive: boolean;
  serviceType: string | null;
  city: { name: string } | null;
  _count: { redemptions: number };
}

const describe = (p: Promo) => (p.type === 'PERCENT' ? `-${p.value} %${p.maxDiscount ? ` (max ${fcfa(p.maxDiscount)})` : ''}` : p.type === 'FIXED' ? `-${fcfa(p.value)}` : 'Livraison offerte');

export default function PromotionsPage() {
  const cities = useCities();
  const { data, reload } = useApi<Promo[]>('/admin/promotions', { persist: false });
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const today = new Date().toISOString().slice(0, 10);
  const [f, setF] = useState({ code: '', name: '', type: 'PERCENT', value: '20', maxDiscount: '', minOrderAmount: '', usageLimit: '', perUserLimit: '1', firstOrderOnly: false, cityId: '', serviceType: '', startsAt: today, endsAt: '' });
  const num = (v: string) => (v === '' ? undefined : Number(v));

  return (
    <div className="space-y-4">
      <PageHeader title="Promotions" subtitle="Remises sur les frais de livraison, financées par la plateforme (le gain du livreur n’est pas réduit)." action={<Button onClick={() => setOpen(true)}>Nouveau code</Button>} />
      <DataTable
        rows={data}
        rowKey={(r) => r.id}
        empty="Aucune promotion"
        columns={[
          { header: 'Code', cell: (r) => <><span className="font-mono font-semibold text-brand">{r.code ?? '—'}</span><span className="block text-xs text-slate-500">{r.name}</span></> },
          { header: 'Remise', cell: describe },
          { header: 'Conditions', cell: (r) => <span className="text-xs text-slate-600">{[r.city?.name, r.serviceType && SERVICE_LABELS[r.serviceType], r.minOrderAmount && `dès ${fcfa(r.minOrderAmount)}`, r.firstOrderOnly && '1re commande', r.perUserLimit && `${r.perUserLimit}×/client`].filter(Boolean).join(' · ') || 'Aucune'}</span> },
          { header: 'Période', cell: (r) => `${dateOnly(r.startsAt)} → ${r.endsAt ? dateOnly(r.endsAt) : '∞'}` },
          { header: 'Utilisations', cell: (r) => `${r._count.redemptions}${r.usageLimit ? ` / ${r.usageLimit}` : ''}` },
          {
            header: 'Statut',
            cell: (r) => (
              <button onClick={async () => { await api(`/admin/promotions/${r.id}`, { method: 'PATCH', body: { isActive: !r.isActive } }); void reload(); }}>
                <Badge tone={r.isActive ? 'green' : 'gray'}>{r.isActive ? 'Active (désactiver)' : 'Inactive (activer)'}</Badge>
              </button>
            ),
          },
        ]}
      />
      <Sheet open={open} onClose={() => setOpen(false)} title="Nouveau code promo">
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-2">
            <Field label="Code"><Input value={f.code} onChange={(e) => setF({ ...f, code: e.target.value.toUpperCase() })} placeholder="BIENVENUE" /></Field>
            <Field label="Nom interne"><Input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></Field>
            <Field label="Type">
              <Select value={f.type} onChange={(e) => setF({ ...f, type: e.target.value })}>
                <option value="PERCENT">Pourcentage</option>
                <option value="FIXED">Montant fixe</option>
                <option value="FREE_DELIVERY">Livraison offerte</option>
              </Select>
            </Field>
            {f.type !== 'FREE_DELIVERY' && <Field label={f.type === 'PERCENT' ? 'Pourcentage' : 'Montant (FCFA)'}><Input type="number" value={f.value} onChange={(e) => setF({ ...f, value: e.target.value })} /></Field>}
            <Field label="Remise maximum (FCFA)"><Input type="number" value={f.maxDiscount} onChange={(e) => setF({ ...f, maxDiscount: e.target.value })} /></Field>
            <Field label="Frais minimum (FCFA)"><Input type="number" value={f.minOrderAmount} onChange={(e) => setF({ ...f, minOrderAmount: e.target.value })} /></Field>
            <Field label="Utilisations totales"><Input type="number" value={f.usageLimit} onChange={(e) => setF({ ...f, usageLimit: e.target.value })} placeholder="illimité" /></Field>
            <Field label="Par client"><Input type="number" value={f.perUserLimit} onChange={(e) => setF({ ...f, perUserLimit: e.target.value })} /></Field>
            <Field label="Ville">
              <Select value={f.cityId} onChange={(e) => setF({ ...f, cityId: e.target.value })}>
                <option value="">Toutes</option>
                {cities.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </Select>
            </Field>
            <Field label="Service">
              <Select value={f.serviceType} onChange={(e) => setF({ ...f, serviceType: e.target.value })}>
                <option value="">Tous</option>
                {['PARCEL', 'PICKUP_DROP', 'ERRAND', 'PURCHASE'].map((s) => <option key={s} value={s}>{SERVICE_LABELS[s]}</option>)}
              </Select>
            </Field>
            <Field label="Début"><Input type="date" value={f.startsAt} onChange={(e) => setF({ ...f, startsAt: e.target.value })} /></Field>
            <Field label="Fin (facultatif)"><Input type="date" value={f.endsAt} onChange={(e) => setF({ ...f, endsAt: e.target.value })} /></Field>
          </div>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" className="accent-brand" checked={f.firstOrderOnly} onChange={(e) => setF({ ...f, firstOrderOnly: e.target.checked })} /> Réservé à la première commande</label>
          <Alert>{error}</Alert>
          <Button
            block
            disabled={!f.name || !f.code}
            onClick={async () => {
              setError(null);
              try {
                await api('/admin/promotions', {
                  body: {
                    code: f.code, name: f.name, type: f.type, value: f.type === 'FREE_DELIVERY' ? 0 : Number(f.value),
                    maxDiscount: num(f.maxDiscount), minOrderAmount: num(f.minOrderAmount), usageLimit: num(f.usageLimit), perUserLimit: num(f.perUserLimit),
                    firstOrderOnly: f.firstOrderOnly, cityId: f.cityId || undefined, serviceType: f.serviceType || undefined,
                    startsAt: new Date(`${f.startsAt}T00:00:00Z`).toISOString(), endsAt: f.endsAt ? new Date(`${f.endsAt}T23:59:59Z`).toISOString() : undefined,
                  },
                });
                setOpen(false);
                void reload();
              } catch (err) {
                setError((err as Error).message);
              }
            }}
          >
            Créer
          </Button>
        </div>
      </Sheet>
    </div>
  );
}
