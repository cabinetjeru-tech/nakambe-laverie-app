'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { formatDate } from '@/lib/format';

const CLIENT_TYPE_LABELS: Record<string, string> = {
  PARTICULIER: 'Particulier',
  ENTREPRISE: 'Entreprise',
  ADMINISTRATION: 'Administration',
  HOTEL: 'Hôtel',
  RESTAURANT: 'Restaurant',
  AUTRE: 'Autre',
};

function NewClientForm({ onCreated }: { onCreated: () => void }) {
  const [form, setForm] = useState({ fullName: '', phone: '', district: '', address: '', type: 'PARTICULIER' });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function update<K extends keyof typeof form>(k: K, v: string) {
    setForm((f) => ({ ...f, [k]: v }));
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      await api.post('/clients', form);
      setForm({ fullName: '', phone: '', district: '', address: '', type: 'PARTICULIER' });
      onCreated();
    } catch (err: any) {
      setError(err?.response?.data?.message ?? 'Erreur lors de la création.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={submit} className="card mb-6 grid gap-3 sm:grid-cols-2">
      <div>
        <label className="label">Nom complet</label>
        <input className="input" value={form.fullName} onChange={(e) => update('fullName', e.target.value)} required />
      </div>
      <div>
        <label className="label">Téléphone</label>
        <input className="input" value={form.phone} onChange={(e) => update('phone', e.target.value)} required />
      </div>
      <div>
        <label className="label">Type</label>
        <select className="input" value={form.type} onChange={(e) => update('type', e.target.value)}>
          {Object.entries(CLIENT_TYPE_LABELS).map(([k, l]) => (
            <option key={k} value={k}>
              {l}
            </option>
          ))}
        </select>
      </div>
      <div>
        <label className="label">Quartier</label>
        <input className="input" value={form.district} onChange={(e) => update('district', e.target.value)} />
      </div>
      <div className="sm:col-span-2">
        <label className="label">Adresse</label>
        <input className="input" value={form.address} onChange={(e) => update('address', e.target.value)} />
      </div>
      {error && <p className="text-sm text-red-600 sm:col-span-2">{error}</p>}
      <div className="sm:col-span-2">
        <button type="submit" disabled={saving} className="btn-primary disabled:opacity-60">
          {saving ? 'Enregistrement...' : 'Ajouter le client'}
        </button>
      </div>
    </form>
  );
}

export default function ClientsPage() {
  const [search, setSearch] = useState('');
  const [showForm, setShowForm] = useState(false);
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ['clients', search],
    queryFn: async () => (await api.get('/clients', { params: { search, pageSize: 50 } })).data,
  });

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-brand-blue">Clients</h1>
          <p className="text-sm text-slate-500">{data?.total ?? 0} client(s) enregistré(s)</p>
        </div>
        <button className="btn-primary" onClick={() => setShowForm((v) => !v)}>
          {showForm ? 'Fermer' : '+ Nouveau client'}
        </button>
      </div>

      {showForm && (
        <NewClientForm
          onCreated={() => {
            setShowForm(false);
            queryClient.invalidateQueries({ queryKey: ['clients'] });
          }}
        />
      )}

      <input
        className="input mb-4 max-w-sm"
        placeholder="Rechercher par nom, téléphone, numéro client..."
        value={search}
        onChange={(e) => setSearch(e.target.value)}
      />

      <div className="card overflow-x-auto !p-0">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-4 py-3">N° client</th>
              <th className="px-4 py-3">Nom</th>
              <th className="px-4 py-3">Téléphone</th>
              <th className="px-4 py-3">Type</th>
              <th className="px-4 py-3">Depuis</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {isLoading && (
              <tr>
                <td colSpan={5} className="px-4 py-6 text-center text-slate-400">
                  Chargement...
                </td>
              </tr>
            )}
            {data?.items?.map((c: any) => (
              <tr key={c.id} className="hover:bg-slate-50">
                <td className="px-4 py-3 font-mono text-xs text-slate-500">{c.clientNumber}</td>
                <td className="px-4 py-3">
                  <Link href={`/admin/clients/${c.id}`} className="font-semibold text-brand-blue hover:underline">
                    {c.fullName}
                  </Link>
                  {c.companyName && <div className="text-xs text-slate-400">{c.companyName}</div>}
                </td>
                <td className="px-4 py-3">{c.phone}</td>
                <td className="px-4 py-3">{CLIENT_TYPE_LABELS[c.type] ?? c.type}</td>
                <td className="px-4 py-3 text-slate-500">{formatDate(c.createdAt)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
