'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Copy, Plus, Trash2, UserPlus } from 'lucide-react';
import { useState } from 'react';
import { Badge, Button, Card, ErrorMessage, Field, Input, Modal, PageHeader, Select, Spinner } from '@/components/ui';
import { del, get, patch, post, put } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { dateTime, localToIso, todayIn } from '@/lib/format';
import { useSalon } from '@/lib/salon';

interface Staff {
  id: string;
  displayName: string;
  phone: string | null;
  calendarColor: string;
  contractType: string;
  isActive: boolean;
  hasAccount: boolean;
  membershipId: string | null;
  membershipStatus: string | null;
  roles: { code: string; name: string }[];
  salonIds: string[];
  skills: { serviceId: string }[];
}
interface StaffDetail extends Staff {
  schedules: { salonId: string; weekday: number; startsAt: string; endsAt: string }[];
  upcomingTimeOff: { id: string; type: string; startsAt: string; endsAt: string; note: string | null }[];
}
interface Role {
  id: string;
  code: string;
  name: string;
  editable: boolean;
}

const CONTRACTS: Record<string, string> = { EMPLOYEE: 'Salarié', FREELANCE: 'Indépendant', CHAIR_RENTAL: 'Location de fauteuil', APPRENTICE: 'Apprenti' };
const DAYS = ['Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi', 'Dimanche'];
const TIME_OFF: Record<string, string> = { LEAVE: 'Congé', SICK: 'Maladie', BREAK: 'Pause', TRAINING: 'Formation', OTHER: 'Autre' };

export default function TeamPage() {
  const { can } = useAuth();
  const [creating, setCreating] = useState(false);
  const [inviting, setInviting] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);
  const { data: staff = [], isLoading, error } = useQuery({ queryKey: ['staff', 'all'], queryFn: () => get<Staff[]>('/staff?includeInactive=true') });

  return (
    <>
      <PageHeader
        title="Employés"
        description="Profils, plannings, absences et accès à l’application."
        actions={
          can('staff.manage') && (
            <>
              <Button variant="secondary" onClick={() => setCreating(true)}><Plus className="h-4 w-4" /> Employé sans compte</Button>
              <Button onClick={() => setInviting(true)}><UserPlus className="h-4 w-4" /> Inviter</Button>
            </>
          )
        }
      />
      <ErrorMessage error={error} />
      {isLoading ? (
        <Spinner />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {staff.map((s) => (
            <button key={s.id} onClick={() => setSelected(s.id)} className="rounded-xl border border-stone-200 bg-white p-4 text-left hover:border-brand-500">
              <div className="flex items-center gap-3">
                <span className="flex h-10 w-10 items-center justify-center rounded-full text-sm font-semibold text-white" style={{ background: s.calendarColor }} aria-hidden>
                  {s.displayName.slice(0, 2).toUpperCase()}
                </span>
                <div className="min-w-0">
                  <p className="truncate font-medium text-stone-900">{s.displayName}</p>
                  <p className="truncate text-xs text-stone-500">{s.roles.map((r) => r.name).join(', ') || CONTRACTS[s.contractType]}</p>
                </div>
              </div>
              <div className="mt-3 flex flex-wrap gap-1">
                {!s.isActive && <Badge>Inactif</Badge>}
                {s.membershipStatus === 'SUSPENDED' && <Badge tone="red">Accès suspendu</Badge>}
                {!s.hasAccount && <Badge tone="amber">Sans compte</Badge>}
                <Badge tone="violet">{s.skills.length} prestation(s)</Badge>
              </div>
            </button>
          ))}
        </div>
      )}
      {can('commissions.read', 'commissions.rules.manage') && <CommissionRules staff={staff} />}
      {creating && <CreateStaff onClose={() => setCreating(false)} />}
      {inviting && <Invite onClose={() => setInviting(false)} />}
      {selected && <StaffPanel staffId={selected} onClose={() => setSelected(null)} />}
    </>
  );
}

function SalonChecks({ value, onChange }: { value: string[]; onChange: (ids: string[]) => void }) {
  const { salons } = useSalon();
  if (salons.length <= 1) return null;
  return (
    <div>
      <p className="mb-1 text-sm font-medium">Salons</p>
      <div className="flex flex-wrap gap-2">
        {salons.map((s) => (
          <label key={s.id} className="flex items-center gap-1.5 rounded-full border border-stone-300 px-3 py-1 text-sm">
            <input type="checkbox" checked={value.includes(s.id)} onChange={(e) => onChange(e.target.checked ? [...value, s.id] : value.filter((id) => id !== s.id))} />
            {s.name}
          </label>
        ))}
      </div>
    </div>
  );
}

