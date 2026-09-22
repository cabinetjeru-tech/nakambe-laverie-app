'use client';

import clsx from 'clsx';
import { BookOpen, Pencil, Plus, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { PhotoInput } from '@/components/photo-input';
import { Alert, Button, Card, EmptyState, Field, FieldGroup, Input, Select, Sheet, Spinner, Textarea } from '@/components/ui';
import { fcfa } from '@/lib/format';
import { useMerchant } from '@/lib/merchant';
import { useApi } from '@/lib/use-api';

interface Category {
  id: string;
  name: string;
  position: number;
}

interface Product {
  id: string;
  categoryId: string | null;
  name: string;
  description: string | null;
  price: number;
  imageUrl: string | null;
  isAvailable: boolean;
  position: number;
  optionGroups: { id: string; name: string; minChoices: number; maxChoices: number; options: { id: string; name: string; extraPrice: number }[] }[];
}

interface GroupDraft {
  name: string;
  required: boolean;
  maxChoices: number;
  options: { name: string; extraPrice: string }[];
}

interface ProductDraft {
  id?: string;
  name: string;
  description: string;
  price: string;
  categoryId: string;
  imageKey?: string | null;
  imageUrl: string | null;
  isAvailable: boolean;
  groups: GroupDraft[];
}

const toDraft = (p?: Product, categoryId = ''): ProductDraft =>
  p
    ? {
        id: p.id,
        name: p.name,
        description: p.description ?? '',
        price: String(p.price),
        categoryId: p.categoryId ?? '',
        imageUrl: p.imageUrl,
        isAvailable: p.isAvailable,
        groups: p.optionGroups.map((g) => ({ name: g.name, required: g.minChoices > 0, maxChoices: g.maxChoices, options: g.options.map((o) => ({ name: o.name, extraPrice: o.extraPrice ? String(o.extraPrice) : '' })) })),
      }
    : { name: '', description: '', price: '', categoryId, imageUrl: null, isAvailable: true, groups: [] };

function GroupEditor({ group, onChange, onRemove }: { group: GroupDraft; onChange: (g: GroupDraft) => void; onRemove: () => void }) {
  return (
    <div className="space-y-2 rounded-xl border border-slate-200 p-3">
      <div className="flex gap-2">
        <Input placeholder="Nom du choix (ex. Accompagnement)" value={group.name} maxLength={60} onChange={(e) => onChange({ ...group, name: e.target.value })} />
        <button type="button" onClick={onRemove} className="rounded-lg p-2 text-slate-400 hover:text-red-600" aria-label="Supprimer ce groupe">
          <Trash2 className="h-4 w-4" />
        </button>
      </div>
      <div className="flex flex-wrap items-center gap-3 text-sm">
        <label className="flex items-center gap-1.5">
          <input type="checkbox" checked={group.required} onChange={(e) => onChange({ ...group, required: e.target.checked })} className="accent-brand" />
          Obligatoire
        </label>
        <label className="flex items-center gap-1.5">
          Choix maximum
          <Select className="w-auto py-1 text-sm" value={group.maxChoices} onChange={(e) => onChange({ ...group, maxChoices: Number(e.target.value) })}>
            {[1, 2, 3, 4, 5, 10].map((n) => (
              <option key={n} value={n}>{n}</option>
            ))}
          </Select>
        </label>
      </div>
      {group.options.map((o, i) => (
        <div key={i} className="flex gap-2">
          <Input placeholder={`Choix ${i + 1}`} value={o.name} maxLength={60} onChange={(e) => onChange({ ...group, options: group.options.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)) })} />
          <Input className="w-28" type="number" inputMode="numeric" min={0} step={50} placeholder="+ FCFA" value={o.extraPrice} onChange={(e) => onChange({ ...group, options: group.options.map((x, j) => (j === i ? { ...x, extraPrice: e.target.value } : x)) })} />
          <button type="button" onClick={() => onChange({ ...group, options: group.options.filter((_, j) => j !== i) })} className="p-2 text-slate-400" aria-label="Retirer">
            ×
          </button>
        </div>
      ))}
      <Button type="button" size="sm" variant="ghost" onClick={() => onChange({ ...group, options: [...group.options, { name: '', extraPrice: '' }] })}>
        <Plus className="h-4 w-4" /> Ajouter un choix
      </Button>
    </div>
  );
}

