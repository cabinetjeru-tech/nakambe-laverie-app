'use client';

import { useRouter } from 'next/navigation';
import { FormEvent, useEffect, useState } from 'react';
import { Button, ErrorMessage, Field, Input } from '@/components/ui';
import { post, Session } from '@/lib/api';
import { useAuth } from '@/lib/auth';

/** Le jeton est dans le fragment (#…) : il n'est jamais envoyé aux serveurs ni journalisé. */
export default function InvitationPage() {
  const { acceptSession } = useAuth();
  const router = useRouter();
  const [token, setToken] = useState('');
  const [fullName, setFullName] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<unknown>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    setToken(window.location.hash.slice(1));
  }, []);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const session = await post<Session>('/auth/invitations/accept', { token, password, ...(fullName ? { fullName } : {}) });
      await acceptSession(session);
      router.replace('/tableau-de-bord');
    } catch (e) {
      setError(e);
    } finally {
      setLoading(false);
    }
  }

  if (!token) return <p className="text-sm text-stone-600">Lien d’invitation incomplet : ouvrez le lien reçu en entier.</p>;

  return (
    <form onSubmit={submit} className="space-y-4">
      <h1 className="text-xl font-semibold text-stone-900">Rejoindre l’équipe</h1>
      <p className="text-sm text-stone-600">Nouveau compte : indiquez votre nom et choisissez un mot de passe. Vous avez déjà un compte : saisissez votre mot de passe actuel.</p>
      <Field label="Nom complet (nouveau compte)">{(id) => <Input id={id} value={fullName} onChange={(e) => setFullName(e.target.value)} autoComplete="name" />}</Field>
      <Field label="Mot de passe">{(id) => <Input id={id} type="password" value={password} onChange={(e) => setPassword(e.target.value)} required />}</Field>
      <ErrorMessage error={error} />
      <Button type="submit" loading={loading} className="w-full">
        Rejoindre
      </Button>
    </form>
  );
}
