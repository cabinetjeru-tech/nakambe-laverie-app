'use client';
import { Pencil, Plus, Trash2, Wallet } from 'lucide-react';
import { useEffect, useState } from 'react';
import { RequirePerm } from '@/components/AppShell';
import { PaymentMethodSelect, PayModal } from '@/components/pickers';
import { Badge, Button, Card, Field, Input, Modal, MoneyInput, PageHeader, Select, Spinner, Table, Tabs, Textarea, useUi } from '@/components/ui';
import { patch, post } from '@/lib/api';
import { fmtDate, fmtPhone, formatFCFA, todayISO } from '@/lib/format';
import { useApi } from '@/lib/hooks';
import { expenseTone } from '@/lib/tones';

export default function AchatsPage() {
  return <RequirePerm perms={['suppliers.manage']}><Achats /></RequirePerm>;
}

function Achats() {
  const { toast } = useUi();
  const [tab, setTab] = useState<'achats' | 'fournisseurs'>('achats');
  const purchases = useApi<any[]>('/stock/purchases');
  const suppliers = useApi<any[]>('/stock/suppliers');
  const products = useApi<any[]>('/stock/products');
  const [newPurchase, setNewPurchase] = useState(false);
  const [sup, setSup] = useState<any | null>(null);
  const [paying, setPaying] = useState<any | null>(null);
  return (
    <>
      <PageHeader title="Fournisseurs & achats" subtitle="Un achat de marchandises entre en stock et crée une dette fournisseur ; ce n'est pas une charge" actions={tab === 'achats' ? <Button icon={<Plus className="h-4 w-4" />} onClick={() => setNewPurchase(true)}>Nouvel achat</Button> : <Button icon={<Plus className="h-4 w-4" />} onClick={() => setSup({})}>Nouveau fournisseur</Button>} />
      <Tabs value={tab} onChange={setTab} tabs={[{ key: 'achats', label: 'Achats' }, { key: 'fournisseurs', label: 'Fournisseurs' }]} />
      {tab === 'achats' && <Card>{purchases.loading && !purchases.data ? <Spinner /> : <Table rows={purchases.data ?? []} empty="Aucun achat." columns={[
        { key: 'purchaseDate', label: 'Date', render: (p: any) => fmtDate(p.purchaseDate) },
        { key: 'number', label: 'N°', render: (p: any) => <span className="font-mono text-xs">{p.number}</span> },
        { key: 'supplier', label: 'Fournisseur', render: (p: any) => <>{p.supplier.name}{p.reference && <p className="text-xs text-neutral-500">Fact. {p.reference}</p>}</> },
        { key: 'lines', label: 'Produits', render: (p: any) => <span className="text-xs">{p.lines.map((l: any) => `${l.quantity} × ${l.product.name}`).join(', ')}</span> },
        { key: 'total', label: 'Total', align: 'right', render: (p: any) => <b>{formatFCFA(p.total)}</b> },
        { key: 'balance', label: 'Reste dû', align: 'right', render: (p: any) => formatFCFA(p.total - p.paidAmount) },
        { key: 'status', label: 'Statut', render: (p: any) => <Badge tone={expenseTone[p.status]}>{{ PAID: 'Payé', PARTIAL: 'Partiel', UNPAID: 'Non payé', CANCELLED: 'Annulé' }[p.status as string]}</Badge> },
        { key: 'a', label: '', render: (p: any) => p.status !== 'PAID' && <Button size="sm" variant="outline" icon={<Wallet className="h-3.5 w-3.5" />} onClick={() => setPaying(p)}>Régler</Button> },
      ]} />}</Card>}
      {tab === 'fournisseurs' && <Card>{suppliers.loading && !suppliers.data ? <Spinner /> : <Table rows={suppliers.data ?? []} columns={[
        { key: 'name', label: 'Fournisseur', render: (s: any) => <><b>{s.name}</b>{s.contact && <p className="text-xs text-neutral-500">{s.contact}</p>}</> },
        { key: 'phone', label: 'Téléphone', render: (s: any) => fmtPhone(s.phone) },
        { key: 'address', label: 'Adresse' },
        { key: 'products', label: 'Produits', align: 'right', render: (s: any) => s._count.products },
        { key: 'purchases', label: 'Achats', align: 'right', render: (s: any) => s._count.purchases },
        { key: 'active', label: 'Statut', render: (s: any) => <Badge tone={s.active ? 'green' : 'gray'}>{s.active ? 'Actif' : 'Inactif'}</Badge> },
        { key: 'e', label: '', render: (s: any) => <Button size="sm" variant="ghost" onClick={() => setSup(s)} icon={<Pencil className="h-3.5 w-3.5" />} /> },
      ]} />}</Card>}
      <PurchaseModal open={newPurchase} suppliers={(suppliers.data ?? []).filter((s) => s.active)} products={products.data ?? []} onClose={() => setNewPurchase(false)} onSaved={() => { setNewPurchase(false); purchases.reload(); products.reload(); }} />
      <SupplierModal supplier={sup} onClose={() => setSup(null)} onSaved={() => { setSup(null); suppliers.reload(); }} />
      <PayModal open={!!paying} onClose={() => setPaying(null)} title={`Régler ${paying?.number ?? ''}`} max={paying ? paying.total - paying.paidAmount : 0} onPay={async (b) => { await post(`/stock/purchases/${paying.id}/pay`, b); toast('success', 'Règlement enregistré'); purchases.reload(); }} />
    </>
  );
}

