'use client';
import Link from 'next/link';
import { useState } from 'react';
import { PAYMENT_METHOD_LABELS } from '@dread-royal/shared';
import { RequirePerm } from '@/components/AppShell';
import { Card, ErrorBox, Input, PageHeader, Spinner, StatCard, Table, Tabs } from '@/components/ui';
import { openFile, qs } from '@/lib/api';
import { fmtDate, fmtPhone, formatFCFA, todayISO } from '@/lib/format';
import { useApi } from '@/lib/hooks';

export default function FinancesPage() {
  return <RequirePerm perms={['finance.view']}><Finances /></RequirePerm>;
}

function Row({ label, value, bold, sub, account }: { label: React.ReactNode; value: number; bold?: boolean; sub?: boolean; account?: string | null }) {
  return (
    <div className={`flex items-center justify-between gap-3 py-1.5 text-sm ${bold ? 'border-t-2 border-royal-gold/50 font-bold' : ''} ${sub ? 'pl-4 text-neutral-600' : ''}`}>
      <span>{label}{account && <span className="ml-2 text-[10px] text-neutral-400">{account}</span>}</span>
      <span className={`tabular-nums ${value < 0 ? 'text-red-600' : ''}`}>{formatFCFA(value)}</span>
    </div>
  );
}

function Finances() {
  const [tab, setTab] = useState<'resultat' | 'tresorerie' | 'creances' | 'dettes'>('resultat');
  const [period, setPeriod] = useState('month');
  const [date, setDate] = useState(todayISO());
  const sum = useApi<any>(tab === 'resultat' ? `/finance/summary${qs({ period, date })}` : null);
  const tre = useApi<any>(tab === 'tresorerie' ? '/finance/treasury' : null);
  const rec = useApi<any>(tab === 'creances' ? '/finance/receivables' : null);
  const pay = useApi<any>(tab === 'dettes' ? '/finance/payables' : null);
  const s = sum.data;
  return (
    <>
      <PageHeader title="Comptabilité & finances" subtitle="Présentation de gestion conforme à l'esprit SYSCOHADA — à valider par un professionnel comptable" />
      <Tabs value={tab} onChange={setTab} tabs={[{ key: 'resultat', label: 'Résultat' }, { key: 'tresorerie', label: 'Trésorerie' }, { key: 'creances', label: 'Créances clients' }, { key: 'dettes', label: 'Dettes fournisseurs' }]} />
      {tab === 'resultat' && (
        <>
          <div className="mb-4 flex flex-wrap gap-2">
            <div className="flex rounded-lg bg-neutral-200 p-0.5">{[['day', 'Jour'], ['week', 'Semaine'], ['month', 'Mois'], ['year', 'Année']].map(([k, l]) => <button key={k} onClick={() => setPeriod(k)} className={`rounded-md px-3 py-1 text-sm font-semibold ${period === k ? 'bg-royal-black text-royal-gold' : ''}`}>{l}</button>)}</div>
            <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="w-40" />
            <button className="text-sm font-semibold text-royal-gold-dark hover:underline" onClick={() => openFile(`/reports/result${qs({ period, date, format: 'pdf' })}`)}>Exporter en PDF</button>
          </div>
          {sum.error && <ErrorBox error={sum.error} onRetry={sum.reload} />}
          {sum.loading && !s ? <Spinner /> : s && (
            <>
              <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-5">
                <StatCard tone="dark" label="Chiffre d'affaires" value={formatFCFA(s.revenue.total)} hint={`${s.revenue.salesCount} ventes · facturé`} />
                <StatCard label="Encaissements" value={formatFCFA(s.cash.totalIn)} hint="Argent réellement reçu" />
                <StatCard label="Charges (dépenses)" value={formatFCFA(s.totalExpenses)} hint="Engagées, payées ou non" />
                <StatCard tone="gold" label="Résultat comptable" value={<span className={s.accountingResult < 0 ? 'text-red-600' : ''}>{formatFCFA(s.accountingResult)}</span>} />
                <StatCard tone="gold" label="Bénéfice estimé" value={<span className={s.estimatedProfit < 0 ? 'text-red-600' : ''}>{formatFCFA(s.estimatedProfit)}</span>} hint="Après commissions dues" />
              </div>
              <div className="grid gap-5 lg:grid-cols-2">
                <Card title={`Compte de résultat simplifié — ${s.period.label}`}>
                  <Row label="Prestations de services" account="706" value={s.revenue.services} sub />
                  <Row label="Ventes de produits" account="701" value={s.revenue.products} sub />
                  <Row label="Forfaits" account="706" value={s.revenue.packages} sub />
                  <Row label="Chiffre d'affaires" value={s.revenue.total} />
                  <Row label="Acomptes conservés (ventes annulées)" account="758" value={s.retainedDeposits} sub />
                  <Row label="Autres recettes" account="75" value={s.otherIncome} sub />
                  <Row label="Total des produits" value={s.revenue.total + s.retainedDeposits + s.otherIncome} bold />
                  <Row label="Coût d'achat des produits vendus" account="601" value={-s.costOfGoodsSold} sub />
                  <Row label="Consommations, pertes, écarts de stock" account="603" value={-s.stockConsumption} sub />
                  {s.expenses.map((e: any) => <Row key={e.categoryId} label={e.name} account={e.account} value={-e.amount} sub />)}
                  <Row label="RÉSULTAT COMPTABLE" value={s.accountingResult} bold />
                  <Row label="Commissions dues non réglées (provision)" value={-s.commissionsProvision} sub />
                  <Row label="BÉNÉFICE ESTIMÉ" value={s.estimatedProfit} bold />
                  <p className="mt-2 text-xs text-neutral-500">Remises accordées : {formatFCFA(s.revenue.discounts)} · commissions en attente (ventes non soldées) : {formatFCFA(s.commissionsPending)} · reste à encaisser sur les ventes de la période : {formatFCFA(s.revenue.unpaidOnPeriodSales)}</p>
                </Card>
                <Card title="Flux de trésorerie de la période">
                  <p className="mb-2 text-xs font-bold uppercase text-neutral-500">Encaissements (nets des remboursements)</p>
                  {s.cash.encaissementsByMethod.map((m: any) => <Row key={m.method} label={PAYMENT_METHOD_LABELS[m.method]} value={m.amount} sub />)}
                  <Row label="Autres recettes" value={s.otherIncome} sub />
                  <Row label="Total encaissé" value={s.cash.totalIn} bold />
                  <p className="mb-2 mt-4 text-xs font-bold uppercase text-neutral-500">Décaissements (dépenses et fournisseurs payés)</p>
                  {s.cash.decaissementsByMethod.map((m: any) => <Row key={m.method} label={PAYMENT_METHOD_LABELS[m.method]} value={-m.amount} sub />)}
                  <Row label="Total décaissé" value={-s.cash.totalOut} bold />
                  <Row label="Variation de trésorerie" value={s.cash.netCashFlow} bold />
                  <Row label="Écarts de caisse constatés" value={s.cash.cashDifferences} sub />
                  <p className="mt-3 rounded-lg bg-royal-gold-light/50 p-3 text-xs text-neutral-700">La variation de trésorerie n&apos;est pas le bénéfice : un achat de stock ou le règlement d&apos;une dette sort de l&apos;argent sans être une charge de la période, et une vente à crédit est un produit sans encaissement.</p>
                </Card>
              </div>
            </>
          )}
        </>
      )}
      {tab === 'tresorerie' && (tre.loading || !tre.data ? <Spinner /> : (
        <>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6">
            <StatCard tone="dark" label="Trésorerie totale" value={formatFCFA(tre.data.total)} />
            {tre.data.accounts.map((a: any) => <StatCard key={a.method} label={PAYMENT_METHOD_LABELS[a.method]} value={<span className={a.balance < 0 ? 'text-red-600' : ''}>{formatFCFA(a.balance)}</span>} hint={a.opening ? `dont solde initial ${formatFCFA(a.opening)}` : undefined} />)}
          </div>
          <p className="mt-3 text-xs text-neutral-500">Soldes calculés à partir des soldes d&apos;ouverture (Paramètres → Trésorerie) et de toutes les opérations enregistrées. Un solde négatif indique un solde d&apos;ouverture non renseigné ou des paiements faits depuis un compte personnel.</p>
        </>
      ))}
      {tab === 'creances' && (rec.loading || !rec.data ? <Spinner /> : (
        <Card title={`Créances clients : ${formatFCFA(rec.data.total)}`}>
          <Table rows={rec.data.items} empty="Aucune créance : toutes les ventes sont soldées." columns={[
            { key: 'saleDate', label: 'Date', render: (s: any) => fmtDate(s.saleDate) },
            { key: 'number', label: 'Facture', render: (s: any) => <Link href={`/ventes/detail/?id=${s.id}`} className="font-mono text-xs text-royal-gold-dark hover:underline">{s.number}</Link> },
            { key: 'client', label: 'Client', render: (s: any) => s.client ? `${s.client.firstName} ${s.client.lastName}` : 'Passage' },
            { key: 'phone', label: 'Téléphone', render: (s: any) => fmtPhone(s.client?.phone) },
            { key: 'total', label: 'Total', align: 'right', render: (s: any) => formatFCFA(s.total) },
            { key: 'balance', label: 'Reste dû', align: 'right', render: (s: any) => <b className="text-red-600">{formatFCFA(s.balance)}</b> },
          ]} />
        </Card>
      ))}
      {tab === 'dettes' && (pay.loading || !pay.data ? <Spinner /> : (
        <Card title={`Dettes fournisseurs et charges à payer : ${formatFCFA(pay.data.total)}`}>
          <Table rows={pay.data.items} empty="Aucune dette." columns={[
            { key: 'date', label: 'Date', render: (p: any) => fmtDate(p.date) },
            { key: 'number', label: 'N°', render: (p: any) => <span className="font-mono text-xs">{p.number}</span> },
            { key: 'supplier', label: 'Fournisseur' },
            { key: 'label', label: 'Objet' },
            { key: 'amount', label: 'Montant', align: 'right', render: (p: any) => formatFCFA(p.amount) },
            { key: 'paid', label: 'Payé', align: 'right', render: (p: any) => formatFCFA(p.paid) },
            { key: 'balance', label: 'Reste dû', align: 'right', render: (p: any) => <b className="text-red-600">{formatFCFA(p.balance)}</b> },
          ]} />
        </Card>
      ))}
    </>
  );
}
