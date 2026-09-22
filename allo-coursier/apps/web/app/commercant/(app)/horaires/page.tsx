'use client';

import { Plus, Trash2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Alert, Button, Card, Field, Input } from '@/components/ui';
import { WEEKDAYS } from '@/lib/cart';
import { dateTime } from '@/lib/format';
import { MerchantSpace, useMerchant } from '@/lib/merchant';

type Slot = { opensAt: string; closesAt: string };
// Lundi en premier, comme au Burkina Faso.
const ORDER = [1, 2, 3, 4, 5, 6, 0];

export default function MerchantHoursPage() {
  const { merchant, call, setMerchant, canManage } = useMerchant();
  const [week, setWeek] = useState<Record<number, Slot[]>>({});
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [closure, setClosure] = useState({ startsAt: '', endsAt: '', reason: '' });

  useEffect(() => {
    if (!merchant) return;
    const next: Record<number, Slot[]> = {};
    for (const d of ORDER) next[d] = merchant.openingHours.filter((h) => h.weekday === d).map((h) => ({ opensAt: h.opensAt, closesAt: h.closesAt }));
    setWeek(next);
  }, [merchant]);

  if (!merchant) return null;

  const setDay = (day: number, slots: Slot[]) => {
    setSaved(false);
    setWeek((w) => ({ ...w, [day]: slots }));
  };

  const save = async () => {
    setBusy(true);
    setError(null);
    try {
      const hours = ORDER.flatMap((weekday) => (week[weekday] ?? []).map((s) => ({ weekday, ...s })));
      setMerchant(await call('hours', { method: 'PUT', body: { hours } }));
      setSaved(true);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const copyMonday = () => {
    setSaved(false);
    setWeek((w) => Object.fromEntries(ORDER.map((d) => [d, d === 0 ? w[0] ?? [] : (w[1] ?? []).map((s) => ({ ...s }))])));
  };

  const run = async (fn: () => Promise<MerchantSpace>) => {
    setError(null);
    try {
      setMerchant(await fn());
    } catch (err) {
      setError((err as Error).message);
    }
  };

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold text-brand">Horaires</h1>

      <Card className="space-y-2">
        <p className="text-sm text-slate-600">
          Aujourd’hui, votre commerce est <strong className={merchant.isOpen ? 'text-brand-greenDark' : 'text-red-600'}>{merchant.isOpen ? 'ouvert' : 'fermé'}</strong>
          {merchant.isOpenOverride === true && ' (ouverture forcée)'}
          {merchant.isOpenOverride === false && ' (fermeture forcée)'}.
        </p>
        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant={merchant.isOpenOverride === null ? 'primary' : 'outline'} onClick={() => run(() => call('open', { method: 'PUT', body: { isOpenOverride: null } }))}>
            Selon les horaires
          </Button>
          <Button size="sm" variant={merchant.isOpenOverride === false ? 'danger' : 'outline'} onClick={() => run(() => call('open', { method: 'PUT', body: { isOpenOverride: false } }))}>
            Fermer maintenant
          </Button>
          <Button size="sm" variant={merchant.isOpenOverride === true ? 'success' : 'outline'} onClick={() => run(() => call('open', { method: 'PUT', body: { isOpenOverride: true } }))}>
            Ouvrir maintenant
          </Button>
        </div>
        <p className="text-xs text-slate-500">« Fermer maintenant » est utile en cas de rush ou de coupure : pensez à revenir à « Selon les horaires ».</p>
      </Card>

      <Card className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold text-brand">Semaine type</h2>
          {canManage && (
            <button type="button" className="text-xs font-semibold text-brand-light" onClick={copyMonday}>
              Copier le lundi sur tous les jours
            </button>
          )}
        </div>
        {ORDER.map((day) => {
          const slots = week[day] ?? [];
          return (
            <div key={day} className="flex flex-wrap items-start gap-2 border-t border-slate-100 pt-3 first:border-0 first:pt-0">
              <label className="flex w-28 items-center gap-2 pt-2.5 text-sm font-medium">
                <input
                  type="checkbox"
                  className="accent-brand"
                  disabled={!canManage}
                  checked={slots.length > 0}
                  onChange={(e) => setDay(day, e.target.checked ? [{ opensAt: '08:00', closesAt: '22:00' }] : [])}
                />
                {WEEKDAYS[day]}
              </label>
              <div className="flex-1 space-y-2">
                {slots.length === 0 && <p className="pt-2.5 text-sm text-slate-400">Fermé</p>}
                {slots.map((s, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <Input className="w-28" type="time" disabled={!canManage} value={s.opensAt} onChange={(e) => setDay(day, slots.map((x, j) => (j === i ? { ...x, opensAt: e.target.value } : x)))} />
                    <span className="text-slate-400">→</span>
                    <Input className="w-28" type="time" disabled={!canManage} value={s.closesAt} onChange={(e) => setDay(day, slots.map((x, j) => (j === i ? { ...x, closesAt: e.target.value } : x)))} />
                    {canManage && slots.length > 1 && (
                      <button type="button" className="p-1 text-slate-400" aria-label="Retirer ce créneau" onClick={() => setDay(day, slots.filter((_, j) => j !== i))}>
                        <Trash2 className="h-4 w-4" />
                      </button>
                    )}
                  </div>
                ))}
                {canManage && slots.length > 0 && slots.length < 3 && (
                  <button type="button" className="inline-flex items-center gap-1 text-xs font-semibold text-brand-light" onClick={() => setDay(day, [...slots, { opensAt: '18:00', closesAt: '23:00' }])}>
                    <Plus className="h-3.5 w-3.5" /> Créneau (ex. midi et soir)
                  </button>
                )}
              </div>
            </div>
          );
        })}
        <p className="text-xs text-slate-500">Un créneau qui se termine après minuit (ex. 18:00 → 02:00) est accepté. Sans aucun horaire, le commerce est considéré comme toujours ouvert.</p>
        {canManage && (
          <Button block loading={busy} onClick={save}>
            Enregistrer les horaires
          </Button>
        )}
        {saved && <Alert tone="green">Horaires enregistrés.</Alert>}
      </Card>

      <Card className="space-y-3">
        <h2 className="font-semibold text-brand">Fermetures exceptionnelles</h2>
        {merchant.closures.length === 0 && <p className="text-sm text-slate-500">Aucune fermeture prévue (fêtes, congés, travaux…).</p>}
        {merchant.closures.map((c) => (
          <div key={c.id} className="flex items-center justify-between rounded-xl bg-slate-50 px-3 py-2 text-sm">
            <span>
              {dateTime(c.startsAt)} → {dateTime(c.endsAt)}
              {c.reason && <span className="block text-xs text-slate-500">{c.reason}</span>}
            </span>
            {canManage && (
              <button type="button" className="p-1 text-slate-400 hover:text-red-600" aria-label="Supprimer" onClick={() => run(() => call(`closures/${c.id}`, { method: 'DELETE' }))}>
                <Trash2 className="h-4 w-4" />
              </button>
            )}
          </div>
        ))}
        {canManage && (
          <div className="space-y-2 border-t border-slate-100 pt-3">
            <div className="grid gap-2 sm:grid-cols-2">
              <Field label="Du">
                <Input type="datetime-local" value={closure.startsAt} onChange={(e) => setClosure({ ...closure, startsAt: e.target.value })} />
              </Field>
              <Field label="Au">
                <Input type="datetime-local" value={closure.endsAt} onChange={(e) => setClosure({ ...closure, endsAt: e.target.value })} />
              </Field>
            </div>
            <Input placeholder="Raison (ex. Tabaski)" maxLength={200} value={closure.reason} onChange={(e) => setClosure({ ...closure, reason: e.target.value })} />
            <Button
              variant="secondary"
              disabled={!closure.startsAt || !closure.endsAt}
              onClick={() =>
                run(async () => {
                  const m = await call<MerchantSpace>('closures', {
                    body: { startsAt: new Date(closure.startsAt).toISOString(), endsAt: new Date(closure.endsAt).toISOString(), reason: closure.reason.trim() || undefined },
                  });
                  setClosure({ startsAt: '', endsAt: '', reason: '' });
                  return m;
                })
              }
            >
              Ajouter la fermeture
            </Button>
          </div>
        )}
      </Card>
      <Alert>{error}</Alert>
    </div>
  );
}
