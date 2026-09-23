'use client';

import clsx from 'clsx';
import Link from 'next/link';
import { useState } from 'react';
import { DataTable } from '@/components/admin/table';
import { Alert, Badge, Button, Card, Input, PageHeader, Select, Stat } from '@/components/ui';
import { api } from '@/lib/api';
import { dateTime, fcfa, phoneDisplay } from '@/lib/format';
import type { Paginated } from '@/lib/types';
import { useApi } from '@/lib/use-api';

interface Summary {
  platformBalance: number;
  externalFlows: number;
  clientsCredit: number;
  owedToDrivers: number;
  cashHeldByDrivers: number;
  owedToMerchants: number;
  pendingPayouts: number;
}
interface Payout {
  id: string;
  amount: number;
  status: string;
  destinationPhone: string;
  reference: string | null;
  createdAt: string;
  wallet: { balance: number; user: { id: string; firstName: string; lastName: string; phone: string } | null; merchant: { id: string; name: string } | null };
}
interface WalletRow {
  id: string;
  kind: string;
  balance: number;
  user: { id: string; firstName: string; lastName: string; phone: string } | null;
  merchant: { id: string; name: string } | null;
}
interface Settlement {
  id: string;
  amount: number;
  method: string;
  reference: string | null;
  createdAt: string;
  driverId: string;
  driver: { user: { firstName: string; lastName: string; phone: string } };
}

const TABS = [
  ['retraits', 'Retraits et reversements'],
  ['especes', 'Versements d’espèces'],
  ['portefeuilles', 'Portefeuilles'],
] as const;
const KINDS: Record<string, string> = { DRIVER: 'Livreurs', MERCHANT: 'Commerçants', CLIENT: 'Clients', PLATFORM_REVENUE: 'Plateforme', CASH_CLEARING: 'Flux externes' };

