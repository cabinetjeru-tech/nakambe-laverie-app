'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus } from 'lucide-react';
import { useState } from 'react';
import { Badge, Button, Card, ErrorMessage, Field, Input, Modal, PageHeader, Select, Spinner, Table, Td } from '@/components/ui';
import { get, post, put, qs } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { dateTime, money, number } from '@/lib/format';
import { useSalon } from '@/lib/salon';

interface Product {
  id: string;
  name: string;
  brand: string | null;
  kind: string;
  unit: string;
  purchasePrice: number;
  salePrice: number | null;
  supplier: { name: string } | null;
  stocks: { salonId: string; quantity: string; alertThreshold: string | null; isLow: boolean }[];
}

const KIND: Record<string, string> = { RETAIL: 'Revente', PROFESSIONAL: 'Technique', BOTH: 'Revente et technique' };
const MOVEMENT: Record<string, string> = {
  PURCHASE_RECEIPT: 'Réception',
  SALE: 'Vente',
  CONSUMPTION: 'Consommation',
  TRANSFER_OUT: 'Transfert sortant',
  TRANSFER_IN: 'Transfert entrant',
  ADJUSTMENT: 'Inventaire',
  LOSS: 'Perte',
  RETURN: 'Retour',
};

type Action = { kind: 'product' } | { kind: 'receipt'; product: Product } | { kind: 'adjust'; product: Product } | { kind: 'threshold'; product: Product } | { kind: 'history'; product: Product };

export default function StockPage() {
  const { salon } = useSalon();
  const { can } = useAuth();
  const [lowOnly, setLowOnly] = useState(false);
  const [q, setQ] = useState('');
  const [action, setAction] = useState<Action | null>(null);
  const { data = [], isLoading, error } = useQuery({
    queryKey: ['products', salon?.id, q, lowOnly],
    queryFn: () => get<Product[]>(`/products${qs({ salonId: salon!.id, q, lowStock: lowOnly || undefined })}`),
    enabled: Boolean(salon),
  });

  if (!salon) return <Spinner />;
  return (
    <>
      <PageHeader
        title="Stock"
        description={`Quantités du salon ${salon.name}`}
        actions={can('purchases.manage') && <Button onClick={() => setAction({ kind: 'product' })}><Plus className="h-4 w-4" /> Nouveau produit</Button>}
      />
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Rechercher un produit, une marque, un code" className="max-w-sm" aria-label="Rechercher" />
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={lowOnly} onChange={(e) => setLowOnly(e.target.checked)} /> Sous le seuil d’alerte
        </label>
      </div>
      <ErrorMessage error={error} />
      {isLoading ? (
        <Spinner />
      ) : (
        <Table head={['Produit', 'Type', 'Prix d’achat', 'Prix de vente', 'En stock', '']} empty={data.length === 0}>
          {data.map((p) => {
            const stock = p.stocks.find((s) => s.salonId === salon.id);
            return (
              <tr key={p.id}>
                <Td>
                  <span className="font-medium">{p.name}</span>
                  {p.brand && <span className="text-stone-500"> · {p.brand}</span>}
                </Td>
                <Td>{KIND[p.kind]}</Td>
                <Td className="tabular-nums">{money(p.purchasePrice)}</Td>
                <Td className="tabular-nums">{p.salePrice !== null ? money(p.salePrice) : '—'}</Td>
                <Td className="tabular-nums">
                  {number(stock?.quantity ?? 0, 3)} {p.unit}
                  {stock?.isLow && <span className="ml-2"><Badge tone="red">Seuil {number(stock.alertThreshold, 3)}</Badge></span>}
                </Td>
                <Td>
                  <div className="flex gap-1">
                    {can('purchases.manage') && <Button size="sm" variant="secondary" onClick={() => setAction({ kind: 'receipt', product: p })}>Réception</Button>}
                    {can('stock.adjust') && <Button size="sm" variant="ghost" onClick={() => setAction({ kind: 'adjust', product: p })}>Inventaire</Button>}
                    {can('stock.adjust') && <Button size="sm" variant="ghost" onClick={() => setAction({ kind: 'threshold', product: p })}>Seuil</Button>}
                    <Button size="sm" variant="ghost" onClick={() => setAction({ kind: 'history', product: p })}>Historique</Button>
                  </div>
                </Td>
              </tr>
            );
          })}
        </Table>
      )}
      {action?.kind === 'product' && <CreateProduct onClose={() => setAction(null)} />}
      {action?.kind === 'receipt' && <Receipt product={action.product} onClose={() => setAction(null)} />}
      {action?.kind === 'adjust' && <Adjust product={action.product} onClose={() => setAction(null)} />}
      {action?.kind === 'threshold' && <Threshold product={action.product} onClose={() => setAction(null)} />}
      {action?.kind === 'history' && <History product={action.product} onClose={() => setAction(null)} />}
    </>
  );
}

