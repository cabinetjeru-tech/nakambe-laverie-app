'use client';

import { useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api, openAuthenticatedPdf } from '@/lib/api';
import { formatDate, formatFcfa } from '@/lib/format';

interface Item {
  serviceId?: string;
  label: string;
  quantity: number;
  unitPrice: number;
}

const QUOTE_STATUS_LABELS: Record<string, string> = {
  BROUILLON: 'Brouillon',
  ENVOYE: 'Envoyé',
  ACCEPTE: 'Accepté',
  REFUSE: 'Refusé',
  EXPIRE: 'Expiré',
};

function NewQuoteForm({ onCreated }: { onCreated: () => void }) {
  const [clientSearch, setClientSearch] = useState('');
  const [clientId, setClientId] = useState<string | null>(null);
  const [clientLabel, setClientLabel] = useState('');
  const [items, setItems] = useState<Item[]>([{ label: '', quantity: 1, unitPrice: 0 }]);
  const [discount, setDiscount] = useState(0);
  const [conditions, setConditions] = useState('Devis valable 15 jours. Acompte de 50% à la validation.');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { data: clientResults } = useQuery({
    queryKey: ['client-search-quote', clientSearch],
    queryFn: async () => (await api.get('/clients', { params: { search: clientSearch, pageSize: 8 } })).data,
    enabled: clientSearch.length > 1 && !clientId,
  });

  const { data: services } = useQuery({
    queryKey: ['all-services'],
    queryFn: async () => (await api.get('/catalog/services')).data,
  });

  const total = useMemo(() => items.reduce((s, i) => s + i.quantity * i.unitPrice, 0) - discount, [items, discount]);

  function updateItem(idx: number, patch: Partial<Item>) {
    setItems((prev) => prev.map((it, i) => (i === idx ? { ...it, ...patch } : it)));
  }

  function pickService(idx: number, serviceId: string) {
    const service = services?.find((s: any) => s.id === serviceId);
    if (!service) return;
    updateItem(idx, { serviceId, label: service.name, unitPrice: Number(service.price) });
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!clientId) {
      setError('Sélectionnez un client.');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await api.post('/quotes', {
        clientId,
        discount,
        conditions,
        items: items
          .filter((i) => i.label)
          .map((i) => ({ serviceId: i.serviceId, label: i.label, quantity: i.quantity, unitPrice: i.serviceId ? undefined : i.unitPrice })),
      });
      onCreated();
    } catch (err: any) {
      setError(err?.response?.data?.message ?? 'Erreur lors de la création du devis.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={submit} className="card mb-6 flex flex-col gap-4">
      <div>
        <label className="label">Client</label>
        {clientId ? (
          <div className="flex items-center justify-between rounded-lg bg-brand-blue-light px-3 py-2">
            <span className="text-sm font-semibold text-brand-blue">{clientLabel}</span>
            <button type="button" className="text-xs font-semibold text-red-600" onClick={() => setClientId(null)}>
              Changer
            </button>
          </div>
        ) : (
          <>
            <input className="input" placeholder="Rechercher un client..." value={clientSearch} onChange={(e) => setClientSearch(e.target.value)} />
            {clientResults?.items?.length > 0 && (
              <div className="mt-2 max-h-40 overflow-y-auto rounded-lg border border-slate-200">
                {clientResults.items.map((c: any) => (
                  <button
                    type="button"
                    key={c.id}
                    onClick={() => {
                      setClientId(c.id);
                      setClientLabel(`${c.fullName} — ${c.phone}`);
                    }}
                    className="block w-full px-3 py-2 text-left text-sm hover:bg-slate-50"
                  >
                    {c.fullName} — {c.phone}
                  </button>
                ))}
              </div>
            )}
          </>
        )}
      </div>

      <div className="flex flex-col gap-2">
        {items.map((item, idx) => (
          <div key={idx} className="grid grid-cols-12 gap-2">
            <select
              className="input col-span-5"
              value={item.serviceId ?? ''}
              onChange={(e) => (e.target.value ? pickService(idx, e.target.value) : updateItem(idx, { serviceId: undefined }))}
            >
              <option value="">— Article personnalisé —</option>
              {services?.map((s: any) => (
                <option key={s.id} value={s.id}>
                  {s.name} ({formatFcfa(s.price)})
                </option>
              ))}
            </select>
            {!item.serviceId && (
              <input className="input col-span-4" placeholder="Description" value={item.label} onChange={(e) => updateItem(idx, { label: e.target.value })} />
            )}
            <input
              type="number"
              min={1}
              className={`input ${item.serviceId ? 'col-span-6' : 'col-span-2'}`}
              value={item.quantity}
              onChange={(e) => updateItem(idx, { quantity: Number(e.target.value) })}
            />
            {!item.serviceId && (
              <input type="number" min={0} className="input col-span-1" placeholder="P.U." value={item.unitPrice} onChange={(e) => updateItem(idx, { unitPrice: Number(e.target.value) })} />
            )}
          </div>
        ))}
        <button type="button" className="w-fit text-sm font-semibold text-brand-blue" onClick={() => setItems((p) => [...p, { label: '', quantity: 1, unitPrice: 0 }])}>
          + Ajouter une ligne
        </button>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label className="label">Réduction (FCFA)</label>
          <input type="number" min={0} className="input" value={discount} onChange={(e) => setDiscount(Number(e.target.value))} />
        </div>
        <div>
          <label className="label">Total</label>
          <div className="input flex items-center bg-slate-50 font-bold text-brand-blue">{formatFcfa(total)}</div>
        </div>
      </div>

      <div>
        <label className="label">Conditions</label>
        <textarea className="input" rows={2} value={conditions} onChange={(e) => setConditions(e.target.value)} />
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}
      <button type="submit" disabled={saving} className="btn-primary w-fit disabled:opacity-60">
        {saving ? 'Enregistrement...' : 'Créer le devis'}
      </button>
    </form>
  );
}

