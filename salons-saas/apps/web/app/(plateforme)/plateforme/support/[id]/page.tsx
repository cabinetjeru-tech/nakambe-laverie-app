'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import clsx from 'clsx';
import { ArrowLeft, Lock } from 'lucide-react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useState } from 'react';
import { Badge, Button, Card, ErrorMessage, Field, Select, Spinner, Textarea } from '@/components/ui';
import { get, patch, post } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { PLATFORM_ROLE, TENANT_STATUS, TICKET_CATEGORY, TICKET_PRIORITY, TICKET_STATUS_PLATFORM } from '@/lib/billing';
import { dateTime } from '@/lib/format';

interface TicketDetail {
  id: string;
  number: number;
  subject: string;
  category: string;
  status: string;
  priority: string;
  assignedToId: string | null;
  createdAt: string;
  tenant: { id: string; displayName: string; status: string; plan: { name: string } };
  createdBy: { fullName: string; phone: string } | null;
  assignedTo: { fullName: string } | null;
  messages: { id: string; body: string; fromPlatform: boolean; internal: boolean; authorName: string; createdAt: string }[];
}

interface StaffMember {
  role: string;
  isActive: boolean;
  user: { id: string; fullName: string };
}

export default function PlatformTicketPage() {
  const { id } = useParams<{ id: string }>();
  const { me } = useAuth();
  const queryClient = useQueryClient();
  const ticket = useQuery({ queryKey: ['platform-ticket', id], queryFn: () => get<TicketDetail>(`/platform/support/tickets/${id}`), refetchInterval: 30_000 });
  const staff = useQuery({ queryKey: ['platform-staff'], queryFn: () => get<StaffMember[]>('/platform/staff') });
  const [body, setBody] = useState('');
  const [internal, setInternal] = useState(false);
  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ['platform-ticket', id] });
    queryClient.invalidateQueries({ queryKey: ['platform-tickets'] });
  };
  const reply = useMutation({
    mutationFn: () => post(`/platform/support/tickets/${id}/messages`, { body, internal }),
    onSuccess: () => {
      setBody('');
      refresh();
    },
  });
  const update = useMutation({ mutationFn: (changes: Record<string, string | null>) => patch(`/platform/support/tickets/${id}`, changes), onSuccess: refresh });

  if (ticket.isLoading) return <Spinner />;
  if (ticket.error || !ticket.data) return <ErrorMessage error={ticket.error} />;
  const t = ticket.data;

  return (
    <div className="space-y-4">
      <Link href="/plateforme/support" className="inline-flex items-center gap-1 text-sm text-stone-600 hover:text-stone-900">
        <ArrowLeft className="h-4 w-4" aria-hidden /> File du support
      </Link>
      <div className="grid gap-4 lg:grid-cols-[1fr_18rem]">
        <div className="space-y-4">
          <div>
            <h1 className="text-xl font-semibold text-stone-900">
              #{t.number} · {t.subject}
            </h1>
            <p className="mt-1 text-sm text-stone-500">
              {TICKET_CATEGORY[t.category]} · ouverte le {dateTime(t.createdAt)} par {t.createdBy?.fullName ?? '—'}
              {t.createdBy && <span className="tabular-nums"> ({t.createdBy.phone})</span>}
            </p>
          </div>
          <ol className="space-y-3">
            {t.messages.map((m) => (
              <li
                key={m.id}
                className={clsx(
                  'max-w-[85%] rounded-xl px-4 py-3',
                  m.internal ? 'ml-auto border border-dashed border-amber-300 bg-amber-50' : m.fromPlatform ? 'ml-auto bg-brand-50' : 'bg-white ring-1 ring-stone-200',
                )}
              >
                <p className="flex items-center gap-1 text-xs font-medium text-stone-500">
                  {m.internal && <Lock className="h-3 w-3" aria-hidden />}
                  {m.authorName}
                  {m.internal ? ' · note interne' : m.fromPlatform ? ' · support' : ''} · {dateTime(m.createdAt)}
                </p>
                <p className="mt-1 whitespace-pre-wrap text-sm text-stone-900">{m.body}</p>
              </li>
            ))}
          </ol>
          <Card>
            <form
              className="space-y-3"
              onSubmit={(e) => {
                e.preventDefault();
                reply.mutate();
              }}
            >
              <div role="radiogroup" aria-label="Type de message" className="inline-flex rounded-lg border border-stone-300 bg-white p-0.5 text-sm">
                <button type="button" role="radio" aria-checked={!internal} onClick={() => setInternal(false)} className={clsx('rounded-md px-3 py-1', !internal ? 'bg-brand-600 text-white' : 'text-stone-700')}>
                  Réponse au salon
                </button>
                <button type="button" role="radio" aria-checked={internal} onClick={() => setInternal(true)} className={clsx('rounded-md px-3 py-1', internal ? 'bg-amber-500 text-white' : 'text-stone-700')}>
                  Note interne
                </button>
              </div>
              <Textarea aria-label="Message" required rows={4} value={body} onChange={(e) => setBody(e.target.value)} placeholder={internal ? 'Visible uniquement de l’équipe plateforme' : 'Le demandeur est notifié dans l’application'} />
              <ErrorMessage error={reply.error} />
              <div className="flex justify-end">
                <Button type="submit" loading={reply.isPending} disabled={!body.trim()}>
                  {internal ? 'Ajouter la note' : 'Envoyer la réponse'}
                </Button>
              </div>
            </form>
          </Card>
        </div>

        <aside className="space-y-4">
          <Card title="Salon">
            <Link href={`/plateforme/salons/${t.tenant.id}`} className="font-medium text-brand-700 hover:underline">
              {t.tenant.displayName}
            </Link>
            <div className="mt-2 flex flex-wrap gap-2">
              <Badge tone={TENANT_STATUS[t.tenant.status]?.tone}>{TENANT_STATUS[t.tenant.status]?.label}</Badge>
              <Badge>{t.tenant.plan.name}</Badge>
            </div>
          </Card>
          <Card title="Traitement">
            <div className="space-y-3">
              <Field label="Statut">
                {(fid) => (
                  <Select id={fid} value={t.status} onChange={(e) => update.mutate({ status: e.target.value })}>
                    {Object.entries(TICKET_STATUS_PLATFORM).map(([value, s]) => (
                      <option key={value} value={value}>
                        {s.label}
                      </option>
                    ))}
                  </Select>
                )}
              </Field>
              <Field label="Priorité">
                {(fid) => (
                  <Select id={fid} value={t.priority} onChange={(e) => update.mutate({ priority: e.target.value })}>
                    {Object.entries(TICKET_PRIORITY).map(([value, s]) => (
                      <option key={value} value={value}>
                        {s.label}
                      </option>
                    ))}
                  </Select>
                )}
              </Field>
              <Field label="Assignée à">
                {(fid) => (
                  <Select id={fid} value={t.assignedToId ?? ''} onChange={(e) => update.mutate({ assignedToId: e.target.value || null })}>
                    <option value="">Personne</option>
                    {staff.data
                      ?.filter((s) => s.isActive)
                      .map((s) => (
                        <option key={s.user.id} value={s.user.id}>
                          {s.user.fullName} ({PLATFORM_ROLE[s.role]})
                        </option>
                      ))}
                  </Select>
                )}
              </Field>
              {me && t.assignedToId !== me.user.id && (
                <Button size="sm" variant="secondary" onClick={() => update.mutate({ assignedToId: me.user.id })}>
                  Me l’assigner
                </Button>
              )}
              <ErrorMessage error={update.error} />
            </div>
          </Card>
        </aside>
      </div>
    </div>
  );
}
