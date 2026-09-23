'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Lock } from 'lucide-react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useState } from 'react';
import { Badge, Button, Card, ErrorMessage, Field, Input, PageHeader, Select, Spinner, Stat, Textarea } from '@/components/ui';
import { del, get, patch, post } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { APPOINTMENT_STATUS, date, dateTime, money } from '@/lib/format';

interface Client {
  id: string;
  clientNumber: string;
  fullName: string;
  phone: string | null;
  email: string | null;
  birthDate: string | null;
  hairType: string | null;
  tags: string[];
  isBlocked: boolean;
  visitCount: number;
  totalSpent: number;
  noShowCount: number;
  lastVisitAt: string | null;
  consents: Record<string, { granted: boolean; since: string }>;
  notes: { id: string; body: string; isPinned: boolean; createdAt: string }[];
}

export default function ClientPage() {
  const { id } = useParams<{ id: string }>();
  const { can } = useAuth();
  const router = useRouter();
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState(false);
  const [note, setNote] = useState('');
  const { data: client, isLoading, error } = useQuery({ queryKey: ['client', id], queryFn: () => get<Client>(`/clients/${id}`) });
  const { data: history } = useQuery({
    queryKey: ['client-history', id],
    queryFn: () =>
      get<{
        appointments: { id: string; startsAt: string; status: string; items: { serviceName: string; staff: { displayName: string } }[] }[];
        sales: { id: string; number: string; status: string; total: number; createdAt: string; items: { label: string; quantity: number }[] }[];
      }>(`/clients/${id}/history`),
  });
  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['client', id] });
  const addNote = useMutation({ mutationFn: () => post(`/clients/${id}/notes`, { body: note }), onSuccess: () => { setNote(''); invalidate(); } });
  const consent = useMutation({ mutationFn: (granted: boolean) => patch(`/clients/${id}`, { marketingConsent: granted }), onSuccess: invalidate });
  const anonymize = useMutation({ mutationFn: () => del(`/clients/${id}`), onSuccess: () => router.replace('/clients') });

  if (isLoading) return <Spinner />;
  if (error || !client) return <ErrorMessage error={error ?? 'Client introuvable'} />;
  const marketing = client.consents.MARKETING_WHATSAPP?.granted ?? false;

  return (
    <>
      <Link href="/clients" className="mb-3 inline-flex items-center gap-1 text-sm text-stone-600 hover:text-stone-900">
        <ArrowLeft className="h-4 w-4" /> Clients
      </Link>
      <PageHeader
        title={client.fullName}
        description={`${client.clientNumber}${client.phone ? ` · ${client.phone}` : ''}${client.email ? ` · ${client.email}` : ''}`}
        actions={can('clients.manage') && <Button variant="secondary" onClick={() => setEditing(!editing)}>{editing ? 'Fermer' : 'Modifier'}</Button>}
      />
      {editing && <EditClient client={client} onDone={() => { setEditing(false); invalidate(); }} />}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Visites" value={client.visitCount} />
        <Stat label="Total dépensé" value={money(client.totalSpent)} />
        <Stat label="Dernière visite" value={client.lastVisitAt ? date(client.lastVisitAt) : '—'} />
        <Stat label="Absences" value={client.noShowCount} />
      </div>

      <div className="mt-6 grid gap-4 lg:grid-cols-2">
        <Card title="Notes">
          {can('clients.manage') && (
            <div className="mb-3 flex gap-2">
              <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Ajouter une note" aria-label="Nouvelle note" />
              <Button variant="secondary" disabled={!note.trim()} loading={addNote.isPending} onClick={() => addNote.mutate()}>Ajouter</Button>
            </div>
          )}
          {client.notes.length === 0 ? (
            <p className="text-sm text-stone-500">Aucune note.</p>
          ) : (
            <ul className="space-y-2 text-sm">
              {client.notes.map((n) => (
                <li key={n.id} className="rounded-lg bg-stone-50 px-3 py-2">
                  <p>{n.body}</p>
                  <p className="text-xs text-stone-400">{dateTime(n.createdAt)}</p>
                </li>
              ))}
            </ul>
          )}
          <div className="mt-4 border-t border-stone-100 pt-3 text-sm">
            <p className="mb-1 font-medium">Messages promotionnels</p>
            <p className="text-stone-600">{marketing ? 'Accepte les offres WhatsApp / SMS.' : 'Ne souhaite pas recevoir d’offres.'}</p>
            {can('clients.manage') && (
              <Button size="sm" variant="ghost" className="mt-1 px-0" onClick={() => consent.mutate(!marketing)}>
                {marketing ? 'Retirer le consentement' : 'Enregistrer son accord'}
              </Button>
            )}
          </div>
        </Card>
        {can('clients.technical.read') && <TechnicalNotes clientId={id} canWrite={can('clients.technical.manage')} />}
      </div>

      <div className="mt-6 grid gap-4 lg:grid-cols-2">
        <Card title="Rendez-vous">
          <ul className="divide-y divide-stone-100 text-sm">
            {history?.appointments.length === 0 && <li className="py-2 text-stone-500">Aucun rendez-vous.</li>}
            {history?.appointments.map((a) => (
              <li key={a.id} className="flex items-center justify-between gap-2 py-2">
                <span>
                  {dateTime(a.startsAt)} · {a.items.map((i) => i.serviceName).join(', ')} <span className="text-stone-500">({a.items[0]?.staff.displayName})</span>
                </span>
                <Badge tone={APPOINTMENT_STATUS[a.status]?.tone}>{APPOINTMENT_STATUS[a.status]?.label}</Badge>
              </li>
            ))}
          </ul>
        </Card>
        <Card title="Achats">
          <ul className="divide-y divide-stone-100 text-sm">
            {history?.sales.length === 0 && <li className="py-2 text-stone-500">Aucun achat.</li>}
            {history?.sales.map((s) => (
              <li key={s.id} className="flex justify-between gap-2 py-2">
                <span>
                  {date(s.createdAt)} · {s.items.map((i) => (i.quantity > 1 ? `${i.quantity}× ${i.label}` : i.label)).join(', ')}
                </span>
                <span className={s.status === 'VOIDED' ? 'text-stone-400 line-through' : 'tabular-nums'}>{money(s.total)}</span>
              </li>
            ))}
          </ul>
        </Card>
      </div>

      {can('clients.delete') && (
        <div className="mt-8 rounded-xl border border-red-200 p-4 text-sm">
          <p className="font-medium text-red-800">Droit à l’effacement</p>
          <p className="mb-2 text-stone-600">Anonymise la fiche : nom, coordonnées, notes et fiche technique sont effacés ; les ventes restent pour la comptabilité.</p>
          <Button size="sm" variant="danger" loading={anonymize.isPending} onClick={() => window.confirm('Anonymiser définitivement ce client ?') && anonymize.mutate()}>
            Anonymiser ce client
          </Button>
        </div>
      )}
    </>
  );
}

