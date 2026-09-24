'use client';

import { useQuery } from '@tanstack/react-query';
import clsx from 'clsx';
import Link from 'next/link';
import { useState } from 'react';
import { Badge, ErrorMessage, PageHeader, Select, Spinner, Table, Td } from '@/components/ui';
import { get, qs } from '@/lib/api';
import { TICKET_CATEGORY, TICKET_PRIORITY, TICKET_STATUS_PLATFORM } from '@/lib/billing';
import { dateTime } from '@/lib/format';

interface Queue {
  counts: Record<string, number>;
  items: {
    id: string;
    number: number;
    subject: string;
    category: string;
    status: string;
    priority: string;
    assignedToId: string | null;
    lastMessageAt: string;
    tenant: { id: string; displayName: string };
    _count: { messages: number };
  }[];
}

export default function PlatformSupportPage() {
  const [status, setStatus] = useState('');
  const [assigned, setAssigned] = useState('');
  const queue = useQuery({
    queryKey: ['platform-tickets', status, assigned],
    queryFn: () => get<Queue>(`/platform/support/tickets${qs({ status, assigned })}`),
    refetchInterval: 60_000,
    placeholderData: (previous) => previous,
  });
  const counts = queue.data?.counts ?? {};

  return (
    <div>
      <PageHeader title="Support" description="Demandes des salons, les plus urgentes et les plus anciennes en premier." />
      <div className="mb-4 flex flex-wrap items-center gap-2">
        {[['', 'À traiter et en attente'], ...Object.entries(TICKET_STATUS_PLATFORM).map(([k, v]) => [k, v.label])].map(([value, label]) => (
          <button
            key={value}
            onClick={() => setStatus(value)}
            aria-pressed={status === value}
            className={clsx('rounded-full border px-3 py-1 text-sm', status === value ? 'border-brand-600 bg-brand-50 text-brand-700' : 'border-stone-300 bg-white text-stone-700 hover:bg-stone-50')}
          >
            {label}
            {value && counts[value] !== undefined && <span className="ml-1 tabular-nums text-stone-500">{counts[value]}</span>}
          </button>
        ))}
        <Select className="w-48" value={assigned} onChange={(e) => setAssigned(e.target.value)} aria-label="Assignation">
          <option value="">Toutes les demandes</option>
          <option value="me">Assignées à moi</option>
          <option value="none">Non assignées</option>
        </Select>
      </div>
      {queue.error && <ErrorMessage error={queue.error} />}
      {queue.isLoading ? (
        <Spinner />
      ) : (
        <Table head={['Priorité', 'Demande', 'Salon', 'Catégorie', 'Statut', 'Messages', 'Dernière activité']} empty={queue.data?.items.length === 0}>
          {queue.data?.items.map((t) => (
            <tr key={t.id} className="hover:bg-stone-50">
              <Td>
                <Badge tone={TICKET_PRIORITY[t.priority]?.tone}>{TICKET_PRIORITY[t.priority]?.label}</Badge>
              </Td>
              <Td>
                <Link href={`/plateforme/support/${t.id}`} className="font-medium text-brand-700 hover:underline">
                  #{t.number} · {t.subject}
                </Link>
              </Td>
              <Td>{t.tenant.displayName}</Td>
              <Td>{TICKET_CATEGORY[t.category] ?? t.category}</Td>
              <Td>
                <Badge tone={TICKET_STATUS_PLATFORM[t.status]?.tone}>{TICKET_STATUS_PLATFORM[t.status]?.label}</Badge>
              </Td>
              <Td className="tabular-nums">{t._count.messages}</Td>
              <Td>{dateTime(t.lastMessageAt)}</Td>
            </tr>
          ))}
        </Table>
      )}
    </div>
  );
}
