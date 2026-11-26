'use client';
import { Plus, Search } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { PAYMENT_STATUS_LABELS } from '@dread-royal/shared';
import { RequirePerm } from '@/components/AppShell';
import { Badge, Button, Card, ErrorBox, Input, PageHeader, Select, Spinner, StatCard, Table } from '@/components/ui';
import { qs } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { fmtDateTime, formatFCFA, todayISO } from '@/lib/format';
import { useApi, useDebounce } from '@/lib/hooks';
import { payTone } from '@/lib/tones';

export default function VentesPage() {
  return <RequirePerm perms={['sales.view']}><Ventes /></RequirePerm>;
}

function Ventes() {
  const { can } = useAuth();
  const router = useRouter();
  const [from, setFrom] = useState(new Date(Date.now() - 29 * 86_400_000).toISOString().slice(0, 10));
  const [to, setTo] = useState(todayISO());
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [page, setPage] = useState(1);
  const ds = useDebounce(search);
  const filter = status === 'CANCELLED' ? { status: 'CANCELLED' } : status ? { status: 'VALIDATED', paymentStatus: status } : {};
  const { data, error, loading, reload } = useApi<any>(`/sales${qs({ from, to, search: ds, page, pageSize: 40, ...filter })}`);
  const pages = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1;
  return (
    <>
      <PageHeader title="Ventes & factures" actions={can('sales.create') && <Link href="/vente/"><Button icon={<Plus className="h-4 w-4" />}>Nouvelle vente</Button></Link>} />
      {data && <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatCard label="Ventes" value={data.total} />
        <StatCard tone="dark" label="Chiffre d'affaires" value={formatFCFA(data.sums.total ?? 0)} hint="Ventes validées (hors annulations)" />
        <StatCard label="Encaissé sur ces ventes" value={formatFCFA(data.sums.paidAmount ?? 0)} />
        <StatCard label="Reste à payer" value={formatFCFA(data.sums.balance ?? 0)} tone={(data.sums.balance ?? 0) > 0 ? 'red' : 'green'} />
      </div>}
      <Card>
        <div className="mb-3 flex flex-wrap gap-2">
          <Input type="date" value={from} onChange={(e) => { setFrom(e.target.value); setPage(1); }} className="w-40" />
          <Input type="date" value={to} onChange={(e) => { setTo(e.target.value); setPage(1); }} className="w-40" />
          <Select value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }} className="w-48"><option value="">Tous les statuts</option><option value="PAID">Payées</option><option value="PARTIAL,UNPAID">Reste à payer</option><option value="CANCELLED">Annulées</option></Select>
          <div className="relative min-w-[200px] flex-1"><Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-neutral-400" /><Input value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} placeholder="N° facture, client, téléphone" className="pl-9" /></div>
        </div>
        {error && <ErrorBox error={error} onRetry={reload} />}
        {loading && !data ? <Spinner /> : data && (
          <>
            <Table rows={data.items} onRowClick={(s: any) => router.push(`/ventes/detail/?id=${s.id}`)} empty="Aucune vente sur la période." columns={[
              { key: 'number', label: 'Facture', render: (s: any) => <span className="font-mono text-xs">{s.number}</span> },
              { key: 'saleDate', label: 'Date', render: (s: any) => fmtDateTime(s.saleDate) },
              { key: 'client', label: 'Client', render: (s: any) => s.client ? `${s.client.firstName} ${s.client.lastName}` : <span className="text-neutral-400">Passage</span> },
              { key: 'items', label: 'Lignes', align: 'right', render: (s: any) => s._count.items },
              { key: 'total', label: 'Total', align: 'right', render: (s: any) => <b>{formatFCFA(s.total)}</b> },
              { key: 'paid', label: 'Payé', align: 'right', render: (s: any) => formatFCFA(s.paidAmount - s.refundedAmount) },
              { key: 'balance', label: 'Reste', align: 'right', render: (s: any) => s.status === 'CANCELLED' ? '—' : formatFCFA(s.balance) },
              { key: 'status', label: 'Statut', render: (s: any) => s.status === 'CANCELLED' ? <Badge tone="red">Annulée</Badge> : <Badge tone={payTone[s.paymentStatus]}>{PAYMENT_STATUS_LABELS[s.paymentStatus]}</Badge> },
            ]} />
            {pages > 1 && <div className="mt-3 flex items-center justify-end gap-2 text-sm"><Button size="sm" variant="outline" disabled={page <= 1} onClick={() => setPage(page - 1)}>Précédent</Button><span>Page {page} / {pages}</span><Button size="sm" variant="outline" disabled={page >= pages} onClick={() => setPage(page + 1)}>Suivant</Button></div>}
          </>
        )}
      </Card>
    </>
  );
}
