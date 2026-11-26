'use client';
import { useState } from 'react';
import { RequirePerm } from '@/components/AppShell';
import { Badge, Button, Card, Input, Modal, PageHeader, Select, Spinner, Table } from '@/components/ui';
import { qs } from '@/lib/api';
import { fmtDateTime } from '@/lib/format';
import { useApi, useDebounce } from '@/lib/hooks';

const ENTITIES: Record<string, string> = { Sale: 'Vente', Client: 'Client', Appointment: 'Rendez-vous', Expense: 'Dépense', OtherIncome: 'Recette', CashSession: 'Caisse', Product: 'Produit', Purchase: 'Achat', Inventory: 'Inventaire', Service: 'Prestation', Staff: 'Personnel', User: 'Utilisateur', Role: 'Rôle', Setting: 'Paramètres', Backup: 'Sauvegarde', LoyaltyPackage: 'Forfait', ClientSubscription: 'Abonnement', Supplier: 'Fournisseur' };
const ACTION_TONE: Record<string, string> = { CANCEL: 'red', DEACTIVATE: 'red', LOGIN_FAILED: 'red', CREATE: 'green', PAYMENT: 'gold', UPDATE: 'blue' };

export default function JournalPage() {
  return <RequirePerm perms={['audit.view']}><Journal /></RequirePerm>;
}

function Journal() {
  const [entity, setEntity] = useState('');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const ds = useDebounce(search);
  const { data, loading } = useApi<any>(`/audit${qs({ entity, search: ds, page, pageSize: 50 })}`);
  const [detail, setDetail] = useState<any | null>(null);
  const pages = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1;
  return (
    <>
      <PageHeader title="Historique des actions" subtitle="Journal inaltérable de toutes les opérations sensibles (qui, quoi, quand, avant/après)" />
      <Card>
        <div className="mb-3 flex flex-wrap gap-2">
          <Select value={entity} onChange={(e) => { setEntity(e.target.value); setPage(1); }} className="w-48"><option value="">Tous les objets</option>{Object.entries(ENTITIES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</Select>
          <Input value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} placeholder="Rechercher dans les descriptions…" className="flex-1" />
        </div>
        {loading && !data ? <Spinner /> : data && <>
          <Table rows={data.items} onRowClick={setDetail} columns={[
            { key: 'createdAt', label: 'Date', render: (l: any) => fmtDateTime(l.createdAt) },
            { key: 'user', label: 'Utilisateur', render: (l: any) => l.user?.fullName ?? 'Système' },
            { key: 'action', label: 'Action', render: (l: any) => <Badge tone={ACTION_TONE[l.action] ?? 'gray'}>{l.action}</Badge> },
            { key: 'entity', label: 'Objet', render: (l: any) => ENTITIES[l.entity] ?? l.entity },
            { key: 'summary', label: 'Description', render: (l: any) => <span className="text-xs">{l.summary}</span> },
            { key: 'ip', label: 'IP', render: (l: any) => <span className="font-mono text-[10px] text-neutral-400">{l.ip}</span> },
          ]} />
          {pages > 1 && <div className="mt-3 flex items-center justify-end gap-2 text-sm"><Button size="sm" variant="outline" disabled={page <= 1} onClick={() => setPage(page - 1)}>Précédent</Button><span>Page {page} / {pages}</span><Button size="sm" variant="outline" disabled={page >= pages} onClick={() => setPage(page + 1)}>Suivant</Button></div>}
        </>}
      </Card>
      <Modal open={!!detail} onClose={() => setDetail(null)} title="Détail de l'opération" size="lg">
        {detail && <div className="space-y-3 text-sm">
          <p><b>{detail.summary}</b></p>
          <p className="text-xs text-neutral-500">{fmtDateTime(detail.createdAt)} · {detail.user?.fullName ?? 'Système'} · {detail.action} · {detail.entity} {detail.entityId}</p>
          {detail.before && <details><summary className="cursor-pointer font-semibold">Avant</summary><pre className="mt-1 max-h-64 overflow-auto rounded bg-neutral-100 p-2 text-[11px]">{JSON.stringify(detail.before, null, 2)}</pre></details>}
          {detail.after && <details open><summary className="cursor-pointer font-semibold">Après</summary><pre className="mt-1 max-h-64 overflow-auto rounded bg-neutral-100 p-2 text-[11px]">{JSON.stringify(detail.after, null, 2)}</pre></details>}
        </div>}
      </Modal>
    </>
  );
}
