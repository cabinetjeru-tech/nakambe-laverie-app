'use client';

import { useState } from 'react';
import { api } from '@/lib/api';

type ChatMessage = { role: 'user' | 'assistant'; content: string };

const GREETING: ChatMessage = {
  role: 'assistant',
  content:
    'Bonjour ! Je suis Kady, votre interlocutrice chez NAKAMBÉ Laverie Exprès et Digitale. Je peux répondre à vos questions sur nos services, nos tarifs, nos horaires, ou vous guider sur le site.',
};

const MAX_HISTORY_SENT = 10;

export function AssistantWidget() {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([GREETING]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function send(e: React.FormEvent) {
    e.preventDefault();
    const text = input.trim();
    if (!text || sending) return;

    const nextMessages = [...messages, { role: 'user' as const, content: text }];
    setMessages(nextMessages);
    setInput('');
    setError(null);
    setSending(true);

    try {
      const toSend = nextMessages.filter((m) => m !== GREETING).slice(-MAX_HISTORY_SENT);
      const { data } = await api.post('/assistant/chat', { messages: toSend });
      setMessages((prev) => [...prev, { role: 'assistant', content: data.reply }]);
    } catch (err: any) {
      setError(err?.response?.data?.message ?? "L'assistant est indisponible pour le moment. Réessayez plus tard.");
    } finally {
      setSending(false);
    }
  }

  return (
    <>
      {open && (
        <div className="fixed bottom-24 left-5 z-50 flex h-[28rem] w-[22rem] max-w-[calc(100vw-2.5rem)] flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl">
          <div className="flex items-center justify-between bg-brand-blue px-4 py-3 text-white">
            <span className="font-semibold">Assistante Nakambé</span>
            <button type="button" onClick={() => setOpen(false)} aria-label="Fermer" className="text-xl leading-none">
              ×
            </button>
          </div>

          <div className="flex-1 space-y-3 overflow-y-auto p-3">
            {messages.map((m, i) => (
              <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                <div
                  className={`max-w-[85%] rounded-2xl px-3 py-2 text-sm ${
                    m.role === 'user' ? 'bg-brand-blue text-white' : 'bg-slate-100 text-slate-700'
                  }`}
                >
                  {m.content}
                </div>
              </div>
            ))}
            {sending && <div className="text-xs text-slate-400">L&apos;assistant écrit...</div>}
            {error && <p className="text-xs text-red-600">{error}</p>}
          </div>

          <form onSubmit={send} className="flex gap-2 border-t border-slate-100 p-2">
            <input
              className="input flex-1 !py-2 text-sm"
              placeholder="Posez votre question..."
              value={input}
              onChange={(e) => setInput(e.target.value)}
              disabled={sending}
            />
            <button type="submit" disabled={sending || !input.trim()} className="btn-primary !px-3 !py-2 text-sm disabled:opacity-60">
              Envoyer
            </button>
          </form>
        </div>
      )}

      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label="Discuter avec Kady"
        className="fixed bottom-5 left-5 z-50 flex h-14 w-14 items-center justify-center rounded-full bg-brand-blue text-2xl shadow-lg transition hover:scale-105"
      >
        💬
      </button>
    </>
  );
}
