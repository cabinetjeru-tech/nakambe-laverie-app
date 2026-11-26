'use client';
import { Pencil, Plus } from 'lucide-react';
import { useEffect, useState } from 'react';
import { COMMISSION_MODE_LABELS, CONTRACT_LABELS, STAFF_STATUS_LABELS } from '@dread-royal/shared';
import { RequirePerm } from '@/components/AppShell';
import { Badge, Button, Card, ErrorBox, Field, Input, Modal, MoneyInput, PageHeader, Select, Spinner, Table, Textarea, useUi } from '@/components/ui';
import { patch, post } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { fmtDate, fmtPhone, formatFCFA, todayISO } from '@/lib/format';
import { useApi } from '@/lib/hooks';

export default function PersonnelPage() {
  return <RequirePerm perms={['staff.view']}><Personnel /></RequirePerm>;
}

function Personnel() {
  const { can } = useAuth();
  const { data, error, loading, reload } = useApi<any[]>('/staff');
  const [edit, setEdit] = useState<any | null>(null);
  return (
    <>
      <PageHeader title="Personnel" subtitle={data ? `${data.filter((s) => s.status === 'ACTIVE').length} collaborateur(s) actif(s)` : undefined} actions={can('staff.manage') && <Button icon={<Plus className="h-4 w-4" />} onClick={() => setEdit({})}>Nouveau collaborateur</Button>} />
      <Card>
        {error && <ErrorBox error={error} onRetry={reload} />}
        {loading && !data ? <Spinner /> : <Table rows={data ?? []} columns={[
          { key: 'name', label: 'Collaborateur', render: (s: any) => <div className="flex items-center gap-2"><span className="h-3 w-3 rounded-full" style={{ background: s.color }} /><div><b>{s.firstName} {s.lastName}</b><p className="text-xs text-neutral-500">{s.code} · {s.position}</p></div></div> },
          { key: 'phone', label: 'Téléphone', render: (s: any) => fmtPhone(s.phone) },
          { key: 'hireDate', label: 'Recrutement', render: (s: any) => fmtDate(s.hireDate) },
          { key: 'contract', label: 'Contrat', render: (s: any) => CONTRACT_LABELS[s.contractType] },
          { key: 'salary', label: 'Rémunération fixe', align: 'right', render: (s: any) => s.baseSalary ? formatFCFA(s.baseSalary) : '—' },
          { key: 'commission', label: 'Commission', render: (s: any) => <span className="text-xs">{COMMISSION_MODE_LABELS[s.commissionMode]}{s.commissionMode === 'PERCENT' ? ` (${s.commissionRate} %)` : s.commissionMode === 'FIXED' ? ` (${formatFCFA(s.commissionFixed)})` : ''}</span> },
          { key: 'account', label: 'Compte', render: (s: any) => s.user ? <Badge tone={s.user.active ? 'gold' : 'gray'}>{s.user.username}</Badge> : <span className="text-xs text-neutral-400">aucun</span> },
          { key: 'status', label: 'Statut', render: (s: any) => <Badge tone={s.status === 'ACTIVE' ? 'green' : s.status === 'ON_LEAVE' ? 'orange' : 'gray'}>{STAFF_STATUS_LABELS[s.status]}</Badge> },
          ...(can('staff.manage') ? [{ key: 'e', label: '', render: (s: any) => <Button size="sm" variant="ghost" onClick={() => setEdit(s)} icon={<Pencil className="h-3.5 w-3.5" />} /> }] : []),
        ]} />}
        <p className="mt-3 text-xs text-neutral-500">Pour donner un accès à l&apos;application à un collaborateur, créez son compte dans « Utilisateurs & rôles » et liez-le à sa fiche.</p>
      </Card>
      <StaffModal staff={edit} onClose={() => setEdit(null)} onSaved={() => { setEdit(null); reload(); }} />
    </>
  );
}

