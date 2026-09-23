'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ChevronLeft, ChevronRight, Plus } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import { ClientOption, ClientPicker } from '@/components/pickers/client-picker';
import { Badge, Button, ErrorMessage, Field, Input, Modal, PageHeader, Select, Spinner, Textarea } from '@/components/ui';
import { get, patch, post, qs } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { APPOINTMENT_STATUS, localToIso, longDay, minutesInZone, money, shiftDate, time, todayIn } from '@/lib/format';
import { useSalon } from '@/lib/salon';

interface AppointmentItem {
  id: string;
  serviceId: string;
  serviceName: string;
  startsAt: string;
  endsAt: string;
  price: number;
  staff: { id: string; displayName: string; calendarColor: string };
}
interface Appointment {
  id: string;
  reference: string;
  status: string;
  startsAt: string;
  endsAt: string;
  estimatedTotal: number;
  clientNote: string | null;
  internalNote: string | null;
  client: { id: string; fullName: string; phone: string | null } | null;
  items: AppointmentItem[];
  sales: { id: string; number: string }[];
}
interface Agenda {
  date: string;
  timezone: string;
  opening: { start: string; end: string }[];
  staff: { id: string; displayName: string; calendarColor: string; workingHours: { start: string; end: string }[] }[];
  appointments: Appointment[];
}

const PX_PER_MIN = 1.2;
const CANCELLED = ['CANCELLED_BY_CLIENT', 'CANCELLED_BY_SALON', 'NO_SHOW'];

