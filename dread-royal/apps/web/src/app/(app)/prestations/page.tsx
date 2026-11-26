'use client';
import { Pencil, Plus, Search } from 'lucide-react';
import { useEffect, useState } from 'react';
import { RequirePerm } from '@/components/AppShell';
import { Badge, Button, Card, ErrorBox, Field, Input, Modal, MoneyInput, PageHeader, Select, Spinner, Table, Tabs, Textarea, useUi } from '@/components/ui';
import { patch, post, qs } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { fmtDuration, formatFCFA } from '@/lib/format';
import { useApi } from '@/lib/hooks';

export default function PrestationsPage() {
  return <RequirePerm perms={['services.view']}><Prestations /></RequirePerm>;
}

function Prestations() {
  const { can } = useAuth();
  const [cat, setCat] = useState('all');
  const [search, setSearch] = useState('');
  const [showInactive, setShowInactive] = useState(false);
  const cats = useApi<any[]>('/services/categories');
  const list = useApi<any[]>(`/services${qs({ includeInactive: showInactive ? 'true' : undefined })}`);
  const [edit, setEdit] = useState<any | null>(null);
  const rows = (list.data ?? []).filter((s) => (cat === 'all' || s.categoryId === cat) && (!search || `${s.code} ${s.name}`.toLowerCase().includes(search.toLowerCase())));
  return (
    <>
      <PageHeader title="Prestations & tarifs" subtitle="Tarifs en FCFA — mèches et rajouts non inclus sauf mention" actions={can('services.manage') && <Button icon={<Plus className="h-4 w-4" />} onClick={() => setEdit({})}>Nouvelle prestation</Button>} />
      {cats.data && <Tabs value={cat} onChange={setCat} tabs={[{ key: 'all', label: 'Toutes' }, ...cats.data.map((c) => ({ key: c.id, label: c.name }))]} />}
      <Card>
        <div className="mb-3 flex flex-wrap items-center gap-3">
          <div className="relative min-w-[220px] flex-1"><Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-neutral-400" /><Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Rechercher…" className="pl-9" /></div>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={showInactive} onChange={(e) => setShowInactive(e.target.checked)} />Afficher les inactives</label>
        </div>
        {list.error && <ErrorBox error={list.error} onRetry={list.reload} />}
        {list.loading && !list.data ? <Spinner /> : (
          <Table rows={rows} columns={[
            { key: 'code', label: 'Code', render: (s: any) => <span className="font-mono text-xs">{s.code}</span> },
            { key: 'name', label: 'Désignation', render: (s: any) => <div><b>{s.name}</b>{s.description && <p className="text-xs text-neutral-500">{s.description}</p>}</div> },
            { key: 'category', label: 'Catégorie', render: (s: any) => <span className="text-xs">{s.category.name}</span> },
            { key: 'price', label: 'Prix', align: 'right', render: (s: any) => <span className="font-semibold">{formatFCFA(s.price, false)}{s.priceMax ? ` – ${formatFCFA(s.priceMax, false)}` : ''}</span> },
            { key: 'duration', label: 'Durée', render: (s: any) => fmtDuration(s.durationMin) },
            { key: 'commission', label: 'Commission', render: (s: any) => s.commissionType === 'NONE' ? '—' : s.commissionType === 'PERCENT' ? `${s.commissionValue} %` : formatFCFA(s.commissionValue) },
            { key: 'active', label: 'Statut', render: (s: any) => <Badge tone={s.active ? 'green' : 'gray'}>{s.active ? 'Active' : 'Inactive'}</Badge> },
            ...(can('services.manage') ? [{ key: 'edit', label: '', render: (s: any) => <Button size="sm" variant="ghost" onClick={() => setEdit(s)} icon={<Pencil className="h-3.5 w-3.5" />} /> }] : []),
          ]} />
        )}
      </Card>
      <ServiceModal service={edit} categories={cats.data ?? []} onClose={() => setEdit(null)} onSaved={() => { setEdit(null); list.reload(); }} />
    </>
  );
}

function ServiceModal({ service, categories, onClose, onSaved }: { service: any | null; categories: any[]; onClose: () => void; onSaved: () => void }) {
  const { toast } = useUi();
  const [f, setF] = useState<any>({});
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (service) setF({ code: service.code ?? '', name: service.name ?? '', description: service.description ?? '', categoryId: service.categoryId ?? categories[0]?.id, price: service.price ?? '', priceMax: service.priceMax ?? '', durationMin: service.durationMin ?? 60, commissionType: service.commissionType ?? 'PERCENT', commissionValue: service.commissionValue ?? 30, active: service.active ?? true });
  }, [service, categories]);
  const save = async () => {
    setBusy(true);
    const body = { ...f, price: Number(f.price), priceMax: f.priceMax === '' ? null : Number(f.priceMax), durationMin: Number(f.durationMin), commissionValue: Number(f.commissionValue), description: f.description || undefined };
    try {
      if (service?.id) { const { code, ...rest } = body; await patch(`/services/${service.id}`, rest); } else await post('/services', body);
      toast('success', 'Prestation enregistrée');
      onSaved();
    } catch (e: any) { toast('error', e.message); } finally { setBusy(false); }
  };
  const set = (k: string) => (e: any) => setF({ ...f, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value });
  return (
    <Modal open={!!service} onClose={onClose} title={service?.id ? `Modifier ${service.code}` : 'Nouvelle prestation'} footer={<><Button variant="outline" onClick={onClose}>Annuler</Button><Button loading={busy} onClick={save}>Enregistrer</Button></>}>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Code" required><Input value={f.code ?? ''} onChange={set('code')} disabled={!!service?.id} placeholder="DRH06" /></Field>
        <Field label="Catégorie" required><Select value={f.categoryId ?? ''} onChange={set('categoryId')}>{categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</Select></Field>
        <Field label="Désignation" required className="sm:col-span-2"><Input value={f.name ?? ''} onChange={set('name')} /></Field>
        <Field label="Description" className="sm:col-span-2"><Textarea value={f.description ?? ''} onChange={set('description')} /></Field>
        <Field label="Prix de base" required><MoneyInput value={f.price ?? ''} onChange={(v) => setF({ ...f, price: v })} /></Field>
        <Field label="Prix maximum" hint="Optionnel : selon longueur / volume"><MoneyInput value={f.priceMax ?? ''} onChange={(v) => setF({ ...f, priceMax: v })} /></Field>
        <Field label="Durée estimée (minutes)" required><Input type="number" min={5} step={5} value={f.durationMin ?? ''} onChange={set('durationMin')} /></Field>
        <Field label="Commission du coiffeur">
          <div className="flex gap-2">
            <Select value={f.commissionType} onChange={set('commissionType')} className="w-36"><option value="PERCENT">%</option><option value="FIXED">Fixe (FCFA)</option><option value="NONE">Aucune</option></Select>
            {f.commissionType !== 'NONE' && <Input type="number" min={0} value={f.commissionValue} onChange={set('commissionValue')} />}
          </div>
        </Field>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={!!f.active} onChange={set('active')} />Prestation active</label>
      </div>
    </Modal>
  );
}
