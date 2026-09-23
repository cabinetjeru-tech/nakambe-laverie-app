'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { DataTable } from '@/components/admin/table';
import { Badge, Input, PageHeader, Pagination, Select } from '@/components/ui';
import { dateOnly, dateTime, phoneDisplay } from '@/lib/format';
import type { Paginated } from '@/lib/types';
import type { UserRow } from '@/lib/admin-types';
import { useApi } from '@/lib/use-api';

export default function ClientsPage() {
  const router = useRouter();
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [page, setPage] = useState(1);
  const q = ['roleCode=CLIENT', status && `status=${status}`, search.trim().length >= 2 && `search=${encodeURIComponent(search.trim())}`, `page=${page}`, 'pageSize=25'].filter(Boolean).join('&');
  const { data } = useApi<Paginated<UserRow>>(`/admin/users?${q}`, { persist: false });
  return (
    <div className="space-y-4">
      <PageHeader title="Clients" subtitle={data ? `${data.total} client(s)` : undefined} />
      <div className="flex flex-wrap gap-2">
        <Input className="w-64" placeholder="Nom ou téléphone" value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} />
        <Select className="w-auto" value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }}>
          <option value="">Tous</option>
          <option value="ACTIVE">Actifs</option>
          <option value="SUSPENDED">Suspendus</option>
        </Select>
      </div>
      <DataTable
        rows={data?.items}
        rowKey={(r) => r.id}
        onRowClick={(r) => router.push(`/admin/utilisateurs/${r.id}`)}
        columns={[
          { header: 'Client', cell: (r) => <span className="font-semibold text-brand">{r.firstName} {r.lastName}</span> },
          { header: 'Téléphone', cell: (r) => phoneDisplay(r.phone) },
          { header: 'Statut', cell: (r) => <Badge tone={r.status === 'ACTIVE' ? 'green' : 'red'}>{r.status === 'ACTIVE' ? 'Actif' : 'Suspendu'}</Badge> },
          { header: 'Inscrit le', cell: (r) => dateOnly(r.createdAt) },
          { header: 'Dernière connexion', cell: (r) => dateTime(r.lastLoginAt) },
        ]}
      />
      {data && <Pagination page={page} pageSize={data.pageSize} total={data.total} onChange={setPage} />}
    </div>
  );
}
