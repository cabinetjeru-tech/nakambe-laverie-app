'use client';

import { useParams } from 'next/navigation';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { formatFcfa, whatsappLink } from '@/lib/format';
import { ORDER_STATUS_LABELS } from '@/lib/constants';

export default function ClientDetailPage() {
  const { id } = useParams<{ id: string }>();

  const { data: client, isLoading } = useQuery({
    queryKey: ['client', id],
    queryFn: async () => (await api.get(`/clients/${id}`)).data,
  });

  if (isLoading || !client) return <p className="text-slate-400">Chargement...</p>;

  return (
    <div>
      <Link href="/admin/clients" className="text-sm text-brand-blue hover:underline">
        ← Retour aux clients
      </Link>

      <div className="mt-4 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-brand-blue">{client.fullName}</h1>
          <p className="text-sm text-slate-500">
            {client.clientNumber} · {client.phone}
          </p>
        </div>
        <a
          href={whatsappLink(client.whatsapp ?? client.phone, `Bonjour ${client.fullName}, ici Nakambé.`)}
          target="_blank"
          rel="noreferrer"
          className="btn-secondary !px-4 !py-2 text-sm"
        >
          💬 WhatsApp
        </a>
      </div>

      <div className="mt-6 grid gap-4 sm:grid-cols-3">
        <div className="card">
          <div className="text-xs uppercase text-slate-500">Total dépensé</div>
          <div className="mt-1 text-xl font-extrabold text-brand-blue">{formatFcfa(client.totalSpent)}</div>
        </div>
        <div className="card">
          <div className="text-xs uppercase text-slate-500">Commandes</div>
          <div className="mt-1 text-xl font-extrabold text-brand-blue">{client.ordersCount}</div>
        </div>
        <div className="card">
          <div className="text-xs uppercase text-slate-500">Points fidélité</div>
          <div className="mt-1 text-xl font-extrabold text-brand-blue">{client.loyaltyPoints}</div>
        </div>
      </div>

      <div className="mt-8 grid gap-6 md:grid-cols-2">
        <div className="card">
          <h3 className="mb-3 text-sm font-bold uppercase text-slate-500">Coordonnées</h3>
          <dl className="space-y-1 text-sm">
            <div className="flex justify-between"><dt className="text-slate-500">Quartier</dt><dd>{client.district ?? '—'}</dd></div>
            <div className="flex justify-between"><dt className="text-slate-500">Adresse</dt><dd>{client.address ?? '—'}</dd></div>
            <div className="flex justify-between"><dt className="text-slate-500">Type</dt><dd>{client.type}</dd></div>
            {client.companyName && (
              <div className="flex justify-between"><dt className="text-slate-500">Société</dt><dd>{client.companyName}</dd></div>
            )}
          </dl>
        </div>

        <div className="card">
          <h3 className="mb-3 text-sm font-bold uppercase text-slate-500">Dernières commandes</h3>
          {client.orders?.length ? (
            <ul className="divide-y divide-slate-100 text-sm">
              {client.orders.map((o: any) => (
                <li key={o.id} className="flex items-center justify-between py-2">
                  <Link href={`/admin/commandes/${o.id}`} className="font-medium text-brand-blue hover:underline">
                    {o.orderNumber}
                  </Link>
                  <span className="badge bg-brand-gold-light text-brand-blue-dark">
                    {ORDER_STATUS_LABELS[o.status] ?? o.status}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-slate-400">Aucune commande.</p>
          )}
        </div>
      </div>
    </div>
  );
}
