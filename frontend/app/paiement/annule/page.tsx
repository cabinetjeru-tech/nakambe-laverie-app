'use client';

import Link from 'next/link';
import { SiteHeader } from '@/components/site-header';
import { SiteFooter } from '@/components/site-footer';

export default function PaiementAnnulePage() {
  return (
    <div className="min-h-screen">
      <SiteHeader />
      <div className="mx-auto max-w-md px-4 py-16 text-center">
        <div className="card">
          <div className="text-4xl">🚫</div>
          <h1 className="mt-3 text-xl font-bold text-brand-blue">Paiement annulé</h1>
          <p className="mt-2 text-sm text-slate-500">
            Vous n&apos;avez pas été débité. Vous pouvez réessayer à tout moment depuis votre espace client.
          </p>
          <Link href="/espace-client" className="btn-primary mt-6 inline-block w-full">
            Retour à mon espace
          </Link>
        </div>
      </div>
      <SiteFooter />
    </div>
  );
}
