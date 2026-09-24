'use client';

import { useQuery } from '@tanstack/react-query';
import clsx from 'clsx';
import { AlertTriangle, Clock, Lock } from 'lucide-react';
import Link from 'next/link';
import { get } from '@/lib/api';
import { BillingStatus } from '@/lib/billing';
import { date, money } from '@/lib/format';

export function useBillingStatus() {
  return useQuery({ queryKey: ['billing-status'], queryFn: () => get<BillingStatus | null>('/billing/status'), refetchInterval: 5 * 60_000 });
}

/**
 * Bandeau d'état de l'abonnement, en haut de chaque écran : fin d'essai proche, facture
 * impayée (délai de grâce), salon en lecture seule. Icône + texte : jamais la couleur seule.
 */
export function BillingBanner() {
  const { data } = useBillingStatus();
  if (!data) return null;

  let tone: 'info' | 'warning' | 'danger' | null = null;
  let Icon = Clock;
  let text = '';
  const days = data.daysLeft ?? 0;
  const dayWord = days <= 1 ? (days === 1 ? 'demain' : "aujourd'hui") : `dans ${days} jours`;

  if (data.tenantStatus === 'SUSPENDED') {
    tone = 'danger';
    Icon = Lock;
    text = `Salon en consultation seule${data.suspensionReason ? ` (${data.suspensionReason.toLowerCase()})` : ''}. Vos données sont conservées : réglez votre facture pour tout réactiver immédiatement.`;
  } else if (data.tenantStatus === 'CANCELLED') {
    tone = 'danger';
    Icon = Lock;
    text = 'Abonnement résilié : salon en consultation seule. Réabonnez-vous pour reprendre là où vous en étiez.';
  } else if (data.tenantStatus === 'PAST_DUE') {
    tone = 'warning';
    Icon = AlertTriangle;
    text = `Facture impayée${data.openInvoice ? ` (${money(data.openInvoice.total, data.openInvoice.currency)})` : ''} : réglez-la avant le ${date(data.graceEndsAt!)} pour éviter le passage en consultation seule.`;
  } else if (data.subscriptionStatus === 'TRIALING' && days <= 7) {
    tone = 'info';
    text = `Votre essai gratuit se termine ${dayWord} (${date(data.currentPeriodEnd!)}). Choisissez votre offre pour continuer sans interruption.`;
  } else if (data.cancelAtPeriodEnd && data.currentPeriodEnd) {
    tone = 'info';
    text = `Résiliation programmée : le salon passera en consultation seule le ${date(data.currentPeriodEnd)}.`;
  } else if (data.openInvoice && days <= 3 && data.subscriptionStatus === 'ACTIVE') {
    tone = 'info';
    text = `Facture ${data.openInvoice.number} à régler ${dayWord}.`;
  }
  if (!tone) return null;

  return (
    <div
      role={tone === 'danger' ? 'alert' : 'status'}
      className={clsx(
        'flex items-start gap-2 border-b px-4 py-2 text-sm lg:px-8 print:hidden',
        tone === 'info' && 'border-blue-100 bg-blue-50 text-blue-900',
        tone === 'warning' && 'border-amber-200 bg-amber-50 text-amber-900',
        tone === 'danger' && 'border-red-200 bg-red-50 text-red-900',
      )}
    >
      <Icon className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
      <p className="flex-1">
        {text}{' '}
        {data.canManage ? (
          <Link href="/abonnement" className="whitespace-nowrap font-semibold underline underline-offset-2">
            {data.tenantStatus === 'CANCELLED' ? 'Se réabonner' : data.subscriptionStatus === 'TRIALING' ? 'Choisir mon offre' : 'Voir mon abonnement'}
          </Link>
        ) : (
          <span className="text-xs opacity-80">Prévenez le responsable du salon.</span>
        )}
      </p>
    </div>
  );
}
