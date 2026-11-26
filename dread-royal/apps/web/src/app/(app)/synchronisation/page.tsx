'use client';
import { RefreshCw, Trash2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Badge, Button, Card, PageHeader, Table, useUi } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { fmtDateTime } from '@/lib/format';
import { useApi } from '@/lib/hooks';
import { discard, flush, listLog, listOps, QueuedOp, subscribe, SyncLog } from '@/lib/offline';

const STATUS: Record<string, string> = { APPLIED: 'Appliquée', CONFLICT: 'Conflit', REJECTED: 'Refusée' };

export default function SyncPage() {
  const { can } = useAuth();
  const { toast, confirm } = useUi();
  const [ops, setOps] = useState<QueuedOp[]>([]);
  const [log, setLog] = useState<SyncLog[]>([]);
  const [online, setOnline] = useState(true);
  const server = useApi<any[]>(`/sync/history${can('audit.view') ? '?all=true' : ''}`);
  useEffect(() => {
    const load = async () => { setOps(await listOps()); setLog(await listLog()); setOnline(navigator.onLine); };
    load();
    return subscribe(load);
  }, []);
  const sync = async () => { const n = await flush(); toast(n ? 'success' : 'info', n ? `${n} opération(s) synchronisée(s)` : 'Rien à synchroniser ou serveur injoignable'); server.reload(); };
  return (
    <>
      <PageHeader title="Synchronisation" subtitle={online ? 'Connecté au serveur' : 'Hors connexion — les opérations sont conservées sur cet appareil'} actions={<Button icon={<RefreshCw className="h-4 w-4" />} onClick={sync} disabled={!online}>Synchroniser maintenant</Button>} />
      <Card title={`File d'attente de cet appareil (${ops.length})`}>
        <p className="mb-3 text-xs text-neutral-500">Les ventes en attente ne sont <b>pas validées</b> : elles n&apos;apparaissent ni dans le chiffre d&apos;affaires ni dans la caisse tant que le serveur ne les a pas confirmées. Chaque opération possède un identifiant unique : un renvoi ne crée jamais de doublon.</p>
        <Table rows={ops.map((o) => ({ ...o, id: o.opId }))} empty="Aucune opération en attente." columns={[
          { key: 'createdAt', label: 'Créée le', render: (o: any) => fmtDateTime(o.createdAt) },
          { key: 'label', label: 'Opération' },
          { key: 'status', label: 'État', render: (o: any) => o.status === 'pending' ? <Badge tone="orange">En attente</Badge> : <Badge tone="red">{o.status === 'conflict' ? 'Conflit' : 'Refusée'}</Badge> },
          { key: 'message', label: 'Motif', render: (o: any) => <span className="text-xs text-red-700">{o.message}</span> },
          { key: 'a', label: '', render: (o: any) => o.status !== 'pending' && <Button size="sm" variant="ghost" icon={<Trash2 className="h-3.5 w-3.5" />} onClick={async () => { const r = await confirm({ title: 'Abandonner cette opération', message: 'Elle sera supprimée de cet appareil. Ressaisissez-la si nécessaire après correction.', danger: true }); if (r.ok) discard(o.opId); }}>Abandonner</Button> },
        ]} />
      </Card>
      <div className="mt-5 grid gap-5 lg:grid-cols-2">
        <Card title="Historique local des synchronisations">
          <Table rows={log} empty="Aucune synchronisation." columns={[
            { key: 'at', label: 'Date', render: (l: any) => fmtDateTime(l.at) },
            { key: 'sent', label: 'Envoyées', align: 'right' },
            { key: 'applied', label: 'Appliquées', align: 'right' },
            { key: 'duplicates', label: 'Doublons', align: 'right' },
            { key: 'conflicts', label: 'Conflits', align: 'right' },
            { key: 'error', label: 'Erreur', render: (l: any) => <span className="text-xs text-red-700">{l.error}</span> },
          ]} />
        </Card>
        <Card title="Opérations reçues par le serveur">
          <Table rows={(server.data ?? []).map((o) => ({ ...o, id: o.opId }))} empty="Aucune opération hors ligne reçue." columns={[
            { key: 'receivedAt', label: 'Reçue le', render: (o: any) => fmtDateTime(o.receivedAt) },
            { key: 'type', label: 'Type', render: (o: any) => ({ 'client.create': 'Client', 'appointment.create': 'Rendez-vous', 'sale.create': 'Vente' } as any)[o.type] },
            { key: 'status', label: 'Résultat', render: (o: any) => <Badge tone={o.status === 'APPLIED' ? 'green' : 'red'}>{STATUS[o.status]}</Badge> },
            { key: 'message', label: 'Message', render: (o: any) => <span className="text-xs">{o.message}</span> },
          ]} />
        </Card>
      </div>
    </>
  );
}