function PurchaseModal({ open, suppliers, products, onClose, onSaved }: { open: boolean; suppliers: any[]; products: any[]; onClose: () => void; onSaved: () => void }) {
  const { toast } = useUi();
  const [supplierId, setSupplierId] = useState('');
  const [date, setDate] = useState(todayISO());
  const [lines, setLines] = useState<{ productId: string; quantity: number | ''; unitCost: number | '' }[]>([{ productId: '', quantity: 1, unitCost: '' }]);
  const [paid, setPaid] = useState<number | ''>(0);
  const [method, setMethod] = useState('CASH');
  const [reference, setReference] = useState('');
  const [notes, setNotes] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (open) { setLines([{ productId: '', quantity: 1, unitCost: '' }]); setPaid(0); setReference(''); setNotes(''); } }, [open]);
  const total = lines.reduce((a, l) => a + (Number(l.quantity) || 0) * (Number(l.unitCost) || 0), 0);
  const save = async () => {
    setBusy(true);
    try {
      await post('/stock/purchases', { supplierId, purchaseDate: date, lines: lines.filter((l) => l.productId).map((l) => ({ productId: l.productId, quantity: Number(l.quantity), unitCost: Number(l.unitCost) })), paidAmount: Number(paid) || 0, method: Number(paid) ? method : undefined, reference: reference || undefined, notes: notes || undefined });
      toast('success', 'Achat enregistré, stock mis à jour'); onSaved();
    } catch (e: any) { toast('error', e.message); } finally { setBusy(false); }
  };
  return (
    <Modal open={open} onClose={onClose} size="lg" title="Nouvel achat fournisseur" footer={<><Button variant="outline" onClick={onClose}>Annuler</Button><Button loading={busy} disabled={!supplierId || !lines.some((l) => l.productId && Number(l.quantity) > 0)} onClick={save}>Enregistrer ({formatFCFA(total)})</Button></>}>
      <div className="grid gap-3 sm:grid-cols-3">
        <Field label="Fournisseur" required><Select value={supplierId} onChange={(e) => setSupplierId(e.target.value)}><option value="">— Choisir —</option>{suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</Select></Field>
        <Field label="Date"><Input type="date" value={date} onChange={(e) => setDate(e.target.value)} /></Field>
        <Field label="N° facture fournisseur"><Input value={reference} onChange={(e) => setReference(e.target.value)} /></Field>
      </div>
      <div className="mt-4 space-y-2">
        {lines.map((l, i) => (
          <div key={i} className="grid gap-2 sm:grid-cols-[2fr_1fr_1fr_auto]">
            <Select value={l.productId} onChange={(e) => { const p = products.find((x) => x.id === e.target.value); setLines(lines.map((x, j) => (j === i ? { ...x, productId: e.target.value, unitCost: p?.purchasePrice ?? '' } : x))); }}><option value="">— Produit —</option>{products.map((p) => <option key={p.id} value={p.id}>{p.name} (stock {p.quantity})</option>)}</Select>
            <Input type="number" min={1} value={l.quantity} onChange={(e) => setLines(lines.map((x, j) => (j === i ? { ...x, quantity: e.target.value === '' ? '' : Number(e.target.value) } : x)))} placeholder="Qté" />
            <MoneyInput value={l.unitCost} onChange={(v) => setLines(lines.map((x, j) => (j === i ? { ...x, unitCost: v } : x)))} placeholder="Coût unitaire" />
            <Button variant="ghost" onClick={() => setLines(lines.filter((_, j) => j !== i))} disabled={lines.length === 1} aria-label="Retirer"><Trash2 className="h-4 w-4" /></Button>
          </div>
        ))}
        <Button size="sm" variant="ghost" icon={<Plus className="h-3.5 w-3.5" />} onClick={() => setLines([...lines, { productId: '', quantity: 1, unitCost: '' }])}>Ajouter une ligne</Button>
      </div>
      <div className="mt-4 grid gap-3 sm:grid-cols-3">
        <Field label="Montant payé maintenant" hint="0 = achat à crédit (dette)"><MoneyInput value={paid} onChange={setPaid} /></Field>
        {Number(paid) > 0 && <Field label="Moyen de paiement"><PaymentMethodSelect value={method} onChange={(e) => setMethod(e.target.value)} /></Field>}
        <Field label="Notes"><Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={1} /></Field>
      </div>
    </Modal>
  );
}

