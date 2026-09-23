'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { FormEvent, useState } from 'react';
import { Button, ErrorMessage, Field, Input } from '@/components/ui';
import { useAuth } from '@/lib/auth';

export default function SignupPage() {
  const { signup } = useAuth();
  const router = useRouter();
  const [form, setForm] = useState({ fullName: '', phone: '', email: '', password: '', businessName: '', salonName: '', city: '' });
  const [error, setError] = useState<unknown>(null);
  const [loading, setLoading] = useState(false);
  const set = (key: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) => setForm({ ...form, [key]: e.target.value });

  async function submit(event: FormEvent) {
    event.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const payload: Record<string, string> = { ...form, salonName: form.salonName || form.businessName };
      if (!payload.email) delete payload.email;
      await signup(payload);
      router.replace('/tableau-de-bord');
    } catch (e) {
      setError(e);
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold text-stone-900">Créer mon salon</h1>
        <p className="text-sm text-stone-500">30 jours d’essai gratuit, sans engagement.</p>
      </div>
      <Field label="Nom du salon">{(id) => <Input id={id} value={form.businessName} onChange={set('businessName')} required minLength={2} />}</Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Ville">{(id) => <Input id={id} value={form.city} onChange={set('city')} required minLength={2} />}</Field>
        <Field label="Nom de l’établissement" hint="Si différent">
          {(id) => <Input id={id} value={form.salonName} onChange={set('salonName')} />}
        </Field>
      </div>
      <Field label="Votre nom complet">{(id) => <Input id={id} value={form.fullName} onChange={set('fullName')} autoComplete="name" required minLength={2} />}</Field>
      <Field label="Téléphone">{(id) => <Input id={id} value={form.phone} onChange={set('phone')} autoComplete="tel" inputMode="tel" required />}</Field>
      <Field label="Email (facultatif)">{(id) => <Input id={id} type="email" value={form.email} onChange={set('email')} autoComplete="email" />}</Field>
      <Field label="Mot de passe" hint="8 caractères minimum">
        {(id) => <Input id={id} type="password" value={form.password} onChange={set('password')} autoComplete="new-password" required minLength={8} />}
      </Field>
      <ErrorMessage error={error} />
      <Button type="submit" loading={loading} className="w-full">
        Créer mon salon
      </Button>
      <p className="text-center text-sm">
        Déjà inscrit ?{' '}
        <Link href="/connexion" className="text-brand-700 hover:underline">
          Se connecter
        </Link>
      </p>
    </form>
  );
}
