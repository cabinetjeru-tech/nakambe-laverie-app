'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { Badge, Button, Card, Empty, ErrorMessage, Field, Input, Modal, PageHeader, Select, Spinner } from '@/components/ui';
import { del, get, patch, post } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { money } from '@/lib/format';

interface Category {
  id: string;
  name: string;
  _count: { services: number };
}
interface Service {
  id: string;
  categoryId: string;
  name: string;
  description: string | null;
  basePrice: number;
  priceIsFrom: boolean;
  durationMinutes: number;
  isActive: boolean;
  variants: { id: string; name: string; price: number; durationMinutes: number }[];
  steps: { label: string; durationMinutes: number; blocksStaff: boolean }[];
  staffSkills: { staffId: string }[];
}
interface StaffLite {
  id: string;
  displayName: string;
}

export default function ServicesPage() {
  const { can } = useAuth();
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState<Service | 'new' | null>(null);
  const [newCategory, setNewCategory] = useState('');
  const { data: categories = [], isLoading } = useQuery({ queryKey: ['categories'], queryFn: () => get<Category[]>('/service-categories') });
  const { data: services = [] } = useQuery({ queryKey: ['services', 'all'], queryFn: () => get<Service[]>('/services?includeInactive=true') });
  const createCategory = useMutation({
    mutationFn: () => post('/service-categories', { name: newCategory }),
    onSuccess: () => {
      setNewCategory('');
      queryClient.invalidateQueries({ queryKey: ['categories'] });
    },
  });
  const manage = can('services.manage');

  if (isLoading) return <Spinner />;
  return (
    <>
      <PageHeader
        title="Prestations"
        description="Prix, durées et temps de pose : l’agenda s’en sert pour proposer les créneaux."
        actions={manage && categories.length > 0 && <Button onClick={() => setEditing('new')}><Plus className="h-4 w-4" /> Nouvelle prestation</Button>}
      />
      {manage && (
        <div className="mb-5 flex max-w-md gap-2">
          <Input value={newCategory} onChange={(e) => setNewCategory(e.target.value)} placeholder="Nouvelle catégorie (Tresses, Coupe…)" aria-label="Nouvelle catégorie" />
          <Button variant="secondary" disabled={newCategory.trim().length < 2} loading={createCategory.isPending} onClick={() => createCategory.mutate()}>Ajouter</Button>
        </div>
      )}
      <ErrorMessage error={createCategory.error} />
      {categories.length === 0 && <Empty title="Aucune catégorie">Créez d’abord une catégorie, puis vos prestations.</Empty>}
      <div className="space-y-4">
        {categories.map((category) => {
          const list = services.filter((s) => s.categoryId === category.id);
          return (
            <Card key={category.id} title={category.name}>
              {list.length === 0 ? (
                <p className="text-sm text-stone-500">Aucune prestation.</p>
              ) : (
                <ul className="divide-y divide-stone-100">
                  {list.map((s) => (
                    <li key={s.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                      <div>
                        <p className="text-sm font-medium text-stone-900">
                          {s.name} {!s.isActive && <Badge>Désactivée</Badge>}
                        </p>
                        <p className="text-xs text-stone-500">
                          {s.durationMinutes} min
                          {s.steps.some((st) => !st.blocksStaff) && ` · dont ${s.steps.filter((st) => !st.blocksStaff).reduce((t, st) => t + st.durationMinutes, 0)} min de pose`}
                          {s.variants.length > 0 && ` · ${s.variants.length} variante(s)`} · {s.staffSkills.length} employé(s)
                        </p>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className="text-sm font-semibold tabular-nums">{s.priceIsFrom ? 'dès ' : ''}{money(s.basePrice)}</span>
                        {manage && <Button size="sm" variant="secondary" onClick={() => setEditing(s)}>Modifier</Button>}
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          );
        })}
      </div>
      {editing && <ServiceForm service={editing === 'new' ? null : editing} categories={categories} onClose={() => setEditing(null)} />}
    </>
  );
}

function ServiceForm({ service, categories, onClose }: { service: Service | null; categories: Category[]; onClose: () => void }) {
  const { can } = useAuth();
  const queryClient = useQueryClient();
  const { data: staff = [] } = useQuery({ queryKey: ['staff'], queryFn: () => get<StaffLite[]>('/staff') });
  const [form, setForm] = useState({
    categoryId: service?.categoryId ?? categories[0]?.id ?? '',
    name: service?.name ?? '',
    basePrice: service?.basePrice ?? 0,
    durationMinutes: service?.durationMinutes ?? 60,
    priceIsFrom: service?.priceIsFrom ?? false,
    isActive: service?.isActive ?? true,
  });
  // Seuls les champs acceptés par l'API (qui refuse tout champ inconnu).
  const [steps, setSteps] = useState(service?.steps.map(({ label, durationMinutes, blocksStaff }) => ({ label, durationMinutes, blocksStaff })) ?? []);
  const [variants, setVariants] = useState(service?.variants.map(({ name, price, durationMinutes }) => ({ name, price, durationMinutes })) ?? []);
  const [staffIds, setStaffIds] = useState<string[] | null>(service ? service.staffSkills.map((s) => s.staffId) : null);
  const stepsTotal = steps.reduce((t, s) => t + s.durationMinutes, 0);

  const save = useMutation({
    mutationFn: () => {
      const payload: Record<string, unknown> = {
        categoryId: form.categoryId,
        name: form.name,
        durationMinutes: form.durationMinutes,
        priceIsFrom: form.priceIsFrom,
        steps,
        ...(staffIds ? { staffIds } : {}),
      };
      const pricesChanged = !service || service.basePrice !== form.basePrice || JSON.stringify(service.variants.map(({ name, price, durationMinutes }) => ({ name, price, durationMinutes }))) !== JSON.stringify(variants);
      if (pricesChanged) Object.assign(payload, { basePrice: form.basePrice, variants });
      if (service) return patch(`/services/${service.id}`, { ...payload, isActive: form.isActive });
      return post('/services', payload);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['services'] });
      queryClient.invalidateQueries({ queryKey: ['categories'] });
      onClose();
    },
  });
  const remove = useMutation({
    mutationFn: () => del(`/services/${service!.id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['services'] });
      onClose();
    },
  });

  return (
    <Modal
      open
      wide
      title={service ? `Modifier « ${service.name} »` : 'Nouvelle prestation'}
      onClose={onClose}
      footer={
        <>
          {service && <Button variant="ghost" className="mr-auto text-red-700" onClick={() => window.confirm('Supprimer cette prestation ?') && remove.mutate()}>Supprimer</Button>}
          <Button variant="secondary" onClick={onClose}>Annuler</Button>
          <Button loading={save.isPending} onClick={() => save.mutate()} disabled={steps.length > 0 && stepsTotal !== form.durationMinutes}>Enregistrer</Button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Nom">{(id) => <Input id={id} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />}</Field>
          <Field label="Catégorie">
            {(id) => (
              <Select id={id} value={form.categoryId} onChange={(e) => setForm({ ...form, categoryId: e.target.value })}>
                {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </Select>
            )}
          </Field>
          <Field label="Prix (FCFA)" hint={!can('prices.manage') && service ? 'Modification réservée aux responsables' : undefined}>
            {(id) => <Input id={id} type="number" min={0} step={50} value={form.basePrice} disabled={Boolean(service) && !can('prices.manage')} onChange={(e) => setForm({ ...form, basePrice: Number(e.target.value) })} />}
          </Field>
          <Field label="Durée totale (min)">{(id) => <Input id={id} type="number" min={5} step={5} value={form.durationMinutes} onChange={(e) => setForm({ ...form, durationMinutes: Number(e.target.value) })} />}</Field>
        </div>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={form.priceIsFrom} onChange={(e) => setForm({ ...form, priceIsFrom: e.target.checked })} />
          Prix « à partir de » (ajustable à l’encaissement)
        </label>
        {service && (
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={form.isActive} onChange={(e) => setForm({ ...form, isActive: e.target.checked })} />
            Proposée à la réservation
          </label>
        )}

        <div>
          <div className="mb-2 flex items-center justify-between">
            <p className="text-sm font-medium">Étapes (facultatif)</p>
            <Button size="sm" variant="ghost" onClick={() => setSteps([...steps, { label: '', durationMinutes: 15, blocksStaff: true }])}>+ Étape</Button>
          </div>
          {steps.length > 0 && (
            <>
              <ul className="space-y-2">
                {steps.map((step, i) => (
                  <li key={i} className="flex flex-wrap items-center gap-2">
                    <Input className="w-40 flex-1" value={step.label} placeholder="Application, Pose…" aria-label="Étape" onChange={(e) => setSteps(steps.map((s, j) => (j === i ? { ...s, label: e.target.value } : s)))} />
                    <Input className="w-20" type="number" min={5} step={5} value={step.durationMinutes} aria-label="Durée" onChange={(e) => setSteps(steps.map((s, j) => (j === i ? { ...s, durationMinutes: Number(e.target.value) } : s)))} />
                    <label className="flex items-center gap-1 text-xs">
                      <input type="checkbox" checked={!step.blocksStaff} onChange={(e) => setSteps(steps.map((s, j) => (j === i ? { ...s, blocksStaff: !e.target.checked } : s)))} />
                      Temps de pose
                    </label>
                    <button onClick={() => setSteps(steps.filter((_, j) => j !== i))} aria-label="Retirer l’étape" className="text-stone-400 hover:text-red-600"><Trash2 className="h-4 w-4" /></button>
                  </li>
                ))}
              </ul>
              <p className={`mt-1 text-xs ${stepsTotal === form.durationMinutes ? 'text-stone-500' : 'text-red-600'}`}>
                Total des étapes : {stepsTotal} min {stepsTotal !== form.durationMinutes && `(doit égaler ${form.durationMinutes} min)`}. Pendant un temps de pose, le coiffeur peut prendre un autre client.
              </p>
            </>
          )}
        </div>

        <div>
          <div className="mb-2 flex items-center justify-between">
            <p className="text-sm font-medium">Variantes (longueur, taille…)</p>
            <Button size="sm" variant="ghost" disabled={Boolean(service) && !can('prices.manage')} onClick={() => setVariants([...variants, { name: '', price: form.basePrice, durationMinutes: form.durationMinutes }])}>+ Variante</Button>
          </div>
          <ul className="space-y-2">
            {variants.map((v, i) => (
              <li key={i} className="flex flex-wrap items-center gap-2">
                <Input className="w-40 flex-1" value={v.name} placeholder="Cheveux longs" aria-label="Variante" onChange={(e) => setVariants(variants.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))} />
                <Input className="w-28" type="number" min={0} step={50} value={v.price} aria-label="Prix" onChange={(e) => setVariants(variants.map((x, j) => (j === i ? { ...x, price: Number(e.target.value) } : x)))} />
                <Input className="w-20" type="number" min={5} step={5} value={v.durationMinutes} aria-label="Durée" onChange={(e) => setVariants(variants.map((x, j) => (j === i ? { ...x, durationMinutes: Number(e.target.value) } : x)))} />
                <button onClick={() => setVariants(variants.filter((_, j) => j !== i))} aria-label="Retirer la variante" className="text-stone-400 hover:text-red-600"><Trash2 className="h-4 w-4" /></button>
              </li>
            ))}
          </ul>
        </div>

        <div>
          <p className="mb-2 text-sm font-medium">Réalisée par</p>
          <div className="flex flex-wrap gap-2">
            {staff.map((s) => {
              const checked = staffIds ? staffIds.includes(s.id) : true;
              return (
                <label key={s.id} className={`flex items-center gap-1.5 rounded-full border px-3 py-1 text-sm ${checked ? 'border-brand-500 bg-brand-50' : 'border-stone-300'}`}>
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={(e) => {
                      const current = staffIds ?? staff.map((x) => x.id);
                      setStaffIds(e.target.checked ? [...current, s.id] : current.filter((id) => id !== s.id));
                    }}
                  />
                  {s.displayName}
                </label>
              );
            })}
          </div>
        </div>
        <ErrorMessage error={save.error ?? remove.error} />
      </div>
    </Modal>
  );
}
