'use client';

import { useState } from 'react';
import { DataTable } from '@/components/admin/table';
import { Input, PageHeader, Pagination } from '@/components/ui';
import { dateTime } from '@/lib/format';
import type { Paginated } from '@/lib/types';
import { useApi } from '@/lib/use-api';

interface Log {
  id: string;
  action: string;
  entityType: string;
  entityId: string | null;
  before: unknown;
  after: unknown;
  createdAt: string;
  actor: { firstName: string; lastName: string; phone: string } | null;
}

export default function AuditPage() {
  const [entityType, setEntityType] = useState('');
  const [page, setPage] = useState(1);
  const { data } = useApi<Paginated<Log>>(`/admin/audit-logs?page=${page}&pageSize=30${entityType ? `&entityType=${entityType}` : ''}`, { persist: false });
  return (
    <div className="space-y-4">
      <PageHeader title="Journal d’audit" subtitle="Toutes les actions sensibles de l’équipe (tarifs, rôles, paiements, livreurs…)." />
      <Input className="w-64" placeholder="Filtrer par type (ex. PricingRule)" value={entityType} onChange={(e) => { setEntityType(e.target.value); setPage(1); }} />
      <DataTable
        rows={data?.items}
        rowKey={(r) => r.id}
        columns={[
          { header: 'Date', cell: (r) => dateTime(r.createdAt) },
          { header: 'Auteur', cell: (r) => (r.actor ? `${r.actor.firstName} ${r.actor.lastName}` : 'Système') },
          { header: 'Action', cell: (r) => <span className="font-mono text-xs">{r.action}</span> },
          { header: 'Élément', cell: (r) => <span className="text-xs">{r.entityType} {r.entityId?.slice(0, 8)}</span> },
          {
            header: 'Détail',
            cell: (r) => (
              <details className="max-w-md text-xs">
                <summary className="cursor-pointer text-brand-light">voir</summary>
                <pre className="mt-1 max-h-48 overflow-auto whitespace-pre-wrap rounded bg-slate-50 p-2">{JSON.stringify({ avant: r.before, après: r.after }, null, 1)}</pre>
              </details>
            ),
          },
        ]}
      />
      {data && <Pagination page={page} pageSize={data.pageSize} total={data.total} onChange={setPage} />}
    </div>
  );
}
