'use client';

import { Suspense, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { SiteHeader } from '@/components/site-header';
import { SiteFooter } from '@/components/site-footer';
import { useRequireAuth } from '@/lib/use-require-auth';
import { api } from '@/lib/api';
import { SERVICE_DOMAIN_LABELS } from '@/lib/constants';

const DOMAINS = Object.entries(SERVICE_DOMAIN_LABELS).filter(([key]) => key !== 'MOBILE');

function NouvelleDemandeForm() {
  const { user, loading } = useRequireAuth(['CLIENT']);
  const router = useRouter();
  const params = useSearchParams();

  const [domain, setDomain] = useState(params.get('domaine') ?? 'LAVERIE_PRESSING');
  const [mode, setMode] = useState(params.get('mode') ?? 'A_DOMICILE');
  const [scheduledDate, setScheduledDate] = useState('');
  const [address, setAddress] = useState('');
  const [quantityNote, setQuantityNote] = useState('');
  const [comment, setComment] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);

  if (loading || !user) {
    return <p className="p-10 text-center text-slate-400">Chargement...</p>;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await api.post('/appointments', {
        domain,
        mode,
        scheduledDate: new Date(scheduledDate).toISOString(),
        address: mode === 'A_DOMICILE' ? address : undefined,
        quantityNote,
        comment,
      });
      setSuccess(true);
    } catch (err: any) {
      setError(err?.response?.data?.message ?? "Impossible d'envoyer votre demande. Réessayez.");
    } finally {
      setSubmitting(false);
    }
  }

  if (success) {
    return (
      <div className="mx-auto max-w-lg px-4 py-16 text-center">
        <div className="card">
          <div className="text-4xl">✅</div>
          <h1 className="mt-3 text-xl font-bold text-brand-blue">Votre demande a bien été envoyée !</h1>
          <p className="mt-2 text-sm text-slate-600">
            Notre équipe va la confirmer rapidement. Vous pouvez suivre son évolution depuis votre espace client.
          </p>
          <button className="btn-primary mt-6" onClick={() => router.push('/espace-client')}>
            Aller à mon espace
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-lg px-4 py-10">
      <h1 className="text-2xl font-bold text-brand-blue">Nouvelle demande</h1>
      <p className="mt-1 text-sm text-slate-500">
        Décrivez votre besoin, nous vous confirmons le rendez-vous rapidement.
      </p>

      <form onSubmit={handleSubmit} className="card mt-6 flex flex-col gap-4">
        <div>
          <label className="label">1. Quel service ?</label>
          <select className="input" value={domain} onChange={(e) => setDomain(e.target.value)}>
            {DOMAINS.map(([key, label]) => (
              <option key={key} value={key}>
                {label}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="label">2. À domicile ou au siège ?</label>
          <div className="grid grid-cols-2 gap-2">
            {[
              ['A_DOMICILE', 'À domicile'],
              ['AU_SIEGE', 'Au siège'],
            ].map(([value, label]) => (
              <button
                type="button"
                key={value}
                onClick={() => setMode(value)}
                className={`rounded-lg border-2 px-3 py-2.5 text-sm font-semibold ${
                  mode === value ? 'border-brand-blue bg-brand-blue-light text-brand-blue' : 'border-slate-200 text-slate-500'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        <div>
          <label className="label">3. Date et heure souhaitées</label>
          <input
            type="datetime-local"
            className="input"
            value={scheduledDate}
            onChange={(e) => setScheduledDate(e.target.value)}
            required
          />
        </div>

        {mode === 'A_DOMICILE' && (
          <div>
            <label className="label">4. Votre adresse</label>
            <input
              className="input"
              placeholder="Quartier, repère..."
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              required
            />
          </div>
        )}

        <div>
          <label className="label">Quantité estimée (facultatif)</label>
          <input
            className="input"
            placeholder="Ex : 10 pièces, un divan 6 places..."
            value={quantityNote}
            onChange={(e) => setQuantityNote(e.target.value)}
          />
        </div>

        <div>
          <label className="label">Commentaire (facultatif)</label>
          <textarea className="input" rows={3} value={comment} onChange={(e) => setComment(e.target.value)} />
        </div>

        {error && <p className="text-sm text-red-600">{error}</p>}

        <button type="submit" disabled={submitting} className="btn-primary w-full disabled:opacity-60">
          {submitting ? 'Envoi...' : 'Envoyer ma demande'}
        </button>
      </form>
    </div>
  );
}

export default function NouvelleDemandePage() {
  return (
    <div className="min-h-screen">
      <SiteHeader />
      <Suspense fallback={<p className="p-10 text-center text-slate-400">Chargement...</p>}>
        <NouvelleDemandeForm />
      </Suspense>
      <SiteFooter />
    </div>
  );
}
