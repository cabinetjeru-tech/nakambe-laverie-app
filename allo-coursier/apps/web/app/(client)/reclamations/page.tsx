'use client';

import { MessageSquareWarning } from 'lucide-react';
import Link from 'next/link';
import { EmptyState, LinkButton, PageHeader, Spinner, StatusBadge } from '@/components/ui';
import { COMPLAINT_CATEGORIES, COMPLAINT_STATUS, dateTime } from '@/lib/format';
import { useApi } from '@/lib/use-api';

export default function ComplaintsPage() {
  const { data } = useApi<{ id: string; reference: string; category: string; status: string; createdAt: string; order: { reference: string } | null }[]>('/complaints');
  return (
    <div>
      <PageHeader title="Mes réclamations" action={<LinkButton href="/reclamations/nouvelle">Nouvelle</LinkButton>} />
      {!data && <Spinner />}
      {data?.length === 0 && <EmptyState icon={<MessageSquareWarning className="h-10 w-10" />} title="Aucune réclamation" />}
      <ul className="space-y-2">
        {data?.map((c) => (
          <li key={c.id}>
            <Link href={`/reclamations/${c.id}`} className="flex items-center justify-between rounded-2xl bg-white p-4 shadow-card">
              <span>
                <span className="block font-semibold text-brand">{COMPLAINT_CATEGORIES[c.category]}</span>
                <span className="text-xs text-slate-500">
                  {c.reference} {c.order && `· ${c.order.reference}`} · {dateTime(c.createdAt)}
                </span>
              </span>
              <StatusBadge status={c.status} label={COMPLAINT_STATUS[c.status]} />
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