export default function AppointmentsPage() {
  const { salon } = useSalon();
  const { can } = useAuth();
  const [date, setDate] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [selected, setSelected] = useState<Appointment | null>(null);

  useEffect(() => {
    if (salon && !date) setDate(todayIn(salon.timezone));
  }, [salon, date]);

  const { data, isLoading, error } = useQuery({
    queryKey: ['agenda', salon?.id, date],
    queryFn: () => get<Agenda>(`/appointments/agenda${qs({ salonId: salon!.id, date })}`),
    enabled: Boolean(salon && date),
  });

  const range = useMemo(() => {
    if (!data) return { start: 8 * 60, end: 20 * 60 };
    const tz = data.timezone;
    const points = [
      ...data.opening.flatMap((o) => [minutesInZone(o.start, tz), minutesInZone(o.end, tz)]),
      ...data.appointments.flatMap((a) => [minutesInZone(a.startsAt, tz), minutesInZone(a.endsAt, tz)]),
    ];
    if (points.length === 0) return { start: 8 * 60, end: 20 * 60 };
    return { start: Math.floor(Math.min(...points) / 60) * 60, end: Math.ceil(Math.max(...points) / 60) * 60 };
  }, [data]);

  if (!salon || !date) return <Spinner />;

  return (
    <>
      <PageHeader
        title="Rendez-vous"
        description={longDay(date)}
        actions={
          <>
            <div className="flex items-center rounded-lg border border-stone-300 bg-white">
              <button className="p-2 hover:bg-stone-50" onClick={() => setDate(shiftDate(date, -1))} aria-label="Jour précédent">
                <ChevronLeft className="h-4 w-4" />
              </button>
              <input type="date" value={date} onChange={(e) => e.target.value && setDate(e.target.value)} className="border-x border-stone-300 px-2 py-1.5 text-sm" aria-label="Date" />
              <button className="p-2 hover:bg-stone-50" onClick={() => setDate(shiftDate(date, 1))} aria-label="Jour suivant">
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>
            <Button variant="secondary" onClick={() => setDate(todayIn(salon.timezone))}>
              Aujourd’hui
            </Button>
            {can('appointments.create') && (
              <Button onClick={() => setCreating(true)}>
                <Plus className="h-4 w-4" /> Nouveau
              </Button>
            )}
          </>
        }
      />
      {isLoading && <Spinner />}
      <ErrorMessage error={error} />
      {data && data.opening.length === 0 && <p className="mb-3 text-sm text-stone-500">Le salon est fermé ce jour-là.</p>}
      {data && (
        <div className="overflow-x-auto rounded-xl border border-stone-200 bg-white">
          <div className="flex min-w-full">
            <div className="sticky left-0 z-10 w-14 shrink-0 border-r border-stone-100 bg-white">
              <div className="h-10 border-b border-stone-100" />
              <div className="relative" style={{ height: (range.end - range.start) * PX_PER_MIN }}>
                {Array.from({ length: (range.end - range.start) / 60 + 1 }, (_, i) => (
                  <span key={i} className="absolute -translate-y-2 pl-2 text-xs tabular-nums text-stone-400" style={{ top: i * 60 * PX_PER_MIN }}>
                    {String(range.start / 60 + i).padStart(2, '0')}h
                  </span>
                ))}
              </div>
            </div>
            {data.staff.map((staff) => (
              <div key={staff.id} className="min-w-[11rem] flex-1 border-r border-stone-100 last:border-r-0">
                <div className="flex h-10 items-center gap-2 border-b border-stone-100 px-2">
                  <span className="h-2.5 w-2.5 rounded-full" style={{ background: staff.calendarColor }} aria-hidden />
                  <span className="truncate text-sm font-medium">{staff.displayName}</span>
                </div>
                <div className="relative bg-stone-100/70" style={{ height: (range.end - range.start) * PX_PER_MIN }}>
                  {staff.workingHours.map((w) => {
                    const top = (minutesInZone(w.start, data.timezone) - range.start) * PX_PER_MIN;
                    const height = (minutesInZone(w.end, data.timezone) - minutesInZone(w.start, data.timezone)) * PX_PER_MIN;
                    return <div key={w.start} className="absolute inset-x-0 bg-white" style={{ top, height }} />;
                  })}
                  {Array.from({ length: (range.end - range.start) / 60 }, (_, i) => (
                    <div key={i} className="absolute inset-x-0 border-t border-stone-100" style={{ top: i * 60 * PX_PER_MIN }} />
                  ))}
                  {data.appointments.flatMap((a) =>
                    a.items
                      .filter((item) => item.staff.id === staff.id)
                      .map((item) => {
                        const top = (minutesInZone(item.startsAt, data.timezone) - range.start) * PX_PER_MIN;
                        const height = Math.max(22, (minutesInZone(item.endsAt, data.timezone) - minutesInZone(item.startsAt, data.timezone)) * PX_PER_MIN - 2);
                        const cancelled = CANCELLED.includes(a.status);
                        return (
                          <button
                            key={item.id}
                            onClick={() => setSelected(a)}
                            className={`absolute inset-x-1 overflow-hidden rounded-md border-l-4 px-2 py-1 text-left text-xs shadow-sm ${cancelled ? 'bg-stone-50 text-stone-400 line-through' : 'bg-white text-stone-800 hover:ring-1 hover:ring-brand-500'}`}
                            style={{ top, height, borderColor: staff.calendarColor }}
                          >
                            <span className="font-semibold tabular-nums">{time(item.startsAt, data.timezone)}</span> {a.client?.fullName ?? 'Passage'}
                            <span className="block truncate text-stone-500">{item.serviceName}</span>
                          </button>
                        );
                      }),
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
      {creating && data && <CreateAppointment date={date} agenda={data} onClose={() => setCreating(false)} />}
      {selected && data && <AppointmentDetail appointment={selected} timezone={data.timezone} onClose={() => setSelected(null)} />}
    </>
  );
}

interface Service {
  id: string;
  name: string;
  basePrice: number;
  durationMinutes: number;
  variants: { id: string; name: string; price: number; durationMinutes: number }[];
}

function CreateAppointment({ date, agenda, onClose }: { date: string; agenda: Agenda; onClose: () => void }) {
  const { salon } = useSalon();
  const queryClient = useQueryClient();
  const [client, setClient] = useState<ClientOption | null>(null);
  const [serviceId, setServiceId] = useState('');
  const [variantId, setVariantId] = useState('');
  const [staffId, setStaffId] = useState('');
  const [slot, setSlot] = useState('');
  const [note, setNote] = useState('');
  const { data: services = [] } = useQuery({ queryKey: ['services'], queryFn: () => get<Service[]>('/services') });
  const service = services.find((s) => s.id === serviceId);
  const { data: availability, isFetching } = useQuery({
    queryKey: ['availability', salon?.id, date, serviceId, variantId],
    queryFn: () =>
      get<{ staff: { staffId: string; staffName: string; price: number; durationMinutes: number; slots: string[] }[] }>(
        `/appointments/availability${qs({ salonId: salon!.id, date, serviceId, variantId })}`,
      ),
    enabled: Boolean(serviceId),
  });
  const staffOptions = availability?.staff ?? [];
  const chosen = staffOptions.find((s) => s.staffId === staffId);

  const create = useMutation({
    mutationFn: () =>
      post('/appointments', {
        salonId: salon!.id,
        clientId: client?.id,
        startsAt: slot,
        items: [{ serviceId, staffId, ...(variantId ? { variantId } : {}) }],
        ...(note ? { internalNote: note } : {}),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['agenda'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard'] });
      onClose();
    },
  });

  return (
    <Modal
      open
      title="Nouveau rendez-vous"
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Annuler
          </Button>
          <Button disabled={!slot || !staffId} loading={create.isPending} onClick={() => create.mutate()}>
            Réserver
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <div>
          <p className="mb-1 text-sm font-medium text-stone-700">Client</p>
          <ClientPicker value={client} onChange={setClient} />
          <p className="mt-1 text-xs text-stone-500">Facultatif pour un client de passage.</p>
        </div>
        <Field label="Prestation">
          {(id) => (
            <Select id={id} value={serviceId} onChange={(e) => { setServiceId(e.target.value); setVariantId(''); setStaffId(''); setSlot(''); }}>
              <option value="">Choisir…</option>
              {services.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name} — {money(s.basePrice)} · {s.durationMinutes} min
                </option>
              ))}
            </Select>
          )}
        </Field>
        {service && service.variants.length > 0 && (
          <Field label="Variante">
            {(id) => (
              <Select id={id} value={variantId} onChange={(e) => { setVariantId(e.target.value); setSlot(''); }}>
                <option value="">Standard</option>
                {service.variants.map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.name} — {money(v.price)} · {v.durationMinutes} min
                  </option>
                ))}
              </Select>
            )}
          </Field>
        )}
        {serviceId && (
          <Field label="Coiffeur">
            {(id) => (
              <Select id={id} value={staffId} onChange={(e) => { setStaffId(e.target.value); setSlot(''); }}>
                <option value="">{isFetching ? 'Recherche des disponibilités…' : 'Choisir…'}</option>
                {staffOptions.map((s) => (
                  <option key={s.staffId} value={s.staffId} disabled={s.slots.length === 0}>
                    {s.staffName} — {s.slots.length ? `${s.slots.length} créneaux` : 'complet'} · {money(s.price)}
                  </option>
                ))}
              </Select>
            )}
          </Field>
        )}
        {chosen && (
          <div>
            <p className="mb-2 text-sm font-medium text-stone-700">Créneau ({chosen.durationMinutes} min)</p>
            <div className="flex flex-wrap gap-2">
              {chosen.slots.map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => setSlot(s)}
                  className={`rounded-lg border px-2.5 py-1 text-sm tabular-nums ${slot === s ? 'border-brand-600 bg-brand-600 text-white' : 'border-stone-300 hover:bg-stone-50'}`}
                >
                  {time(s, agenda.timezone)}
                </button>
              ))}
            </div>
          </div>
        )}
        <Field label="Note interne">{(id) => <Textarea id={id} value={note} onChange={(e) => setNote(e.target.value)} maxLength={1000} />}</Field>
        <ErrorMessage error={create.error} />
      </div>
    </Modal>
  );
}