function SupplierModal({ supplier, onClose, onSaved }: { supplier: any | null; onClose: () => void; onSaved: () => void }) {
  const { toast } = useUi();
  const [f, setF] = useState<any>({});
  useEffect(() => { if (supplier) setF({ name: '', contact: '', phone: '', address: '', notes: '', active: true, ...supplier }); }, [supplier]);
  const set = (k: string) => (e: any) => setF({ ...f, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value });
  const save = async () => {
    const body = { name: f.name, contact: f.contact || undefined, phone: f.phone || undefined, address: f.address || undefined, notes: f.notes || undefined, active: f.active };
    try { if (supplier?.id) await patch(`/stock/suppliers/${supplier.id}`, body); else await post('/stock/suppliers', body); toast('success', 'Fournisseur enregistré'); onSaved(); } catch (e: any) { toast('error', e.message); }
  };
  return (
    <Modal open={!!supplier} onClose={onClose} title={supplier?.id ? supplier.name : 'Nouveau fournisseur'} size="sm" footer={<Button disabled={!f.name} onClick={save}>Enregistrer</Button>}>
      <div className="space-y-3">
        <Field label="Nom" required><Input value={f.name ?? ''} onChange={set('name')} /></Field>
        <Field label="Contact"><Input value={f.contact ?? ''} onChange={set('contact')} /></Field>
        <Field label="Téléphone"><Input value={f.phone ?? ''} onChange={set('phone')} /></Field>
        <Field label="Adresse"><Input value={f.address ?? ''} onChange={set('address')} /></Field>
        <Field label="Notes"><Textarea value={f.notes ?? ''} onChange={set('notes')} rows={2} /></Field>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={!!f.active} onChange={set('active')} />Actif</label>
      </div>
    </Modal>
  );
}