function CreateStaff({ onClose }: { onClose: () => void }) {
  const { salon } = useSalon();
  const queryClient = useQueryClient();
  const [form, setForm] = useState({ displayName: '', phone: '', contractType: 'EMPLOYEE', calendarColor: '#2F80ED' });
  const [salonIds, setSalonIds] = useState<string[]>(salon ? [salon.id] : []);
  const create = useMutation({
    mutationFn: () => post('/staff', { ...form, phone: form.phone || undefined, salonIds }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['staff'] });
      onClose();
    },
  });
  return (
    <Modal open title="Employé sans compte" onClose={onClose} footer={<><Button variant="secondary" onClick={onClose}>Annuler</Button><Button loading={create.isPending} onClick={() => create.mutate()}>Créer</Button></>}>
      <div className="space-y-3">
        <p className="text-sm text-stone-600">Pour un apprenti ou un coiffeur qui n’utilise pas l’application : il apparaît dans l’agenda et à la caisse.</p>
        <Field label="Nom affiché">{(id) => <Input id={id} value={form.displayName} onChange={(e) => setForm({ ...form, displayName: e.target.value })} />}</Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Téléphone">{(id) => <Input id={id} value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />}</Field>
          <Field label="Contrat">
            {(id) => (
              <Select id={id} value={form.contractType} onChange={(e) => setForm({ ...form, contractType: e.target.value })}>
                {Object.entries(CONTRACTS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </Select>
            )}
          </Field>
        </div>
        <Field label="Couleur dans l’agenda">{(id) => <Input id={id} type="color" value={form.calendarColor} onChange={(e) => setForm({ ...form, calendarColor: e.target.value })} className="h-10 w-20 p-1" />}</Field>
        <SalonChecks value={salonIds} onChange={setSalonIds} />
        <ErrorMessage error={create.error} />
      </div>
    </Modal>
  );
}

function Invite({ onClose }: { onClose: () => void }) {
  const { salon } = useSalon();
  const queryClient = useQueryClient();
  const { data: roles = [] } = useQuery({ queryKey: ['roles'], queryFn: () => get<Role[]>('/roles') });
  const [phone, setPhone] = useState('');
  const [roleId, setRoleId] = useState('');
  const [salonIds, setSalonIds] = useState<string[]>(salon ? [salon.id] : []);
  const [allSalons, setAllSalons] = useState(false);
  const invite = useMutation({
    mutationFn: () => post<{ link: string }>('/invitations', { phone, roleId, allSalons, salonIds: allSalons ? [] : salonIds }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['invitations'] }),
  });
  const link = invite.data?.link;
  return (
    <Modal open title="Inviter un membre de l’équipe" onClose={onClose}>
      {link ? (
        <div className="space-y-3 text-sm">
          <p>Invitation créée. Envoyez ce lien à la personne (valable 72 h) :</p>
          <div className="flex gap-2">
            <Input readOnly value={link} aria-label="Lien d’invitation" />
            <Button variant="secondary" onClick={() => navigator.clipboard?.writeText(link)} aria-label="Copier"><Copy className="h-4 w-4" /></Button>
          </div>
          <a className="inline-block font-medium text-emerald-700 hover:underline" href={`https://wa.me/${phone.replace(/\D/g, '')}?text=${encodeURIComponent(`Rejoignez l’équipe du salon : ${link}`)}`} target="_blank" rel="noreferrer">
            Envoyer par WhatsApp
          </a>
          <div className="flex justify-end"><Button onClick={onClose}>Terminé</Button></div>
        </div>
      ) : (
        <div className="space-y-3">
          <Field label="Téléphone">{(id) => <Input id={id} value={phone} onChange={(e) => setPhone(e.target.value)} inputMode="tel" />}</Field>
          <Field label="Rôle">
            {(id) => (
              <Select id={id} value={roleId} onChange={(e) => setRoleId(e.target.value)}>
                <option value="">Choisir…</option>
                {roles.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
              </Select>
            )}
          </Field>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={allSalons} onChange={(e) => setAllSalons(e.target.checked)} />
            Accès à tous les salons
          </label>
          {!allSalons && <SalonChecks value={salonIds} onChange={setSalonIds} />}
          <ErrorMessage error={invite.error} />
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={onClose}>Annuler</Button>
            <Button disabled={!phone || !roleId} loading={invite.isPending} onClick={() => invite.mutate()}>Créer l’invitation</Button>
          </div>
        </div>
      )}
    </Modal>
  );
}

function StaffPanel({ staffId, onClose }: { staffId: string; onClose: () => void }) {
  const { can } = useAuth();
  const { salon, salons } = useSalon();
  const queryClient = useQueryClient();
  const { data: staff } = useQuery({ queryKey: ['staff', staffId], queryFn: () => get<StaffDetail>(`/staff/${staffId}`) });
  const refresh = () => queryClient.invalidateQueries({ queryKey: ['staff'] });

  if (!staff || !salon) return <Modal open title="Employé" onClose={onClose}><Spinner /></Modal>;
  const scheduleSalon = staff.salonIds.includes(salon.id) ? salon.id : staff.salonIds[0];
  return (
    <Modal open wide title={staff.displayName} onClose={onClose}>
      <div className="space-y-6">
        <p className="text-sm text-stone-600">
          {CONTRACTS[staff.contractType]} · {staff.phone ?? 'sans téléphone'} · {staff.salonIds.map((id) => salons.find((s) => s.id === id)?.name).filter(Boolean).join(', ')}
        </p>
        {can('staff.schedule.manage') && scheduleSalon && <ScheduleEditor staff={staff} salonId={scheduleSalon} onSaved={refresh} />}
        <TimeOff staff={staff} canManage={can('staff.schedule.manage')} onChanged={refresh} />
        {staff.membershipId && can('roles.manage') && <AccessEditor staff={staff} onSaved={refresh} />}
        {can('staff.manage') && (
          <div className="flex flex-wrap gap-2 border-t border-stone-100 pt-4">
            <ToggleActive staff={staff} onDone={refresh} />
            {staff.membershipId && <SuspendAccess staff={staff} onDone={refresh} />}
          </div>
        )}
      </div>
    </Modal>
  );
}

function ScheduleEditor({ staff, salonId, onSaved }: { staff: StaffDetail; salonId: string; onSaved: () => void }) {
  const initial = DAYS.map((_, i) => {
    const entry = staff.schedules.find((s) => s.salonId === salonId && s.weekday === i + 1);
    return { enabled: Boolean(entry), startsAt: entry?.startsAt ?? '08:00', endsAt: entry?.endsAt ?? '18:00' };
  });
  const [days, setDays] = useState(initial);
  const save = useMutation({
    mutationFn: () =>
      put(`/staff/${staff.id}/schedule`, {
        salonId,
        entries: days.flatMap((d, i) => (d.enabled ? [{ weekday: i + 1, startsAt: d.startsAt, endsAt: d.endsAt }] : [])),
      }),
    onSuccess: onSaved,
  });
  return (
    <Card title="Planning de la semaine" actions={<Button size="sm" loading={save.isPending} onClick={() => save.mutate()}>Enregistrer</Button>}>
      <ul className="space-y-2">
        {days.map((d, i) => (
          <li key={i} className="flex flex-wrap items-center gap-2 text-sm">
            <label className="flex w-28 items-center gap-2">
              <input type="checkbox" checked={d.enabled} onChange={(e) => setDays(days.map((x, j) => (j === i ? { ...x, enabled: e.target.checked } : x)))} />
              {DAYS[i]}
            </label>
            {d.enabled ? (
              <>
                <Input type="time" className="w-28" value={d.startsAt} aria-label={`Début ${DAYS[i]}`} onChange={(e) => setDays(days.map((x, j) => (j === i ? { ...x, startsAt: e.target.value } : x)))} />
                <span>à</span>
                <Input type="time" className="w-28" value={d.endsAt} aria-label={`Fin ${DAYS[i]}`} onChange={(e) => setDays(days.map((x, j) => (j === i ? { ...x, endsAt: e.target.value } : x)))} />
              </>
            ) : (
              <span className="text-stone-400">Repos</span>
            )}
          </li>
        ))}
      </ul>
      <ErrorMessage error={save.error} />
    </Card>
  );
}

function TimeOff({ staff, canManage, onChanged }: { staff: StaffDetail; canManage: boolean; onChanged: () => void }) {
  const { salon } = useSalon();
  const today = todayIn(salon!.timezone);
  const [form, setForm] = useState({ type: 'LEAVE', from: today, fromTime: '08:00', to: today, toTime: '20:00', note: '' });
  const add = useMutation({
    mutationFn: () =>
      post<{ conflictingAppointments: number }>(`/staff/${staff.id}/time-off`, {
        type: form.type,
        startsAt: localToIso(form.from, form.fromTime, salon!.timezone),
        endsAt: localToIso(form.to, form.toTime, salon!.timezone),
        ...(form.note ? { note: form.note } : {}),
      }),
    onSuccess: onChanged,
  });
  const remove = useMutation({ mutationFn: (id: string) => del(`/staff/${staff.id}/time-off/${id}`), onSuccess: onChanged });
  return (
    <Card title="Absences à venir">
      {staff.upcomingTimeOff.length === 0 ? (
        <p className="text-sm text-stone-500">Aucune absence prévue.</p>
      ) : (
        <ul className="mb-3 space-y-1 text-sm">
          {staff.upcomingTimeOff.map((t) => (
            <li key={t.id} className="flex items-center justify-between">
              <span>{TIME_OFF[t.type]} : {dateTime(t.startsAt, salon!.timezone)} → {dateTime(t.endsAt, salon!.timezone)} {t.note && <span className="text-stone-500">({t.note})</span>}</span>
              {canManage && <button onClick={() => remove.mutate(t.id)} aria-label="Supprimer l’absence" className="text-stone-400 hover:text-red-600"><Trash2 className="h-4 w-4" /></button>}
            </li>
          ))}
        </ul>
      )}
      {canManage && (
        <div className="mt-3 grid gap-2 border-t border-stone-100 pt-3 sm:grid-cols-3">
          <Select value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })} aria-label="Type d’absence">
            {Object.entries(TIME_OFF).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </Select>
          <div className="flex gap-1"><Input type="date" value={form.from} onChange={(e) => setForm({ ...form, from: e.target.value })} aria-label="Du" /><Input type="time" value={form.fromTime} onChange={(e) => setForm({ ...form, fromTime: e.target.value })} aria-label="Heure de début" /></div>
          <div className="flex gap-1"><Input type="date" value={form.to} onChange={(e) => setForm({ ...form, to: e.target.value })} aria-label="Au" /><Input type="time" value={form.toTime} onChange={(e) => setForm({ ...form, toTime: e.target.value })} aria-label="Heure de fin" /></div>
          <Input className="sm:col-span-2" value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} placeholder="Note (facultatif)" aria-label="Note" />
          <Button variant="secondary" loading={add.isPending} onClick={() => add.mutate()}>Ajouter</Button>
          {add.data && add.data.conflictingAppointments > 0 && (
            <p className="text-sm text-amber-800 sm:col-span-3">Attention : {add.data.conflictingAppointments} rendez-vous déjà pris sur cette période sont à déplacer.</p>
          )}
          <div className="sm:col-span-3"><ErrorMessage error={add.error ?? remove.error} /></div>
        </div>
      )}
    </Card>
  );
}