function StaffModal({ staff, onClose, onSaved }: { staff: any | null; onClose: () => void; onSaved: () => void }) {
  const { toast } = useUi();
  const [f, setF] = useState<any>({});
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (staff) { const base = { firstName: '', lastName: '', position: '', isStylist: true, contractType: 'CDI', baseSalary: 0, commissionMode: 'SERVICE_DEFAULT', commissionRate: 30, commissionFixed: 0, status: 'ACTIVE', color: '#D4AF37' }; setF({ ...base, ...staff, hireDate: staff.hireDate?.slice(0, 10) ?? todayISO(), phone: staff.phone ?? '', notes: staff.notes ?? '' }); } }, [staff]);
  const set = (k: string) => (e: any) => setF({ ...f, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value });
  const save = async () => {
    setBusy(true);
    const body = { firstName: f.firstName, lastName: f.lastName, phone: f.phone || undefined, position: f.position, isStylist: f.isStylist, hireDate: f.hireDate, contractType: f.contractType, baseSalary: Number(f.baseSalary) || 0, commissionMode: f.commissionMode, commissionRate: Number(f.commissionRate) || 0, commissionFixed: Number(f.commissionFixed) || 0, status: f.status, color: f.color, notes: f.notes || undefined };
    try { if (staff?.id) await patch(`/staff/${staff.id}`, body); else await post('/staff', body); toast('success', 'Fiche enregistrée'); onSaved(); } catch (e: any) { toast('error', e.message); } finally { setBusy(false); }
  };
  return (
    <Modal open={!!staff} onClose={onClose} size="lg" title={staff?.id ? `${staff.firstName} ${staff.lastName}` : 'Nouveau collaborateur'} footer={<><Button variant="outline" onClick={onClose}>Annuler</Button><Button loading={busy} disabled={!f.firstName || !f.lastName || !f.position} onClick={save}>Enregistrer</Button></>}>
      <div className="grid gap-3 sm:grid-cols-3">
        <Field label="Prénom" required><Input value={f.firstName ?? ''} onChange={set('firstName')} /></Field>
        <Field label="Nom" required><Input value={f.lastName ?? ''} onChange={set('lastName')} /></Field>
        <Field label="Téléphone"><Input value={f.phone ?? ''} onChange={set('phone')} /></Field>
        <Field label="Fonction" required><Input value={f.position ?? ''} onChange={set('position')} placeholder="Locticien, Tresseuse, Barbier…" /></Field>
        <Field label="Date de recrutement"><Input type="date" value={f.hireDate ?? ''} onChange={set('hireDate')} /></Field>
        <Field label="Type de contrat"><Select value={f.contractType} onChange={set('contractType')}>{Object.entries(CONTRACT_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</Select></Field>
        <Field label="Salaire fixe mensuel"><MoneyInput value={f.baseSalary ?? ''} onChange={(v) => setF({ ...f, baseSalary: v })} /></Field>
        <Field label="Mode de commission"><Select value={f.commissionMode} onChange={set('commissionMode')}>{Object.entries(COMMISSION_MODE_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</Select></Field>
        {f.commissionMode === 'PERCENT' && <Field label="Taux (%)"><Input type="number" min={0} max={100} value={f.commissionRate} onChange={set('commissionRate')} /></Field>}
        {f.commissionMode === 'FIXED' && <Field label="Montant fixe par prestation"><MoneyInput value={f.commissionFixed ?? ''} onChange={(v) => setF({ ...f, commissionFixed: v })} /></Field>}
        <Field label="Statut"><Select value={f.status} onChange={set('status')}>{Object.entries(STAFF_STATUS_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</Select></Field>
        <Field label="Couleur du planning"><Input type="color" value={f.color ?? '#D4AF37'} onChange={set('color')} className="h-10 p-1" /></Field>
        <label className="flex items-center gap-2 self-end pb-2 text-sm"><input type="checkbox" checked={!!f.isStylist} onChange={set('isStylist')} />Réalise des prestations</label>
        <Field label="Notes" className="sm:col-span-3"><Textarea value={f.notes ?? ''} onChange={set('notes')} rows={2} /></Field>
      </div>
    </Modal>
  );
}
