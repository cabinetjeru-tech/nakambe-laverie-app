'use client';
import { AlertTriangle, ArrowRightLeft, ClipboardCheck, Pencil, Plus, Search } from 'lucide-react';
import { useEffect, useState } from 'react';
import { STOCK_MOVEMENT_LABELS } from '@dread-royal/shared';
import { RequirePerm } from '@/components/AppShell';
import { Badge, Button, Card, ErrorBox, Field, Input, Modal, MoneyInput, PageHeader, Select, Spinner, StatCard, Table, Tabs, useUi } from '@/components/ui';
import { patch, post, qs } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { fmtDateTime, formatFCFA } from '@/lib/format';
import { useApi } from '@/lib/hooks';

export default function StockPage() {
  return <RequirePerm perms={['stock.view']}><Stock /></RequirePerm>;
}

function Stock() {
  const { can } = useAuth();
  const [tab, setTab] = useState<'produits' | 'mouvements' | 'inventaire'>('produits');
  const [search, setSearch] = useState('');
  const [alertsOnly, setAlertsOnly] = useState(false);
  useEffect(() => { if (new URLSearchParams(location.search).get('alertes')) setAlertsOnly(true); }, []);
  const products = useApi<any[]>(`/stock/products${qs({ includeInactive: 'true' })}`);
  const cats = useApi<any[]>('/stock/categories');
  const suppliers = useApi<any[]>('/stock/suppliers');
  const moves = useApi<any[]>(tab === 'mouvements' ? '/stock/movements' : null);
  const [edit, setEdit] = useState<any | null>(null);
  const [move, setMove] = useState<any | null>(null);
  const list = (products.data ?? []).filter((p) => (!alertsOnly || (p.alert && p.active)) && (!search || `${p.reference} ${p.name}`.toLowerCase().includes(search.toLowerCase())));
  const active = (products.data ?? []).filter((p) => p.active);
  return (
    <>
      <PageHeader title="Stock & produits" actions={can('stock.manage') && <><Button variant="outline" icon={<ArrowRightLeft className="h-4 w-4" />} onClick={() => setMove({})}>Mouvement</Button><Button icon={<Plus className="h-4 w-4" />} onClick={() => setEdit({})}>Nouveau produit</Button></>} />
      <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatCard label="Références actives" value={active.length} />
        <StatCard tone="dark" label="Valeur du stock (coût)" value={formatFCFA(active.reduce((a, p) => a + p.stockValue, 0))} />
        <StatCard label="Valeur à la vente" value={formatFCFA(active.filter((p) => p.sellable).reduce((a, p) => a + p.quantity * p.salePrice, 0))} />
        <StatCard label="Alertes de stock" value={active.filter((p) => p.alert).length} tone={active.some((p) => p.alert) ? 'red' : 'green'} onClick={() => { setTab('produits'); setAlertsOnly(true); }} />
      </div>
      <Tabs value={tab} onChange={setTab} tabs={[{ key: 'produits', label: 'Produits' }, { key: 'mouvements', label: 'Historique des mouvements' }, ...(can('stock.manage') ? [{ key: 'inventaire' as const, label: 'Inventaire' }] : [])]} />
      {tab === 'produits' && (
        <Card>
          <div className="mb-3 flex flex-wrap items-center gap-3">
            <div className="relative min-w-[220px] flex-1"><Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-neutral-400" /><Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Référence ou désignation" className="pl-9" /></div>
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={alertsOnly} onChange={(e) => setAlertsOnly(e.target.checked)} />Alertes uniquement</label>
          </div>
          {products.error && <ErrorBox error={products.error} onRetry={products.reload} />}
          {products.loading && !products.data ? <Spinner /> : <Table rows={list} rowClassName={(p: any) => (!p.active ? 'opacity-50' : undefined)} columns={[
            { key: 'reference', label: 'Réf.', render: (p: any) => <span className="font-mono text-xs">{p.reference}</span> },
            { key: 'name', label: 'Désignation', render: (p: any) => <><b>{p.name}</b><p className="text-xs text-neutral-500">{p.category.name}{p.supplier ? ` · ${p.supplier.name}` : ''}{!p.sellable ? ' · usage interne' : ''}</p></> },
            { key: 'quantity', label: 'Stock', align: 'right', render: (p: any) => <span className={`font-bold ${p.alert ? 'text-red-600' : ''}`}>{p.quantity} {p.alert && <AlertTriangle className="inline h-3.5 w-3.5" />}</span> },
            { key: 'min', label: 'Seuil', align: 'right', render: (p: any) => p.minQuantity },
            { key: 'cost', label: 'Coût (CMUP)', align: 'right', render: (p: any) => formatFCFA(p.purchasePrice, false) },
            { key: 'price', label: 'Prix vente', align: 'right', render: (p: any) => p.sellable ? formatFCFA(p.salePrice, false) : '—' },
            { key: 'value', label: 'Valeur', align: 'right', render: (p: any) => formatFCFA(p.stockValue, false) },
            ...(can('stock.manage') ? [{ key: 'a', label: '', render: (p: any) => <div className="flex gap-1"><Button size="sm" variant="ghost" onClick={() => setMove({ productId: p.id })} icon={<ArrowRightLeft className="h-3.5 w-3.5" />} /><Button size="sm" variant="ghost" onClick={() => setEdit(p)} icon={<Pencil className="h-3.5 w-3.5" />} /></div> }] : []),
          ]} />}
        </Card>
      )}
      {tab === 'mouvements' && <Card>{moves.loading && !moves.data ? <Spinner /> : <Table rows={moves.data ?? []} columns={[
        { key: 'createdAt', label: 'Date', render: (m: any) => fmtDateTime(m.createdAt) },
        { key: 'product', label: 'Produit', render: (m: any) => `${m.product.reference} — ${m.product.name}` },
        { key: 'type', label: 'Type', render: (m: any) => <Badge tone={m.quantity > 0 ? 'green' : 'orange'}>{STOCK_MOVEMENT_LABELS[m.type]}</Badge> },
        { key: 'quantity', label: 'Qté', align: 'right', render: (m: any) => <b>{m.quantity > 0 ? '+' : ''}{m.quantity}</b> },
        { key: 'after', label: 'Stock après', align: 'right', render: (m: any) => m.quantityAfter },
        { key: 'reason', label: 'Motif', render: (m: any) => <span className="text-xs">{m.reason}</span> },
      ]} />}</Card>}
      {tab === 'inventaire' && <Inventory products={active} onDone={() => { products.reload(); setTab('mouvements'); }} />}
      <ProductModal product={edit} categories={cats.data ?? []} suppliers={suppliers.data ?? []} onClose={() => setEdit(null)} onSaved={() => { setEdit(null); products.reload(); }} />
      <MoveModal init={move} products={active} onClose={() => setMove(null)} onSaved={() => { setMove(null); products.reload(); moves.reload(); }} />
    </>
  );
}

