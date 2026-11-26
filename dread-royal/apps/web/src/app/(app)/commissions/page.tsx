'use client';
import { HandCoins } from 'lucide-react';
import { useState } from 'react';
import { COMMISSION_STATUS_LABELS, PAYMENT_METHOD_LABELS } from '@dread-royal/shared';
import { RequirePerm } from '@/components/AppShell';
import { PaymentMethodSelect } from '@/components/pickers';
import { Badge, Button, Card, Field, Input, Modal, PageHeader, Select, Spinner, StatCard, Table, Tabs, useUi } from '@/components/ui';
import { post, qs } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { fmtDate, fmtDateTime, formatFCFA, todayISO } from '@/lib/format';
import { useApi } from '@/lib/hooks';
import { commissionTone } from '@/lib/tones';

export default function CommissionsPage() {
  return <RequirePerm perms={['commissions.view_all', 'commissions.view_own']}><Commissions /></RequirePerm>;
}

function Commissions() {
  const { can } = useAuth();
  const { toast } = useUi();
  const [tab, setTab] = useState<'synthese' | 'detail' | 'reglements'>('synthese');
  const [date, setDate] = useState(todayISO());
  const [staffId, setStaffId] = useState('');
  const [status, setStatus] = useState('');
  const summary = useApi<any>(`/commissions/summary${qs({ date })}`);
  const list = useApi<any[]>(tab === 'detail' ? `/commissions${qs({ staffId, status })}` : null);
  const payouts = useApi<any[]>(tab === 'reglements' ? `/commissions/payouts${qs({ staffId })}` : null);
  const [pay, setPay] = useState<any | null>(null);
  const [method, setMethod] = useState('CASH');
  const [busy, setBusy] = useState(false);
  const all = can('commissions.view_all');
  const doPay = async () => {
    setBusy(true);
    try { const r = await post('/commissions/payouts', { staffId: pay.staffId, method }); toast('success', `Règlement ${r.number} : ${formatFCFA(r.amount)} — dépense « Commissions » enregistrée`); setPay(null); summary.reload(); payouts.reload(); } catch (e: any) { toast('error', e.message); } finally { setBusy(false); }
  };
  return (
    <>
      <PageHeader title={all ? 'Commissions' : 'Mes commissions'} subtitle="Calculées sur les prestations réalisées et entièrement payées par le client" actions={<Input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="w-40" />} />
      <Tabs value={tab} onChange={setTab} tabs={[{ key: 'synthese', label: 'Synthèse' }, { key: 'detail', label: 'Détail' }, { key: 'reglements', label: 'Règlements' }]} />
      {tab === 'synthese' && (summary.loading || !summary.data ? <Spinner /> : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {summary.data.staff.map((s: any) => (
            <Card key={s.staffId} title={s.name} actions={can('commissions.pay') && s.due > 0 && <Button size="sm" icon={<HandCoins className="h-3.5 w-3.5" />} onClick={() => setPay(s)}>Régler</Button>}>
              <p className="-mt-2 mb-3 text-xs text-neutral-500">{s.position} · {s.servicesThisMonth} prestation(s) ce mois</p>
              <div className="grid grid-cols-3 gap-2 text-center">
                <div className="rounded-lg bg-neutral-50 p-2"><p className="text-[10px] uppercase text-neutral-500">Jour</p><p className="font-bold">{formatFCFA(s.day, false)}</p></div>
                <div className="rounded-lg bg-neutral-50 p-2"><p className="text-[10px] uppercase text-neutral-500">Semaine</p><p className="font-bold">{formatFCFA(s.week, false)}</p></div>
                <div className="rounded-lg bg-neutral-50 p-2"><p className="text-[10px] uppercase text-neutral-500">Mois</p><p className="font-bold">{formatFCFA(s.month, false)}</p></div>
              </div>
              <div className="mt-3 flex justify-between text-sm"><span>Dû (à régler)</span><b className="text-royal-gold-dark">{formatFCFA(s.due)}</b></div>
              <div className="flex justify-between text-xs text-neutral-500"><span>En attente (ventes non soldées)</span><span>{formatFCFA(s.pending)}</span></div>
            </Card>
          ))}
        </div>
      ))}
      {tab !== 'synthese' && all && summary.data && (
        <div className="mb-3 flex flex-wrap gap-2">
          <Select value={staffId} onChange={(e) => setStaffId(e.target.value)} className="w-56"><option value="">Tous les collaborateurs</option>{summary.data.staff.map((s: any) => <option key={s.staffId} value={s.staffId}>{s.name}</option>)}</Select>
          {tab === 'detail' && <Select value={status} onChange={(e) => setStatus(e.target.value)} className="w-56"><option value="">Tous les statuts</option>{Object.entries(COMMISSION_STATUS_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</Select>}
        </div>
      )}
      {tab === 'detail' && <Card>{list.loading && !list.data ? <Spinner /> : <Table rows={list.data ?? []} empty="Aucune commission." columns={[
        { key: 'createdAt', label: 'Date', render: (c: any) => fmtDate(c.createdAt) },
        { key: 'staff', label: 'Collaborateur', render: (c: any) => `${c.staff.firstName} ${c.staff.lastName}` },
        { key: 'sale', label: 'Facture', render: (c: any) => <span className="font-mono text-xs">{c.saleItem.sale.number}</span> },
        { key: 'service', label: 'Prestation', render: (c: any) => <>{c.saleItem.label}{c.saleItem.sale.client && <p className="text-xs text-neutral-500">{c.saleItem.sale.client.firstName} {c.saleItem.sale.client.lastName}</p>}</> },
        { key: 'base', label: 'Base', align: 'right', render: (c: any) => formatFCFA(c.baseAmount, false) },
        { key: 'rule', label: 'Règle' },
        { key: 'amount', label: 'Commission', align: 'right', render: (c: any) => <b className={c.amount < 0 ? 'text-red-600' : ''}>{formatFCFA(c.amount)}</b> },
        { key: 'status', label: 'Statut', render: (c: any) => <Badge tone={commissionTone[c.status]}>{COMMISSION_STATUS_LABELS[c.status]}</Badge> },
      ]} />}</Card>}
      {tab === 'reglements' && <Card>{payouts.loading && !payouts.data ? <Spinner /> : <Table rows={payouts.data ?? []} empty="Aucun règlement." columns={[
        { key: 'number', label: 'N°', render: (p: any) => <span className="font-mono text-xs">{p.number}</span> },
        { key: 'createdAt', label: 'Date', render: (p: any) => fmtDateTime(p.createdAt) },
        { key: 'staff', label: 'Collaborateur', render: (p: any) => `${p.staff.firstName} ${p.staff.lastName}` },
        { key: 'period', label: 'Période couverte', render: (p: any) => `${fmtDate(p.periodFrom)} → ${fmtDate(p.periodTo)}` },
        { key: 'count', label: 'Lignes', align: 'right', render: (p: any) => p._count.commissions },
        { key: 'method', label: 'Moyen', render: (p: any) => PAYMENT_METHOD_LABELS[p.method] },
        { key: 'amount', label: 'Montant', align: 'right', render: (p: any) => <b>{formatFCFA(p.amount)}</b> },
      ]} />}</Card>}
      <Modal open={!!pay} onClose={() => setPay(null)} title={`Régler les commissions de ${pay?.name ?? ''}`} size="sm" footer={<Button loading={busy} onClick={doPay}>Payer {pay && formatFCFA(pay.due)}</Button>}>
        <div className="space-y-3 text-sm">
          <p>Toutes les commissions dues seront marquées comme réglées et une dépense « Commissions » sera créée automatiquement.</p>
          <Field label="Moyen de paiement"><PaymentMethodSelect value={method} onChange={(e) => setMethod(e.target.value)} /></Field>
        </div>
      </Modal>
    </>
  );
}
