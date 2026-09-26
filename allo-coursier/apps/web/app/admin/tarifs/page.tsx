'use client';

import { useState } from 'react';
import { CityFilter, useCities } from '@/components/admin/city-filter';
import { Alert, Badge, Button, Card, Field, Input, PageHeader, Select, Sheet } from '@/components/ui';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { dateOnly, fcfa, SERVICE_LABELS, VEHICLE_LABELS } from '@/lib/format';
import type { PriceLine } from '@/lib/types';
import { useApi } from '@/lib/use-api';

interface Rule {
  id: string;
  name: string;
  cityId: string;
  zoneId: string | null;
  serviceType: string | null;
  vehicleType: string | null;
  baseFare: number;
  minFare: number;
  pricePerKm: number;
  includedKm: number;
  expressFixed: number;
  expressPercent: number;
  waitingFreeMinutes: number;
  waitingPricePerMinute: number;
  nightSurcharge: number;
  nightStart: string | null;
  nightEnd: string | null;
  purchaseFeePercent: number;
  purchaseFeeMin: number;
  extraStopFee: number;
  commissionPercent: number;
  roundingStep: number;
  priority: number;
  validFrom: string;
  validTo: string | null;
  isActive: boolean;
  city: { name: string };
  zone: { name: string } | null;
}

const NUMERIC: [keyof Rule, string, string?][] = [
  ['baseFare', 'Prise en charge (FCFA)'],
  ['minFare', 'Prix minimum (FCFA)'],
  ['pricePerKm', 'Prix par km (FCFA)'],
  ['includedKm', 'Km inclus'],
  ['expressFixed', 'Express : supplément fixe'],
  ['expressPercent', 'Express : supplément (%)'],
  ['waitingFreeMinutes', 'Attente gratuite (min)'],
  ['waitingPricePerMinute', 'Prix minute d’attente'],
  ['nightSurcharge', 'Supplément de nuit'],
  ['purchaseFeePercent', 'Frais d’achat (%)'],
  ['purchaseFeeMin', 'Frais d’achat minimum'],
  ['extraStopFee', 'Arrêt supplémentaire'],
  ['commissionPercent', 'Commission plateforme (%)'],
  ['roundingStep', 'Arrondi (FCFA)'],
  ['priority', 'Priorité'],
];

const EMPTY: Partial<Rule> = {
  name: '', zoneId: null, serviceType: null, vehicleType: 'MOTO', baseFare: 500, minFare: 1000, pricePerKm: 150, includedKm: 2,
  expressFixed: 500, expressPercent: 0, waitingFreeMinutes: 10, waitingPricePerMinute: 25, nightSurcharge: 0, nightStart: null, nightEnd: null,
  purchaseFeePercent: 10, purchaseFeeMin: 200, extraStopFee: 300, commissionPercent: 20, roundingStep: 50, priority: 0, isActive: true,
};

