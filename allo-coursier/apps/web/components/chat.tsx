'use client';

import clsx from 'clsx';
import { MapPin, Send } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { api, newId } from '@/lib/api';
import { timeOnly } from '@/lib/format';
import { currentPosition } from '@/lib/geo';
import { getSocket } from '@/lib/socket';
import type { Message } from '@/lib/types';
import { Button } from './ui';

export function ChatPanel({ orderId, meId, quickReplies = [], readOnly }: { orderId: string; meId: string; quickReplies?: string[]; readOnly?: boolean }) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [text, setText] = useState('');
  const [error, setError] = useState<string | null>(null);
  const bottom = useRef<HTMLDivElement>(null);

  const merge = useCallback((incoming: Message[]) => {
    setMessages((prev) => {
      const byKey = new Map(prev.map((m) => [m.clientMessageId ?? m.id, m]));
      for (const m of incoming) byKey.set(m.clientMessageId ?? m.id, m);
      return [...byKey.values()].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    });
  }, []);

  useEffect(() => {
    let active = true;
    api<{ messages: Message[] }>(`/orders/${orderId}/messages`)
      .then((r) => active && merge(r.messages))
      .catch(() => undefined);
    const socket = getSocket();
    socket.emit('order:subscribe', { orderId });
    const onMessage = (e: { orderId: string; message: Message }) => e.orderId === orderId && merge([e.message]);
    socket.on('chat.message', onMessage);
    const onReconnect = () => {
      socket.emit('order:subscribe', { orderId });
      api<{ messages: Message[] }>(`/orders/${orderId}/messages`).then((r) => merge(r.messages)).catch(() => undefined);
    };
    socket.on('connect', onReconnect);
    void api(`/orders/${orderId}/messages/read`, { method: 'POST' }).catch(() => undefined);
    return () => {
      active = false;
      socket.off('chat.message', onMessage);
      socket.off('connect', onReconnect);
    };
  }, [orderId, merge]);

  useEffect(() => bottom.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' }), [messages.length]);

  const send = async (body: Partial<Message> & { type: Message['type'] }) => {
    const clientMessageId = newId('m-');
    const optimistic: Message = {
      id: clientMessageId,
      clientMessageId,
      senderId: meId,
      type: body.type,
      body: body.body ?? null,
      lat: body.lat ?? null,
      lng: body.lng ?? null,
      attachmentUrl: null,
      createdAt: new Date().toISOString(),
      pending: true,
    };
    merge([optimistic]);
    setError(null);
    // Renvoi automatique avec le même identifiant : jamais de doublon côté serveur.
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const saved = await api<Message>(`/orders/${orderId}/messages`, { body: { clientMessageId, type: body.type, body: body.body, lat: body.lat, lng: body.lng } });
        merge([saved]);
        return;
      } catch (err) {
        if (!(err as { offline?: boolean }).offline || attempt === 2) {
          setError((err as Error).message);
          setMessages((prev) => prev.filter((m) => m.clientMessageId !== clientMessageId));
          return;
        }
        await new Promise((r) => setTimeout(r, 3000));
      }
    }
  };

  const shareLocation = async () => {
    try {
      const p = await currentPosition();
      await send({ type: 'LOCATION', lat: p.lat, lng: p.lng });
    } catch (err) {
      setError((err as Error).message);
    }
  };

  return (
    <div className="flex flex-col">
      <div className="max-h-80 min-h-[120px] space-y-2 overflow-y-auto rounded-xl bg-slate-50 p-3">
        {messages.length === 0 && <p className="py-6 text-center text-sm text-slate-400">Aucun message pour l’instant.</p>}
        {messages.map((m) => {
          const mine = m.senderId === meId;
          return (
            <div key={m.clientMessageId ?? m.id} className={clsx('flex', mine ? 'justify-end' : 'justify-start')}>
              <div className={clsx('max-w-[80%] rounded-2xl px-3 py-2 text-sm', mine ? 'rounded-br-md bg-brand text-white' : 'rounded-bl-md bg-white text-slate-800 shadow-sm', m.pending && 'opacity-60')}>
                {m.type === 'LOCATION' && m.lat != null ? (
                  <a href={`https://www.google.com/maps?q=${m.lat},${m.lng}`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 underline">
                    <MapPin className="h-4 w-4" /> Position partagée
                  </a>
                ) : m.type === 'IMAGE' && m.attachmentUrl ? (
                  <img src={m.attachmentUrl} alt="Photo" className="max-h-48 rounded-lg" />
                ) : (
                  <span className="whitespace-pre-wrap break-words">{m.body}</span>
                )}
                <span className={clsx('mt-0.5 block text-right text-[10px]', mine ? 'text-blue-200' : 'text-slate-400')}>{m.pending ? 'envoi…' : timeOnly(m.createdAt)}</span>
              </div>
            </div>
          );
        })}
        <div ref={bottom} />
      </div>
      {!readOnly && (
        <>
          {quickReplies.length > 0 && (
            <div className="mt-2 flex gap-2 overflow-x-auto pb-1">
              {quickReplies.map((q) => (
                <button key={q} onClick={() => send({ type: 'QUICK_REPLY', body: q })} className="shrink-0 rounded-full bg-brand-sky px-3 py-1.5 text-xs font-medium text-brand">
                  {q}
                </button>
              ))}
            </div>
          )}
          <form
            className="mt-2 flex gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              if (!text.trim()) return;
              void send({ type: 'TEXT', body: text.trim() });
              setText('');
            }}
          >
            <button type="button" onClick={shareLocation} className="rounded-xl bg-slate-100 px-3 text-slate-600" aria-label="Partager ma position">
              <MapPin className="h-5 w-5" />
            </button>
            <input value={text} onChange={(e) => setText(e.target.value)} placeholder="Votre message…" maxLength={1000} className="min-w-0 flex-1 rounded-xl border border-slate-300 px-3 py-2 text-[15px] focus:border-brand-light focus:outline-none" />
            <Button type="submit" aria-label="Envoyer">
              <Send className="h-4 w-4" />
            </Button>
          </form>
          {error && <p className="mt-1 text-xs text-red-600">{error}</p>}
        </>
      )}
    </div>
  );
}
