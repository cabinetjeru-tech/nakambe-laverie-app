'use client';

import { Suspense, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { useAuth, getRoleHomePath } from '@/lib/auth-context';
import { SiteHeader } from '@/components/site-header';
import { SiteFooter } from '@/components/site-footer';
import { COMPANY } from '@/lib/constants';

function ConnexionForm() {
  const { login } = useAuth();
  const router = useRouter();
  const params = useSearchParams();
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const user = await login(phone, password);
      const redirect = params.get('redirect');
      if (redirect) router.push(redirect);
      else router.push(getRoleHomePath(user.role));
    } catch (err: any) {
      setError(err?.response?.data?.message ?? 'Identifiants incorrects.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="mx-auto flex max-w-md flex-col px-4 py-16">
      <h1 className="text-2xl font-bold text-brand-blue">Connexion</h1>
      <p className="mt-1 text-sm text-slate-500">Accédez à votre espace {COMPANY.name}.</p>

      <form onSubmit={handleSubmit} className="card mt-6 flex flex-col gap-4">
        <div>
          <label className="label">Numéro de téléphone</label>
          <input
            className="input"
            placeholder="+226 XX XX XX XX"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            required
          />
        </div>
        <div>
          <label className="label">Mot de passe</label>
          <input
            type="password"
            className="input"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
        </div>
        {error && <p className="text-sm text-red-600">{error}</p>}
        <button type="submit" disabled={loading} className="btn-primary w-full disabled:opacity-60">
          {loading ? 'Connexion...' : 'Se connecter'}
        </button>
      </form>

      <p className="mt-4 text-center text-sm text-slate-500">
        Pas encore de compte ?{' '}
        <Link href="/inscription" className="font-semibold text-brand-blue">
          Créer un compte client
        </Link>
      </p>
    </div>
  );
}

export default function ConnexionPage() {
  return (
    <div className="min-h-screen">
      <SiteHeader />
      <Suspense fallback={<p className="p-10 text-center text-slate-400">Chargement...</p>}>
        <ConnexionForm />
      </Suspense>
      <SiteFooter />
    </div>
  );
}
