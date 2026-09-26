'use client';

import clsx from 'clsx';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { FormEvent, useState } from 'react';
import { AuthShell } from '@/components/auth-shell';
import { PhoneInput } from '@/components/phone-input';
import { Alert, Button, Field, Input, Select } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import type { City } from '@/lib/types';
import { useApi } from '@/lib/use-api';

export default function DriverSignupPage() {
  const { register } = useAuth();
  const router = useRouter();
  const cities = useApi<City[]>('/cities');
  const [form, setForm] = useState({ firstName: '', lastName: '', phone: '', pin: '', pin2: '', cityId: '', vehicleType: 'MOTO', plateNumber: '' });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const set = (k: keyof typeof form, v: string) => setForm((f) => ({ ...f, [k]: v }));

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (form.pin !== form.pin2) return setError('Les deux codes secrets ne sont pas identiques.');
    const cityId = form.cityId || cities.data?.[0]?.id;
    if (!cityId) return setError('Choisissez votre ville.');
    setBusy(true);
    setError(null);
    try {
      await register({
        firstName: form.firstName,
        lastName: form.lastName,
        phone: form.phone,
        pin: form.pin,
        accountType: 'DRIVER',
        driver: { cityId, vehicleType: form.vehicleType, plateNumber: form.plateNumber || undefined },
      });
      router.replace('/livreur');
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <AuthShell
      title="Devenir livreur"
      subtitle="Inscrivez-vous, envoyez vos documents : l’équipe valide votre compte."
      suffix="LIVREUR"
      footer={
        <>
          Déjà inscrit ? <Link href="/connexion?next=/livreur" className="font-semibold text-white underline">Se connecter</Link>
        </>
      }
    >
      <form onSubmit={submit} className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <Field label="Prénom">
            <Input value={form.firstName} onChange={(e) => set('firstName', e.target.value)} required maxLength={60} />
          </Field>
          <Field label="Nom">
            <Input value={form.lastName} onChange={(e) => set('lastName', e.target.value)} required maxLength={60} />
          </Field>
        </div>
        <Field label="Numéro de téléphone">
          <PhoneInput value={form.phone} onChange={(v) => set('phone', v)} required />
        </Field>
        <Field label="Ville">
          <Select value={form.cityId} onChange={(e) => set('cityId', e.target.value)}>
            {cities.data?.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </Select>
        </Field>
        <Field label="Véhicule">
          <div className="grid grid-cols-2 gap-2">
            {[
              ['MOTO', 'Moto'],
              ['TRICYCLE', 'Tricycle'],
            ].map(([code, label]) => (
              <button key={code} type="button" onClick={() => set('vehicleType', code)} className={clsx('rounded-xl border p-3 font-semibold', form.vehicleType === code ? 'border-brand-light bg-brand-sky text-brand' : 'border-slate-200 text-slate-600')}>
                {label}
              </button>
            ))}
          </div>
        </Field>
        <Field label="Immatriculation (facultatif)">
          <Input value={form.plateNumber} maxLength={20} onChange={(e) => set('plateNumber', e.target.value.toUpperCase())} placeholder="11 GJ 4521" />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Code secret" hint="4 à 6 chiffres">
            <Input type="password" inputMode="numeric" maxLength={6} value={form.pin} onChange={(e) => set('pin', e.target.value.replace(/\D/g, ''))} required />
          </Field>
          <Field label="Confirmation">
            <Input type="password" inputMode="numeric" maxLength={6} value={form.pin2} onChange={(e) => set('pin2', e.target.value.replace(/\D/g, ''))} required />
          </Field>
        </div>
        <Alert>{error}</Alert>
        <Button type="submit" block size="lg" variant="success" loading={busy}>
          Créer mon compte livreur
        </Button>
      </form>
    </AuthShell>
  );
}
