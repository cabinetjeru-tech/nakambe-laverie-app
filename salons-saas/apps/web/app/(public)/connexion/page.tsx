'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { FormEvent, useEffect, useState } from 'react';
import { Button, ErrorMessage, Field, Input } from '@/components/ui';
import { useAuth } from '@/lib/auth';

export default function LoginPage() {
  const { login, status } = useAuth();
  const router = useRouter();
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<unknown>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (status === 'authenticated') router.replace('/tableau-de-bord');
  }, [status, router]);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setLoading(true);
    setError(null);
    try {
      await login(identifier, password);
      router.replace('/tableau-de-bord');
    } catch (e) {
      setError(e);
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <h1 className="text-xl font-semibold text-stone-900">Connexion</h1>
      <Field label="Téléphone ou email">
        {(id) => <Input id={id} value={identifier} onChange={(e) => setIdentifier(e.target.value)} autoComplete="username" placeholder="70 12 34 56" required />}
      </Field>
      <Field label="Mot de passe">
        {(id) => <Input id={id} type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" required />}
      </Field>
      <ErrorMessage error={error} />
      <Button type="submit" loading={loading} className="w-full">
        Se connecter
      </Button>
      <div className="flex justify-between text-sm">
        <Link href="/mot-de-passe" className="text-brand-700 hover:underline">
          Mot de passe oublié ?
        </Link>
        <Link href="/inscription" className="text-brand-700 hover:underline">
          Créer mon salon
        </Link>
      </div>
    </form>
  );
}