function ProductModal({ product, categories, suppliers, onClose, onSaved }: { product: any | null; categories: any[]; suppliers: any[]; onClose: () => void; onSaved: () => void }) {
  const { toast } = useUi();
  const [f, setF] = useState<any>({});
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (product) setF({ reference: '', name: '', categoryId: categories[0]?.id, purchasePrice: '', salePrice: '', minQuantity: 3, unit: 'pièce', sellable: true, active: true, initialQuantity: '', ...product, supplierId: product.supplierId ?? '' }); }, [product, categories]);
  const set = (k: string) => (e: any) => setF({ ...f, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value });
  const save = async () => {
    setBusy(true);
    const body: any = { name: f.name, categoryId: f.categoryId, supplierId: f.supplierId || undefined, purchasePrice: Number(f.purchasePrice) || 0, salePrice: Number(f.salePrice) || 0, minQuantity: Number(f.minQuantity) || 0, unit: f.unit, sellable: f.sellable, active: f.active };
    try {
      if (product?.id) await patch(`/stock/products/${product.id}`, body);
      else await post('/stock/products', { ...body, reference: f.reference.toUpperCase(), initialQuantity: Number(f.initialQuantity) || undefined });
      toast('success', 'Produit enregistré'); onSaved();
    } catch (e: any) { toast('error', e.message); } finally { setBusy(false); }
  };
  return (
    <Modal open={!!product} onClose={onClose} title={product?.id ? `Produit ${product.reference}` : 'Nouveau produit'} footer={<><Button variant="outline" onClick={onClose}>Annuler</Button><Button loading={busy} onClick={save}>Enregistrer</Button></>}>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Référence" required><Input value={f.reference ?? ''} onChange={set('reference')} disabled={!!product?.id} placeholder="GEL-LOCK" /></Field>
        <Field label="Catégorie"><Select value={f.categoryId ?? ''} onChange={set('categoryId')}>{categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</Select></Field>
        <Field label="Désignation" required className="sm:col-span-2"><Input value={f.name ?? ''} onChange={set('name')} /></Field>
        <Field label="Prix d'achat" hint={product?.id ? 'Mis à jour automatiquement (coût moyen) à chaque achat' : undefined}><MoneyInput value={f.purchasePrice ?? ''} onChange={(v) => setF({ ...f, purchasePrice: v })} /></Field>
        <Field label="Prix de vente"><MoneyInput value={f.salePrice ?? ''} onChange={(v) => setF({ ...f, salePrice: v })} /></Field>
        <Field label="Seuil minimum (alerte)"><Input type="number" min={0} value={f.minQuantity ?? ''} onChange={set('minQuantity')} /></Field>
        <Field label="Fournisseur"><Select value={f.supplierId ?? ''} onChange={set('supplierId')}><option value="">—</option>{suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</Select></Field>
        {!product?.id && <Field label="Stock initial"><Input type="number" min={0} value={f.initialQuantity ?? ''} onChange={set('initialQuantity')} /></Field>}
        <Field label="Unité"><Input value={f.unit ?? ''} onChange={set('unit')} /></Field>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={!!f.sellable} onChange={set('sellable')} />Vendu aux clients</label>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={!!f.active} onChange={set('active')} />Actif</label>
      </div>
    </Modal>
  );
}

function MoveModal({ init, products, onClose, onSaved }: { init: any | null; products: any[]; onClose: () => void; onSaved: () => void }) {
  const { toast } = useUi();
  const [f, setF] = useState<any>({});
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (init) setF({ productId: init.productId ?? '', type: 'USAGE', quantity: 1, reason: '' }); }, [init]);
  const set = (k: string) => (e: any) => setF({ ...f, [k]: e.target.value });
  const p = products.find((x) => x.id === f.productId);
  const save = async () => {
    setBusy(true);
    try { await post('/stock/movements', { productId: f.productId, type: f.type, quantity: Number(f.quantity), reason: f.reason }); toast('success', 'Mouvement enregistré'); onSaved(); } catch (e: any) { toast('error', e.message); } finally { setBusy(false); }
  };
  return (
    <Modal open={!!init} onClose={onClose} title="Mouvement de stock" size="sm" footer={<Button loading={busy} disabled={!f.productId || !Number(f.quantity) || (f.reason ?? '').length < 3} onClick={save}>Enregistrer</Button>}>
      <div className="space-y-3">
        <Field label="Produit"><Select value={f.productId} onChange={set('productId')}><option value="">— Choisir —</option>{products.map((x) => <option key={x.id} value={x.id}>{x.name} (stock {x.quantity})</option>)}</Select></Field>
        <Field label="Type"><Select value={f.type} onChange={set('type')}><option value="USAGE">Consommation en salon</option><option value="OUT">Sortie (perte, casse, péremption)</option><option value="IN">Entrée (hors achat)</option><option value="ADJUSTMENT">Ajustement (+ ou −)</option></Select></Field>
        <Field label="Quantité" hint={f.type === 'ADJUSTMENT' ? 'Négatif pour retirer' : p ? `Stock actuel : ${p.quantity}` : undefined}><Input type="number" value={f.quantity} onChange={set('quantity')} /></Field>
        <Field label="Motif / justification" required><Input value={f.reason ?? ''} onChange={set('reason')} /></Field>
        <p className="text-xs text-neutral-500">Les entrées fournisseurs se saisissent dans « Fournisseurs & achats » (mise à jour du coût et de la dette).</p>
      </div>
    </Modal>
  );
}

