'use client';

import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';
import { formatFcfa, whatsappLink } from '@/lib/format';
import { ORDER_STATUS_LABELS, SERVICE_DOMAIN_LABELS } from '@/lib/constants';

export default function MesMissionsPage() {
  const { user } = useAuth();
  const endpoint = user?.role === 'CHAUFFEUR' ? '/orders/missions' : '/orders/assigned';

  const { data, isLoading } = useQuery({
    queryKey: ['mes-missions', endpoint],
    queryFn: async () => (await api.get(endpoint)).data,
    enabled: !!user,
  });

  return (
    <div>
      <h1 className="text-2xl font-bold text-brand-blue">Mes missions</h1>
      <p className="text-sm text-slate-500">Commandes qui vous sont affectées.</p>

      <div className="mt-6 flex flex-col gap-3">
        {isLoading && <p className="text-slate-400">Chargement...</p>}
        {data?.length === 0 && <p className="text-slate-400">Aucune mission en cours.</p>}
        {data?.map((o: any) => (
          <Link key={o.id} href={`/admin/commandes/${o.id}`} className="card flex items-center justify-between hover:shadow-md">
            <div>
              <div className="font-semibold text-brand-blue">{o.orderNumber}</div>
              <div className="text-xs text-slate-500">
                {o.client?.fullName} · {SERVICE_DOMAIN_LABELS[o.domain] ?? o.domain}
              </div>
            </div>
            <div className="flex items-center gap-3">
              <span className="badge bg-brand-gold-light text-brand-blue-dark">
                {ORDER_STATUS_LABELS[o.status] ?? o.status}
              </span>
              <span className="text-sm font-semibold">{formatFcfa(o.total)}</span>
              <a
                onClick={(e) => e.stopPropagation()}
                href={whatsappLink(o.client?.whatsapp ?? o.client?.phone ?? '', `Bonjour, je suis en route pour votre commande ${o.orderNumber}.`)}
                target="_blank"
                rel="noreferrer"
                className="text-lg"
              >
                💬
              </a>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
