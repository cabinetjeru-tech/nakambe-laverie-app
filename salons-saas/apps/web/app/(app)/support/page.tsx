'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Badge, Button, Empty, ErrorMessage, Field, Input, Modal, PageHeader, Select, Spinner, Table, Td, Textarea } from '@/components/ui';
import { get, post } from '@/lib/api';
import { TICKET_CATEGORY, TICKET_STATUS } from '@/lib/billing';
import { dateTime } from '@/lib/format';

interface Ticket {
  id: string;
  number: number;
  subject: string;
  category: string;
  status: string;
  lastMessageAt: string;
}

export default function SupportPage() {
  const tickets = useQuery({ queryKey: ['support-tickets'], queryFn: () => get<Ticket[]>('/support/tickets') });
  const [creating, setCreating] = useState(false);

  return (
    <div>
      <PageHeader
        title="Aide et support"
        description="Une question, un souci, une facture ? L’équipe de la plateforme vous répond ici."
        actions={
          <Button onClick={() => setCreating(true)}>
            <Plus className="h-4 w-4" aria-hidden /> Nouvelle demande
          </Button>
        }
      />
      {tickets.isLoading ? (
        <Spinner />
      ) : tickets.error ? (
        <ErrorMessage error={tickets.error} />
      ) : tickets.data?.length === 0 ? (
        <Empty title="Aucune demande pour l’instant">Décrivez votre besoin : vous serez notifié dès la réponse.</Empty>
      ) : (
        <Table head={['N°', 'Objet', 'Catégorie', 'Statut', 'Dernier message']}>
          {tickets.data?.map((t) => (
            <tr key={t.id} className="hover:bg-stone-50">
              <Td className="tabular-nums text-stone-500">#{t.number}</Td>
              <Td>
                <Link href={`/support/${t.id}`} className="font-medium text-brand-700 hover:underline">
                  {t.subject}
                </Link>
              </Td>
              <Td>{TICKET_CATEGORY[t.category] ?? t.category}</Td>
              <Td>
                <Badge tone={TICKET_STATUS[t.status]?.tone}>{TICKET_STATUS[t.status]?.label}</Badge>
              </Td>
              <Td>{dateTime(t.lastMessageAt)}</Td>
            </tr>
          ))}
        </Table>
      )}
      {creating && <NewTicketModal onClose={() => setCreating(false)} />}
    </div>
  );
}

function NewTicketModal({ onClose }: { onClose: () => void }) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [subject, setSubject] = useState('');
  const [category, setCategory] = useState('question');
  const [body, setBody] = useState('');
  const create = useMutation({
    mutationFn: () => post<{ id: string }>('/support/tickets', { subject, category, body }),
    onSuccess: (ticket) => {
      queryClient.invalidateQueries({ queryKey: ['support-tickets'] });
      router.push(`/support/${ticket.id}`);
    },
  });
  return (
    <Modal open title="Nouvelle demande" onClose={onClose}>
      <form
        className="space-y-3"
        onSubmit={(e) => {
          e.preventDefault();
          create.mutate();
        }}
      >
        <Field label="Objet">{(id) => <Input id={id} required minLength={4} maxLength={150} value={subject} onChange={(e) => setSubject(e.target.value)} />}</Field>
        <Field label="Catégorie">
          {(id) => (
            <Select id={id} value={category} onChange={(e) => setCategory(e.target.value)}>
              {Object.entries(TICKET_CATEGORY).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </Select>
          )}
        </Field>
        <Field label="Votre message" hint="Plus vous êtes précis (écran, heure, message affiché), plus la réponse sera rapide.">
          {(id) => <Textarea id={id} required minLength={10} rows={6} value={body} onChange={(e) => setBody(e.target.value)} />}
        </Field>
        <ErrorMessage error={create.error} />
        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onClose}>
            Annuler
          </Button>
          <Button type="submit" loading={create.isPending}>
            Envoyer
          </Button>
        </div>
      </form>
    </Modal>
  );
}
