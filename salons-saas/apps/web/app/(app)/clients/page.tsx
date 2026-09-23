'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { FormEvent, useState } from 'react';
import { Button, ErrorMessage, Field, Input, Modal, PageHeader, Select, Spinner, Table, Td } from '@/components/ui';
import { get, post, qs } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { date, money } from '@/lib/format';

interface ClientRow {
  id: string;
  clientNumber: string;
  fullName: string;
  phone: string | null;
  lastVisitAt?: string | null;
  visitCount?: number;
  totalSpent?: number;
  noShowCount?: number;
}

export default function ClientsPage() {
  const { can } = useAuth();
  const [q, setQ] = useState('');
  const [page, setPage] = useState(1);
  const [creating, setCreating] = useState(false);
  const { data, isLoading, error } = useQuery({
    queryKey: ['clients', q, page],
    queryFn: () => get<{ total: number; page: number; pageSize: number; items: ClientRow[] }>(`/clients${qs({ q, page, pageSize: 30 })}`),
  });
  const full = can('clients.read');
  const pages = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1;

  return (
    <>
      <PageHeader
        title="Clients"
        description={data ? `${data.total} client${data.total > 1 ? 's' : ''}` : undefined}
        actions={can('clients.manage') && <Button onClick={() => setCreating(true)}><Plus className="h-4 w-4" /> Nouveau client</Button>}
      />
      <Input value={q} onChange={(e) => { setQ(e.target.value); setPage(1); }} placeholder="Rechercher par nom, numéro ou téléphone" className="mb-4 max-w-md" aria-label="Rechercher" />
      <ErrorMessage error={error} />
      {isLoading ? (
        <Spinner />
      ) : (
        <Table head={full ? ['Client', 'Téléphone', 'Visites', 'Dépensé', 'Dernière visite', 'Absences'] : ['Client', 'Téléphone']} empty={data?.items.length === 0}>
          {data?.items.map((c) => (
            <tr key={c.id} className="hover:bg-stone-50">
              <Td>
                {full ? (
                  <Link href={`/clients/${c.id}`} className="font-medium text-brand-700 hover:underline">{c.fullName}</Link>
                ) : (
                  <span className="font-medium">{c.fullName}</span>
                )}
                <span className="ml-2 text-xs text-stone-400">{c.clientNumber}</span>
              </Td>
              <Td>{c.phone ?? '—'}</Td>
              {full && (
                <>
                  <Td className="tabular-nums">{c.visitCount}</Td>
                  <Td className="tabular-nums">{money(c.totalSpent)}</Td>
                  <Td>{c.lastVisitAt ? date(c.lastVisitAt) : '—'}</Td>
                  <Td className="tabular-nums">{c.noShowCount ? <span className="text-red-700">{c.noShowCount}</span> : 0}</Td>
                </>
              )}
            </tr>
          ))}
        </Table>
      )}
      {pages > 1 && (
        <div className="mt-3 flex items-center gap-2 text-sm">
          <Button size="sm" variant="secondary" disabled={page <= 1} onClick={() => setPage(page - 1)}>Précédent</Button>
          <span>Page {page} / {pages}</span>
          <Button size="sm" variant="secondary" disabled={page >= pages} onClick={() => setPage(page + 1)}>Suivant</Button>
        </div>
      )}
      {creating && <CreateClient onClose={() => setCreating(false)} />}
    </>
  );
}

function CreateClient({ onClose }: { onClose: () => void }) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [form, setForm] = useState({ fullName: '', phone: '', email: '', birthDate: '', gender: '', hairType: '', marketingConsent: false });
  const create = useMutation({
    mutationFn: () => {
      const payload: Record<string, unknown> = { fullName: form.fullName, marketingConsent: form.marketingConsent };
      for (const key of ['phone', 'email', 'birthDate', 'gender', 'hairType'] as const) if (form[key]) payload[key] = form[key];
      return post<{ id: string }>('/clients', payload);
    },
    onSuccess: (client) => {
      queryClient.invalidateQueries({ queryKey: ['clients'] });
      router.push(`/clients/${client.id}`);
    },
  });
  const submit = (e: FormEvent) => {
    e.preventDefault();
    create.mutate();
  };
  return (
    <Modal open title="Nouveau client" onClose={onClose}>
      <form onSubmit={submit} className="space-y-3">
        <Field label="Nom complet">{(id) => <Input id={id} value={form.fullName} onChange={(e) => setForm({ ...form, fullName: e.target.value })} required minLength={2} />}</Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Téléphone">{(id) => <Input id={id} value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} inputMode="tel" />}</Field>
          <Field label="Email">{(id) => <Input id={id} type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />}</Field>
          <Field label="Date de naissance">{(id) => <Input id={id} type="date" value={form.birthDate} onChange={(e) => setForm({ ...form, birthDate: e.target.value })} />}</Field>
          <Field label="Genre">
            {(id) => (
              <Select id={id} value={form.gender} onChange={(e) => setForm({ ...form, gender: e.target.value })}>
                <option value="">—</option>
                <option value="FEMALE">Femme</option>
                <option value="MALE">Homme</option>
                <option value="OTHER">Autre</option>
              </Select>
            )}
          </Field>
        </div>
        <Field label="Type de cheveux">{(id) => <Input id={id} value={form.hairType} onChange={(e) => setForm({ ...form, hairType: e.target.value })} placeholder="Naturel, défrisé, locks…" />}</Field>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={form.marketingConsent} onChange={(e) => setForm({ ...form, marketingConsent: e.target.checked })} />
          Accepte de recevoir nos offres par WhatsApp / SMS
        </label>
        <ErrorMessage error={create.error} />
        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="secondary" onClick={onClose}>Annuler</Button>
          <Button type="submit" loading={create.isPending}>Créer</Button>
        </div>
      </form>
    </Modal>
  );
}
