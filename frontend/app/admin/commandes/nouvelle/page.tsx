'use client';

import { Suspense, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { formatFcfa } from '@/lib/format';
import { SERVICE_DOMAIN_LABELS } from '@/lib/constants';

interface Item {
  serviceId?: string;
  label: string;
  quantity: number;
  unitPrice: number;
}

function NouvelleCommandeForm() {
  const router = useRouter();
  const params = useSearchParams();
  const appointmentId = params.get('appointmentId') ?? undefined;
  const [domain, setDomain] = useState(params.get('domain') ?? 'LAVERIE_PRESSING');
  const [clientSearch, setClientSearch] = useState('');
  const [clientId, setClientId] = useState<string | null>(params.get('clientId'));
  const [selectedClientLabel, setSelectedClientLabel] = useState(params.get('clientLabel') ?? '');
  const [deliveryMode, setDeliveryMode] = useState('RETRAIT_SUR_PLACE');
  const [address, setAddress] = useState(params.get('address') ?? '');
  const [items, setItems] = useState<Item[]>([{ label: '', quantity: 1, unitPrice: 0 }]);
  const [discount, setDiscount] = useState(0);
  const [travelFee, setTravelFee] = useState(0);
  const [notes, setNotes] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const { data: clientResults } = useQuery({
    queryKey: ['client-search', clientSearch],
    queryFn: async () => (await api.get('/clients', { params: { search: clientSearch, pageSize: 8 } })).data,
    enabled: clientSearch.length > 1 && !clientId,
  });

  const { data: services } = useQuery({
    queryKey: ['catalog-services', domain],
    queryFn: async () => (await api.get('/catalog/services', { params: { domain } })).data,
  });

  const total = useMemo(() => {
    const subtotal = items.reduce((sum, i) => sum + i.quantity * i.unitPrice, 0);
    return subtotal - discount + travelFee;
  }, [items, discount, travelFee]);

  function updateItem(idx: number, patch: Partial<Item>) {
    setItems((prev) => prev.map((it, i) => (i === idx ? { ...it, ...patch } : it)));
  }

  function addItem() {
    setItems((prev) => [...prev, { label: '', quantity: 1, unitPrice: 0 }]);
  }

  function removeItem(idx: number) {
    setItems((prev) => prev.filter((_, i) => i !== idx));
  }

  function pickService(idx: number, serviceId: string) {
    const service = services?.find((s: any) => s.id === serviceId);
    if (!service) return;
    updateItem(idx, { serviceId, label: service.name, unitPrice: Number(service.price) });
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!clientId) {
      setError('Sélectionnez un client.');
      return;
    }
    setSubmitting(true);
    try {
      const { data } = await api.post('/orders', {
        clientId,
        appointmentId,
        domain,
        deliveryMode,
        address: deliveryMode === 'LIVRAISON' ? address : undefined,
        notes,
        discount,
        travelFee,
        items: items
          .filter((i) => i.label)
          .map((i) => ({
            serviceId: i.serviceId,
            label: i.label,
            quantity: i.quantity,
            unitPrice: i.serviceId ? undefined : i.unitPrice,
          })),
      });
      router.push(`/admin/commandes/${data.id}`);
    } catch (err: any) {
      setError(err?.response?.data?.message ?? 'Erreur lors de la création de la commande.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="max-w-3xl">
      <h1 className="text-2xl font-bold text-brand-blue">Nouvelle commande</h1>
      <p className="text-sm text-slate-500">Enregistrement d&apos;une commande à la réception.</p>

      <form onSubmit={handleSubmit} className="mt-6 flex flex-col gap-6">
        <div className="card">
          <label className="label">Client</label>
          {clientId ? (
            <div className="flex items-center justify-between rounded-lg bg-brand-blue-light px-3 py-2">
              <span className="text-sm font-semibold text-brand-blue">{selectedClientLabel}</span>
              <button
                type="button"
                className="text-xs font-semibold text-red-600"
                onClick={() => {
                  setClientId(null);
                  setSelectedClientLabel('');
                }}
              >
                Changer
              </button>
            </div>
          ) : (
            <>
              <input
                className="input"
                placeholder="Rechercher un client par nom ou téléphone..."
                value={clientSearch}
                onChange={(e) => setClientSearch(e.target.value)}
              />
              {clientResults?.items?.length > 0 && (
                <div className="mt-2 max-h-48 overflow-y-auto rounded-lg border border-slate-200">
                  {clientResults.items.map((c: any) => (
                    <button
                      type="button"
                      key={c.id}
                      onClick={() => {
                        setClientId(c.id);
                        setSelectedClientLabel(`${c.fullName} — ${c.phone}`);
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

        <div className="card grid gap-4 sm:grid-cols-2">
          <div>
            <label className="label">Domaine</label>
            <select className="input" value={domain} onChange={(e) => setDomain(e.target.value)}>
              {Object.entries(SERVICE_DOMAIN_LABELS).map(([k, l]) => (
                <option key={k} value={k}>
                  {l}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="label">Mode</label>
            <select className="input" value={deliveryMode} onChange={(e) => setDeliveryMode(e.target.value)}>
              <option value="RETRAIT_SUR_PLACE">Retrait sur place</option>
              <option value="LIVRAISON">Livraison</option>
            </select>
          </div>
          {deliveryMode === 'LIVRAISON' && (
            <div className="sm:col-span-2">
              <label className="label">Adresse de livraison</label>
              <input className="input" value={address} onChange={(e) => setAddress(e.target.value)} />
            </div>
          )}
          <div className="sm:col-span-2">
            <label className="label">Notes / défauts constatés</label>
            <textarea className="input" rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
          </div>
        </div>

        <div className="card">
          <div className="mb-3 flex items-center justify-between">
            <label className="label !mb-0">Articles / prestations</label>
            <button type="button" onClick={addItem} className="text-sm font-semibold text-brand-blue">
              + Ajouter une ligne
            </button>
          </div>
          <div className="flex flex-col gap-3">
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
                  <input
                    className="input col-span-4"
                    placeholder="Description"
                    value={item.label}
                    onChange={(e) => updateItem(idx, { label: e.target.value })}
                  />
                )}
                <input
                  type="number"
                  min={1}
                  className={`input ${item.serviceId ? 'col-span-3' : 'col-span-2'}`}
                  value={item.quantity}
                  onChange={(e) => updateItem(idx, { quantity: Number(e.target.value) })}
                />
                {!item.serviceId && (
                  <input
                    type="number"
                    min={0}
                    className="input col-span-2"
                    placeholder="P.U."
                    value={item.unitPrice}
                    onChange={(e) => updateItem(idx, { unitPrice: Number(e.target.value) })}
                  />
                )}
                <button
                  type="button"
                  onClick={() => removeItem(idx)}
                  className="col-span-1 text-sm text-red-500"
                >
                  ✕
                </button>
              </div>
            ))}
          </div>
        </div>

        <div className="card grid gap-4 sm:grid-cols-3">
          <div>
            <label className="label">Réduction (FCFA)</label>
            <input type="number" min={0} className="input" value={discount} onChange={(e) => setDiscount(Number(e.target.value))} />
          </div>
          <div>
            <label className="label">Frais de déplacement (FCFA)</label>
            <input type="number" min={0} className="input" value={travelFee} onChange={(e) => setTravelFee(Number(e.target.value))} />
          </div>
          <div>
            <label className="label">Total</label>
            <div className="input flex items-center bg-slate-50 font-bold text-brand-blue">{formatFcfa(total)}</div>
          </div>
        </div>

        {error && <p className="text-sm text-red-600">{error}</p>}

        <button type="submit" disabled={submitting} className="btn-primary w-fit disabled:opacity-60">
          {submitting ? 'Enregistrement...' : 'Créer la commande'}
        </button>
      </form>
    </div>
  );
}

export default function NouvelleCommandePage() {
  return (
    <Suspense fallback={<p className="text-slate-400">Chargement...</p>}>
      <NouvelleCommandeForm />
    </Suspense>
  );
}
