'use client';

import { useMutation } from '@tanstack/react-query';
import { FlaskConical } from 'lucide-react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense } from 'react';
import { Button, Card, ErrorMessage, Spinner } from '@/components/ui';
import { post } from '@/lib/api';
import { money } from '@/lib/format';

/**
 * Simulateur d'agrégateur (PAYMENT_PROVIDER=sandbox, jamais en production) : remplace la
 * page de paiement CinetPay pour tester tout le parcours sans argent réel.
 */
function Sandbox() {
  const params = useSearchParams();
  const router = useRouter();
  const transaction = params.get('transaction') ?? '';
  const amount = Number(params.get('montant') ?? 0);
  // Comme un vrai agrégateur, retour vers l'adresse fournie ; seul le chemin est gardé (pas de redirection externe).
  const back = (() => {
    try {
      const url = new URL(params.get('retour') ?? '/abonnement', typeof window === 'undefined' ? 'http://localhost' : window.location.origin);
      return url.pathname + url.search;
    } catch {
      return '/abonnement';
    }
  })();
  const pay = useMutation({
    mutationFn: (outcome: 'SUCCEEDED' | 'FAILED') => post(`/billing/sandbox/${encodeURIComponent(transaction)}/complete`, { outcome }),
    onSuccess: () => router.replace(back),
  });

  return (
    <Card>
      <div className="flex items-center gap-2 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900">
        <FlaskConical className="h-4 w-4" aria-hidden /> Paiement simulé — environnement de test, aucun argent n’est prélevé.
      </div>
      <p className="mt-4 text-sm text-stone-500">Montant à payer</p>
      <p className="text-3xl font-semibold tabular-nums text-stone-900">{money(amount)}</p>
      <p className="mt-1 break-all text-xs text-stone-400">Transaction {transaction}</p>
      <div className="mt-3">
        <ErrorMessage error={pay.error} />
      </div>
      <div className="mt-6 flex flex-wrap gap-2">
        <Button loading={pay.isPending && pay.variables === 'SUCCEEDED'} disabled={pay.isPending} onClick={() => pay.mutate('SUCCEEDED')}>
          Simuler un paiement réussi
        </Button>
        <Button variant="secondary" loading={pay.isPending && pay.variables === 'FAILED'} disabled={pay.isPending} onClick={() => pay.mutate('FAILED')}>
          Simuler un refus
        </Button>
      </div>
    </Card>
  );
}

export default function SandboxPage() {
  return (
    <div className="mx-auto max-w-md">
      <Suspense fallback={<Spinner />}>
        <Sandbox />
      </Suspense>
    </div>
  );
}
