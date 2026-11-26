'use client';
import { Ban, Plus, Wallet } from 'lucide-react';
import { useState } from 'react';
import { EXPENSE_STATUS_LABELS, PAYMENT_METHOD_LABELS } from '@dread-royal/shared';
import { RequirePerm } from '@/components/AppShell';
import { PaymentMethodSelect, PayModal } from '@/components/pickers';
import { Badge, Button, Card, ErrorBox, Field, Input, Modal, MoneyInput, PageHeader, Select, Spinner, StatCard, Table, Tabs, Textarea, useUi } from '@/components/ui';
import { post, qs } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { fmtDate, formatFCFA, todayISO } from '@/lib/format';
import { useApi } from '@/lib/hooks';
import { expenseTone } from '@/lib/tones';

export default function DepensesPage() {
  return <RequirePerm perms={['expenses.view']}><Depenses /></RequirePerm>;
}

function Depenses() {
  const { can } = useAuth();
  const { toast, confirm } = useUi();
  const [tab, setTab] = useState<'dep' | 'rec'>('dep');
  const monthStart = todayISO().slice(0, 8) + '01';
  const [from, setFrom] = useState(monthStart);
  const [to, setTo] = useState(todayISO());
  const [categoryId, setCat] = useState('');
  const cats = useApi<any[]>('/finance/expense-categories');
  const exp = useApi<any[]>(`/finance/expenses${qs({ from, to, categoryId })}`);
  const inc = useApi<any[]>(`/finance/incomes${qs({ from, to })}`);
  const suppliers = useApi<any[]>(can('expenses.manage') ? '/stock/suppliers' : null);
  const [creating, setCreating] = useState(false);
  const [creatingInc, setCreatingInc] = useState(false);
  const [paying, setPaying] = useState<any | null>(null);
  const live = (exp.data ?? []).filter((e) => e.status !== 'CANCELLED');
  const cancel = async (path: string, label: string, reload: () => void) => {
    const r = await confirm({ title: `Annuler ${label}`, message: "L'opération restera visible avec le statut « Annulée ». Les espèces éventuellement sorties sont réintégrées en caisse.", danger: true, reasonLabel: 'Motif', reasonRequired: true });
    if (!r.ok) return;
    try { await post(path, { reason: r.reason }); toast('success', 'Opération annulée'); reload(); } catch (e: any) { toast('error', e.message); }
  };
  return (
    <>
      <PageHeader title="Dépenses & recettes" actions={can('expenses.manage') && (tab === 'dep' ? <Button icon={<Plus className="h-4 w-4" />} onClick={() => setCreating(true)}>Nouvelle dépense</Button> : <Button icon={<Plus className="h-4 w-4" />} onClick={() => setCreatingInc(true)}>Nouvelle recette</Button>)} />
      <Tabs value={tab} onChange={setTab} tabs={[{ key: 'dep', label: 'Dépenses (charges)' }, { key: 'rec', label: 'Autres recettes' }]} />
      <div className="mb-4 flex flex-wrap gap-2">
        <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="w-40" />
        <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="w-40" />
        {tab === 'dep' && <Select value={categoryId} onChange={(e) => setCat(e.target.value)} className="w-64"><option value="">Toutes les catégories</option>{cats.data?.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</Select>}
      </div>
      {tab === 'dep' ? (
        <>
          <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-3">
            <StatCard tone="dark" label="Charges de la période" value={formatFCFA(live.reduce((a, e) => a + e.amount, 0))} />
            <StatCard label="Payé" value={formatFCFA(live.reduce((a, e) => a + e.paidAmount, 0))} />
            <StatCard label="Reste à payer (dettes)" value={formatFCFA(live.reduce((a, e) => a + e.amount - e.paidAmount, 0))} tone="red" />
          </div>
          <Card>
            {exp.error && <ErrorBox error={exp.error} onRetry={exp.reload} />}
            {exp.loading && !exp.data ? <Spinner /> : <Table rows={exp.data ?? []} empty="Aucune dépense." rowClassName={(e: any) => (e.status === 'CANCELLED' ? 'opacity-50' : undefined)} columns={[
              { key: 'expenseDate', label: 'Date', render: (e: any) => fmtDate(e.expenseDate) },
              { key: 'number', label: 'N°', render: (e: any) => <span className="font-mono text-xs">{e.number}</span> },
              { key: 'category', label: 'Catégorie', render: (e: any) => <><span>{e.category.name}</span><p className="text-[10px] text-neutral-400">Compte {e.category.syscohadaAccount}</p></> },
              { key: 'label', label: 'Libellé', render: (e: any) => <>{e.label}{e.supplier && <p className="text-xs text-neutral-500">{e.supplier.name}</p>}{e.cancelReason && <p className="text-xs text-red-600">Annulée : {e.cancelReason}</p>}</> },
              { key: 'method', label: 'Moyen', render: (e: any) => e.method ? PAYMENT_METHOD_LABELS[e.method] : '' },
              { key: 'amount', label: 'Montant', align: 'right', render: (e: any) => <b>{formatFCFA(e.amount)}</b> },
              { key: 'status', label: 'Statut', render: (e: any) => <Badge tone={expenseTone[e.status]}>{EXPENSE_STATUS_LABELS[e.status]}</Badge> },
              ...(can('expenses.manage') ? [{ key: 'actions', label: '', render: (e: any) => e.status !== 'CANCELLED' && <div className="flex gap-1">{e.status !== 'PAID' && <Button size="sm" variant="outline" onClick={() => setPaying(e)} icon={<Wallet className="h-3.5 w-3.5" />}>Régler</Button>}<Button size="sm" variant="ghost" onClick={() => cancel(`/finance/expenses/${e.id}/cancel`, `la dépense ${e.number}`, exp.reload)} aria-label="Annuler"><Ban className="h-3.5 w-3.5" /></Button></div> }] : []),
            ]} />}
          </Card>
        </>
      ) : (
        <Card>
          <p className="mb-3 text-xs text-neutral-500">Recettes hors ventes : location de poste, formation, divers. Les ventes sont enregistrées dans « Nouvelle vente ».</p>
          {inc.loading && !inc.data ? <Spinner /> : <Table rows={inc.data ?? []} empty="Aucune autre recette." rowClassName={(e: any) => (e.cancelledAt ? 'opacity-50' : undefined)} columns={[
            { key: 'incomeDate', label: 'Date', render: (e: any) => fmtDate(e.incomeDate) },
            { key: 'number', label: 'N°', render: (e: any) => <span className="font-mono text-xs">{e.number}</span> },
            { key: 'category', label: 'Catégorie' },
            { key: 'label', label: 'Libellé', render: (e: any) => <>{e.label}{e.cancelReason && <p className="text-xs text-red-600">Annulée : {e.cancelReason}</p>}</> },
            { key: 'method', label: 'Moyen', render: (e: any) => PAYMENT_METHOD_LABELS[e.method] },
            { key: 'amount', label: 'Montant', align: 'right', render: (e: any) => <b>{formatFCFA(e.amount)}</b> },
            ...(can('expenses.manage') ? [{ key: 'a', label: '', render: (e: any) => !e.cancelledAt && <Button size="sm" variant="ghost" onClick={() => cancel(`/finance/incomes/${e.id}/cancel`, `la recette ${e.number}`, inc.reload)} aria-label="Annuler"><Ban className="h-3.5 w-3.5" /></Button> }] : []),
          ]} />}
        </Card>
      )}
      <ExpenseModal open={creating} onClose={() => setCreating(false)} categories={cats.data ?? []} suppliers={suppliers.data ?? []} onSaved={() => { setCreating(false); exp.reload(); }} />
      <IncomeModal open={creatingInc} onClose={() => setCreatingInc(false)} onSaved={() => { setCreatingInc(false); inc.reload(); }} />
      <PayModal open={!!paying} onClose={() => setPaying(null)} title={`Régler ${paying?.number ?? ''}`} max={paying ? paying.amount - paying.paidAmount : 0} onPay={async (b) => { await post(`/finance/expenses/${paying.id}/pay`, b); toast('success', 'Règlement enregistré'); exp.reload(); }} />
    </>
  );
}

function ExpenseModal({ open, onClose, onSaved, categories, suppliers }: { open: boolean; onClose: () => void; onSaved: () => void; categories: any[]; suppliers: any[] }) {
  const { toast } = useUi();
  const [f, setF] = useState<any>({ expenseDate: todayISO(), method: 'CASH', paidNow: 'full' });
  const [busy, setBusy] = useState(false);
  const set = (k: string) => (e: any) => setF({ ...f, [k]: e.target.value });
  const save = async () => {
    setBusy(true);
    try {
      await post('/finance/expenses', { categoryId: f.categoryId, label: f.label, amount: Number(f.amount), expenseDate: f.expenseDate, paidAmount: f.paidNow === 'full' ? Number(f.amount) : f.paidNow === 'none' ? 0 : Number(f.paidAmount), method: f.paidNow === 'none' ? undefined : f.method, supplierId: f.supplierId || undefined, reference: f.reference || undefined, notes: f.notes || undefined });
      toast('success', 'Dépense enregistrée');
      setF({ expenseDate: todayISO(), method: 'CASH', paidNow: 'full' });
      onSaved();
    } catch (e: any) { toast('error', e.message); } finally { setBusy(false); }
  };
  return (
    <Modal open={open} onClose={onClose} title="Nouvelle dépense" footer={<><Button variant="outline" onClick={onClose}>Annuler</Button><Button loading={busy} disabled={!f.categoryId || !f.label || !f.amount} onClick={save}>Enregistrer</Button></>}>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Catégorie" required><Select value={f.categoryId ?? ''} onChange={set('categoryId')}><option value="">— Choisir —</option>{categories.map((c) => <option key={c.id} value={c.id}>{c.name} ({c.syscohadaAccount})</option>)}</Select></Field>
        <Field label="Date" required><Input type="date" value={f.expenseDate} onChange={set('expenseDate')} /></Field>
        <Field label="Libellé" required className="sm:col-span-2"><Input value={f.label ?? ''} onChange={set('label')} placeholder="Ex : facture SONABEL octobre" /></Field>
        <Field label="Montant" required><MoneyInput value={f.amount ?? ''} onChange={(v) => setF({ ...f, amount: v })} /></Field>
        <Field label="Fournisseur / prestataire"><Select value={f.supplierId ?? ''} onChange={set('supplierId')}><option value="">—</option>{suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</Select></Field>
        <Field label="Paiement"><Select value={f.paidNow} onChange={set('paidNow')}><option value="full">Payée en totalité</option><option value="partial">Payée partiellement</option><option value="none">Non payée (dette)</option></Select></Field>
        {f.paidNow !== 'none' && <Field label="Moyen de paiement"><PaymentMethodSelect value={f.method} onChange={set('method')} /></Field>}
        {f.paidNow === 'partial' && <Field label="Montant payé"><MoneyInput value={f.paidAmount ?? ''} onChange={(v) => setF({ ...f, paidAmount: v })} /></Field>}
        <Field label="Référence (facture, transaction)"><Input value={f.reference ?? ''} onChange={set('reference')} /></Field>
        <Field label="Notes" className="sm:col-span-2"><Textarea value={f.notes ?? ''} onChange={set('notes')} rows={2} /></Field>
      </div>
    </Modal>
  );
}

function IncomeModal({ open, onClose, onSaved }: { open: boolean; onClose: () => void; onSaved: () => void }) {
  const { toast } = useUi();
  const [f, setF] = useState<any>({ incomeDate: todayISO(), method: 'CASH', category: 'Location de poste' });
  const [busy, setBusy] = useState(false);
  const set = (k: string) => (e: any) => setF({ ...f, [k]: e.target.value });
  const save = async () => {
    setBusy(true);
    try { await post('/finance/incomes', { ...f, amount: Number(f.amount), reference: f.reference || undefined }); toast('success', 'Recette enregistrée'); onSaved(); } catch (e: any) { toast('error', e.message); } finally { setBusy(false); }
  };
  return (
    <Modal open={open} onClose={onClose} title="Autre recette" size="sm" footer={<Button loading={busy} disabled={!f.label || !f.amount} onClick={save}>Enregistrer</Button>}>
      <div className="space-y-3">
        <Field label="Catégorie"><Select value={f.category} onChange={set('category')}>{['Location de poste', 'Formation / apprentissage', 'Shooting / événement', 'Divers'].map((c) => <option key={c}>{c}</option>)}</Select></Field>
        <Field label="Libellé" required><Input value={f.label ?? ''} onChange={set('label')} /></Field>
        <Field label="Montant" required><MoneyInput value={f.amount ?? ''} onChange={(v) => setF({ ...f, amount: v })} /></Field>
        <Field label="Date"><Input type="date" value={f.incomeDate} onChange={set('incomeDate')} /></Field>
        <Field label="Moyen"><PaymentMethodSelect value={f.method} onChange={set('method')} /></Field>
        {f.method !== 'CASH' && <Field label="Référence"><Input value={f.reference ?? ''} onChange={set('reference')} /></Field>}
      </div>
    </Modal>
  );
}
