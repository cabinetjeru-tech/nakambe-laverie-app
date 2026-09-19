'use client';

import { useQuery } from '@tanstack/react-query';
import { api, openAuthenticatedPdf } from '@/lib/api';
import { formatDate, formatFcfa } from '@/lib/format';

const INVOICE_STATUS_LABELS: Record<string, string> = {
  IMPAYEE: 'Impayée',
  PARTIELLEMENT_PAYEE: 'Partiellement payée',
  PAYEE: 'Payée',
  ANNULEE: 'Annulée',
};

const INVOICE_STATUS_COLORS: Record<string, string> = {
  IMPAYEE: 'bg-red-100 text-red-700',
  PARTIELLEMENT_PAYEE: 'bg-brand-gold-light text-brand-blue-dark',
  PAYEE: 'bg-green-100 text-green-700',
  ANNULEE: 'bg-slate-100 text-slate-500',
};

export default function FacturesPage() {
  const { data: invoices, isLoading } = useQuery({
    queryKey: ['invoices'],
    queryFn: async () => (await api.get('/invoices')).data,
  });

  const { data: payments } = useQuery({
    queryKey: ['payments'],
    queryFn: async () => (await api.get('/payments')).data,
  });

  return (
    <div className="flex flex-col gap-10">
      <div>
        <h1 className="text-2xl font-bold text-brand-blue">Factures</h1>
        <p className="text-sm text-slate-500">{invoices?.length ?? 0} facture(s)</p>

        <div className="card mt-4 overflow-x-auto !p-0">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-3">N° facture</th>
                <th className="px-4 py-3">Client</th>
                <th className="px-4 py-3">Statut</th>
                <th className="px-4 py-3">Total</th>
                <th className="px-4 py-3">Payé</th>
                <th className="px-4 py-3">Date</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {isLoading && (
                <tr>
                  <td colSpan={7} className="px-4 py-6 text-center text-slate-400">Chargement...</td>
                </tr>
              )}
              {invoices?.map((inv: any) => (
                <tr key={inv.id} className="hover:bg-slate-50">
                  <td className="px-4 py-3 font-semibold text-brand-blue">{inv.invoiceNumber}</td>
                  <td className="px-4 py-3">{inv.client?.fullName}</td>
                  <td className="px-4 py-3">
                    <span className={`badge ${INVOICE_STATUS_COLORS[inv.status] ?? ''}`}>
                      {INVOICE_STATUS_LABELS[inv.status] ?? inv.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 font-semibold">{formatFcfa(inv.total)}</td>
                  <td className="px-4 py-3">{formatFcfa(inv.amountPaid)}</td>
                  <td className="px-4 py-3 text-slate-500">{formatDate(inv.createdAt)}</td>
                  <td className="px-4 py-3">
                    <button className="text-xs font-semibold text-brand-blue underline" onClick={() => openAuthenticatedPdf(`/invoices/${inv.id}/pdf`)}>
                      PDF
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div>
        <h2 className="text-xl font-bold text-brand-blue">Paiements récents</h2>
        <div className="card mt-4 overflow-x-auto !p-0">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-3">N° paiement</th>
                <th className="px-4 py-3">Client</th>
                <th className="px-4 py-3">Moyen</th>
                <th className="px-4 py-3">Montant</th>
                <th className="px-4 py-3">Date</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {payments?.map((p: any) => (
                <tr key={p.id} className="hover:bg-slate-50">
                  <td className="px-4 py-3 font-mono text-xs text-slate-500">{p.paymentNumber}</td>
                  <td className="px-4 py-3">{p.client?.fullName}</td>
                  <td className="px-4 py-3">{p.method}</td>
                  <td className="px-4 py-3 font-semibold">{formatFcfa(p.amount)}</td>
                  <td className="px-4 py-3 text-slate-500">{formatDate(p.createdAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
