'use client';

import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { SERVICE_DOMAIN_LABELS } from '@/lib/constants';

function PriceEditor({ service, onSaved }: { service: any; onSaved: () => void }) {
  const [price, setPrice] = useState(Number(service.price));
  const [saving, setSaving] = useState(false);

  async function save() {
    if (price === Number(service.price)) return;
    setSaving(true);
    try {
      await api.patch(`/catalog/services/${service.id}`, { price });
      onSaved();
    } finally {
      setSaving(false);
    }
  }

  return (
    <input
      type="number"
      className="input !w-32 text-right"
      value={price}
      disabled={saving}
      onChange={(e) => setPrice(Number(e.target.value))}
      onBlur={save}
    />
  );
}

function NewServiceForm({ categories, onCreated }: { categories: any[]; onCreated: () => void }) {
  const [categoryId, setCategoryId] = useState(categories[0]?.id ?? '');
  const [name, setName] = useState('');
  const [unit, setUnit] = useState('pièce');
  const [price, setPrice] = useState(0);
  const [saving, setSaving] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      await api.post('/catalog/services', { categoryId, name, unit, price });
      setName('');
      setPrice(0);
      onCreated();
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={submit} className="card mb-6 grid gap-3 sm:grid-cols-4">
      <select className="input" value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
        {categories.map((c) => (
          <option key={c.id} value={c.id}>
            {c.name}
          </option>
        ))}
      </select>
      <input className="input" placeholder="Nom du service" value={name} onChange={(e) => setName(e.target.value)} required />
      <input className="input" placeholder="Unité (pièce, m², forfait...)" value={unit} onChange={(e) => setUnit(e.target.value)} />
      <div className="flex gap-2">
        <input type="number" min={0} className="input" placeholder="Prix" value={price || ''} onChange={(e) => setPrice(Number(e.target.value))} required />
        <button type="submit" disabled={saving} className="btn-primary shrink-0 disabled:opacity-60">
          Ajouter
        </button>
      </div>
    </form>
  );
}

export default function CataloguePage() {
  const queryClient = useQueryClient();
  const { data: categories, isLoading } = useQuery({
    queryKey: ['catalog-categories'],
    queryFn: async () => (await api.get('/catalog/categories')).data,
  });

  function refresh() {
    queryClient.invalidateQueries({ queryKey: ['catalog-categories'] });
  }

  return (
    <div>
      <h1 className="text-2xl font-bold text-brand-blue">Services & tarifs</h1>
      <p className="mb-6 text-sm text-slate-500">Les tarifs sont modifiables ici, sans toucher au code (§32 du cahier des charges).</p>

      {categories && <NewServiceForm categories={categories} onCreated={refresh} />}

      {isLoading && <p className="text-slate-400">Chargement...</p>}

      <div className="flex flex-col gap-6">
        {categories?.map((cat: any) => (
          <div key={cat.id} className="card">
            <h3 className="mb-3 font-bold text-brand-blue">
              {cat.name} <span className="text-xs font-normal text-slate-400">({SERVICE_DOMAIN_LABELS[cat.domain] ?? cat.domain})</span>
            </h3>
            <table className="w-full text-sm">
              <tbody className="divide-y divide-slate-100">
                {cat.services.map((s: any) => (
                  <tr key={s.id}>
                    <td className="py-2">{s.name}</td>
                    <td className="py-2 text-slate-400">{s.unit}</td>
                    <td className="py-2 text-right">
                      <PriceEditor service={s} onSaved={refresh} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ))}
      </div>
    </div>
  );
}