function AppointmentDetail({ appointment, timezone, onClose }: { appointment: Appointment; timezone: string; onClose: () => void }) {
  const { can } = useAuth();
  const router = useRouter();
  const queryClient = useQueryClient();
  const [moveTo, setMoveTo] = useState('');
  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ['agenda'] });
    queryClient.invalidateQueries({ queryKey: ['dashboard'] });
  };
  const status = useMutation({
    mutationFn: (payload: { status: string; reason?: string }) => post(`/appointments/${appointment.id}/status`, payload),
    onSuccess: () => {
      refresh();
      onClose();
    },
  });
  const move = useMutation({
    mutationFn: () => {
      const day = new Intl.DateTimeFormat('en-CA', { timeZone: timezone }).format(new Date(appointment.startsAt));
      return patch(`/appointments/${appointment.id}`, { startsAt: localToIso(day, moveTo, timezone) });
    },
    onSuccess: () => {
      refresh();
      onClose();
    },
  });
  const st = appointment.status;
  const active = ['PENDING', 'CONFIRMED', 'CHECKED_IN', 'IN_PROGRESS'].includes(st);

  return (
    <Modal open title={`Rendez-vous ${appointment.reference}`} onClose={onClose}>
      <div className="space-y-4 text-sm">
        <div className="flex items-center justify-between">
          <div>
            <p className="font-semibold text-stone-900">{appointment.client?.fullName ?? 'Client de passage'}</p>
            {appointment.client?.phone && <p className="text-stone-500">{appointment.client.phone}</p>}
          </div>
          <Badge tone={APPOINTMENT_STATUS[st]?.tone}>{APPOINTMENT_STATUS[st]?.label}</Badge>
        </div>
        <ul className="divide-y divide-stone-100 rounded-lg border border-stone-200">
          {appointment.items.map((item) => (
            <li key={item.id} className="flex justify-between px-3 py-2">
              <span>
                <span className="tabular-nums">{time(item.startsAt, timezone)}–{time(item.endsAt, timezone)}</span> · {item.serviceName} · {item.staff.displayName}
              </span>
              <span className="tabular-nums">{money(item.price)}</span>
            </li>
          ))}
        </ul>
        {appointment.internalNote && <p className="rounded-lg bg-stone-50 px-3 py-2 text-stone-700">{appointment.internalNote}</p>}
        {appointment.sales.length > 0 && <p className="text-stone-600">Encaissé : ticket {appointment.sales[0].number}</p>}

        <div className="flex flex-wrap gap-2">
          {st === 'CONFIRMED' && <Button size="sm" variant="secondary" onClick={() => status.mutate({ status: 'CHECKED_IN' })}>Client arrivé</Button>}
          {['CONFIRMED', 'CHECKED_IN'].includes(st) && <Button size="sm" variant="secondary" onClick={() => status.mutate({ status: 'IN_PROGRESS' })}>Commencer</Button>}
          {active && st !== 'PENDING' && <Button size="sm" variant="secondary" onClick={() => status.mutate({ status: 'COMPLETED' })}>Terminer</Button>}
          {active && appointment.sales.length === 0 && can('sales.create') && (
            <Button size="sm" onClick={() => router.push(`/caisse?rdv=${appointment.id}`)}>Encaisser</Button>
          )}
          {st === 'COMPLETED' && appointment.sales.length === 0 && can('sales.create') && (
            <Button size="sm" onClick={() => router.push(`/caisse?rdv=${appointment.id}`)}>Encaisser</Button>
          )}
        </div>
        {active && can('appointments.cancel') && (
          <div className="flex flex-wrap gap-2 border-t border-stone-100 pt-3">
            <Button size="sm" variant="ghost" onClick={() => status.mutate({ status: 'CANCELLED_BY_CLIENT', reason: 'Annulé par le client' })}>Annulé par le client</Button>
            <Button size="sm" variant="ghost" onClick={() => status.mutate({ status: 'CANCELLED_BY_SALON', reason: 'Annulé par le salon' })}>Annulé par le salon</Button>
            {st === 'CONFIRMED' && <Button size="sm" variant="ghost" onClick={() => status.mutate({ status: 'NO_SHOW' })}>Client absent</Button>}
          </div>
        )}
        {['PENDING', 'CONFIRMED'].includes(st) && can('appointments.manage') && (
          <div className="flex items-end gap-2 border-t border-stone-100 pt-3">
            <Field label="Déplacer à (même jour)">{(id) => <Input id={id} type="time" value={moveTo} onChange={(e) => setMoveTo(e.target.value)} step={900} />}</Field>
            <Button size="sm" variant="secondary" disabled={!moveTo} loading={move.isPending} onClick={() => move.mutate()}>
              Déplacer
            </Button>
          </div>
        )}
        <ErrorMessage error={status.error ?? move.error} />
      </div>
    </Modal>
  );
}
