'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Bell } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { get, post } from '@/lib/api';
import { dateTime } from '@/lib/format';

interface Notification {
  id: string;
  event: string;
  title: string | null;
  body: string;
  actionUrl: string | null;
  readAt: string | null;
  createdAt: string;
}

/** Cloche : notifications du membre connecté (abonnement, factures, réponses du support). */
export function NotificationBell() {
  const [open, setOpen] = useState(false);
  const router = useRouter();
  const queryClient = useQueryClient();
  const panel = useRef<HTMLDivElement>(null);
  const count = useQuery({ queryKey: ['notifications-count'], queryFn: () => get<{ count: number }>('/notifications/unread-count'), refetchInterval: 60_000 });
  const list = useQuery({ queryKey: ['notifications'], queryFn: () => get<Notification[]>('/notifications?limit=20'), enabled: open });

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ['notifications'] });
    queryClient.invalidateQueries({ queryKey: ['notifications-count'] });
  };
  const markRead = useMutation({ mutationFn: (id: string) => post(`/notifications/${id}/read`), onSuccess: refresh });
  const markAll = useMutation({ mutationFn: () => post('/notifications/read-all'), onSuccess: refresh });

  useEffect(() => {
    if (!open) return;
    const close = (event: MouseEvent) => panel.current && !panel.current.contains(event.target as Node) && setOpen(false);
    const escape = (event: KeyboardEvent) => event.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', close);
    document.addEventListener('keydown', escape);
    return () => {
      document.removeEventListener('mousedown', close);
      document.removeEventListener('keydown', escape);
    };
  }, [open]);

  const unread = count.data?.count ?? 0;
  return (
    <div className="relative" ref={panel}>
      <button
        onClick={() => setOpen(!open)}
        className="relative rounded-lg p-2 text-stone-600 hover:bg-stone-100"
        aria-label={unread > 0 ? `Notifications (${unread} non lues)` : 'Notifications'}
        aria-expanded={open}
      >
        <Bell className="h-5 w-5" aria-hidden />
        {unread > 0 && (
          <span className="absolute right-1 top-1 min-w-[18px] rounded-full bg-red-600 px-1 text-center text-[11px] font-semibold leading-[18px] text-white">
            {unread > 9 ? '9+' : unread}
          </span>
        )}
      </button>
      {open && (
        <div className="absolute right-0 z-50 mt-2 w-[min(22rem,calc(100vw-2rem))] rounded-xl border border-stone-200 bg-white shadow-xl">
          <div className="flex items-center justify-between border-b border-stone-100 px-4 py-2.5">
            <p className="text-sm font-semibold text-stone-900">Notifications</p>
            {unread > 0 && (
              <button onClick={() => markAll.mutate()} className="text-xs font-medium text-brand-700 hover:underline">
                Tout marquer comme lu
              </button>
            )}
          </div>
          <ul className="max-h-96 divide-y divide-stone-100 overflow-y-auto">
            {list.isLoading && <li className="px-4 py-6 text-center text-sm text-stone-500">Chargement…</li>}
            {list.data?.length === 0 && <li className="px-4 py-6 text-center text-sm text-stone-500">Aucune notification.</li>}
            {list.data?.map((n) => (
              <li key={n.id}>
                <button
                  className="w-full px-4 py-3 text-left hover:bg-stone-50"
                  onClick={() => {
                    if (!n.readAt) markRead.mutate(n.id);
                    setOpen(false);
                    if (n.actionUrl) router.push(n.actionUrl);
                  }}
                >
                  <div className="flex items-start gap-2">
                    {!n.readAt && <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-brand-600" aria-label="Non lue" />}
                    <div className={n.readAt ? 'pl-4' : ''}>
                      <p className="text-sm font-medium text-stone-900">{n.title ?? n.body}</p>
                      {n.title && <p className="mt-0.5 text-sm text-stone-600">{n.body}</p>}
                      <p className="mt-1 text-xs text-stone-400">{dateTime(n.createdAt)}</p>
                    </div>
                  </div>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
