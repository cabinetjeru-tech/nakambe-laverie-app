'use client';
import clsx from 'clsx';
import { ChevronLeft, ChevronRight, Plus, Search, ShoppingCart } from 'lucide-react';
import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { APPOINTMENT_STATUS_LABELS } from '@dread-royal/shared';
import { RequirePerm } from '@/components/AppShell';
import { ClientLite, ClientPicker } from '@/components/pickers';
import { Badge, Button, Card, ErrorBox, Field, Input, Modal, PageHeader, Select, Spinner, Tabs, Textarea, useUi } from '@/components/ui';
import { get, patch, post, qs } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { fmtDuration, fmtTime, formatFCFA, todayISO } from '@/lib/format';
import { useApi, useDebounce } from '@/lib/hooks';
import { submitOrQueue } from '@/lib/offline';
import { apptTone } from '@/lib/tones';

type View = 'day' | 'week' | 'month';
const DAY = 86_400_000;
const START_H = 7;
const END_H = 21;
const PX_PER_MIN = 1.1;
const iso = (d: Date) => d.toISOString().slice(0, 10);
const utc = (s: string) => new Date(`${s}T00:00:00.000Z`);

function range(view: View, date: string) {
  const d = utc(date);
  if (view === 'day') return { from: d, to: new Date(d.getTime() + DAY) };
  if (view === 'week') { const from = new Date(d.getTime() - ((d.getUTCDay() + 6) % 7) * DAY); return { from, to: new Date(from.getTime() + 7 * DAY) }; }
  const first = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1));
  const from = new Date(first.getTime() - ((first.getUTCDay() + 6) % 7) * DAY);
  return { from, to: new Date(from.getTime() + 42 * DAY) };
}

export default function RendezVousPage() {
  return <RequirePerm perms={['appointments.view_all', 'appointments.view_own']}><Planning /></RequirePerm>;
}