function TechnicalNotes({ clientId, canWrite }: { clientId: string; canWrite: boolean }) {
  const queryClient = useQueryClient();
  const [kind, setKind] = useState('coloration');
  const [content, setContent] = useState('');
  const { data = [] } = useQuery({
    queryKey: ['technical', clientId],
    queryFn: () => get<{ id: string; kind: string; content: string; createdAt: string }[]>(`/clients/${clientId}/technical-notes`),
  });
  const add = useMutation({
    mutationFn: () => post(`/clients/${clientId}/technical-notes`, { kind, content }),
    onSuccess: () => {
      setContent('');
      queryClient.invalidateQueries({ queryKey: ['technical', clientId] });
    },
  });
  return (
    <Card title={<span className="inline-flex items-center gap-1.5"><Lock className="h-3.5 w-3.5" aria-hidden /> Fiche technique</span>}>
      <p className="mb-3 text-xs text-stone-500">Formules, allergies : données chiffrées, chaque consultation est enregistrée.</p>
      {canWrite && (
        <div className="mb-3 space-y-2">
          <Select value={kind} onChange={(e) => setKind(e.target.value)} aria-label="Type">
            <option value="coloration">Coloration</option>
            <option value="allergie">Allergie / sensibilité</option>
            <option value="soin">Soin</option>
            <option value="autre">Autre</option>
          </Select>
          <Textarea value={content} onChange={(e) => setContent(e.target.value)} placeholder="Ex. : 6.3 + oxydant 20 vol, pose 35 min" aria-label="Contenu" />
          <Button size="sm" variant="secondary" disabled={!content.trim()} loading={add.isPending} onClick={() => add.mutate()}>Enregistrer</Button>
          <ErrorMessage error={add.error} />
        </div>
      )}
      <ul className="space-y-2 text-sm">
        {data.length === 0 && <li className="text-stone-500">Aucune information.</li>}
        {data.map((n) => (
          <li key={n.id} className={`rounded-lg px-3 py-2 ${n.kind === 'allergie' ? 'bg-red-50' : 'bg-stone-50'}`}>
            <p className="text-xs font-semibold uppercase tracking-wide text-stone-500">{n.kind}</p>
            <p className="whitespace-pre-line">{n.content}</p>
            <p className="text-xs text-stone-400">{dateTime(n.createdAt)}</p>
          </li>
        ))}
      </ul>
    </Card>
  );
}

function EditClient({ client, onDone }: { client: Client; onDone: () => void }) {
  const [form, setForm] = useState({ fullName: client.fullName, phone: client.phone ?? '', email: client.email ?? '', hairType: client.hairType ?? '' });
  const save = useMutation({
    mutationFn: () =>
      patch(`/clients/${client.id}`, {
        fullName: form.fullName,
        ...(form.phone ? { phone: form.phone } : {}),
        ...(form.email ? { email: form.email } : {}),
        hairType: form.hairType,
      }),
    onSuccess: onDone,
  });
  return (
    <Card className="mb-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Nom complet">{(id) => <Input id={id} value={form.fullName} onChange={(e) => setForm({ ...form, fullName: e.target.value })} />}</Field>
        <Field label="Téléphone">{(id) => <Input id={id} value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />}</Field>
        <Field label="Email">{(id) => <Input id={id} value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />}</Field>
        <Field label="Type de cheveux">{(id) => <Input id={id} value={form.hairType} onChange={(e) => setForm({ ...form, hairType: e.target.value })} />}</Field>
      </div>
      <ErrorMessage error={save.error} />
      <div className="mt-3 flex justify-end">
        <Button loading={save.isPending} onClick={() => save.mutate()}>Enregistrer</Button>
      </div>
    </Card>
  );
}
