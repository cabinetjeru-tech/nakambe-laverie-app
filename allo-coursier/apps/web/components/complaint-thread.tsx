'use client';

import clsx from 'clsx';
import { useState } from 'react';
import { api } from '@/lib/api';
import { dateTime } from '@/lib/format';
import { Button, Textarea } from './ui';

export interface ComplaintDetail {
  id: string;
  reference: string;
  category: string;
  description: string;
  status: string;
  resolution: string | null;
  refundAmount: number | null;
  createdAt: string;
  userId: string;
  user: { firstName: string; lastName: string; phone: string };
  order: { id: string; reference: string } | null;
  messages: { id: string; authorId: string; body: string; isInternal: boolean; attachmentUrl: string | null; createdAt: string }[];
}

export function ComplaintThread({ complaint, meId, staff, onChange }: { complaint: ComplaintDetail; meId: string; staff?: boolean; onChange: () => void }) {
  const [text, setText] = useState('');
  const [internal, setInternal] = useState(false);
  const [busy, setBusy] = useState(false);
  return (
    <div className="space-y-3">
      <div className="rounded-xl bg-slate-50 p-3 text-sm text-slate-700">{complaint.description}</div>
      {complaint.messages.map((m) => (
        <div key={m.id} className={clsx('rounded-xl p-3 text-sm', m.isInternal ? 'bg-amber-50 ring-1 ring-amber-200' : m.authorId === complaint.userId ? 'bg-white ring-1 ring-slate-200' : 'bg-brand-sky')}>
          <p className="text-xs font-semibold text-slate-500">
            {m.isInternal ? 'Note interne' : m.authorId === complaint.userId ? `${complaint.user.firstName} (client)` : 'Service client Allô-Coursier'} · {dateTime(m.createdAt)}
          </p>
          <p className="mt-1 whitespace-pre-wrap text-slate-800">{m.body}</p>
          {m.attachmentUrl && <img src={m.attachmentUrl} alt="Pièce jointe" className="mt-2 max-h-48 rounded-lg" />}
        </div>
      ))}
      {complaint.status !== 'RESOLVED' && complaint.status !== 'REJECTED' && (
        <div className="space-y-2">
          <Textarea rows={2} placeholder="Votre message…" value={text} maxLength={2000} onChange={(e) => setText(e.target.value)} />
          <div className="flex items-center justify-between">
            {staff ? (
              <label className="flex items-center gap-2 text-sm text-slate-600">
                <input type="checkbox" checked={internal} onChange={(e) => setInternal(e.target.checked)} className="accent-amber-500" /> Note interne
              </label>
            ) : (
              <span />
            )}
            <Button
              size="sm"
              loading={busy}
              disabled={!text.trim()}
              onClick={async () => {
                setBusy(true);
                try {
                  await api(`/complaints/${complaint.id}/messages`, { body: { body: text.trim(), isInternal: staff ? internal : undefined } });
                  setText('');
                  onChange();
                } finally {
                  setBusy(false);
                }
              }}
            >
              Envoyer
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
