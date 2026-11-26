'use client';
import { Plus, Search } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { GENDER_LABELS } from '@dread-royal/shared';
import { RequirePerm } from '@/components/AppShell';
import { ClientFormModal } from '@/components/pickers';
import { Badge, Button, Card, ErrorBox, Input, PageHeader, Select, Spinner, Table } from '@/components/ui';
import { qs } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { fmtDate, fmtPhone } from '@/lib/format';
import { useApi, useDebounce } from '@/lib/hooks';

export default function ClientsPage() {
  return <RequirePerm perms={['clients.view', 'clients.view_own']}><Clients /></RequirePerm>;
}

function Clients() {
  const { can } = useAuth();
  const router = useRouter();
  const [search, setSearch] = useState('');
  const [gender, setGender] = useState('');
  const [page, setPage] = useState(1);
  const [creating, setCreating] = useState(false);
  const ds = useDebounce(search);
  const { data, error, loading, reload } = useApi<any>(`/clients${qs({ search: ds, gender, page, pageSize: 30 })}`);
  const pages = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1;
  return (
    <>
      <PageHeader title="Clients" subtitle={data ? `${data.total} client(s)` : undefined} actions={can('clients.manage') && <Button icon={<Plus className="h-4 w-4" />} onClick={() => setCreating(true)}>Nouveau client</Button>} />
      <Card>
        <div className="mb-4 flex flex-wrap gap-2">
          <div className="relative min-w-[220px] flex-1">
            <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-neutral-400" />
            <Input value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} placeholder="Nom, prénom, téléphone ou code client…" className="pl-9" />
          </div>
          <Select value={gender} onChange={(e) => { setGender(e.target.value); setPage(1); }} className="w-48"><option value="">Tous les profils</option>{Object.entries(GENDER_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</Select>
        </div>
        {error && <ErrorBox error={error} onRetry={reload} />}
        {loading && !data ? <Spinner /> : data && (
          <>
            <Table rows={data.items} onRowClick={(c: any) => router.push(`/clients/fiche/?id=${c.id}`)} empty="Aucun client trouvé." columns={[
              { key: 'code', label: 'Code', render: (c: any) => <span className="font-mono text-xs">{c.code}</span> },
              { key: 'name', label: 'Nom', render: (c: any) => <b>{c.lastName} {c.firstName}</b> },
              { key: 'phone', label: 'Téléphone', render: (c: any) => fmtPhone(c.phone) },
              { key: 'gender', label: 'Profil', render: (c: any) => GENDER_LABELS[c.gender] },
              { key: 'preferences', label: 'Préférences', render: (c: any) => <span className="line-clamp-1 text-xs text-neutral-600">{c.preferences}</span> },
              { key: 'points', label: 'Points', align: 'right', render: (c: any) => c.loyaltyPoints ? <Badge tone="gold">{c.loyaltyPoints}</Badge> : '' },
              { key: 'createdAt', label: 'Inscription', render: (c: any) => fmtDate(c.createdAt) },
            ]} />
            {pages > 1 && <div className="mt-3 flex items-center justify-end gap-2 text-sm"><Button size="sm" variant="outline" disabled={page <= 1} onClick={() => setPage(page - 1)}>Précédent</Button><span>Page {page} / {pages}</span><Button size="sm" variant="outline" disabled={page >= pages} onClick={() => setPage(page + 1)}>Suivant</Button></div>}
          </>
        )}
      </Card>
      <ClientFormModal open={creating} onClose={() => setCreating(false)} onSaved={(c) => { setCreating(false); if (!c.queued) router.push(`/clients/fiche/?id=${c.id}`); else reload(); }} />
    </>
  );
}