function Inventory({ products, onDone }: { products: any[]; onDone: () => void }) {
  const { toast, confirm } = useUi();
  const [counts, setCounts] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const lines = products.filter((p) => counts[p.id] !== undefined && counts[p.id] !== '');
  const gaps = lines.filter((p) => Number(counts[p.id]) !== p.quantity);
  const submit = async () => {
    const r = await confirm({ title: "Valider l'inventaire", message: `${lines.length} produit(s) compté(s), ${gaps.length} écart(s). Les écarts seront enregistrés en mouvements « Inventaire ».` });
    if (!r.ok) return;
    setBusy(true);
    try { await post('/stock/inventories', { lines: lines.map((p) => ({ productId: p.id, countedQty: Number(counts[p.id]) })) }); toast('success', 'Inventaire validé'); setCounts({}); onDone(); } catch (e: any) { toast('error', e.message); } finally { setBusy(false); }
  };
  return (
    <Card title="Inventaire physique" actions={<Button icon={<ClipboardCheck className="h-4 w-4" />} loading={busy} disabled={!lines.length} onClick={submit}>Valider ({lines.length})</Button>}>
      <p className="mb-3 text-xs text-neutral-500">Saisissez les quantités comptées. Seuls les produits renseignés sont pris en compte.</p>
      <Table rows={products} columns={[
        { key: 'name', label: 'Produit', render: (p: any) => <><b>{p.name}</b> <span className="font-mono text-xs text-neutral-500">{p.reference}</span></> },
        { key: 'quantity', label: 'Théorique', align: 'right' },
        { key: 'count', label: 'Compté', render: (p: any) => <Input type="number" min={0} value={counts[p.id] ?? ''} onChange={(e) => setCounts({ ...counts, [p.id]: e.target.value })} className="w-24" /> },
        { key: 'gap', label: 'Écart', align: 'right', render: (p: any) => counts[p.id] ? <b className={Number(counts[p.id]) - p.quantity < 0 ? 'text-red-600' : 'text-emerald-700'}>{Number(counts[p.id]) - p.quantity}</b> : '' },
      ]} />
    </Card>
  );
}
