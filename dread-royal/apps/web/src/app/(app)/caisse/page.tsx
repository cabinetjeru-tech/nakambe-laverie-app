'use client';
import { ArrowDownCircle, ArrowUpCircle, Lock, Unlock } from 'lucide-react';
import { useState } from 'react';
import { CASH_SOURCE_LABELS, PAYMENT_KIND_LABELS, PAYMENT_METHOD_LABELS } from '@dread-royal/shared';
import { RequirePerm } from '@/components/AppShell';
import { Badge, Button, Card, ErrorBox, Field, Input, Modal, MoneyInput, PageHeader, Select, Spinner, StatCard, Table, Textarea, useUi } from '@/components/ui';
import { get, post } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { fmtDateTime, formatFCFA } from '@/lib/format';
import { useApi } from '@/lib/hooks';

export default function CaissePage() {
  return <RequirePerm perms={['cash.manage', 'finance.view']}><Caisse /></RequirePerm>;
}

function Caisse() {
  const { can } = useAuth();
  const { toast } = useUi();
  const current = useApi<any>('/cash/current');
  const sessions = useApi<any[]>('/cash/sessions');
  const [modal, setModal] = useState<'open' | 'close' | 'move' | null>(null);
  const [detail, setDetail] = useState<any | null>(null);
  const [amount, setAmount] = useState<number | ''>('');
  const [text, setText] = useState('');
  const [type, setType] = useState('OUT');
  const [busy, setBusy] = useState(false);
  const refresh = () => { current.reload(); sessions.reload(); };
  const s = current.data;
  const diff = s && amount !== '' ? Number(amount) - s.theoretical : 0;
  const run = async (fn: () => Promise<unknown>, msg: string) => {
    setBusy(true);
    try { await fn(); toast('success', msg); setModal(null); setAmount(''); setText(''); refresh(); } catch (e: any) { toast('error', e.message); } finally { setBusy(false); }
  };
  return (
    <>
      <PageHeader title="Caisse" subtitle="Espèces : ouverture, mouvements, clôture et écarts" actions={can('cash.manage') && (s
        ? <><Button variant="outline" icon={<ArrowUpCircle className="h-4 w-4" />} onClick={() => { setType('OUT'); setModal('move'); }}>Mouvement manuel</Button><Button variant="dark" icon={<Lock className="h-4 w-4" />} onClick={() => { setAmount(''); setModal('close'); }}>Clôturer la caisse</Button></>
        : !current.loading && <Button icon={<Unlock className="h-4 w-4" />} onClick={() => { setAmount(sessions.data?.[0]?.countedAmount ?? ''); setModal('open'); }}>Ouvrir la caisse</Button>)} />
      {current.error && <ErrorBox error={current.error} onRetry={current.reload} />}
      {current.loading ? <Spinner /> : s ? (
        <>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <StatCard label={`Session ${s.number}`} value={<Badge tone="green">Ouverte</Badge>} hint={`${fmtDateTime(s.openedAt)} par ${s.openedByName}`} />
            <StatCard label="Fonds de caisse initial" value={formatFCFA(s.openingAmount)} />
            <StatCard label="Entrées / sorties" value={<span className="text-base">+{formatFCFA(s.totalIn, false)} / −{formatFCFA(s.totalOut, false)}</span>} />
            <StatCard tone="dark" label="Solde théorique" value={formatFCFA(s.theoretical)} hint="Espèces attendues en caisse" />
          </div>
          <div className="mt-5 grid gap-5 lg:grid-cols-3">
            <Card title="Mouvements d'espèces" className="lg:col-span-2">
              <Table rows={[...s.movements].reverse()} empty="Aucun mouvement." columns={[
                { key: 'createdAt', label: 'Heure', render: (m: any) => fmtDateTime(m.createdAt) },
                { key: 'source', label: 'Origine', render: (m: any) => CASH_SOURCE_LABELS[m.source] },
                { key: 'label', label: 'Libellé' },
                { key: 'user', label: 'Par', render: (m: any) => m.userName },
                { key: 'amount', label: 'Montant', align: 'right', render: (m: any) => <b className={m.type === 'IN' ? 'text-emerald-700' : 'text-red-600'}>{m.type === 'IN' ? '+' : '−'}{formatFCFA(m.amount)}</b> },
              ]} />
            </Card>
            <Card title="Encaissements de la session (tous moyens)">
              <ul className="space-y-1 text-sm">
                {s.paymentsByMethod.length === 0 && <li className="text-neutral-500">Aucun encaissement.</li>}
                {s.paymentsByMethod.map((p: any) => <li key={p.method + p.kind} className="flex justify-between"><span>{PAYMENT_METHOD_LABELS[p.method]} <span className="text-xs text-neutral-500">({PAYMENT_KIND_LABELS[p.kind]})</span></span><b>{p.kind === 'REFUND' ? '−' : ''}{formatFCFA(p.amount)}</b></li>)}
              </ul>
              <p className="mt-3 text-xs text-neutral-500">Seules les espèces sont dans le tiroir-caisse ; Mobile Money et virements sont suivis dans la trésorerie.</p>
            </Card>
          </div>
        </>
      ) : <Card><p className="py-6 text-center text-sm text-neutral-500">La caisse est fermée. Ouvrez une session pour encaisser des espèces.</p></Card>}

      <Card title="Historique des sessions" className="mt-5">
        {sessions.data && <Table rows={sessions.data} onRowClick={(x: any) => get(`/cash/sessions/${x.id}`).then(setDetail)} columns={[
          { key: 'number', label: 'Session', render: (x: any) => <span className="font-mono text-xs">{x.number}</span> },
          { key: 'openedAt', label: 'Ouverture', render: (x: any) => fmtDateTime(x.openedAt) },
          { key: 'closedAt', label: 'Clôture', render: (x: any) => x.closedAt ? fmtDateTime(x.closedAt) : <Badge tone="green">Ouverte</Badge> },
          { key: 'openingAmount', label: 'Fonds initial', align: 'right', render: (x: any) => formatFCFA(x.openingAmount) },
          { key: 'expectedAmount', label: 'Théorique', align: 'right', render: (x: any) => x.expectedAmount != null ? formatFCFA(x.expectedAmount) : '' },
          { key: 'countedAmount', label: 'Réel', align: 'right', render: (x: any) => x.countedAmount != null ? formatFCFA(x.countedAmount) : '' },
          { key: 'difference', label: 'Écart', align: 'right', render: (x: any) => x.difference ? <b className="text-red-600">{formatFCFA(x.difference)}</b> : x.difference === 0 ? <span className="text-emerald-700">0</span> : '' },
          { key: 'differenceReason', label: 'Justification', render: (x: any) => <span className="text-xs">{x.differenceReason}</span> },
        ]} />}
      </Card>

      <Modal open={modal === 'open'} onClose={() => setModal(null)} title="Ouvrir la caisse" size="sm" footer={<Button loading={busy} disabled={amount === ''} onClick={() => run(() => post('/cash/open', { openingAmount: Number(amount), notes: text || undefined }), 'Caisse ouverte')}>Ouvrir</Button>}>
        <Field label="Fonds de caisse compté" hint="Montant en espèces présent dans le tiroir à l'ouverture"><MoneyInput value={amount} onChange={setAmount} /></Field>
      </Modal>
      <Modal open={modal === 'move'} onClose={() => setModal(null)} title="Mouvement manuel d'espèces" size="sm" footer={<Button loading={busy} disabled={!amount || text.length < 3} onClick={() => run(() => post('/cash/movements', { type, amount: Number(amount), label: text }), 'Mouvement enregistré')}>Enregistrer</Button>}>
        <div className="space-y-3">
          <Field label="Sens"><Select value={type} onChange={(e) => setType(e.target.value)}><option value="OUT">Sortie (dépôt en banque, petite dépense…)</option><option value="IN">Entrée (apport, approvisionnement en monnaie…)</option></Select></Field>
          <Field label="Montant"><MoneyInput value={amount} onChange={setAmount} /></Field>
          <Field label="Libellé / justification" required><Input value={text} onChange={(e) => setText(e.target.value)} /></Field>
          <p className="text-xs text-neutral-500">Pour une charge (eau, transport…), utilisez plutôt « Dépenses » : elle sera comptabilisée.</p>
        </div>
      </Modal>
      <Modal open={modal === 'close'} onClose={() => setModal(null)} title="Clôture de caisse" size="sm" footer={<Button variant="dark" loading={busy} disabled={amount === '' || (diff !== 0 && text.trim().length < 3)} onClick={() => run(() => post('/cash/close', { countedAmount: Number(amount), differenceReason: text || undefined }), 'Caisse clôturée')}>Clôturer</Button>}>
        {s && <div className="space-y-3 text-sm">
          <p className="flex justify-between rounded-lg bg-neutral-100 p-3"><span>Solde théorique</span><b>{formatFCFA(s.theoretical)}</b></p>
          <Field label="Solde réel compté"><MoneyInput value={amount} onChange={setAmount} autoFocus /></Field>
          {amount !== '' && <p className={`flex justify-between rounded-lg p-3 font-semibold ${diff === 0 ? 'bg-emerald-50 text-emerald-800' : 'bg-red-50 text-red-800'}`}><span>Écart</span><span>{diff > 0 ? '+' : ''}{formatFCFA(diff)}</span></p>}
          {diff !== 0 && amount !== '' && <Field label="Justification de l'écart" required><Textarea value={text} onChange={(e) => setText(e.target.value)} /></Field>}
        </div>}
      </Modal>
      <Modal open={!!detail} onClose={() => setDetail(null)} title={`Session ${detail?.number ?? ''}`} size="lg">
        {detail && <>
          <p className="mb-3 text-sm">Ouverte le {fmtDateTime(detail.openedAt)} par {detail.openedByName}{detail.closedAt && <> · clôturée le {fmtDateTime(detail.closedAt)} par {detail.closedByName}</>}. Théorique {formatFCFA(detail.theoretical)}{detail.countedAmount != null && <> · réel {formatFCFA(detail.countedAmount)} · écart {formatFCFA(detail.difference)}</>}</p>
          <Table rows={detail.movements} columns={[
            { key: 'createdAt', label: 'Heure', render: (m: any) => fmtDateTime(m.createdAt) },
            { key: 'source', label: 'Origine', render: (m: any) => CASH_SOURCE_LABELS[m.source] },
            { key: 'label', label: 'Libellé' },
            { key: 'amount', label: 'Montant', align: 'right', render: (m: any) => `${m.type === 'IN' ? '+' : '−'}${formatFCFA(m.amount)}` },
          ]} />
        </>}
      </Modal>
    </>
  );
}
