'use client';

import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { Button, Input } from '@/components/ui';
import { get, post, qs } from '@/lib/api';
import { useAuth } from '@/lib/auth';

export interface ClientOption {
  id: string;
  fullName: string;
  phone: string | null;
  clientNumber: string;
}

/** Recherche d'un client (nom, numéro, téléphone) avec création rapide au comptoir. */
export function ClientPicker({ value, onChange }: { value: ClientOption | null; onChange: (client: ClientOption | null) => void }) {
  const { can } = useAuth();
  const [q, setQ] = useState('');
  const [creating, setCreating] = useState(false);
  const [phone, setPhone] = useState('');
  const [error, setError] = useState<string | null>(null);
  const { data } = useQuery({
    queryKey: ['clients-search', q],
    queryFn: () => get<{ items: ClientOption[] }>(`/clients${qs({ q, pageSize: 8 })}`),
    enabled: q.trim().length >= 2 && !value,
  });

  if (value) {
    return (
      <div className="flex items-center justify-between rounded-lg border border-stone-300 px-3 py-2 text-sm">
        <span>
          <strong>{value.fullName}</strong> {value.phone && <span className="text-stone-500">· {value.phone}</span>}
        </span>
        <button type="button" className="text-brand-700 hover:underline" onClick={() => onChange(null)}>
          Changer
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Nom ou téléphone du client" aria-label="Rechercher un client" />
      {data && data.items.length > 0 && (
        <ul className="max-h-48 overflow-y-auto rounded-lg border border-stone-200">
          {data.items.map((c) => (
            <li key={c.id}>
              <button type="button" onClick={() => onChange(c)} className="flex w-full justify-between px-3 py-2 text-left text-sm hover:bg-stone-50">
                <span>{c.fullName}</span>
                <span className="text-stone-500">{c.phone ?? c.clientNumber}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
      {can('clients.manage') && q.trim().length >= 2 && (
        creating ? (
          <div className="flex gap-2">
            <Input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="Téléphone (facultatif)" inputMode="tel" aria-label="Téléphone du nouveau client" />
            <Button
              type="button"
              variant="secondary"
              onClick={async () => {
                setError(null);
                try {
                  const client = await post<ClientOption>('/clients', { fullName: q.trim(), ...(phone ? { phone } : {}) });
                  onChange(client);
                } catch (e) {
                  setError((e as Error).message);
                }
              }}
            >
              Créer
            </Button>
          </div>
        ) : (
          <button type="button" className="text-sm text-brand-700 hover:underline" onClick={() => setCreating(true)}>
            + Nouveau client « {q.trim()} »
          </button>
        )
      )}
      {error && <p className="text-xs text-red-600">{error}</p>}
    </div>
  );
}
