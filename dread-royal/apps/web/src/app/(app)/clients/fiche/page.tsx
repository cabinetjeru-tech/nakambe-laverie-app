'use client';
import { ArrowLeft, CalendarPlus, Pencil, ShoppingCart } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';
import { APPOINTMENT_STATUS_LABELS, GENDER_LABELS, PAYMENT_KIND_LABELS, PAYMENT_METHOD_LABELS, PAYMENT_STATUS_LABELS } from '@dread-royal/shared';
import { ClientFormModal } from '@/components/pickers';
import { Badge, Button, Card, ErrorBox, PageHeader, Spinner, StatCard, Table, Tabs, useUi } from '@/components/ui';
import { patch } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { fmtDate, fmtDateTime, fmtPhone, formatFCFA } from '@/lib/format';
import { useApi, useQueryParam } from '@/lib/hooks';
import { apptTone } from '@/lib/tones';


export default function ClientDetail() {
  const id = useQueryParam('id');
  const { can } = useAuth();
  const { toast, confirm } = useUi();
  const { data, error, loading, reload } = useApi<any>(id ? `/clients/${id}` : null);
  const [tab, setTab] = useState<'rdv' | 'achats' | 'paiements' | 'fidelite'>('rdv');
  const [editing, setEditing] = useState(false);
  if (error) return <ErrorBox error={error} onRetry={reload} />;
  if (loading || !data) return <Spinner />;
  const c = data.client;
  const toggle = async () => {
    const r = await confirm({ title: c.active ? 'Désactiver le client' : 'Réactiver le client', message: c.active ? "Le client n'apparaîtra plus dans les recherches. Son historique est conservé." : 'Le client sera de nouveau visible.', danger: c.active });
    if (!r.ok) return;
    try { await patch(`/clients/${c.id}`, { active: !c.active }); toast('success', 'Fiche mise à jour'); reload(); } catch (e: any) { toast('error', e.message); }
  };
  return (
    <>
      <Link href="/clients/" className="mb-2 inline-flex items-center gap-1 text-sm text-neutral-500 hover:text-neutral-800"><ArrowLeft className="h-4 w-4" />Clients</Link>
      <PageHeader title={`${c.firstName} ${c.lastName}`} subtitle={<>{c.code} · {GENDER_LABELS[c.gender]} · {fmtPhone(c.phone) || 'pas de téléphone'} {c.phone2 && `/ ${fmtPhone(c.phone2)}`} · client depuis le {fmtDate(c.createdAt)} {!c.active && <Badge tone="red">Inactif</Badge>}</>}
        actions={<>
          {can('appointments.manage') && <Link href={`/rendez-vous/?client=${c.id}`}><Button variant="outline" icon={<CalendarPlus className="h-4 w-4" />}>Rendez-vous</Button></Link>}
          {can('sales.create') && <Link href={`/vente/?client=${c.id}`}><Button icon={<ShoppingCart className="h-4 w-4" />}>Vente</Button></Link>}
          {can('clients.manage') && <Button variant="dark" icon={<Pencil className="h-4 w-4" />} onClick={() => setEditing(true)}>Modifier</Button>}
        </>} />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        <StatCard label="Visites (RDV terminés)" value={data.stats.visits} />
        {can('sales.view') && <StatCard label="Total des achats" value={formatFCFA(data.stats.totalSpent)} />}
        {can('sales.view') && <StatCard label="Total payé" value={formatFCFA(data.stats.totalPaid)} />}
        {can('sales.view') && <StatCard label="Reste à payer (dette)" value={formatFCFA(data.stats.debt)} tone={data.stats.debt > 0 ? 'red' : 'green'} />}
        <StatCard tone="gold" label="Points fidélité" value={c.loyaltyPoints} hint={data.stats.lastVisit ? `Dernière visite : ${fmtDate(data.stats.lastVisit)}` : undefined} />
      </div>
      {(c.preferences || c.notes) && (
        <Card className="mt-4">
          {c.preferences && <p className="text-sm"><b className="text-royal-gold-dark">Préférences :</b> {c.preferences}</p>}
          {c.notes && <p className="mt-1 text-sm"><b className="text-royal-gold-dark">Observations :</b> {c.notes}</p>}
        </Card>
      )}
      <div className="mt-5">
        <Tabs value={tab} onChange={setTab} tabs={[{ key: 'rdv', label: `Rendez-vous (${data.appointments.length})` }, ...(can('sales.view') ? [{ key: 'achats' as const, label: `Achats (${data.sales.length})` }, { key: 'paiements' as const, label: `Paiements (${data.payments.length})` }] : []), { key: 'fidelite', label: 'Fidélité & forfaits' }]} />
        <Card>
          {tab === 'rdv' && <Table rows={data.appointments} empty="Aucun rendez-vous." columns={[
            { key: 'startAt', label: 'Date', render: (a: any) => fmtDateTime(a.startAt) },
            { key: 'services', label: 'Prestations', render: (a: any) => a.items.map((i: any) => i.service.name).join(', ') },
            { key: 'staff', label: 'Coiffeur', render: (a: any) => `${a.staff.firstName} ${a.staff.lastName}` },
            { key: 'status', label: 'Statut', render: (a: any) => <Badge tone={apptTone[a.status]}>{APPOINTMENT_STATUS_LABELS[a.status]}</Badge> },
          ]} />}
          {tab === 'achats' && <Table rows={data.sales} empty="Aucun achat." columns={[
            { key: 'number', label: 'Facture', render: (s: any) => <Link className="font-mono text-xs text-royal-gold-dark hover:underline" href={`/ventes/detail/?id=${s.id}`}>{s.number}</Link> },
            { key: 'saleDate', label: 'Date', render: (s: any) => fmtDateTime(s.saleDate) },
            { key: 'items', label: 'Détail', render: (s: any) => <span className="text-xs">{s.items.map((i: any) => i.label).join(', ')}</span> },
            { key: 'total', label: 'Total', align: 'right', render: (s: any) => formatFCFA(s.total) },
            { key: 'balance', label: 'Reste', align: 'right', render: (s: any) => s.status === 'CANCELLED' ? '—' : formatFCFA(s.balance) },
            { key: 'status', label: 'Statut', render: (s: any) => s.status === 'CANCELLED' ? <Badge tone="red">Annulée</Badge> : <Badge tone={s.paymentStatus === 'PAID' ? 'green' : 'orange'}>{PAYMENT_STATUS_LABELS[s.paymentStatus]}</Badge> },
          ]} />}
          {tab === 'paiements' && <Table rows={data.payments} empty="Aucun paiement." columns={[
            { key: 'number', label: 'Reçu', render: (p: any) => <span className="font-mono text-xs">{p.number}</span> },
            { key: 'paidAt', label: 'Date', render: (p: any) => fmtDateTime(p.paidAt) },
            { key: 'saleNumber', label: 'Facture' },
            { key: 'kind', label: 'Nature', render: (p: any) => <Badge tone={p.kind === 'REFUND' ? 'red' : p.kind === 'DEPOSIT' ? 'blue' : 'green'}>{PAYMENT_KIND_LABELS[p.kind]}</Badge> },
            { key: 'method', label: 'Moyen', render: (p: any) => PAYMENT_METHOD_LABELS[p.method] },
            { key: 'amount', label: 'Montant', align: 'right', render: (p: any) => `${p.kind === 'REFUND' ? '−' : ''}${formatFCFA(p.amount)}` },
          ]} />}
          {tab === 'fidelite' && (
            <div className="space-y-4">
              {data.subscriptions.length > 0 && <Table rows={data.subscriptions} columns={[
                { key: 'package', label: 'Forfait', render: (s: any) => s.package.name },
                { key: 'period', label: 'Validité', render: (s: any) => `${fmtDate(s.startDate)} → ${fmtDate(s.endDate)}` },
                { key: 'visits', label: 'Passages', render: (s: any) => `${s.visitsUsed} / ${s.visitsTotal}` },
                { key: 'status', label: 'Statut', render: (s: any) => <Badge tone={s.status === 'ACTIVE' ? 'green' : 'gray'}>{s.status === 'ACTIVE' ? 'Actif' : s.status === 'EXPIRED' ? 'Expiré' : 'Annulé'}</Badge> },
              ]} />}
              <Table rows={data.loyalty} empty="Aucun mouvement de points." columns={[
                { key: 'createdAt', label: 'Date', render: (t: any) => fmtDateTime(t.createdAt) },
                { key: 'type', label: 'Type', render: (t: any) => ({ EARN: 'Gain', REDEEM: 'Récompense utilisée', ADJUST: 'Ajustement', CANCEL: 'Annulation' } as any)[t.type] },
                { key: 'reason', label: 'Motif' },
                { key: 'points', label: 'Points', align: 'right', render: (t: any) => <b className={t.points < 0 ? 'text-red-600' : 'text-emerald-700'}>{t.points > 0 ? '+' : ''}{t.points}</b> },
              ]} />
            </div>
          )}
        </Card>
      </div>
      {can('clients.manage') && <div className="mt-4 text-right"><Button size="sm" variant="ghost" onClick={toggle}>{c.active ? 'Désactiver ce client' : 'Réactiver ce client'}</Button></div>}
      <ClientFormModal open={editing} client={c} onClose={() => setEditing(false)} onSaved={() => { setEditing(false); reload(); }} />
    </>
  );
}
