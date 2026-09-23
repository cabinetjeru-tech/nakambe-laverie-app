'use client';

import { Package } from 'lucide-react';
import { useState } from 'react';
import { OrderCard, OrderSummary } from '@/components/order-card';
import { EmptyState, LinkButton, PageHeader, Pagination, Spinner } from '@/components/ui';
import type { Paginated } from '@/lib/types';
import { useApi } from '@/lib/use-api';

export default function OrdersPage() {
  const [page, setPage] = useState(1);
  const { data, loading } = useApi<Paginated<OrderSummary>>(`/orders?page=${page}&pageSize=15`, { refreshInterval: 60_000 });
  return (
    <div>
      <PageHeader title="Mes commandes" action={<LinkButton href="/commander">Nouvelle</LinkButton>} />
      {!data && loading && <Spinner />}
      {data && data.items.length === 0 && (
        <EmptyState icon={<Package className="h-10 w-10" />} title="Aucune commande pour l’instant">
          Votre première livraison est à un clic.
        </EmptyState>
      )}
      <div className="space-y-3">
        {data?.items.map((o) => <OrderCard key={o.id} order={o} href={`/commandes/${o.id}`} />)}
      </div>
      {data && <Pagination page={page} pageSize={data.pageSize} total={data.total} onChange={setPage} />}
    </div>
  );
}