export default function DevisPage() {
  const [showForm, setShowForm] = useState(false);
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ['quotes'],
    queryFn: async () => (await api.get('/quotes')).data,
  });

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-brand-blue">Devis</h1>
          <p className="text-sm text-slate-500">{data?.length ?? 0} devis</p>
        </div>
        <button className="btn-primary" onClick={() => setShowForm((v) => !v)}>
          {showForm ? 'Fermer' : '+ Nouveau devis'}
        </button>
      </div>

      {showForm && (
        <NewQuoteForm
          onCreated={() => {
            setShowForm(false);
            queryClient.invalidateQueries({ queryKey: ['quotes'] });
          }}
        />
      )}

      <div className="card overflow-x-auto !p-0">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-4 py-3">N° devis</th>
              <th className="px-4 py-3">Client</th>
              <th className="px-4 py-3">Statut</th>
              <th className="px-4 py-3">Total</th>
              <th className="px-4 py-3">Date</th>
              <th className="px-4 py-3"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {isLoading && (
              <tr>
                <td colSpan={6} className="px-4 py-6 text-center text-slate-400">Chargement...</td>
              </tr>
            )}
            {data?.map((q: any) => (
              <tr key={q.id} className="hover:bg-slate-50">
                <td className="px-4 py-3 font-semibold text-brand-blue">{q.quoteNumber}</td>
                <td className="px-4 py-3">{q.client?.fullName}</td>
                <td className="px-4 py-3">
                  <span className="badge bg-slate-100 text-slate-600">{QUOTE_STATUS_LABELS[q.status] ?? q.status}</span>
                </td>
                <td className="px-4 py-3 font-semibold">{formatFcfa(q.total)}</td>
                <td className="px-4 py-3 text-slate-500">{formatDate(q.createdAt)}</td>
                <td className="px-4 py-3">
                  <button className="text-xs font-semibold text-brand-blue underline" onClick={() => openAuthenticatedPdf(`/quotes/${q.id}/pdf`)}>
                    PDF
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