function ProductEditor({ draft, categories, onClose, onSaved }: { draft: ProductDraft; categories: Category[]; onClose: () => void; onSaved: () => void }) {
  const { call } = useMerchant();
  const [d, setD] = useState(draft);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const set = (patch: Partial<ProductDraft>) => setD((x) => ({ ...x, ...patch }));

  const save = async () => {
    if (!d.name.trim()) return setError('Indiquez le nom du produit.');
    if (!(Number(d.price) >= 0) || d.price === '') return setError('Indiquez le prix.');
    const groups = d.groups
      .map((g) => ({ ...g, options: g.options.filter((o) => o.name.trim()) }))
      .filter((g) => g.name.trim() || g.options.length);
    for (const g of groups) {
      if (!g.name.trim()) return setError('Donnez un nom à chaque groupe de choix.');
      if (!g.options.length) return setError(`« ${g.name} » : ajoutez au moins un choix.`);
    }
    setBusy(true);
    setError(null);
    const body = {
      name: d.name.trim(),
      description: d.description.trim() || undefined,
      price: Math.round(Number(d.price)),
      categoryId: d.categoryId || null,
      imageKey: d.imageKey,
      isAvailable: d.isAvailable,
      optionGroups: groups.map((g) => ({
        name: g.name.trim(),
        minChoices: g.required ? 1 : 0,
        maxChoices: g.maxChoices,
        options: g.options.map((o) => ({ name: o.name.trim(), extraPrice: Math.round(Number(o.extraPrice) || 0) })),
      })),
    };
    try {
      await call(d.id ? `products/${d.id}` : 'products', { method: d.id ? 'PATCH' : 'POST', body });
      onSaved();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    if (!d.id || !confirm(`Retirer « ${d.name} » du menu ?`)) return;
    setBusy(true);
    try {
      await call(`products/${d.id}`, { method: 'DELETE' });
      onSaved();
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  };

  return (
    <Sheet open onClose={onClose} title={d.id ? 'Modifier le produit' : 'Nouveau produit'}>
      <div className="space-y-4">
        <Field label="Nom">
          <Input value={d.name} maxLength={80} onChange={(e) => set({ name: e.target.value })} placeholder="Ex. Riz gras au poulet" />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Prix (FCFA)">
            <Input type="number" inputMode="numeric" min={0} step={50} value={d.price} onChange={(e) => set({ price: e.target.value })} />
          </Field>
          <Field label="Catégorie">
            <Select value={d.categoryId} onChange={(e) => set({ categoryId: e.target.value })}>
              <option value="">Sans catégorie</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </Select>
          </Field>
        </div>
        <Field label="Description (facultatif)">
          <Textarea rows={2} maxLength={300} value={d.description} onChange={(e) => set({ description: e.target.value })} />
        </Field>
        <FieldGroup label="Photo">
          <div className="flex items-center gap-3">
            {d.imageUrl && !d.imageKey && <img src={d.imageUrl} alt="" className="h-16 w-16 rounded-xl object-cover" />}
            <PhotoInput purpose="MERCHANT_MEDIA" label={d.imageUrl ? 'Changer la photo' : 'Ajouter une photo'} capture={false} onUploaded={(key) => set({ imageKey: key ?? undefined })} />
          </div>
        </FieldGroup>
        <label className="flex items-center gap-2 text-sm font-medium text-slate-700">
          <input type="checkbox" checked={d.isAvailable} onChange={(e) => set({ isAvailable: e.target.checked })} className="h-4 w-4 accent-brand" />
          Disponible à la commande
        </label>
        <div className="space-y-2">
          <p className="text-sm font-semibold text-brand">Choix proposés au client</p>
          <p className="text-xs text-slate-500">Ex. : viande (obligatoire, 1 choix), suppléments (facultatif, 2 choix maximum, + prix).</p>
          {d.groups.map((g, i) => (
            <GroupEditor key={i} group={g} onChange={(ng) => set({ groups: d.groups.map((x, j) => (j === i ? ng : x)) })} onRemove={() => set({ groups: d.groups.filter((_, j) => j !== i) })} />
          ))}
          <Button type="button" size="sm" variant="secondary" onClick={() => set({ groups: [...d.groups, { name: '', required: false, maxChoices: 1, options: [{ name: '', extraPrice: '' }] }] })}>
            <Plus className="h-4 w-4" /> Ajouter un groupe de choix
          </Button>
        </div>
        <Alert>{error}</Alert>
        <div className="flex gap-2">
          {d.id && (
            <Button variant="outline" onClick={remove} disabled={busy}>
              <Trash2 className="h-4 w-4" />
            </Button>
          )}
          <Button block size="lg" loading={busy} onClick={save}>
            Enregistrer
          </Button>
        </div>
      </div>
    </Sheet>
  );
}

export default function MerchantMenuPage() {
  const { path, call, canManage } = useMerchant();
  const catalog = useApi<{ categories: Category[]; products: Product[] }>(path('catalog'), { persist: false });
  const [editing, setEditing] = useState<ProductDraft | null>(null);
  const [newCategory, setNewCategory] = useState('');
  const [error, setError] = useState<string | null>(null);

  if (!catalog.data) return <Spinner />;
  const { categories, products } = catalog.data;
  const sections = [
    ...categories.map((c) => ({ category: c as Category | null, products: products.filter((p) => p.categoryId === c.id) })),
    { category: null, products: products.filter((p) => !p.categoryId) },
  ].filter((s) => s.category || s.products.length);

  const run = async (fn: () => Promise<unknown>) => {
    setError(null);
    try {
      await fn();
      await catalog.reload();
    } catch (err) {
      setError((err as Error).message);
    }
  };

  const toggleAvailability = (p: Product) => run(() => call(`products/${p.id}`, { method: 'PATCH', body: { isAvailable: !p.isAvailable } }));

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-brand">Menu</h1>
        {canManage && (
          <Button size="sm" onClick={() => setEditing(toDraft(undefined, categories[0]?.id ?? ''))}>
            <Plus className="h-4 w-4" /> Produit
          </Button>
        )}
      </div>
      {!canManage && <Alert tone="blue">Vous pouvez marquer un produit comme épuisé. Le reste du menu est géré par le responsable.</Alert>}
      <Alert>{error}</Alert>

      {products.length === 0 && (
        <EmptyState icon={<BookOpen className="h-8 w-8" />} title="Votre menu est vide">
          Ajoutez vos catégories (Plats, Boissons…) puis vos produits avec leurs prix et photos.
        </EmptyState>
      )}

      {sections.map(({ category, products: list }) => (
        <section key={category?.id ?? 'none'}>
          <div className="mb-2 flex items-center justify-between">
            <h2 className="font-bold text-brand">{category?.name ?? 'Sans catégorie'}</h2>
            {category && canManage && (
              <span className="flex gap-1">
                <button
                  type="button"
                  className="rounded-lg p-1.5 text-slate-400 hover:text-brand"
                  aria-label="Renommer"
                  onClick={() => {
                    const name = prompt('Nouveau nom de la catégorie', category.name);
                    if (name?.trim()) void run(() => call(`categories/${category.id}`, { method: 'PATCH', body: { name: name.trim(), position: category.position } }));
                  }}
                >
                  <Pencil className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  className="rounded-lg p-1.5 text-slate-400 hover:text-red-600"
                  aria-label="Supprimer la catégorie"
                  onClick={() => confirm(`Supprimer la catégorie « ${category.name} » ? Ses produits restent au menu, sans catégorie.`) && void run(() => call(`categories/${category.id}`, { method: 'DELETE' }))}
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </span>
            )}
          </div>
          <div className="divide-y divide-slate-100 overflow-hidden rounded-2xl bg-white shadow-card">
            {list.length === 0 && <p className="p-3.5 text-sm text-slate-400">Aucun produit dans cette catégorie.</p>}
            {list.map((p) => (
              <div key={p.id} className={clsx('flex items-center gap-3 p-3.5', !p.isAvailable && 'bg-slate-50')}>
                {p.imageUrl ? <img src={p.imageUrl} alt="" className="h-12 w-12 shrink-0 rounded-xl object-cover" /> : <span className="h-12 w-12 shrink-0 rounded-xl bg-slate-100" />}
                <button type="button" disabled={!canManage} onClick={() => setEditing(toDraft(p))} className="min-w-0 flex-1 text-left">
                  <span className={clsx('block truncate font-semibold', p.isAvailable ? 'text-slate-800' : 'text-slate-400 line-through')}>{p.name}</span>
                  <span className="text-sm text-brand">{fcfa(p.price)}</span>
                  {p.optionGroups.length > 0 && <span className="ml-2 text-xs text-slate-500">{p.optionGroups.map((g) => g.name).join(', ')}</span>}
                </button>
                <button
                  type="button"
                  onClick={() => toggleAvailability(p)}
                  className={clsx('shrink-0 rounded-full px-2.5 py-1 text-xs font-bold', p.isAvailable ? 'bg-green-50 text-brand-greenDark ring-1 ring-green-200' : 'bg-red-50 text-red-700 ring-1 ring-red-200')}
                >
                  {p.isAvailable ? 'Disponible' : 'Épuisé'}
                </button>
              </div>
            ))}
          </div>
        </section>
      ))}

      {canManage && (
        <Card className="flex gap-2">
          <Input placeholder="Nouvelle catégorie (ex. Boissons)" value={newCategory} maxLength={60} onChange={(e) => setNewCategory(e.target.value)} />
          <Button
            variant="secondary"
            disabled={!newCategory.trim()}
            onClick={() =>
              run(async () => {
                await call('categories', { body: { name: newCategory.trim(), position: categories.length } });
                setNewCategory('');
              })
            }
          >
            Ajouter
          </Button>
        </Card>
      )}

      {editing && (
        <ProductEditor
          draft={editing}
          categories={categories}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            void catalog.reload();
          }}
        />
      )}
    </div>
  );
}
