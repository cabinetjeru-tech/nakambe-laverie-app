'use client';

import clsx from 'clsx';
import { Bell } from 'lucide-react';
import Link from 'next/link';
import { useEffect } from 'react';
import { api } from '@/lib/api';
import { dateTime } from '@/lib/format';
import { useApi } from '@/lib/use-api';
import { EmptyState, Spinner } from './ui';

interface Notification {
  id: string;
  title: string;
  body: string;
  readAt: string | null;
  createdAt: string;
  data: { url?: string } | null;
}

export function NotificationList() {
  const { data } = useApi<{ items: Notification[]; unread: number }>('/notifications');
  useEffect(() => {
    if (data?.unread) void api('/notifications/read', { body: {} }).catch(() => undefined);
  }, [data?.unread]);
  if (!data) return <Spinner />;
  if (!data.items.length) return <EmptyState icon={<Bell className="h-10 w-10" />} title="Aucune notification" />;
  return (
    <ul className="space-y-2">
      {data.items.map((n) => {
        const content = (
          <div className={clsx('rounded-2xl bg-white p-3.5 shadow-card', !n.readAt && 'ring-2 ring-brand-light/40')}>
            <p className="text-sm font-semibold text-brand">{n.title}</p>
            <p className="text-sm text-slate-600">{n.body}</p>
            <p className="mt-1 text-xs text-slate-400">{dateTime(n.createdAt)}</p>
          </div>
        );
        return <li key={n.id}>{n.data?.url ? <Link href={n.data.url}>{content}</Link> : content}</li>;
      })}
    </ul>
  );
}

