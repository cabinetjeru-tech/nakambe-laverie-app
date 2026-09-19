'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { formatDate, formatFcfa } from '@/lib/format';
import { ORDER_STATUS_LABELS, SERVICE_DOMAIN_LABELS } from '@/lib/constants';

export default function CommandesPage() {
  const [status, setStatus] = useState('');

  const { data, isLoading } = useQuery({
    queryKey: ['orders', status],
    queryFn: async () => (await api.get('/orders', { params: status ? { status } : {} })).data,
  });

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-brand-blue">Commandes</h1>
          <p className="text-sm text-slate-500">{data?.length ?? 0} commande(s)</p>
        </div>
        <Link href="/admin/commandes/nouvelle" className="btn-primary">
          + Nouvelle commande
        </Link>
      </div>

      <div className="mb-4 flex flex-wrap gap-2">
        <button
          onClick={() => setStatus('')}
          className={`rounded-full px-3 py-1.5 text-xs font-semibold ${!status ? 'bg-brand-blue text-white' : 'bg-slate-100 text-slate-600'}`}
        >
          Toutes
        </button>
        {Object.entries(ORDER_STATUS_LABELS).map(([key, label]) => (
          <button
            key={key}
            onClick={() => setStatus(key)}
            className={`rounded-full px-3 py-1.5 text-xs font-semibold ${status === key ? 'bg-brand-blue text-white' : 'bg-slate-100 text-slate-600'}`}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="card overflow-x-auto !p-0">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-4 py-3">N° commande</th>
              <th className="px-4 py-3">Client</th>
              <th className="px-4 py-3">Domaine</th>
              <th className="px-4 py-3">Statut</th>
              <th className="px-4 py-3">Total</th>
              <th className="px-4 py-3">Date</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {isLoading && (
              <tr>
                <td colSpan={6} className="px-4 py-6 text-center text-slate-400">
                  Chargement...
                </td>
              </tr>
            )}
            {data?.map((o: any) => (
              <tr key={o.id} className="hover:bg-slate-50">
                <td className="px-4 py-3">
                  <Link href={`/admin/commandes/${o.id}`} className="font-semibold text-brand-blue hover:underline">
                    {o.orderNumber}
                  </Link>
                </td>
                <td className="px-4 py-3">{o.client?.fullName}</td>
                <td className="px-4 py-3 text-slate-500">{SERVICE_DOMAIN_LABELS[o.domain] ?? o.domain}</td>
                <td className="px-4 py-3">
                  <span className="badge bg-brand-gold-light text-brand-blue-dark">
                    {ORDER_STATUS_LABELS[o.status] ?? o.status}
                  </span>
                </td>
                <td className="px-4 py-3 font-semibold">{formatFcfa(o.total)}</td>
                <td className="px-4 py-3 text-slate-500">{formatDate(o.createdAt)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
