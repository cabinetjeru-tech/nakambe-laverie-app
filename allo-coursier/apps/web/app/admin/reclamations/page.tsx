'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { DataTable } from '@/components/admin/table';
import { PageHeader, Pagination, Select, StatusBadge } from '@/components/ui';
import { COMPLAINT_CATEGORIES, COMPLAINT_STATUS, dateTime, phoneDisplay } from '@/lib/format';
import type { Paginated } from '@/lib/types';
import { useApi } from '@/lib/use-api';

interface Row {
  id: string;
  reference: string;
  category: string;
  description: string;
  status: string;
  priority: number;
  createdAt: string;
  user: { firstName: string; lastName: string; phone: string };
  order: { reference: string } | null;
}

export default function AdminComplaintsPage() {
  const router = useRouter();
  const [status, setStatus] = useState('OPEN');
  const [page, setPage] = useState(1);
  const { data } = useApi<Paginated<Row>>(`/admin/complaints?${status ? `status=${status}&` : ''}page=${page}&pageSize=25`, { persist: false });
  return (
    <div className="space-y-4">
      <PageHeader title="Réclamations" />
      <Select className="w-auto" value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }}>
        <option value="">Toutes</option>
        {Object.entries(COMPLAINT_STATUS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
      </Select>
      <DataTable
        rows={data?.items}
        rowKey={(r) => r.id}
        onRowClick={(r) => router.push(`/admin/reclamations/${r.id}`)}
        empty="Aucune réclamation"
        columns={[
          { header: 'Réf.', cell: (r) => <><span className="font-semibold text-brand">{r.reference}</span>{r.order && <span className="block text-xs text-slate-500">{r.order.reference}</span>}</> },
          { header: 'Type', cell: (r) => COMPLAINT_CATEGORIES[r.category] },
          { header: 'Description', cell: (r) => <span className="line-clamp-2 max-w-sm text-xs text-slate-600">{r.description}</span> },
          { header: 'Client', cell: (r) => <>{r.user.firstName} {r.user.lastName}<span className="block text-xs text-slate-500">{phoneDisplay(r.user.phone)}</span></> },
          { header: 'Statut', cell: (r) => <StatusBadge status={r.status} label={COMPLAINT_STATUS[r.status]} /> },
          { header: 'Date', cell: (r) => dateTime(r.createdAt) },
        ]}
      />
      {data && <Pagination page={page} pageSize={data.pageSize} total={data.total} onChange={setPage} />}
    </div>
  );
}
