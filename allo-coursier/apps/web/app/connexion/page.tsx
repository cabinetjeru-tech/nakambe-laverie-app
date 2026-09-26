'use client';

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { FormEvent, Suspense, useState } from 'react';
import { AuthShell } from '@/components/auth-shell';
import { PhoneInput } from '@/components/phone-input';
import { Alert, Button, Field, Input } from '@/components/ui';
import { homeFor, useAuth } from '@/lib/auth';

function LoginForm() {
  const { login } = useAuth();
  const router = useRouter();
  const params = useSearchParams();
  const next = params.get('next');
  const isDriver = next?.startsWith('/livreur');
  const isAdmin = next?.startsWith('/admin');
  const [phone, setPhone] = useState('');
  const [secret, setSecret] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const user = await login(phone, secret);
      router.replace(next && next.startsWith('/') ? next : homeFor(user));
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <AuthShell
      title={isAdmin ? 'Administration' : isDriver ? 'Espace livreur' : 'Connexion'}
      subtitle={isAdmin ? 'Connectez-vous avec votre compte d’équipe.' : 'Entrez votre numéro et votre code secret.'}
      suffix={isDriver ? 'LIVREUR' : undefined}
      footer={
        isAdmin ? null : isDriver ? (
          <>
            Pas encore livreur ? <Link href="/livreur/inscription" className="font-semibold text-white underline">S’inscrire</Link>
          </>
        ) : (
          <>
            Pas encore de compte ? <Link href="/inscription" className="font-semibold text-white underline">Créer un compte</Link>
          </>
        )
      }
    >
      <form onSubmit={submit} className="space-y-4">
        <Field label="Numéro de téléphone">
          <PhoneInput value={phone} onChange={setPhone} required autoFocus />
        </Field>
        <Field label={isAdmin ? 'Mot de passe' : 'Code secret'} hint={isAdmin ? undefined : 'Code oublié ? Appelez le service client, qui vous en donnera un nouveau.'}>
          <Input
            type="password"
            inputMode={isAdmin ? 'text' : 'numeric'}
            autoComplete="current-password"
            value={secret}
            onChange={(e) => setSecret(e.target.value)}
            required
          />
        </Field>
        <Alert>{error}</Alert>
        <Button type="submit" block size="lg" loading={busy}>
          Se connecter
        </Button>
      </form>
    </AuthShell>
  );
}

export default function LoginPage() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  );
}
