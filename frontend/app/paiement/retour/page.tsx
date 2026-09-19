'use client';

import { Suspense, useEffect, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { SiteHeader } from '@/components/site-header';
import { SiteFooter } from '@/components/site-footer';
import { useRequireAuth } from '@/lib/use-require-auth';
import { api } from '@/lib/api';
import { formatFcfa } from '@/lib/format';

type TransactionStatus = 'EN_ATTENTE' | 'CONFIRME' | 'ECHEC' | 'ANNULE';

function PaiementRetourContent() {
  const { user, loading } = useRequireAuth(['CLIENT']);
  const params = useSearchParams();
  const type = params.get('type') === 'invoice' ? 'invoices' : 'quotes';
  const id = params.get('id');

  const [status, setStatus] = useState<TransactionStatus | 'INTROUVABLE' | null>(null);
  const [amount, setAmount] = useState<number | null>(null);
  const [attempts, setAttempts] = useState(0);

  useEffect(() => {
    if (loading || !user || !id) return;
    let cancelled = false;

    async function poll() {
      try {
        const { data } = await api.get(`/online-payments/${type}/${id}/status`);
        if (cancelled) return;
        if (!data) {
          setStatus('INTROUVABLE');
          return;
        }
        setStatus(data.status);
        setAmount(Number(data.amount));
        if (data.status === 'EN_ATTENTE' && attempts < 8) {
          setTimeout(() => setAttempts((a) => a + 1), 2500);
        }
      } catch {
        if (!cancelled) setStatus('INTROUVABLE');
      }
    }
    poll();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, user, id, attempts]);

  if (loading || !user) return <p className="p-10 text-center text-slate-400">Chargement...</p>;

  return (
    <div className="mx-auto max-w-md px-4 py-16 text-center">
      <div className="card">
        {status === 'CONFIRME' && (
          <>
            <div className="text-4xl">✅</div>
            <h1 className="mt-3 text-xl font-bold text-brand-blue">Paiement confirmé !</h1>
            {amount !== null && <p className="mt-2 text-sm text-slate-600">Montant reçu : {formatFcfa(amount)}</p>}
            <p className="mt-1 text-sm text-slate-500">Votre reçu est disponible dans votre espace client.</p>
          </>
        )}
        {status === 'EN_ATTENTE' && (
          <>
            <div className="text-4xl">⏳</div>
            <h1 className="mt-3 text-xl font-bold text-brand-blue">Vérification du paiement en cours...</h1>
            <p className="mt-2 text-sm text-slate-500">
              Cela peut prendre quelques instants. Si rien ne se passe, vérifiez votre espace client dans un moment.
            </p>
          </>
        )}
        {status === 'ECHEC' && (
          <>
            <div className="text-4xl">❌</div>
            <h1 className="mt-3 text-xl font-bold text-red-600">Le paiement n&apos;a pas abouti</h1>
            <p className="mt-2 text-sm text-slate-500">Vous pouvez réessayer depuis votre espace client.</p>
          </>
        )}
        {(status === 'INTROUVABLE' || status === null) && (
          <>
            <div className="text-4xl">ℹ️</div>
            <h1 className="mt-3 text-xl font-bold text-brand-blue">Statut du paiement indisponible</h1>
            <p className="mt-2 text-sm text-slate-500">Consultez votre espace client pour le suivi de vos devis et factures.</p>
          </>
        )}

        <Link href="/espace-client" className="btn-primary mt-6 inline-block w-full">
          Aller à mon espace
        </Link>
      </div>
    </div>
  );
}

export default function PaiementRetourPage() {
  return (
    <div className="min-h-screen">
      <SiteHeader />
      <Suspense fallback={<p className="p-10 text-center text-slate-400">Chargement...</p>}>
        <PaiementRetourContent />
      </Suspense>
      <SiteFooter />
    </div>
  );
}
