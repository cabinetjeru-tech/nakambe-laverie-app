'use client';

import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';

function NewProductForm({ onCreated }: { onCreated: () => void }) {
  const [name, setName] = useState('');
  const [unit, setUnit] = useState('unité');
  const [minThreshold, setMinThreshold] = useState(5);
  const [saving, setSaving] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      await api.post('/stock/products', { name, unit, minThreshold, currentStock: 0 });
      setName('');
      onCreated();
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={submit} className="card mb-6 grid gap-3 sm:grid-cols-4">
      <input className="input sm:col-span-2" placeholder="Nom du produit" value={name} onChange={(e) => setName(e.target.value)} required />
      <input className="input" placeholder="Unité" value={unit} onChange={(e) => setUnit(e.target.value)} />
      <div className="flex gap-2">
        <input type="number" min={0} className="input" placeholder="Seuil min." value={minThreshold} onChange={(e) => setMinThreshold(Number(e.target.value))} />
        <button type="submit" disabled={saving} className="btn-primary shrink-0 disabled:opacity-60">
          Ajouter
        </button>
      </div>
    </form>
  );
}

function MovementForm({ productId, onSaved }: { productId: string; onSaved: () => void }) {
  const [type, setType] = useState('ENTREE');
  const [quantity, setQuantity] = useState(0);
  const [saving, setSaving] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!quantity) return;
    setSaving(true);
    try {
      await api.post('/stock/movements', { productId, type, quantity });
      setQuantity(0);
      onSaved();
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={submit} className="flex items-center gap-1">
      <select className="input !w-24 !py-1 text-xs" value={type} onChange={(e) => setType(e.target.value)}>
        <option value="ENTREE">Entrée</option>
        <option value="SORTIE">Sortie</option>
      </select>
      <input
        type="number"
        min={1}
        className="input !w-20 !py-1 text-xs"
        value={quantity || ''}
        onChange={(e) => setQuantity(Number(e.target.value))}
      />
      <button type="submit" disabled={saving} className="text-xs font-semibold text-brand-blue disabled:opacity-60">
        OK
      </button>
    </form>
  );
}

export default function StockPage() {
  const [showForm, setShowForm] = useState(false);
  const queryClient = useQueryClient();

  const { data: products, isLoading } = useQuery({
    queryKey: ['stock-products'],
    queryFn: async () => (await api.get('/stock/products')).data,
  });

  const { data: suppliers } = useQuery({
    queryKey: ['stock-suppliers'],
    queryFn: async () => (await api.get('/stock/suppliers')).data,
  });

  function refresh() {
    queryClient.invalidateQueries({ queryKey: ['stock-products'] });
  }

  return (
    <div className="flex flex-col gap-10">
      <div>
        <div className="mb-6 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-brand-blue">Stock</h1>
            <p className="text-sm text-slate-500">{products?.length ?? 0} produit(s)</p>
          </div>
          <button className="btn-primary" onClick={() => setShowForm((v) => !v)}>
            {showForm ? 'Fermer' : '+ Nouveau produit'}
          </button>
        </div>

        {showForm && (
          <NewProductForm
            onCreated={() => {
              setShowForm(false);
              refresh();
            }}
          />
        )}

        <div className="card overflow-x-auto !p-0">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-3">Produit</th>
                <th className="px-4 py-3">Stock actuel</th>
                <th className="px-4 py-3">Seuil min.</th>
                <th className="px-4 py-3">Mouvement</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {isLoading && (
                <tr>
                  <td colSpan={4} className="px-4 py-6 text-center text-slate-400">Chargement...</td>
                </tr>
              )}
              {products?.map((p: any) => {
                const low = Number(p.currentStock) <= Number(p.minThreshold);
                return (
                  <tr key={p.id} className={low ? 'bg-red-50' : ''}>
                    <td className="px-4 py-3 font-medium">{p.name}</td>
                    <td className="px-4 py-3">
                      <span className={low ? 'font-bold text-red-600' : ''}>
                        {p.currentStock} {p.unit}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-slate-500">{p.minThreshold} {p.unit}</td>
                    <td className="px-4 py-3">
                      <MovementForm productId={p.id} onSaved={refresh} />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      <div>
        <h2 className="text-xl font-bold text-brand-blue">Fournisseurs</h2>
        <div className="card mt-4 overflow-x-auto !p-0">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-3">Nom</th>
                <th className="px-4 py-3">Téléphone</th>
                <th className="px-4 py-3">Adresse</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {suppliers?.map((s: any) => (
                <tr key={s.id}>
                  <td className="px-4 py-3 font-medium">{s.name}</td>
                  <td className="px-4 py-3">{s.phone}</td>
                  <td className="px-4 py-3 text-slate-500">{s.address}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
