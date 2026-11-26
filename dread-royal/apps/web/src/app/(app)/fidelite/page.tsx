'use client';
import { Pencil, Plus } from 'lucide-react';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { RequirePerm } from '@/components/AppShell';
import { ClientLite, ClientPicker } from '@/components/pickers';
import { Badge, Button, Card, Field, Input, Modal, MoneyInput, PageHeader, Select, Spinner, StatCard, Table, Tabs, Textarea, useUi } from '@/components/ui';
import { patch, post } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { fmtDate, fmtDateTime, formatFCFA } from '@/lib/format';
import { useApi } from '@/lib/hooks';

export default function FidelitePage() {
  return <RequirePerm perms={['loyalty.view']}><Fidelite /></RequirePerm>;
}

const TX: Record<string, string> = { EARN: 'Gain', REDEEM: 'Récompense', ADJUST: 'Ajustement', CANCEL: 'Annulation' };

function Fidelite() {
  const { can } = useAuth();
  const { toast } = useUi();
  const [tab, setTab] = useState<'apercu' | 'forfaits' | 'abonnements'>('apercu');
  const ov = useApi<any>('/loyalty');
  const packages = useApi<any[]>(tab === 'forfaits' ? '/loyalty/packages?all=true' : null);
  const subs = useApi<any[]>(tab === 'abonnements' ? '/loyalty/subscriptions' : null);
  const services = useApi<any[]>(tab === 'forfaits' ? '/services' : null);
  const staff = useApi<any[]>(tab === 'abonnements' ? '/staff?stylists=true' : null);
  const [adjust, setAdjust] = useState(false);
  const [pk, setPk] = useState<any | null>(null);
  const [use, setUse] = useState<any | null>(null);
  return (
    <>
      <PageHeader title="Fidélité & forfaits" subtitle="Règles modifiables par le propriétaire dans Paramètres → Fidélité" actions={can('loyalty.manage') && (tab === 'forfaits' ? <Button icon={<Plus className="h-4 w-4" />} onClick={() => setPk({})}>Nouveau forfait</Button> : <Button variant="outline" onClick={() => setAdjust(true)}>Ajuster des points</Button>)} />
      <Tabs value={tab} onChange={setTab} tabs={[{ key: 'apercu', label: 'Points & récompenses' }, { key: 'forfaits', label: 'Forfaits mensuels' }, { key: 'abonnements', label: 'Abonnements clients' }]} />
      {tab === 'apercu' && (ov.loading || !ov.data ? <Spinner /> : (
        <>
          <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-4">
            <StatCard tone="dark" label="Règle de gain" value={`1 pt / ${formatFCFA(ov.data.rules.amountPerPoint)}`} hint={ov.data.rules.enabled ? 'Programme actif' : 'Programme désactivé'} />
            <StatCard label="Valeur d'un point" value={formatFCFA(ov.data.rules.pointValue)} hint={`Minimum ${ov.data.rules.minRedeemPoints} pts · max ${ov.data.rules.maxRedeemPercent} % d'une vente`} />
            <StatCard label="Points en circulation" value={ov.data.outstandingPoints} />
            <StatCard tone="gold" label="Engagement (valeur)" value={formatFCFA(ov.data.outstandingValue)} hint="Réductions potentielles" />
          </div>
          <div className="grid gap-5 lg:grid-cols-2">
            <Card title="Meilleurs clients (points)"><Table rows={ov.data.top} columns={[
              { key: 'name', label: 'Client', render: (c: any) => <Link className="hover:underline" href={`/clients/fiche/?id=${c.id}`}><b>{c.firstName} {c.lastName}</b> <span className="text-xs text-neutral-500">{c.code}</span></Link> },
              { key: 'points', label: 'Points', align: 'right', render: (c: any) => <Badge tone="gold">{c.loyaltyPoints}</Badge> },
              { key: 'value', label: 'Valeur', align: 'right', render: (c: any) => formatFCFA(c.loyaltyPoints * ov.data.rules.pointValue) },
            ]} /></Card>
            <Card title="Historique des points et récompenses"><Table rows={ov.data.recent} columns={[
              { key: 'date', label: 'Date', render: (t: any) => fmtDateTime(t.createdAt) },
              { key: 'client', label: 'Client', render: (t: any) => `${t.client.firstName} ${t.client.lastName}` },
              { key: 'type', label: 'Type', render: (t: any) => <Badge tone={t.type === 'REDEEM' ? 'gold' : t.type === 'EARN' ? 'green' : 'gray'}>{TX[t.type]}</Badge> },
              { key: 'points', label: 'Points', align: 'right', render: (t: any) => <b className={t.points < 0 ? 'text-red-600' : 'text-emerald-700'}>{t.points > 0 ? '+' : ''}{t.points}</b> },
            ]} /></Card>
          </div>
        </>
      ))}
      {tab === 'forfaits' && <Card>{packages.loading && !packages.data ? <Spinner /> : <Table rows={packages.data ?? []} columns={[
        { key: 'name', label: 'Forfait', render: (p: any) => <><b>{p.name}</b><p className="text-xs text-neutral-500">{p.description}</p></> },
        { key: 'price', label: 'Prix', align: 'right', render: (p: any) => <b>{formatFCFA(p.price)}</b> },
        { key: 'visits', label: 'Passages', align: 'right' },
        { key: 'duration', label: 'Validité', render: (p: any) => `${p.durationDays} jours` },
        { key: 'services', label: 'Prestations couvertes', render: (p: any) => <span className="text-xs">{(services.data ?? []).filter((s) => p.serviceIds.includes(s.id)).map((s) => s.name).join(', ') || 'Toutes'}</span> },
        { key: 'subs', label: 'Vendus', align: 'right', render: (p: any) => p._count.subscriptions },
        { key: 'active', label: '', render: (p: any) => <Badge tone={p.active ? 'green' : 'gray'}>{p.active ? 'Actif' : 'Inactif'}</Badge> },
        ...(can('loyalty.manage') ? [{ key: 'e', label: '', render: (p: any) => <Button size="sm" variant="ghost" onClick={() => setPk(p)} icon={<Pencil className="h-3.5 w-3.5" />} /> }] : []),
      ]} />}<p className="mt-3 text-xs text-neutral-500">Les forfaits se vendent depuis « Nouvelle vente » (onglet Forfaits) ; l&apos;abonnement du client est créé automatiquement.</p></Card>}
      {tab === 'abonnements' && <Card>{subs.loading && !subs.data ? <Spinner /> : <Table rows={subs.data ?? []} empty="Aucun abonnement." columns={[
        { key: 'client', label: 'Client', render: (s: any) => <><b>{s.client.firstName} {s.client.lastName}</b><p className="text-xs text-neutral-500">{s.client.phone}</p></> },
        { key: 'package', label: 'Forfait', render: (s: any) => s.package.name },
        { key: 'validity', label: 'Validité', render: (s: any) => `${fmtDate(s.startDate)} → ${fmtDate(s.endDate)}` },
        { key: 'visits', label: 'Passages', render: (s: any) => <b>{s.visitsUsed} / {s.visitsTotal}</b> },
        { key: 'status', label: 'Statut', render: (s: any) => <Badge tone={s.status === 'ACTIVE' ? 'green' : 'gray'}>{{ ACTIVE: 'Actif', EXPIRED: 'Expiré', CANCELLED: 'Annulé' }[s.status as string]}</Badge> },
        { key: 'a', label: '', render: (s: any) => s.status === 'ACTIVE' && s.visitsUsed < s.visitsTotal && (can('loyalty.manage') || can('sales.create')) && <Button size="sm" onClick={() => setUse(s)}>Utiliser un passage</Button> },
      ]} />}</Card>}
      <AdjustModal open={adjust} onClose={() => setAdjust(false)} onSaved={() => { setAdjust(false); ov.reload(); }} />
      <PackageModal pkg={pk} services={services.data ?? []} onClose={() => setPk(null)} onSaved={() => { setPk(null); packages.reload(); }} />
      <UseModal sub={use} staff={staff.data ?? []} onClose={() => setUse(null)} onSaved={() => { setUse(null); subs.reload(); toast('success', 'Passage enregistré'); }} />
    </>
  );
}