export default function FinancePage() {
  const [tab, setTab] = useState<(typeof TABS)[number][0]>('retraits');
  const [kind, setKind] = useState('DRIVER');
  const summary = useApi<Summary>('/admin/finance/summary', { persist: false });
  const payouts = useApi<Paginated<Payout>>(tab === 'retraits' ? '/admin/payouts?pageSize=50' : null, { persist: false });
  const settlements = useApi<Paginated<Settlement>>(tab === 'especes' ? '/admin/cash-settlements?pageSize=50' : null, { persist: false });
  const wallets = useApi<Paginated<WalletRow>>(tab === 'portefeuilles' ? `/admin/wallets?kind=${kind}&pageSize=100` : null, { persist: false });
  const [refs, setRefs] = useState<Record<string, string>>({});
  const [message, setMessage] = useState<{ tone: 'green' | 'red'; text: string } | null>(null);
  const s = summary.data;

  const payoutAction = async (p: Payout, pay: boolean) => {
    setMessage(null);
    try {
      if (pay) await api(`/admin/payouts/${p.id}/pay`, { body: { reference: refs[p.id] } });
      else await api(`/admin/payouts/${p.id}/reject`, { body: { reason: refs[p.id] } });
      setMessage({ tone: 'green', text: pay ? 'Retrait marqué comme payé.' : 'Retrait refusé.' });
      void payouts.reload();
      void summary.reload();
    } catch (err) {
      setMessage({ tone: 'red', text: (err as Error).message });
    }
  };

  return (
    <div className="space-y-4">
      <PageHeader title="Finances" />
      {s && (
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
          <Stat label="Compte plateforme" value={fcfa(s.platformBalance)} hint="commissions + prépaiements en cours" />
          <Stat label="Espèces chez les livreurs" value={fcfa(s.cashHeldByDrivers)} tone={s.cashHeldByDrivers > 0 ? 'amber' : undefined} hint="à reverser à l’agence" />
          <Stat label="Dû aux livreurs" value={fcfa(s.owedToDrivers)} hint={`${s.pendingPayouts} retrait(s) en attente`} />
          <Stat label="Dû aux commerçants" value={fcfa(s.owedToMerchants)} hint="ventes livrées à reverser" />
          <Stat label="Crédit des clients" value={fcfa(s.clientsCredit)} hint="soldes des portefeuilles" />
          <Stat label="Flux externes" value={fcfa(-s.externalFlows)} hint="net reçu − versé (Mobile Money, espèces)" />
        </div>
      )}
      <div className="flex gap-1 rounded-xl bg-white p-1 shadow-card">
        {TABS.map(([k, label]) => (
          <button key={k} onClick={() => setTab(k)} className={clsx('flex-1 rounded-lg px-3 py-2 text-sm font-semibold', tab === k ? 'bg-brand text-white' : 'text-slate-600')}>
            {label}
          </button>
        ))}
      </div>
      {message && <Alert tone={message.tone}>{message.text}</Alert>}

      {tab === 'retraits' && (
        <DataTable
          rows={payouts.data?.items}
          rowKey={(r) => r.id}
          empty="Aucune demande de retrait"
          columns={[
            { header: 'Date', cell: (r) => dateTime(r.createdAt) },
            {
              header: 'Bénéficiaire',
              cell: (r) =>
                r.wallet.merchant ? (
                  <Link className="text-brand-light" href={`/admin/commercants/${r.wallet.merchant.id}`}>🏪 {r.wallet.merchant.name}</Link>
                ) : r.wallet.user ? (
                  <Link className="text-brand-light" href={`/admin/livreurs/${r.wallet.user.id}`}>{r.wallet.user.firstName} {r.wallet.user.lastName}</Link>
                ) : (
                  '—'
                ),
            },
            { header: 'Montant', cell: (r) => <strong>{fcfa(r.amount)}</strong> },
            { header: 'Vers', cell: (r) => phoneDisplay(r.destinationPhone) },
            { header: 'Solde actuel', cell: (r) => fcfa(r.wallet.balance) },
            { header: 'Statut', cell: (r) => <Badge tone={r.status === 'PAID' ? 'green' : r.status === 'REJECTED' ? 'red' : 'amber'}>{r.status === 'PAID' ? `Payé (${r.reference})` : r.status === 'REJECTED' ? 'Refusé' : 'À payer'}</Badge> },
            {
              header: 'Action',
              cell: (r) =>
                r.status === 'PENDING' || r.status === 'APPROVED' ? (
                  <div className="flex min-w-[240px] gap-1">
                    <Input className="py-1 text-xs" placeholder="Réf. transfert / motif" value={refs[r.id] ?? ''} onChange={(e) => setRefs({ ...refs, [r.id]: e.target.value })} />
                    <Button size="sm" variant="success" disabled={(refs[r.id] ?? '').length < 3} onClick={() => payoutAction(r, true)}>Payé</Button>
                    <Button size="sm" variant="outline" disabled={(refs[r.id] ?? '').length < 3} onClick={() => payoutAction(r, false)}>Refuser</Button>
                  </div>
                ) : null,
            },
          ]}
        />
      )}

      {tab === 'especes' && (
        <>
          <Card className="text-sm text-slate-600">Pour enregistrer un versement, ouvrez la fiche du livreur (section « Espèces et solde »).</Card>
          <DataTable
            rows={settlements.data?.items}
            rowKey={(r) => r.id}
            empty="Aucun versement enregistré"
            columns={[
              { header: 'Date', cell: (r) => dateTime(r.createdAt) },
              { header: 'Livreur', cell: (r) => <Link className="text-brand-light" href={`/admin/livreurs/${r.driverId}`}>{r.driver.user.firstName} {r.driver.user.lastName}</Link> },
              { header: 'Montant', cell: (r) => <strong>{fcfa(r.amount)}</strong> },
              { header: 'Moyen', cell: (r) => (r.method === 'ESPECES' ? 'Espèces' : 'Mobile Money') },
              { header: 'Référence', cell: (r) => r.reference ?? '—' },
            ]}
          />
        </>
      )}

      {tab === 'portefeuilles' && (
        <>
          <Select className="w-auto" value={kind} onChange={(e) => setKind(e.target.value)}>
            {Object.entries(KINDS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </Select>
          <DataTable
            rows={wallets.data?.items}
            rowKey={(r) => r.id}
            empty="Aucun portefeuille"
            columns={[
              { header: 'Titulaire', cell: (r) => (r.merchant ? r.merchant.name : r.user ? `${r.user.firstName} ${r.user.lastName}` : KINDS[r.kind]) },
              { header: 'Téléphone', cell: (r) => (r.user ? phoneDisplay(r.user.phone) : '—') },
              { header: 'Solde', cell: (r) => <span className={clsx('font-semibold', r.balance < 0 ? 'text-amber-700' : 'text-slate-800')}>{fcfa(r.balance)}</span> },
              { header: '', cell: (r) => <Link className="text-brand-light" href={`/admin/finances/portefeuilles/${r.id}`}>Mouvements →</Link> },
            ]}
          />
        </>
      )}
    </div>
  );
}
