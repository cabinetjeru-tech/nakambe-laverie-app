'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import clsx from 'clsx';
import { ArrowLeft } from 'lucide-react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useState } from 'react';
import { Badge, Button, Card, ErrorMessage, Spinner, Textarea } from '@/components/ui';
import { get, post } from '@/lib/api';
import { TICKET_CATEGORY, TICKET_STATUS } from '@/lib/billing';
import { dateTime } from '@/lib/format';

interface TicketDetail {
  id: string;
  number: number;
  subject: string;
  category: string;
  status: string;
  createdAt: string;
  messages: { id: string; body: string; fromPlatform: boolean; authorName: string; createdAt: string }[];
}

export default function TicketPage() {
  const { id } = useParams<{ id: string }>();
  const queryClient = useQueryClient();
  const ticket = useQuery({ queryKey: ['support-ticket', id], queryFn: () => get<TicketDetail>(`/support/tickets/${id}`), refetchInterval: 30_000 });
  const [body, setBody] = useState('');
  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ['support-ticket', id] });
    queryClient.invalidateQueries({ queryKey: ['support-tickets'] });
  };
  const reply = useMutation({
    mutationFn: () => post(`/support/tickets/${id}/messages`, { body }),
    onSuccess: () => {
      setBody('');
      refresh();
    },
  });
  const close = useMutation({ mutationFn: () => post(`/support/tickets/${id}/close`), onSuccess: refresh });

  if (ticket.isLoading) return <Spinner />;
  if (ticket.error || !ticket.data) return <ErrorMessage error={ticket.error} />;
  const t = ticket.data;

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <Link href="/support" className="inline-flex items-center gap-1 text-sm text-stone-600 hover:text-stone-900">
        <ArrowLeft className="h-4 w-4" aria-hidden /> Toutes mes demandes
      </Link>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h1 className="text-xl font-semibold text-stone-900">
            #{t.number} · {t.subject}
          </h1>
          <p className="mt-1 text-sm text-stone-500">{TICKET_CATEGORY[t.category]}</p>
        </div>
        <Badge tone={TICKET_STATUS[t.status]?.tone}>{TICKET_STATUS[t.status]?.label}</Badge>
      </div>

      <ol className="space-y-3">
        {t.messages.map((m) => (
          <li key={m.id} className={clsx('max-w-[85%] rounded-xl px-4 py-3', m.fromPlatform ? 'bg-brand-50 text-stone-900' : 'ml-auto bg-white ring-1 ring-stone-200')}>
            <p className="text-xs font-medium text-stone-500">
              {m.authorName} · {dateTime(m.createdAt)}
            </p>
            <p className="mt-1 whitespace-pre-wrap text-sm">{m.body}</p>
          </li>
        ))}
      </ol>

      {t.status !== 'CLOSED' ? (
        <Card>
          <form
            className="space-y-3"
            onSubmit={(e) => {
              e.preventDefault();
              reply.mutate();
            }}
          >
            <label htmlFor="reply" className="text-sm font-medium text-stone-700">
              Répondre
            </label>
            <Textarea id="reply" required rows={4} value={body} onChange={(e) => setBody(e.target.value)} />
            <ErrorMessage error={reply.error ?? close.error} />
            <div className="flex flex-wrap justify-between gap-2">
              <Button type="button" variant="ghost" loading={close.isPending} onClick={() => close.mutate()}>
                Clôturer la demande
              </Button>
              <Button type="submit" loading={reply.isPending} disabled={!body.trim()}>
                Envoyer
              </Button>
            </div>
          </form>
        </Card>
      ) : (
        <p className="text-sm text-stone-500">Demande clôturée. Ouvrez une nouvelle demande si besoin.</p>
      )}
    </div>
  );
}