function Planning() {
  const { can, user } = useAuth();
  const [view, setView] = useState<View>('day');
  const [date, setDate] = useState(todayISO());
  const [staffFilter, setStaffFilter] = useState('');
  const [search, setSearch] = useState('');
  const ds = useDebounce(search);
  const { from, to } = range(view, date);
  const { data, error, loading, reload } = useApi<any[]>(`/appointments${qs({ from: from.toISOString(), to: to.toISOString(), staffId: staffFilter, search: ds })}`);
  const staff = useApi<any[]>(can('appointments.view_all', 'appointments.manage') ? '/staff?stylists=true' : null);
  const [creating, setCreating] = useState<{ startAt?: string; staffId?: string } | null>(null);
  const [selected, setSelected] = useState<any | null>(null);

  useEffect(() => {
    const c = new URLSearchParams(location.search).get('client');
    if (c && can('appointments.manage')) setCreating({});
  }, []); // eslint-disable-line

  const shift = (n: number) => {
    const d = utc(date);
    if (view === 'day') setDate(iso(new Date(d.getTime() + n * DAY)));
    else if (view === 'week') setDate(iso(new Date(d.getTime() + n * 7 * DAY)));
    else setDate(iso(new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + n, 1))));
  };
  const title = view === 'month' ? utc(date).toLocaleDateString('fr-FR', { month: 'long', year: 'numeric', timeZone: 'UTC' }) : view === 'week' ? `Semaine du ${from.toLocaleDateString('fr-FR', { timeZone: 'UTC' })}` : utc(date).toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });
  const columns = staffFilter ? (staff.data ?? []).filter((s) => s.id === staffFilter) : staff.data ?? (user?.staffId ? [{ id: user.staffId, firstName: user.staffName ?? 'Moi', lastName: '', color: '#D4AF37' }] : []);

  return (
    <>
      <PageHeader title={can('appointments.view_all') ? 'Rendez-vous' : 'Mon planning'} subtitle={<span className="capitalize">{title}</span>} actions={can('appointments.manage') && <Button icon={<Plus className="h-4 w-4" />} onClick={() => setCreating({})}>Nouveau rendez-vous</Button>} />
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="flex items-center gap-1">
          <Button size="sm" variant="outline" onClick={() => shift(-1)} aria-label="Précédent"><ChevronLeft className="h-4 w-4" /></Button>
          <Button size="sm" variant="outline" onClick={() => setDate(todayISO())}>Aujourd&apos;hui</Button>
          <Button size="sm" variant="outline" onClick={() => shift(1)} aria-label="Suivant"><ChevronRight className="h-4 w-4" /></Button>
        </div>
        <Input type="date" value={date} onChange={(e) => e.target.value && setDate(e.target.value)} className="w-40" />
        <div className="flex rounded-lg bg-neutral-200 p-0.5">
          {(['day', 'week', 'month'] as View[]).map((v) => <button key={v} onClick={() => setView(v)} className={clsx('rounded-md px-3 py-1 text-sm font-semibold', view === v ? 'bg-royal-black text-royal-gold' : 'text-neutral-700')}>{{ day: 'Jour', week: 'Semaine', month: 'Mois' }[v]}</button>)}
        </div>
        {staff.data && <Select value={staffFilter} onChange={(e) => setStaffFilter(e.target.value)} className="w-48"><option value="">Tous les coiffeurs</option>{staff.data.map((s) => <option key={s.id} value={s.id}>{s.firstName} {s.lastName}</option>)}</Select>}
        <div className="relative w-56"><Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-neutral-400" /><Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Client, téléphone, n° RDV" className="pl-9" /></div>
      </div>
      {error && <ErrorBox error={error} onRetry={reload} />}
      {loading && !data ? <Spinner /> : data && (
        <Card className="overflow-hidden">
          {view === 'day' && <DayView appts={data} columns={columns} date={date} onSelect={setSelected} onSlot={can('appointments.manage') ? (startAt, staffId) => setCreating({ startAt, staffId }) : undefined} />}
          {view === 'week' && <WeekView appts={data} from={from} onSelect={setSelected} onDay={(d) => { setDate(d); setView('day'); }} />}
          {view === 'month' && <MonthView appts={data} from={from} month={utc(date).getUTCMonth()} onDay={(d) => { setDate(d); setView('day'); }} />}
        </Card>
      )}
      <AppointmentModal open={!!creating} initial={creating ?? {}} staff={staff.data ?? []} onClose={() => setCreating(null)} onSaved={() => { setCreating(null); reload(); }} />
      <DetailModal appt={selected} staff={staff.data ?? []} onClose={() => setSelected(null)} onChanged={() => { setSelected(null); reload(); }} />
    </>
  );
}

function ApptBlock({ a, onClick, style, compact }: { a: any; onClick: () => void; style?: React.CSSProperties; compact?: boolean }) {
  const off = a.status === 'CANCELLED' || a.status === 'NO_SHOW';
  return (
    <button onClick={onClick} style={{ ...style, borderLeftColor: a.staff.color }} className={clsx('overflow-hidden rounded-md border border-l-4 bg-white px-2 py-1 text-left text-xs shadow-sm hover:ring-2 hover:ring-royal-gold/50', off && 'opacity-50 line-through', a.status === 'DONE' && 'bg-emerald-50', a.status === 'IN_PROGRESS' && 'bg-violet-50')}>
      <p className="font-bold">{fmtTime(a.startAt)}–{fmtTime(a.endAt)} {a.client.firstName} {a.client.lastName}</p>
      {!compact && <p className="truncate text-neutral-600">{a.items.map((i: any) => i.service.name).join(', ')}</p>}
      {!compact && <Badge tone={apptTone[a.status]}>{APPOINTMENT_STATUS_LABELS[a.status]}</Badge>}
    </button>
  );
}

