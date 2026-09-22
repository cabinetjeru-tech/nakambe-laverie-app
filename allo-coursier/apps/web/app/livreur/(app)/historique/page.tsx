'use client';

import { History } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';
import { EmptyState, PageHeader, Pagination, Spinner, StatusBadge } from '@/components/ui';
import { dateTime, fcfa, SERVICE_LABELS, STATUS_LABELS } from '@/lib/format';
import type { Paginated } from '@/lib/types';
import { useApi } from '@/lib/use-api';

interface Row {
  id: string;
  reference: string;
  status: string;
  serviceType: string;
  driverEarning: number;
  updatedAt: string;
  stops: { kind: string; landmark: string }[];
}

export default function DriverHistoryPage() {
  const [page, setPage] = useState(1);
  const { data } = useApi<Paginated<Row>>(`/driver/missions?page=${page}&pageSize=20`);
  return (
    <div>
      <PageHeader title="Historique" />
      {!data && <Spinner />}
      {data?.items.length === 0 && <EmptyState icon={<History className="h-10 w-10" />} title="Aucune mission terminée" />}
      <ul className="space-y-2">
        {data?.items.map((m) => (
          <li key={m.id}>
            <Link href={`/livreur/missions/${m.id}`} className="block rounded-2xl bg-white p-4 shadow-card">
              <div className="flex items-center justify-between">
                <span className="font-semibold text-brand">{SERVICE_LABELS[m.serviceType]}</span>
                <StatusBadge status={m.status} label={STATUS_LABELS[m.status]} />
              </div>
              <p className="mt-1 truncate text-sm text-slate-600">
                {m.stops[0]?.landmark} → {m.stops[1]?.landmark}
              </p>
              <p className="mt-1 text-xs text-slate-500">
                {m.reference} · {dateTime(m.updatedAt)} · gain {fcfa(m.driverEarning)}
              </p>
            </Link>
          </li>
        ))}
      </ul>
      {data && <Pagination page={page} pageSize={data.pageSize} total={data.total} onChange={setPage} />}
    </div>
  );
}
