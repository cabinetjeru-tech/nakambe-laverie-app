'use client';

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { CheckCircle2, Clock, XCircle } from 'lucide-react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Suspense, useEffect } from 'react';
import { Card, ErrorMessage, Spinner } from '@/components/ui';
import { get, refreshSession } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { money } from '@/lib/format';

interface PaymentStatus {
  id: string;
  status: 'PENDING' | 'SUCCEEDED' | 'FAILED' | 'CANCELLED';
  amount: number;
  currency: string;
  failureReason: string | null;
  invoice: { id: string; number: string; status: string };
}

/** Retour de la page de paiement : l'état est revérifié auprès de l'agrégateur jusqu'à confirmation. */
function PaymentReturn() {
  const id = useSearchParams().get('paiement');
  const queryClient = useQueryClient();
  const { reload } = useAuth();
  const payment = useQuery({
    queryKey: ['billing-payment', id],
    queryFn: () => get<PaymentStatus>(`/billing/payments/${id}`),
    enabled: !!id,
    refetchInterval: (query) => (query.state.data?.status === 'PENDING' ? 4_000 : false),
  });
  const status = payment.data?.status;

  useEffect(() => {
    if (status !== 'SUCCEEDED') return;
    for (const key of ['billing', 'billing-invoices', 'billing-status', 'notifications-count']) queryClient.invalidateQueries({ queryKey: [key] });
    // L'offre a pu changer (passage à une offre supérieure) : droits rafraîchis.
    refreshSession().then(() => reload().catch(() => undefined));
  }, [status, queryClient, reload]);

  if (!id) return <ErrorMessage error="Paiement introuvable." />;
  if (payment.isLoading) return <Spinner label="Vérification du paiement…" />;
  if (payment.error || !payment.data) return <ErrorMessage error={payment.error} />;
  const p = payment.data;

  return (
    <Card>
      <div className="flex flex-col items-center py-6 text-center">
        {p.status === 'SUCCEEDED' && <CheckCircle2 className="h-12 w-12 text-emerald-600" aria-hidden />}
        {p.status === 'PENDING' && <Clock className="h-12 w-12 text-amber-500" aria-hidden />}
        {(p.status === 'FAILED' || p.status === 'CANCELLED') && <XCircle className="h-12 w-12 text-red-600" aria-hidden />}
        <h1 className="mt-3 text-lg font-semibold text-stone-900">
          {p.status === 'SUCCEEDED' && 'Paiement confirmé, merci !'}
          {p.status === 'PENDING' && 'Paiement en cours de confirmation…'}
          {(p.status === 'FAILED' || p.status === 'CANCELLED') && 'Le paiement n’a pas abouti'}
        </h1>
        <p className="mt-1 text-sm text-stone-600">
          {money(p.amount, p.currency)} · facture {p.invoice.number}
          {p.failureReason && p.status !== 'SUCCEEDED' ? ` · ${p.failureReason}` : ''}
        </p>
        {p.status === 'PENDING' && <p className="mt-2 text-xs text-stone-500">Cette page se met à jour automatiquement.</p>}
        <Link href="/abonnement" className="mt-5 inline-flex h-10 items-center rounded-lg bg-brand-600 px-4 text-sm font-medium text-white hover:bg-brand-700">
          {p.status === 'FAILED' ? 'Réessayer' : 'Retour à l’abonnement'}
        </Link>
      </div>
    </Card>
  );
}

export default function PaymentReturnPage() {
  return (
    <div className="mx-auto max-w-lg">
      <Suspense fallback={<Spinner />}>
        <PaymentReturn />
      </Suspense>
    </div>
  );
}