function DayView({ appts, columns, date, onSelect, onSlot }: { appts: any[]; columns: any[]; date: string; onSelect: (a: any) => void; onSlot?: (startAt: string, staffId: string) => void }) {
  const hours = Array.from({ length: END_H - START_H }, (_, i) => START_H + i);
  const height = (END_H - START_H) * 60 * PX_PER_MIN;
  const now = new Date();
  const nowTop = date === todayISO() ? ((now.getUTCHours() - START_H) * 60 + now.getUTCMinutes()) * PX_PER_MIN : -1;
  if (!columns.length) return <p className="py-8 text-center text-sm text-neutral-500">Aucun coiffeur à afficher.</p>;
  return (
    <div className="-m-4 overflow-x-auto">
      <div className="flex min-w-max">
        <div className="sticky left-0 z-10 w-14 shrink-0 border-r bg-white">
          <div className="h-10 border-b" />
          <div className="relative" style={{ height }}>{hours.map((h) => <div key={h} className="absolute right-1 text-[11px] text-neutral-400" style={{ top: (h - START_H) * 60 * PX_PER_MIN - 6 }}>{h}:00</div>)}</div>
        </div>
        {columns.map((s) => {
          const list = appts.filter((a) => a.staff.id === s.id);
          return (
            <div key={s.id} className="w-56 shrink-0 border-r last:border-r-0">
              <div className="flex h-10 items-center gap-2 border-b bg-royal-black px-2 text-sm font-semibold text-white"><span className="h-3 w-3 rounded-full" style={{ background: s.color }} />{s.firstName} {s.lastName}</div>
              <div className="relative" style={{ height }} onDoubleClick={(e) => {
                if (!onSlot) return;
                const y = e.clientY - (e.currentTarget as HTMLElement).getBoundingClientRect().top;
                const min = Math.floor(y / PX_PER_MIN / 15) * 15 + START_H * 60;
                onSlot(`${date}T${String(Math.floor(min / 60)).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`, s.id);
              }}>
                {hours.map((h) => <div key={h} className="absolute inset-x-0 border-t border-neutral-100" style={{ top: (h - START_H) * 60 * PX_PER_MIN }} />)}
                {nowTop > 0 && <div className="absolute inset-x-0 z-10 border-t-2 border-red-500" style={{ top: nowTop }} />}
                {list.map((a) => {
                  const st = new Date(a.startAt);
                  const top = ((st.getUTCHours() - START_H) * 60 + st.getUTCMinutes()) * PX_PER_MIN;
                  const h = Math.max(28, ((+new Date(a.endAt) - +st) / 60000) * PX_PER_MIN - 2);
                  return <ApptBlock key={a.id} a={a} onClick={() => onSelect(a)} style={{ position: 'absolute', top: Math.max(0, top), left: 4, right: 4, height: h }} compact={h < 50} />;
                })}
              </div>
            </div>
          );
        })}
      </div>
      {onSlot && <p className="border-t px-4 py-2 text-xs text-neutral-500">Astuce : double-cliquez sur un créneau libre pour créer un rendez-vous.</p>}
    </div>
  );
}