function AdjustModal({ open, onClose, onSaved }: { open: boolean; onClose: () => void; onSaved: () => void }) {
  const { toast } = useUi();
  const [client, setClient] = useState<ClientLite | null>(null);
  const [points, setPoints] = useState('');
  const [reason, setReason] = useState('');
  const save = async () => {
    try { await post('/loyalty/adjust', { clientId: client!.id, points: Number(points), reason }); toast('success', 'Points ajustés'); onSaved(); } catch (e: any) { toast('error', e.message); }
  };
  return (
    <Modal open={open} onClose={onClose} title="Ajustement de points" size="sm" footer={<Button disabled={!client || !Number(points) || reason.length < 3} onClick={save}>Enregistrer</Button>}>
      <div className="space-y-3">
        <Field label="Client"><ClientPicker value={client} onChange={setClient} allowCreate={false} /></Field>
        <Field label="Points (+ ou −)"><Input type="number" value={points} onChange={(e) => setPoints(e.target.value)} /></Field>
        <Field label="Motif" required><Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Geste commercial, anniversaire…" /></Field>
      </div>
    </Modal>
  );
}

function PackageModal({ pkg, services, onClose, onSaved }: { pkg: any | null; services: any[]; onClose: () => void; onSaved: () => void }) {
  const { toast } = useUi();
  const [f, setF] = useState<any>({});
  useEffect(() => { if (pkg) setF({ code: '', name: '', description: '', price: '', durationDays: 30, visits: 2, serviceIds: [], active: true, ...pkg }); }, [pkg]);
  const set = (k: string) => (e: any) => setF({ ...f, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value });
  const save = async () => {
    const body = { name: f.name, description: f.description || undefined, price: Number(f.price), durationDays: Number(f.durationDays), visits: Number(f.visits), serviceIds: f.serviceIds, active: f.active };
    try { if (pkg?.id) await patch(`/loyalty/packages/${pkg.id}`, body); else await post('/loyalty/packages', { ...body, code: f.code.toUpperCase() }); toast('success', 'Forfait enregistré'); onSaved(); } catch (e: any) { toast('error', e.message); }
  };
  return (
    <Modal open={!!pkg} onClose={onClose} title={pkg?.id ? pkg.name : 'Nouveau forfait'} size="lg" footer={<Button onClick={save} disabled={!f.name || !f.price}>Enregistrer</Button>}>
      <div className="grid gap-3 sm:grid-cols-3">
        <Field label="Code"><Input value={f.code ?? ''} onChange={set('code')} disabled={!!pkg?.id} /></Field>
        <Field label="Nom" className="sm:col-span-2"><Input value={f.name ?? ''} onChange={set('name')} /></Field>
        <Field label="Prix"><MoneyInput value={f.price ?? ''} onChange={(v) => setF({ ...f, price: v })} /></Field>
        <Field label="Passages inclus"><Input type="number" min={1} value={f.visits ?? ''} onChange={set('visits')} /></Field>
        <Field label="Validité (jours)"><Input type="number" min={1} value={f.durationDays ?? ''} onChange={set('durationDays')} /></Field>
        <Field label="Description" className="sm:col-span-3"><Textarea value={f.description ?? ''} onChange={set('description')} rows={2} /></Field>
        <Field label="Prestations couvertes" className="sm:col-span-3">
          <div className="grid max-h-48 gap-1 overflow-y-auto rounded-lg border p-2 sm:grid-cols-2">{services.map((s) => <label key={s.id} className="flex items-center gap-2 text-sm"><input type="checkbox" checked={f.serviceIds?.includes(s.id) ?? false} onChange={(e) => setF({ ...f, serviceIds: e.target.checked ? [...f.serviceIds, s.id] : f.serviceIds.filter((x: string) => x !== s.id) })} />{s.name}</label>)}</div>
        </Field>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={!!f.active} onChange={set('active')} />Actif</label>
      </div>
    </Modal>
  );
}