function useDone(onClose: () => void) {
  const queryClient = useQueryClient();
  return () => {
    queryClient.invalidateQueries({ queryKey: ['products'] });
    queryClient.invalidateQueries({ queryKey: ['dashboard'] });
    onClose();
  };
}

function CreateProduct({ onClose }: { onClose: () => void }) {
  const done = useDone(onClose);
  const [form, setForm] = useState({ name: '', brand: '', kind: 'RETAIL', unit: 'pièce', purchasePrice: 0, salePrice: 0 });
  const save = useMutation({
    mutationFn: () => post('/products', { ...form, brand: form.brand || undefined, salePrice: form.kind === 'PROFESSIONAL' ? undefined : form.salePrice }),
    onSuccess: done,
  });
  return (
    <Modal open title="Nouveau produit" onClose={onClose} footer={<><Button variant="secondary" onClick={onClose}>Annuler</Button><Button loading={save.isPending} onClick={() => save.mutate()}>Créer</Button></>}>
      <div className="space-y-3">
        <Field label="Nom">{(id) => <Input id={id} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />}</Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Marque">{(id) => <Input id={id} value={form.brand} onChange={(e) => setForm({ ...form, brand: e.target.value })} />}</Field>
          <Field label="Unité">{(id) => <Input id={id} value={form.unit} onChange={(e) => setForm({ ...form, unit: e.target.value })} placeholder="pièce, paquet, ml" />}</Field>
          <Field label="Usage">
            {(id) => (
              <Select id={id} value={form.kind} onChange={(e) => setForm({ ...form, kind: e.target.value })}>
                {Object.entries(KIND).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </Select>
            )}
          </Field>
          <Field label="Prix d’achat">{(id) => <Input id={id} type="number" min={0} value={form.purchasePrice} onChange={(e) => setForm({ ...form, purchasePrice: Number(e.target.value) })} />}</Field>
          {form.kind !== 'PROFESSIONAL' && <Field label="Prix de vente">{(id) => <Input id={id} type="number" min={0} value={form.salePrice} onChange={(e) => setForm({ ...form, salePrice: Number(e.target.value) })} />}</Field>}
        </div>
        <ErrorMessage error={save.error} />
      </div>
    </Modal>
  );
}

function Receipt({ product, onClose }: { product: Product; onClose: () => void }) {
  const { salon } = useSalon();
  const done = useDone(onClose);
  const [quantity, setQuantity] = useState(1);
  const [unitCost, setUnitCost] = useState(product.purchasePrice);
  const save = useMutation({ mutationFn: () => post('/stock/receipts', { salonId: salon!.id, lines: [{ productId: product.id, quantity, unitCost }] }), onSuccess: done });
  return (
    <Modal open title={`Réception — ${product.name}`} onClose={onClose} footer={<><Button variant="secondary" onClick={onClose}>Annuler</Button><Button loading={save.isPending} onClick={() => save.mutate()}>Entrer en stock</Button></>}>
      <div className="grid grid-cols-2 gap-3">
        <Field label={`Quantité (${product.unit})`}>{(id) => <Input id={id} type="number" min={0.001} step="any" value={quantity} onChange={(e) => setQuantity(Number(e.target.value))} />}</Field>
        <Field label="Coût unitaire">{(id) => <Input id={id} type="number" min={0} value={unitCost} onChange={(e) => setUnitCost(Number(e.target.value))} />}</Field>
      </div>
      <p className="mt-2 text-xs text-stone-500">Le coût moyen du produit est recalculé automatiquement. Pensez à saisir la facture dans « Dépenses ».</p>
      <ErrorMessage error={save.error} />
    </Modal>
  );
}

function Adjust({ product, onClose }: { product: Product; onClose: () => void }) {
  const { salon } = useSalon();
  const done = useDone(onClose);
  const [mode, setMode] = useState<'COUNT' | 'LOSS'>('COUNT');
  const [quantity, setQuantity] = useState(0);
  const [reason, setReason] = useState('');
  const save = useMutation({ mutationFn: () => post('/stock/adjustments', { salonId: salon!.id, productId: product.id, mode, quantity, reason }), onSuccess: done });
  return (
    <Modal open title={`Inventaire — ${product.name}`} onClose={onClose} footer={<><Button variant="secondary" onClick={onClose}>Annuler</Button><Button disabled={reason.trim().length < 3} loading={save.isPending} onClick={() => save.mutate()}>Enregistrer</Button></>}>
      <div className="space-y-3">
        <Select value={mode} onChange={(e) => setMode(e.target.value as 'COUNT' | 'LOSS')} aria-label="Type">
          <option value="COUNT">Quantité comptée (inventaire)</option>
          <option value="LOSS">Perte (casse, péremption, vol)</option>
        </Select>
        <Field label={mode === 'COUNT' ? 'Quantité réellement présente' : 'Quantité perdue'}>{(id) => <Input id={id} type="number" min={0} step="any" value={quantity} onChange={(e) => setQuantity(Number(e.target.value))} />}</Field>
        <Field label="Motif">{(id) => <Input id={id} value={reason} onChange={(e) => setReason(e.target.value)} />}</Field>
        <ErrorMessage error={save.error} />
      </div>
    </Modal>
  );
}

function Threshold({ product, onClose }: { product: Product; onClose: () => void }) {
  const { salon } = useSalon();
  const done = useDone(onClose);
  const current = product.stocks.find((s) => s.salonId === salon?.id)?.alertThreshold;
  const [value, setValue] = useState(Number(current ?? 0));
  const save = useMutation({ mutationFn: () => put(`/products/${product.id}/threshold`, { salonId: salon!.id, alertThreshold: value }), onSuccess: done });
  return (
    <Modal open title={`Seuil d’alerte — ${product.name}`} onClose={onClose} footer={<><Button variant="secondary" onClick={onClose}>Annuler</Button><Button loading={save.isPending} onClick={() => save.mutate()}>Enregistrer</Button></>}>
      <Field label="Alerter quand le stock descend à" hint="Le produit apparaît alors sur le tableau de bord.">{(id) => <Input id={id} type="number" min={0} step="any" value={value} onChange={(e) => setValue(Number(e.target.value))} />}</Field>
      <ErrorMessage error={save.error} />
    </Modal>
  );
}

function History({ product, onClose }: { product: Product; onClose: () => void }) {
  const { salon } = useSalon();
  const { data = [], isLoading } = useQuery({
    queryKey: ['movements', product.id, salon?.id],
    queryFn: () => get<{ id: string; type: string; quantity: string; reason: string | null; createdAt: string }[]>(`/stock/movements${qs({ salonId: salon!.id, productId: product.id })}`),
  });
  return (
    <Modal open wide title={`Mouvements — ${product.name}`} onClose={onClose}>
      {isLoading ? (
        <Spinner />
      ) : (
        <Card>
          <ul className="divide-y divide-stone-100 text-sm">
            {data.length === 0 && <li className="py-2 text-stone-500">Aucun mouvement.</li>}
            {data.map((m) => (
              <li key={m.id} className="flex justify-between gap-2 py-2">
                <span>{dateTime(m.createdAt, salon?.timezone)} · {MOVEMENT[m.type]}{m.reason ? ` — ${m.reason}` : ''}</span>
                <span className={`tabular-nums ${Number(m.quantity) < 0 ? 'text-red-700' : 'text-emerald-700'}`}>{Number(m.quantity) > 0 ? '+' : ''}{number(m.quantity, 3)}</span>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </Modal>
  );
}
