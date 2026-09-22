'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { FormEvent, useState } from 'react';
import { AuthShell } from '@/components/auth-shell';
import { PhoneInput } from '@/components/phone-input';
import { Alert, Button, Field, Input } from '@/components/ui';
import { useAuth } from '@/lib/auth';

export default function RegisterPage() {
  const { register } = useAuth();
  const router = useRouter();
  const [form, setForm] = useState({ firstName: '', lastName: '', phone: '', pin: '', pin2: '' });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const set = (k: keyof typeof form) => (v: string) => setForm((f) => ({ ...f, [k]: v }));

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (form.pin !== form.pin2) return setError('Les deux codes secrets ne sont pas identiques.');
    setBusy(true);
    setError(null);
    try {
      await register({ firstName: form.firstName, lastName: form.lastName, phone: form.phone, pin: form.pin, accountType: 'CLIENT' });
      router.replace('/accueil');
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <AuthShell
      title="Créer mon compte"
      subtitle="Gratuit, en moins d’une minute."
      footer={
        <>
          Déjà inscrit ? <Link href="/connexion" className="font-semibold text-white underline">Se connecter</Link>
        </>
      }
    >
      <form onSubmit={submit} className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <Field label="Prénom">
            <Input value={form.firstName} onChange={(e) => set('firstName')(e.target.value)} required maxLength={60} autoComplete="given-name" />
          </Field>
          <Field label="Nom">
            <Input value={form.lastName} onChange={(e) => set('lastName')(e.target.value)} required maxLength={60} autoComplete="family-name" />
          </Field>
        </div>
        <Field label="Numéro de téléphone">
          <PhoneInput value={form.phone} onChange={set('phone')} required />
        </Field>
        <Field label="Choisissez un code secret" hint="4 à 6 chiffres, pas de suite (1234) ni de chiffres identiques.">
          <Input type="password" inputMode="numeric" pattern="\d{4,6}" maxLength={6} value={form.pin} onChange={(e) => set('pin')(e.target.value.replace(/\D/g, ''))} required autoComplete="new-password" />
        </Field>
        <Field label="Confirmez le code secret">
          <Input type="password" inputMode="numeric" maxLength={6} value={form.pin2} onChange={(e) => set('pin2')(e.target.value.replace(/\D/g, ''))} required autoComplete="new-password" />
        </Field>
        <Alert>{error}</Alert>
        <Button type="submit" block size="lg" loading={busy}>
          Créer mon compte
        </Button>
        <p className="text-center text-xs text-slate-500">Ne communiquez jamais votre code secret, même au livreur.</p>
      </form>
    </AuthShell>
  );
}