function UseModal({ sub, staff, onClose, onSaved }: { sub: any | null; staff: any[]; onClose: () => void; onSaved: () => void }) {
  const { toast } = useUi();
  const services = useApi<any[]>(sub ? '/services' : null);
  const [serviceId, setServiceId] = useState('');
  const [staffId, setStaffId] = useState('');
  if (!sub) return null;
  const allowed = (services.data ?? []).filter((s) => !sub.package.serviceIds.length || sub.package.serviceIds.includes(s.id));
  const save = async () => {
    try { await post(`/loyalty/subscriptions/${sub.id}/use`, { serviceId: serviceId || undefined, staffId: staffId || undefined }); onSaved(); } catch (e: any) { toast('error', e.message); }
  };
  return (
    <Modal open onClose={onClose} title={`Passage — ${sub.package.name}`} size="sm" footer={<Button onClick={save}>Valider le passage</Button>}>
      <div className="space-y-3">
        <p className="text-sm">{sub.client.firstName} {sub.client.lastName} — {sub.visitsUsed} / {sub.visitsTotal} passages utilisés</p>
        <Field label="Prestation"><Select value={serviceId} onChange={(e) => setServiceId(e.target.value)}><option value="">—</option>{allowed.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</Select></Field>
        <Field label="Coiffeur"><Select value={staffId} onChange={(e) => setStaffId(e.target.value)}><option value="">—</option>{staff.map((s) => <option key={s.id} value={s.id}>{s.firstName} {s.lastName}</option>)}</Select></Field>
      </div>
    </Modal>
  );
}
