'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { SiteHeader } from '@/components/site-header';
import { SiteFooter } from '@/components/site-footer';
import { useRequireAuth } from '@/lib/use-require-auth';
import { api, openAuthenticatedPdf } from '@/lib/api';
import { formatDate, formatFcfa } from '@/lib/format';
import { ORDER_STATUS_LABELS, SERVICE_DOMAIN_LABELS } from '@/lib/constants';

export default function EspaceClientPage() {
  const { user, loading } = useRequireAuth(['CLIENT']);
  const [payingId, setPayingId] = useState<string | null>(null);
  const [payError, setPayError] = useState<string | null>(null);

  async function payNow(type: 'quotes' | 'invoices', id: string) {
    setPayingId(id);
    setPayError(null);
    try {
      const { data } = await api.post(`/online-payments/${type}/${id}/pay`);
      window.location.href = data.paymentUrl;
    } catch (err: any) {
      setPayError(err?.response?.data?.message ?? 'Paiement indisponible pour le moment. Réessayez plus tard.');
      setPayingId(null);
    }
  }

  const ordersQuery = useQuery({
    queryKey: ['mes-commandes'],
    queryFn: async () => (await api.get('/orders/mine')).data,
    enabled: !!user,
  });
  const appointmentsQuery = useQuery({
    queryKey: ['mes-rdv'],
    queryFn: async () => (await api.get('/appointments/mine')).data,
    enabled: !!user,
  });
  const quotesQuery = useQuery({
    queryKey: ['mes-devis'],
    queryFn: async () => (await api.get('/quotes/mine')).data,
    enabled: !!user,
  });
  const invoicesQuery = useQuery({
    queryKey: ['mes-factures'],
    queryFn: async () => (await api.get('/invoices/mine')).data,
    enabled: !!user,
  });

  if (loading || !user) return <p className="p-10 text-center text-slate-400">Chargement...</p>;

  return (
    <div className="min-h-screen">
      <SiteHeader />
      <div className="mx-auto max-w-4xl px-4 py-10">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-brand-blue">Bonjour {user.fullName.split(' ')[0]} 👋</h1>
            <p className="text-sm text-slate-500">Voici le suivi de vos prestations Nakambé.</p>
          </div>
          <Link href="/nouvelle-demande" className="btn-primary !px-4 !py-2 text-sm">
            + Nouvelle demande
          </Link>
        </div>

        <section className="mt-8">
          <h2 className="mb-3 text-lg font-bold text-slate-800">Mes commandes</h2>
          <div className="flex flex-col gap-3">
            {ordersQuery.data?.length ? (
              ordersQuery.data.map((o: any) => (
                <div key={o.id} className="card flex items-center justify-between">
                  <div>
                    <div className="font-semibold text-brand-blue">{o.orderNumber}</div>
                    <div className="text-xs text-slate-500">
                      {SERVICE_DOMAIN_LABELS[o.domain] ?? o.domain} — {formatDate(o.createdAt)}
                    </div>
                  </div>
                  <div className="text-right">
                    <span className="badge bg-brand-gold-light text-brand-blue-dark">
                      {ORDER_STATUS_LABELS[o.status] ?? o.status}
                    </span>
                    <div className="mt-1 text-sm font-semibold">{formatFcfa(o.total)}</div>
                  </div>
                </div>
              ))
            ) : (
              <p className="text-sm text-slate-400">Aucune commande pour le moment.</p>
            )}
          </div>
        </section>

        <section className="mt-8">
          <h2 className="mb-3 text-lg font-bold text-slate-800">Mes rendez-vous</h2>
          <div className="flex flex-col gap-3">
            {appointmentsQuery.data?.length ? (
              appointmentsQuery.data.map((a: any) => (
                <div key={a.id} className="card flex items-center justify-between">
                  <div>
                    <div className="font-semibold text-brand-blue">
                      {SERVICE_DOMAIN_LABELS[a.domain] ?? a.domain}
                    </div>
                    <div className="text-xs text-slate-500">{formatDate(a.scheduledDate)}</div>
                  </div>
                  <span className="badge bg-slate-100 text-slate-600">{a.status}</span>
                </div>
              ))
            ) : (
              <p className="text-sm text-slate-400">Aucun rendez-vous pour le moment.</p>
            )}
          </div>
        </section>

        <section className="mt-8">
          <h2 className="mb-3 text-lg font-bold text-slate-800">Mes devis</h2>
          <div className="flex flex-col gap-3">
            {quotesQuery.data?.length ? (
              quotesQuery.data.map((q: any) => (
                <div key={q.id} className="card flex items-center justify-between">
                  <div>
                    <div className="font-semibold text-brand-blue">{q.quoteNumber}</div>
                    <div className="text-xs text-slate-500">{formatDate(q.createdAt)}</div>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="text-sm font-semibold">{formatFcfa(q.total)}</div>
                    <button
                      type="button"
                      className="text-sm font-semibold text-brand-blue underline"
                      onClick={() => openAuthenticatedPdf(`/quotes/${q.id}/pdf`)}
                    >
                      PDF
                    </button>
                    {q.status !== 'ACCEPTE' && q.status !== 'REFUSE' && q.status !== 'EXPIRE' && (
                      <button
                        type="button"
                        disabled={payingId === q.id}
                        className="btn-primary !px-3 !py-1.5 text-xs disabled:opacity-60"
                        onClick={() => payNow('quotes', q.id)}
                      >
                        {payingId === q.id ? '...' : 'Payer'}
                      </button>
                    )}
                  </div>
                </div>
              ))
            ) : (
              <p className="text-sm text-slate-400">Aucun devis pour le moment.</p>
            )}
            {payError && <p className="text-sm text-red-600">{payError}</p>}
          </div>
        </section>

        <section className="mt-8 mb-16">
          <h2 className="mb-3 text-lg font-bold text-slate-800">Mes factures</h2>
          <div className="flex flex-col gap-3">
            {invoicesQuery.data?.length ? (
              invoicesQuery.data.map((inv: any) => (
                <div key={inv.id} className="card flex items-center justify-between">
                  <div>
                    <div className="font-semibold text-brand-blue">{inv.invoiceNumber}</div>
                    <div className="text-xs text-slate-500">{formatDate(inv.createdAt)}</div>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="badge bg-brand-gold-light text-brand-blue-dark">{inv.status}</span>
                    <button
                      type="button"
                      className="text-sm font-semibold text-brand-blue underline"
                      onClick={() => openAuthenticatedPdf(`/invoices/${inv.id}/pdf`)}
                    >
                      PDF
                    </button>
                    {inv.status !== 'PAYEE' && inv.status !== 'ANNULEE' && (
                      <button
                        type="button"
                        disabled={payingId === inv.id}
                        className="btn-primary !px-3 !py-1.5 text-xs disabled:opacity-60"
                        onClick={() => payNow('invoices', inv.id)}
                      >
                        {payingId === inv.id ? '...' : 'Payer'}
                      </button>
                    )}
                  </div>
                </div>
              ))
            ) : (
              <p className="text-sm text-slate-400">Aucune facture pour le moment.</p>
            )}
          </div>
        </section>
      </div>
      <SiteFooter />
    </div>
  );
}
