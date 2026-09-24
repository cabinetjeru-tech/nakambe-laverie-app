'use client';

import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, Printer } from 'lucide-react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { Badge, Button, ErrorMessage, Spinner } from '@/components/ui';
import { get } from '@/lib/api';
import { CYCLE, INVOICE_STATUS, SAAS_PAYMENT_METHOD, SAAS_PAYMENT_STATUS } from '@/lib/billing';
import { date, money } from '@/lib/format';

interface InvoiceDetail {
  id: string;
  number: string;
  kind: string;
  description: string;
  status: string;
  cycle: string;
  periodStart: string;
  periodEnd: string;
  subtotal: number;
  taxAmount: number;
  total: number;
  currency: string;
  dueAt: string;
  paidAt: string | null;
  createdAt: string;
  voidReason: string | null;
  plan: { name: string };
  buyerSnapshot: { legalName?: string; displayName?: string; taxId?: string | null; tradeRegister?: string | null };
  seller: { legalName: string; address: string; taxId: string };
  vatPercent: number;
  payments: { id: string; method: string; status: string; amount: number; providerReference: string | null; operator: string | null; paidAt: string | null; createdAt: string }[];
}

/** Facture de la plateforme, mise en page pour l'impression (Ctrl+P → PDF). */
export default function InvoicePage() {
  const { id } = useParams<{ id: string }>();
  const invoice = useQuery({ queryKey: ['billing-invoice', id], queryFn: () => get<InvoiceDetail>(`/billing/invoices/${id}`) });
  if (invoice.isLoading) return <Spinner />;
  if (invoice.error || !invoice.data) return <ErrorMessage error={invoice.error} />;
  const i = invoice.data;
  const paid = i.payments.filter((p) => p.status === 'SUCCEEDED');

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between print:hidden">
        <Link href="/abonnement" className="inline-flex items-center gap-1 text-sm text-stone-600 hover:text-stone-900">
          <ArrowLeft className="h-4 w-4" aria-hidden /> Abonnement
        </Link>
        <Button variant="secondary" onClick={() => window.print()}>
          <Printer className="h-4 w-4" aria-hidden /> Imprimer / PDF
        </Button>
      </div>

      <article className="mx-auto max-w-3xl rounded-xl border border-stone-200 bg-white p-8 print:border-0 print:p-0">
        <header className="flex flex-wrap items-start justify-between gap-6">
          <div>
            <p className="text-lg font-semibold text-stone-900">{i.seller.legalName}</p>
            {i.seller.address && <p className="text-sm text-stone-600">{i.seller.address}</p>}
            {i.seller.taxId && <p className="text-sm text-stone-600">IFU : {i.seller.taxId}</p>}
          </div>
          <div className="text-right">
            <p className="text-2xl font-semibold text-stone-900">Facture</p>
            <p className="text-sm font-medium text-stone-700">{i.number}</p>
            <p className="text-sm text-stone-500">Émise le {date(i.createdAt)}</p>
            <div className="mt-1">
              <Badge tone={INVOICE_STATUS[i.status]?.tone}>{INVOICE_STATUS[i.status]?.label}</Badge>
            </div>
          </div>
        </header>

        <section className="mt-8">
          <p className="text-xs font-semibold uppercase tracking-wide text-stone-500">Facturé à</p>
          <p className="mt-1 font-medium text-stone-900">{i.buyerSnapshot.legalName ?? i.buyerSnapshot.displayName}</p>
          {i.buyerSnapshot.taxId && <p className="text-sm text-stone-600">IFU : {i.buyerSnapshot.taxId}</p>}
          {i.buyerSnapshot.tradeRegister && <p className="text-sm text-stone-600">RCCM : {i.buyerSnapshot.tradeRegister}</p>}
        </section>

        <table className="mt-8 w-full text-sm">
          <thead>
            <tr className="border-b border-stone-200 text-left text-xs uppercase tracking-wide text-stone-500">
              <th className="py-2">Désignation</th>
              <th className="py-2">Période</th>
              <th className="py-2 text-right">Montant HT</th>
            </tr>
          </thead>
          <tbody>
            <tr className="border-b border-stone-100">
              <td className="py-3">
                {i.description}
                <span className="block text-xs text-stone-500">
                  Offre {i.plan.name} · {CYCLE[i.cycle]?.toLowerCase()}
                </span>
              </td>
              <td className="py-3">
                {date(i.periodStart)} – {date(i.periodEnd)}
              </td>
              <td className="py-3 text-right tabular-nums">{money(i.subtotal, i.currency)}</td>
            </tr>
          </tbody>
        </table>

        <dl className="ml-auto mt-4 w-full max-w-xs space-y-1 text-sm">
          <div className="flex justify-between">
            <dt className="text-stone-500">Total HT</dt>
            <dd className="tabular-nums">{money(i.subtotal, i.currency)}</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-stone-500">TVA ({i.vatPercent} %)</dt>
            <dd className="tabular-nums">{money(i.taxAmount, i.currency)}</dd>
          </div>
          <div className="flex justify-between border-t border-stone-200 pt-1 text-base font-semibold">
            <dt>Total TTC</dt>
            <dd className="tabular-nums">{money(i.total, i.currency)}</dd>
          </div>
        </dl>

        <section className="mt-8 text-sm">
          {i.status === 'PAID' && paid.length > 0 ? (
            <p className="text-stone-700">
              Réglée le {date(i.paidAt!)} par {SAAS_PAYMENT_METHOD[paid[0].method] ?? paid[0].method}
              {paid[0].providerReference ? ` (réf. ${paid[0].providerReference})` : ''}.
            </p>
          ) : i.status === 'VOID' ? (
            <p className="text-stone-700">Facture annulée{i.voidReason ? ` : ${i.voidReason}` : ''}.</p>
          ) : (
            <p className="text-stone-700">À régler avant le {date(i.dueAt)}.</p>
          )}
        </section>

        {i.payments.length > 0 && (
          <section className="mt-6 print:hidden">
            <p className="text-xs font-semibold uppercase tracking-wide text-stone-500">Paiements</p>
            <ul className="mt-2 divide-y divide-stone-100 text-sm">
              {i.payments.map((p) => (
                <li key={p.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                  <span>
                    {SAAS_PAYMENT_METHOD[p.method] ?? p.method} · {date(p.createdAt)}
                    {p.providerReference ? ` · réf. ${p.providerReference}` : ''}
                  </span>
                  <Badge tone={SAAS_PAYMENT_STATUS[p.status]?.tone}>{SAAS_PAYMENT_STATUS[p.status]?.label}</Badge>
                </li>
              ))}
            </ul>
          </section>
        )}
      </article>
    </div>
  );
}