function RuleForm({ rule, cityId, onDone }: { rule: Partial<Rule>; cityId: string; onDone: () => void }) {
  const [form, setForm] = useState<Partial<Rule>>(rule);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const zones = useApi<{ id: string; name: string }[]>(`/admin/cities/${rule.cityId ?? cityId}/zones`, { persist: false });
  const set = (k: keyof Rule, v: unknown) => setForm((f) => ({ ...f, [k]: v }));

  const save = async () => {
    setBusy(true);
    setError(null);
    const body: Record<string, unknown> = { ...form };
    for (const k of ['id', 'city', 'zone', 'createdAt', 'updatedAt', 'createdById', 'validFrom', 'validTo']) delete body[k];
    if (!form.nightStart) {
      body.nightStart = null;
      body.nightEnd = null;
    }
    if (form.validTo) body.validTo = new Date(form.validTo).toISOString();
    try {
      if (rule.id) {
        delete body.cityId;
        await api(`/admin/pricing-rules/${rule.id}`, { method: 'PATCH', body });
      } else {
        await api('/admin/pricing-rules', { body: { ...body, cityId } });
      }
      onDone();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-3">
      <Field label="Nom de la règle">
        <Input value={form.name ?? ''} onChange={(e) => set('name', e.target.value)} placeholder="Ex. Ouagadougou — moto" />
      </Field>
      <div className="grid grid-cols-3 gap-2">
        <Field label="Zone">
          <Select value={form.zoneId ?? ''} onChange={(e) => set('zoneId', e.target.value || null)}>
            <option value="">Toute la ville</option>
            {zones.data?.map((z) => <option key={z.id} value={z.id}>{z.name}</option>)}
          </Select>
        </Field>
        <Field label="Service">
          <Select value={form.serviceType ?? ''} onChange={(e) => set('serviceType', e.target.value || null)}>
            <option value="">Tous</option>
            {['PARCEL', 'PICKUP_DROP', 'ERRAND', 'PURCHASE'].map((s) => <option key={s} value={s}>{SERVICE_LABELS[s]}</option>)}
          </Select>
        </Field>
        <Field label="Véhicule">
          <Select value={form.vehicleType ?? ''} onChange={(e) => set('vehicleType', e.target.value || null)}>
            <option value="">Tous</option>
            <option value="MOTO">Moto</option>
            <option value="TRICYCLE">Tricycle</option>
          </Select>
        </Field>
      </div>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        {NUMERIC.map(([k, label]) => (
          <Field key={k} label={label}>
            <Input type="number" step="any" value={(form[k] as number | undefined) ?? 0} onChange={(e) => set(k, Number(e.target.value))} />
          </Field>
        ))}
        <Field label="Nuit : début">
          <Input type="time" value={form.nightStart ?? ''} onChange={(e) => set('nightStart', e.target.value || null)} />
        </Field>
        <Field label="Nuit : fin">
          <Input type="time" value={form.nightEnd ?? ''} onChange={(e) => set('nightEnd', e.target.value || null)} />
        </Field>
      </div>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={!!form.isActive} onChange={(e) => set('isActive', e.target.checked)} className="accent-brand" /> Règle active
      </label>
      <p className="text-xs text-slate-500">Les commandes déjà passées gardent leur prix : une modification ne s’applique qu’aux nouvelles commandes.</p>
      <Alert>{error}</Alert>
      <Button block loading={busy} onClick={save}>
        Enregistrer
      </Button>
    </div>
  );
}

function Simulator({ rules }: { rules: Rule[] }) {
  const [ruleId, setRuleId] = useState('');
  const [distanceKm, setDistance] = useState('6');
  const [speed, setSpeed] = useState('STANDARD');
  const [localTime, setTime] = useState('12:00');
  const [purchase, setPurchase] = useState('');
  const [waiting, setWaiting] = useState('');
  const [result, setResult] = useState<{ lines: PriceLine[]; deliveryFee: number; commissionAmount: number; driverEarning: number; totalToPay: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const id = ruleId || rules[0]?.id;
  return (
    <Card className="space-y-3">
      <h2 className="font-semibold text-brand">Simulateur</h2>
      <div className="grid grid-cols-2 gap-2">
        <Field label="Règle" className="col-span-2">
          <Select value={id} onChange={(e) => setRuleId(e.target.value)}>
            {rules.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
          </Select>
        </Field>
        <Field label="Distance (km)"><Input type="number" step="0.1" value={distanceKm} onChange={(e) => setDistance(e.target.value)} /></Field>
        <Field label="Vitesse">
          <Select value={speed} onChange={(e) => setSpeed(e.target.value)}>
            <option value="STANDARD">Standard</option>
            <option value="EXPRESS">Express</option>
          </Select>
        </Field>
        <Field label="Heure"><Input type="time" value={localTime} onChange={(e) => setTime(e.target.value)} /></Field>
        <Field label="Achats (FCFA)"><Input type="number" value={purchase} onChange={(e) => setPurchase(e.target.value)} /></Field>
        <Field label="Attente (min)"><Input type="number" value={waiting} onChange={(e) => setWaiting(e.target.value)} /></Field>
      </div>
      <Button
        variant="secondary"
        disabled={!id}
        onClick={async () => {
          setError(null);
          try {
            setResult(
              await api('/admin/pricing/simulate', {
                body: { ruleId: id, distanceKm: Number(distanceKm), speed, localTime, purchaseAmount: purchase ? Number(purchase) : undefined, waitingMinutes: waiting ? Number(waiting) : undefined },
              }),
            );
          } catch (err) {
            setError((err as Error).message);
          }
        }}
      >
        Calculer
      </Button>
      <Alert>{error}</Alert>
      {result && (
        <div className="rounded-xl bg-slate-50 p-3 text-sm">
          {result.lines.map((l) => (
            <div key={l.code} className="flex justify-between"><span>{l.label}</span><span>{fcfa(l.amount)}</span></div>
          ))}
          <div className="mt-1 flex justify-between border-t border-slate-200 pt-1 font-bold text-brand"><span>Frais de livraison</span><span>{fcfa(result.deliveryFee)}</span></div>
          <div className="flex justify-between text-slate-600"><span>Commission plateforme</span><span>{fcfa(result.commissionAmount)}</span></div>
          <div className="flex justify-between text-slate-600"><span>Gain livreur (indépendant)</span><span>{fcfa(result.driverEarning)}</span></div>
          <div className="flex justify-between text-slate-600"><span>Total payé par le client</span><span>{fcfa(result.totalToPay)}</span></div>
        </div>
      )}
    </Card>
  );
}

export default function PricingPage() {
  const { can } = useAuth();
  const cities = useCities();
  const [cityId, setCityId] = useState('');
  const effectiveCity = cityId || cities[0]?.id || '';
  const { data: rules, reload } = useApi<Rule[]>(effectiveCity ? `/admin/pricing-rules?cityId=${effectiveCity}` : null, { persist: false });
  const [editing, setEditing] = useState<Partial<Rule> | null>(null);

  return (
    <div className="space-y-4">
      <PageHeader
        title="Tarifs"
        subtitle="La règle la plus précise s’applique : zone, puis service, puis véhicule ; à égalité, la priorité la plus haute."
        action={can('pricing.manage') ? <Button onClick={() => setEditing({ ...EMPTY })}>Nouvelle règle</Button> : undefined}
      />
      <CityFilter value={effectiveCity} onChange={setCityId} allLabel="Choisir une ville" />
      <div className="grid gap-4 lg:grid-cols-3">
        <div className="space-y-3 lg:col-span-2">
          {rules?.length === 0 && <Alert tone="amber">Aucune règle : les clients de cette ville ne peuvent pas commander.</Alert>}
          {rules?.map((r) => (
            <Card key={r.id} className={r.isActive ? '' : 'opacity-60'}>
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <p className="font-semibold text-brand">{r.name}</p>
                  <p className="text-xs text-slate-500">
                    {r.zone?.name ?? 'Toute la ville'} · {r.serviceType ? SERVICE_LABELS[r.serviceType] : 'Tous services'} · {r.vehicleType ? VEHICLE_LABELS[r.vehicleType] : 'Tous véhicules'} · depuis le {dateOnly(r.validFrom)}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <Badge tone={r.isActive ? 'green' : 'gray'}>{r.isActive ? 'Active' : 'Inactive'}</Badge>
                  {can('pricing.manage') && (
                    <Button size="sm" variant="outline" onClick={() => setEditing(r)}>
                      Modifier
                    </Button>
                  )}
                </div>
              </div>
              <p className="mt-2 text-sm text-slate-700">
                {fcfa(r.baseFare)} + {fcfa(r.pricePerKm)}/km au-delà de {r.includedKm} km · minimum {fcfa(r.minFare)} · express +{fcfa(r.expressFixed)}
                {r.expressPercent ? ` +${r.expressPercent} %` : ''} · commission {r.commissionPercent} %
                {r.nightSurcharge ? ` · nuit +${fcfa(r.nightSurcharge)} (${r.nightStart}–${r.nightEnd})` : ''}
              </p>
            </Card>
          ))}
        </div>
        {rules && rules.length > 0 && <Simulator rules={rules} />}
      </div>
      <Sheet open={!!editing} onClose={() => setEditing(null)} title={editing?.id ? 'Modifier la règle' : 'Nouvelle règle'}>
        {editing && (
          <RuleForm
            rule={editing}
            cityId={effectiveCity}
            onDone={() => {
              setEditing(null);
              void reload();
            }}
          />
        )}
      </Sheet>
    </div>
  );
}
