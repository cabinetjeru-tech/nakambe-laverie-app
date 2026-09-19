'use client';

import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { formatDate, formatFcfa } from '@/lib/format';

const EXPENSE_CATEGORIES = ['Salaires', 'Loyer', 'Eau', 'Électricité', 'Produits', 'Entretien', 'Transport', 'Communication', 'Taxes', 'Autres'];

function monthRange() {
  const now = new Date();
  const from = new Date(now.getFullYear(), now.getMonth(), 1);
  return { from: from.toISOString(), to: now.toISOString() };
}

function NewExpenseForm({ onCreated }: { onCreated: () => void }) {
  const [category, setCategory] = useState(EXPENSE_CATEGORIES[0]);
  const [label, setLabel] = useState('');
  const [amount, setAmount] = useState(0);
  const [saving, setSaving] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      await api.post('/finance/expenses', { category, label, amount });
      setLabel('');
      setAmount(0);
      onCreated();
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={submit} className="card mb-6 grid gap-3 sm:grid-cols-4">
      <select className="input" value={category} onChange={(e) => setCategory(e.target.value)}>
        {EXPENSE_CATEGORIES.map((c) => (
          <option key={c} value={c}>{c}</option>
        ))}
      </select>
      <input className="input sm:col-span-2" placeholder="Libellé" value={label} onChange={(e) => setLabel(e.target.value)} required />
      <div className="flex gap-2">
        <input type="number" min={1} className="input" placeholder="Montant" value={amount || ''} onChange={(e) => setAmount(Number(e.target.value))} required />
        <button type="submit" disabled={saving} className="btn-primary shrink-0 disabled:opacity-60">
          Ajouter
        </button>
      </div>
    </form>
  );
}

export default function FinancesPage() {
  const [showForm, setShowForm] = useState(false);
  const queryClient = useQueryClient();
  const { from, to } = monthRange();

  const { data: summary } = useQuery({
    queryKey: ['finance-summary', from, to],
    queryFn: async () => (await api.get('/finance/summary', { params: { from, to } })).data,
  });

  const { data: expenses, isLoading } = useQuery({
    queryKey: ['expenses'],
    queryFn: async () => (await api.get('/finance/expenses')).data,
  });

  return (
    <div>
      <h1 className="text-2xl font-bold text-brand-blue">Finances</h1>
      <p className="mb-6 text-sm text-slate-500">Recettes, dépenses et bénéfice estimatif du mois en cours.</p>

      {summary && (
        <div className="mb-6 grid grid-cols-3 gap-4">
          <div className="card">
            <div className="text-xs uppercase text-slate-500">Recettes</div>
            <div className="mt-1 text-xl font-extrabold text-brand-blue">{formatFcfa(summary.totalRevenue)}</div>
          </div>
          <div className="card">
            <div className="text-xs uppercase text-slate-500">Dépenses</div>
            <div className="mt-1 text-xl font-extrabold text-red-600">{formatFcfa(summary.totalExpenses)}</div>
          </div>
          <div className="card border-brand-gold bg-brand-gold-light">
            <div className="text-xs uppercase text-slate-500">Bénéfice estimatif</div>
            <div className="mt-1 text-xl font-extrabold text-brand-blue-dark">{formatFcfa(summary.estimatedProfit)}</div>
          </div>
        </div>
      )}

      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-lg font-bold text-slate-800">Dépenses</h2>
        <button className="btn-primary !px-4 !py-2 text-sm" onClick={() => setShowForm((v) => !v)}>
          {showForm ? 'Fermer' : '+ Nouvelle dépense'}
        </button>
      </div>

      {showForm && (
        <NewExpenseForm
          onCreated={() => {
            setShowForm(false);
            queryClient.invalidateQueries({ queryKey: ['expenses'] });
            queryClient.invalidateQueries({ queryKey: ['finance-summary'] });
          }}
        />
      )}

      <div className="card overflow-x-auto !p-0">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-4 py-3">Catégorie</th>
              <th className="px-4 py-3">Libellé</th>
              <th className="px-4 py-3">Montant</th>
              <th className="px-4 py-3">Date</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {isLoading && (
              <tr>
                <td colSpan={4} className="px-4 py-6 text-center text-slate-400">Chargement...</td>
              </tr>
            )}
            {expenses?.map((e: any) => (
              <tr key={e.id}>
                <td className="px-4 py-3">{e.category}</td>
                <td className="px-4 py-3">{e.label}</td>
                <td className="px-4 py-3 font-semibold text-red-600">{formatFcfa(e.amount)}</td>
                <td className="px-4 py-3 text-slate-500">{formatDate(e.spentAt)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
