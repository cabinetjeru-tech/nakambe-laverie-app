'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '@/lib/auth-context';
import { SiteHeader } from '@/components/site-header';
import { SiteFooter } from '@/components/site-footer';

export default function InscriptionPage() {
  const { registerClient } = useAuth();
  const router = useRouter();
  const [form, setForm] = useState({ fullName: '', phone: '', password: '', address: '', district: '' });
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  function update<K extends keyof typeof form>(key: K, value: string) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await registerClient(form);
      router.push('/espace-client');
    } catch (err: any) {
      setError(err?.response?.data?.message ?? 'Impossible de créer le compte.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen">
      <SiteHeader />
      <div className="mx-auto flex max-w-md flex-col px-4 py-16">
        <h1 className="text-2xl font-bold text-brand-blue">Créer un compte client</h1>
        <p className="mt-1 text-sm text-slate-500">Rejoignez Nakambé pour commander et suivre vos prestations.</p>

        <form onSubmit={handleSubmit} className="card mt-6 flex flex-col gap-4">
          <div>
            <label className="label">Nom complet</label>
            <input className="input" value={form.fullName} onChange={(e) => update('fullName', e.target.value)} required />
          </div>
          <div>
            <label className="label">Téléphone</label>
            <input className="input" placeholder="+226 XX XX XX XX" value={form.phone} onChange={(e) => update('phone', e.target.value)} required />
          </div>
          <div>
            <label className="label">Mot de passe</label>
            <input type="password" className="input" minLength={6} value={form.password} onChange={(e) => update('password', e.target.value)} required />
          </div>
          <div>
            <label className="label">Quartier</label>
            <input className="input" value={form.district} onChange={(e) => update('district', e.target.value)} />
          </div>
          <div>
            <label className="label">Adresse</label>
            <input className="input" value={form.address} onChange={(e) => update('address', e.target.value)} />
          </div>
          {error && <p className="text-sm text-red-600">{error}</p>}
          <button type="submit" disabled={loading} className="btn-primary w-full disabled:opacity-60">
            {loading ? 'Création...' : 'Créer mon compte'}
          </button>
        </form>

        <p className="mt-4 text-center text-sm text-slate-500">
          Déjà client ?{' '}
          <Link href="/connexion" className="font-semibold text-brand-blue">
            Se connecter
          </Link>
        </p>
      </div>
      <SiteFooter />
    </div>
  );
}