function WeekView({ appts, from, onSelect, onDay }: { appts: any[]; from: Date; onSelect: (a: any) => void; onDay: (d: string) => void }) {
  const days = Array.from({ length: 7 }, (_, i) => new Date(from.getTime() + i * DAY));
  return (
    <div className="grid gap-2 md:grid-cols-7">
      {days.map((d) => {
        const list = appts.filter((a) => a.startAt.slice(0, 10) === iso(d));
        return (
          <div key={iso(d)} className={clsx('min-h-[120px] rounded-lg border p-2', iso(d) === todayISO() && 'border-royal-gold bg-royal-gold-light/30')}>
            <button onClick={() => onDay(iso(d))} className="mb-2 w-full text-left text-xs font-bold uppercase text-neutral-600 hover:text-royal-gold-dark">{d.toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' })} <span className="text-neutral-400">({list.length})</span></button>
            <div className="space-y-1">{list.map((a) => <ApptBlock key={a.id} a={a} onClick={() => onSelect(a)} compact />)}</div>
          </div>
        );
      })}
    </div>
  );
}

function MonthView({ appts, from, month, onDay }: { appts: any[]; from: Date; month: number; onDay: (d: string) => void }) {
  const days = Array.from({ length: 42 }, (_, i) => new Date(from.getTime() + i * DAY));
  return (
    <div>
      <div className="mb-1 grid grid-cols-7 text-center text-xs font-bold uppercase text-neutral-500">{['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'].map((d) => <div key={d}>{d}</div>)}</div>
      <div className="grid grid-cols-7 gap-1">
        {days.map((d) => {
          const list = appts.filter((a) => a.startAt.slice(0, 10) === iso(d) && a.status !== 'CANCELLED');
          return (
            <button key={iso(d)} onClick={() => onDay(iso(d))} className={clsx('min-h-[72px] rounded-lg border p-1.5 text-left text-xs hover:ring-2 hover:ring-royal-gold/40', d.getUTCMonth() !== month && 'opacity-40', iso(d) === todayISO() && 'border-royal-gold bg-royal-gold-light/40')}>
              <p className="font-bold">{d.getUTCDate()}</p>
              {list.length > 0 && <p className="mt-1 rounded bg-royal-black px-1 py-0.5 text-center font-semibold text-royal-gold">{list.length} RDV</p>}
              <div className="mt-1 hidden gap-0.5 sm:flex">{list.slice(0, 6).map((a) => <span key={a.id} className="h-1.5 w-1.5 rounded-full" style={{ background: a.staff.color }} />)}</div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function AppointmentModal({ open, initial, staff, onClose, onSaved, appt }: { open: boolean; initial: { startAt?: string; staffId?: string }; staff: any[]; onClose: () => void; onSaved: () => void; appt?: any }) {
  const { toast } = useUi();
  const services = useApi<any[]>(open ? '/services' : null);
  const [client, setClient] = useState<ClientLite | null>(null);
  const [staffId, setStaffId] = useState('');
  const [day, setDay] = useState(todayISO());
  const [time, setTime] = useState('09:00');
  const [serviceIds, setServiceIds] = useState<string[]>([]);
  const [notes, setNotes] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (!open) return;
    if (appt) {
      setClient(appt.client); setStaffId(appt.staff.id); setDay(appt.startAt.slice(0, 10)); setTime(appt.startAt.slice(11, 16)); setServiceIds(appt.items.map((i: any) => i.service.id)); setNotes(appt.notes ?? '');
    } else {
      setStaffId(initial.staffId ?? ''); setDay(initial.startAt?.slice(0, 10) ?? todayISO()); setTime(initial.startAt?.slice(11, 16) ?? '09:00'); setServiceIds([]); setNotes('');
      const c = new URLSearchParams(location.search).get('client');
      if (c) get(`/clients/${c}`).then((r) => setClient(r.client)).catch(() => setClient(null)); else setClient(null);
    }
  }, [open]); // eslint-disable-line
  const chosen = (services.data ?? []).filter((s) => serviceIds.includes(s.id));
  const duration = chosen.reduce((a, s) => a + s.durationMin, 0);
  const byCat = useMemo(() => {
    const m = new Map<string, any[]>();
    (services.data ?? []).forEach((s) => m.set(s.category.name, [...(m.get(s.category.name) ?? []), s]));
    return [...m.entries()];
  }, [services.data]);
  const save = async () => {
    setBusy(true);
    const startAt = `${day}T${time}:00.000Z`;
    try {
      if (appt) {
        await patch(`/appointments/${appt.id}`, { staffId, startAt, serviceIds, notes });
        toast('success', 'Rendez-vous modifié');
      } else {
        const body = { clientId: client!.id, staffId, startAt, serviceIds, notes: notes || undefined };
        const r = await submitOrQueue('appointment.create', body, `RDV ${client!.firstName} ${client!.lastName} le ${day} à ${time}`, () => post('/appointments', body));
        toast(r.queued ? 'warning' : 'success', r.queued ? 'Hors connexion : rendez-vous en attente de synchronisation (le créneau sera vérifié par le serveur)' : `Rendez-vous ${r.result.code} créé`);
      }
      onSaved();
    } catch (e: any) { toast('error', e.message); } finally { setBusy(false); }
  };
  return (
    <Modal open={open} onClose={onClose} size="lg" title={appt ? `Modifier ${appt.code}` : 'Nouveau rendez-vous'} footer={<><Button variant="outline" onClick={onClose}>Annuler</Button><Button loading={busy} disabled={!client || !staffId || !serviceIds.length} onClick={save}>Enregistrer</Button></>}>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Client" required className="sm:col-span-2">{appt ? <p className="text-sm font-semibold">{appt.client.firstName} {appt.client.lastName}</p> : <ClientPicker value={client} onChange={setClient} />}</Field>
        <Field label="Coiffeur / coiffeuse" required><Select value={staffId} onChange={(e) => setStaffId(e.target.value)}><option value="">— Choisir —</option>{staff.map((s) => <option key={s.id} value={s.id}>{s.firstName} {s.lastName} — {s.position}</option>)}</Select></Field>
        <div className="grid grid-cols-2 gap-2">
          <Field label="Date" required><Input type="date" value={day} onChange={(e) => setDay(e.target.value)} /></Field>
          <Field label="Heure" required><Input type="time" step={900} value={time} onChange={(e) => setTime(e.target.value)} /></Field>
        </div>
        <Field label={`Prestations (${chosen.length}) — durée ${fmtDuration(duration)}, fin prévue ${duration ? new Date(new Date(`${day}T${time}:00Z`).getTime() + duration * 60000).toISOString().slice(11, 16) : '—'}`} required className="sm:col-span-2">
          <div className="max-h-64 space-y-2 overflow-y-auto rounded-lg border p-2">
            {byCat.map(([cat, list]) => (
              <div key={cat}>
                <p className="text-[11px] font-bold uppercase text-royal-gold-dark">{cat}</p>
                <div className="grid gap-1 sm:grid-cols-2">
                  {list.map((s) => (
                    <label key={s.id} className={clsx('flex cursor-pointer items-center gap-2 rounded px-2 py-1 text-sm', serviceIds.includes(s.id) ? 'bg-royal-gold-light' : 'hover:bg-neutral-50')}>
                      <input type="checkbox" checked={serviceIds.includes(s.id)} onChange={(e) => setServiceIds(e.target.checked ? [...serviceIds, s.id] : serviceIds.filter((x) => x !== s.id))} />
                      <span className="flex-1">{s.name}</span><span className="text-xs text-neutral-500">{fmtDuration(s.durationMin)}</span>
                    </label>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </Field>
        <Field label="Notes" className="sm:col-span-2"><Textarea value={notes} onChange={(e) => setNotes(e.target.value)} /></Field>
      </div>
    </Modal>
  );
}

function DetailModal({ appt, staff, onClose, onChanged }: { appt: any | null; staff: any[]; onClose: () => void; onChanged: () => void }) {
  const { can, user } = useAuth();
  const { toast, confirm } = useUi();
  const [editing, setEditing] = useState(false);
  if (!appt) return null;
  const setStatus = async (status: string) => {
    let reason: string | undefined;
    if (status === 'CANCELLED') {
      const r = await confirm({ title: 'Annuler le rendez-vous', message: `${appt.client.firstName} ${appt.client.lastName} — ${fmtTime(appt.startAt)}`, danger: true, confirmLabel: 'Annuler le RDV', reasonLabel: "Motif de l'annulation", reasonRequired: true });
      if (!r.ok) return;
      reason = r.reason;
    }
    try { await patch(`/appointments/${appt.id}/status`, { status, reason }); toast('success', `Statut : ${APPOINTMENT_STATUS_LABELS[status]}`); onChanged(); } catch (e: any) { toast('error', e.message); }
  };
  const closed = ['DONE', 'CANCELLED', 'NO_SHOW'].includes(appt.status);
  const mine = appt.staff.id === user?.staffId;
  const total = appt.items.reduce((a: number, i: any) => a + i.price, 0);
  return (
    <>
      <Modal open={!editing} onClose={onClose} title={`Rendez-vous ${appt.code}`} footer={
        <>
          {can('appointments.manage') && !closed && <Button variant="outline" onClick={() => setEditing(true)}>Modifier</Button>}
          {can('appointments.manage') && !closed && <Button variant="danger" onClick={() => setStatus('CANCELLED')}>Annuler</Button>}
          {(can('appointments.manage') || mine) && appt.status !== 'IN_PROGRESS' && !closed && <Button variant="dark" onClick={() => setStatus('IN_PROGRESS')}>Démarrer</Button>}
          {(can('appointments.manage') || mine) && !closed && <Button variant="outline" onClick={() => setStatus('NO_SHOW')}>Client absent</Button>}
          {can('appointments.manage') && appt.status === 'PENDING' && <Button variant="success" onClick={() => setStatus('CONFIRMED')}>Confirmer</Button>}
          {(can('appointments.manage') || mine) && !closed && <Button variant="success" onClick={() => setStatus('DONE')}>Terminé</Button>}
          {can('sales.create') && appt.status !== 'CANCELLED' && <Link href={`/vente/?appointment=${appt.id}`}><Button icon={<ShoppingCart className="h-4 w-4" />}>Encaisser</Button></Link>}
        </>
      }>
        <dl className="grid grid-cols-3 gap-y-2 text-sm">
          <dt className="text-neutral-500">Client</dt><dd className="col-span-2 font-semibold">{appt.client.firstName} {appt.client.lastName} {appt.client.phone && <a href={`tel:${appt.client.phone}`} className="ml-2 text-royal-gold-dark">{appt.client.phone}</a>}</dd>
          <dt className="text-neutral-500">Horaire</dt><dd className="col-span-2">{new Date(appt.startAt).toLocaleDateString('fr-FR', { timeZone: 'UTC' })} · {fmtTime(appt.startAt)} – {fmtTime(appt.endAt)}</dd>
          <dt className="text-neutral-500">Coiffeur</dt><dd className="col-span-2">{appt.staff.firstName} {appt.staff.lastName}</dd>
          <dt className="text-neutral-500">Prestations</dt><dd className="col-span-2">{appt.items.map((i: any) => <div key={i.id}>{i.service.name} <span className="text-xs text-neutral-500">({formatFCFA(i.price)})</span></div>)}<p className="text-xs font-semibold">Estimation : {formatFCFA(total)}</p></dd>
          <dt className="text-neutral-500">Statut</dt><dd className="col-span-2"><Badge tone={apptTone[appt.status]}>{APPOINTMENT_STATUS_LABELS[appt.status]}</Badge> {appt.cancelReason && <span className="text-xs text-neutral-500">({appt.cancelReason})</span>}</dd>
          {appt.notes && <><dt className="text-neutral-500">Notes</dt><dd className="col-span-2">{appt.notes}</dd></>}
        </dl>
        {appt.client.phone && <a className="mt-4 inline-block text-xs font-semibold text-emerald-700 hover:underline" target="_blank" rel="noreferrer" href={`https://wa.me/226${appt.client.phone}?text=${encodeURIComponent(`Bonjour ${appt.client.firstName}, DREAD ROYAL vous rappelle votre rendez-vous du ${new Date(appt.startAt).toLocaleDateString('fr-FR', { timeZone: 'UTC' })} à ${fmtTime(appt.startAt)}. Votre couronne, votre identité !`)}`}>Envoyer un rappel WhatsApp →</a>}
      </Modal>
      <AppointmentModal open={editing} appt={appt} initial={{}} staff={staff} onClose={() => setEditing(false)} onSaved={() => { setEditing(false); onChanged(); }} />
    </>
  );
}