function AccessEditor({ staff, onSaved }: { staff: StaffDetail; onSaved: () => void }) {
  const { data: roles = [] } = useQuery({ queryKey: ['roles'], queryFn: () => get<Role[]>('/roles') });
  const current = roles.find((r) => staff.roles.some((sr) => sr.code === r.code));
  const [roleId, setRoleId] = useState<string>('');
  const save = useMutation({
    mutationFn: () => put(`/members/${staff.membershipId}/access`, { roleIds: [roleId], allSalons: false, salonIds: staff.salonIds }),
    onSuccess: onSaved,
  });
  return (
    <Card title="Accès à l’application">
      <div className="flex flex-wrap items-end gap-2">
        <Field label="Rôle">
          {(id) => (
            <Select id={id} value={roleId || current?.id || ''} onChange={(e) => setRoleId(e.target.value)}>
              {roles.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
            </Select>
          )}
        </Field>
        <Button size="sm" variant="secondary" disabled={!roleId || roleId === current?.id} loading={save.isPending} onClick={() => save.mutate()}>Changer le rôle</Button>
      </div>
      <p className="mt-2 text-xs text-stone-500">Le changement prend effet immédiatement ; l’accès reste limité aux salons de l’employé.</p>
      <ErrorMessage error={save.error} />
    </Card>
  );
}

function ToggleActive({ staff, onDone }: { staff: StaffDetail; onDone: () => void }) {
  const toggle = useMutation({ mutationFn: () => patch(`/staff/${staff.id}`, { isActive: !staff.isActive }), onSuccess: onDone });
  return (
    <>
      <Button size="sm" variant="secondary" loading={toggle.isPending} onClick={() => toggle.mutate()}>
        {staff.isActive ? 'Retirer de l’agenda' : 'Remettre dans l’agenda'}
      </Button>
      <ErrorMessage error={toggle.error} />
    </>
  );
}

function SuspendAccess({ staff, onDone }: { staff: StaffDetail; onDone: () => void }) {
  const suspended = staff.membershipStatus === 'SUSPENDED';
  const action = useMutation({ mutationFn: () => post(`/members/${staff.membershipId}/${suspended ? 'reactivate' : 'suspend'}`), onSuccess: onDone });
  return (
    <>
      <Button size="sm" variant={suspended ? 'secondary' : 'danger'} loading={action.isPending} onClick={() => action.mutate()}>
        {suspended ? 'Rétablir l’accès' : 'Suspendre l’accès'}
      </Button>
      <ErrorMessage error={action.error} />
    </>
  );
}

function CommissionRules({ staff }: { staff: Staff[] }) {
  const { can } = useAuth();
  const queryClient = useQueryClient();
  const { data: rules = [] } = useQuery({
    queryKey: ['commission-rules'],
    queryFn: () => get<{ id: string; appliesTo: string; type: string; value: number; staff: { displayName: string } | null; service: { name: string } | null; serviceCategory: { name: string } | null }[]>('/commission-rules'),
  });
  const [form, setForm] = useState({ staffId: '', appliesTo: 'SERVICE', type: 'PERCENT', value: 30 });
  const create = useMutation({
    mutationFn: () => post('/commission-rules', { ...form, staffId: form.staffId || undefined }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['commission-rules'] }),
  });
  const close = useMutation({ mutationFn: (id: string) => del(`/commission-rules/${id}`), onSuccess: () => queryClient.invalidateQueries({ queryKey: ['commission-rules'] }) });
  return (
    <Card title="Règles de commission" className="mt-6">
      <p className="mb-3 text-xs text-stone-500">La règle la plus précise s’applique (employé &gt; toute l’équipe). Calculées automatiquement à chaque encaissement.</p>
      <ul className="mb-3 space-y-1 text-sm">
        {rules.length === 0 && <li className="text-stone-500">Aucune règle : aucune commission n’est calculée.</li>}
        {rules.map((r) => (
          <li key={r.id} className="flex items-center justify-between">
            <span>
              {r.staff?.displayName ?? 'Toute l’équipe'} · {r.appliesTo === 'SERVICE' ? 'prestations' : 'produits'}
              {r.service ? ` (${r.service.name})` : r.serviceCategory ? ` (${r.serviceCategory.name})` : ''} : <strong>{r.type === 'PERCENT' ? `${r.value} %` : `${r.value} FCFA`}</strong>
            </span>
            {can('commissions.rules.manage') && <button onClick={() => close.mutate(r.id)} aria-label="Clore la règle" className="text-stone-400 hover:text-red-600"><Trash2 className="h-4 w-4" /></button>}
          </li>
        ))}
      </ul>
      {can('commissions.rules.manage') && (
        <div className="flex flex-wrap items-center gap-2 border-t border-stone-100 pt-3">
          <Select className="w-44" value={form.staffId} onChange={(e) => setForm({ ...form, staffId: e.target.value })} aria-label="Employé">
            <option value="">Toute l’équipe</option>
            {staff.filter((s) => s.isActive).map((s) => <option key={s.id} value={s.id}>{s.displayName}</option>)}
          </Select>
          <Select className="w-36" value={form.appliesTo} onChange={(e) => setForm({ ...form, appliesTo: e.target.value })} aria-label="Sur">
            <option value="SERVICE">Prestations</option>
            <option value="PRODUCT">Produits</option>
          </Select>
          <Select className="w-24" value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })} aria-label="Type">
            <option value="PERCENT">%</option>
            <option value="FIXED">FCFA</option>
          </Select>
          <Input className="w-24" type="number" min={0} value={form.value} onChange={(e) => setForm({ ...form, value: Number(e.target.value) })} aria-label="Valeur" />
          <Button size="sm" variant="secondary" loading={create.isPending} onClick={() => create.mutate()}>Ajouter</Button>
          <ErrorMessage error={create.error ?? close.error} />
        </div>
      )}
    </Card>
  );
}
