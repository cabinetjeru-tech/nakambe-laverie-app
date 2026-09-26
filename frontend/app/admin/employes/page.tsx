'use client';

import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { ROLE_LABELS } from '@/lib/constants';
import { formatDate } from '@/lib/format';

const INTERNAL_ROLES = ['ADMIN', 'GERANT', 'RECEPTIONNISTE', 'AGENT_LAVERIE', 'AGENT_NETTOYAGE', 'CHAUFFEUR'];

function InlineFieldEditor({
  userId,
  field,
  value: initialValue,
  onSaved,
  title,
}: {
  userId: string;
  field: 'fullName' | 'phone';
  value: string;
  onSaved: () => void;
  title: string;
}) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(initialValue);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    if (!value.trim() || value === initialValue) {
      setEditing(false);
      setValue(initialValue);
      setError(null);
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await api.patch(`/employees/${userId}`, { [field]: value.trim() });
      onSaved();
      setEditing(false);
    } catch (err: any) {
      setError(err?.response?.data?.message ?? "Échec de l'enregistrement.");
    } finally {
      setSaving(false);
    }
  }

  if (editing) {
    return (
      <div>
        <input
          autoFocus
          className="input !w-48 !py-1"
          value={value}
          disabled={saving}
          onChange={(e) => setValue(e.target.value)}
          onBlur={save}
          onKeyDown={(e) => e.key === 'Enter' && save()}
        />
        {error && <p className="mt-1 text-xs text-red-600">{error}</p>}
      </div>
    );
  }

  return (
    <button type="button" onClick={() => setEditing(true)} className="text-left hover:underline" title={title}>
      {initialValue}
    </button>
  );
}

function NewEmployeeForm({ onCreated }: { onCreated: () => void }) {
  const [form, setForm] = useState({ fullName: '', phone: '', password: '', role: 'RECEPTIONNISTE', position: '' });
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
      await api.post('/employees', form);
      setForm({ fullName: '', phone: '', password: '', role: 'RECEPTIONNISTE', position: '' });
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
        <label className="label">Rôle</label>
        <select className="input" value={form.role} onChange={(e) => update('role', e.target.value)}>
          {INTERNAL_ROLES.map((r) => (
            <option key={r} value={r}>
              {ROLE_LABELS[r]}
            </option>
          ))}
        </select>
      </div>
      <div>
        <label className="label">Fonction</label>
        <input className="input" value={form.position} onChange={(e) => update('position', e.target.value)} placeholder="Ex : Agent laverie-pressing" required />
      </div>
      <div className="sm:col-span-2">
        <label className="label">Mot de passe initial</label>
        <input type="password" className="input" minLength={6} value={form.password} onChange={(e) => update('password', e.target.value)} required />
      </div>
      {error && <p className="text-sm text-red-600 sm:col-span-2">{error}</p>}
      <div className="sm:col-span-2">
        <button type="submit" disabled={saving} className="btn-primary disabled:opacity-60">
          {saving ? 'Enregistrement...' : "Ajouter l'employé"}
        </button>
      </div>
    </form>
  );
}

export default function EmployesPage() {
  const [showForm, setShowForm] = useState(false);
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ['employees'],
    queryFn: async () => (await api.get('/employees')).data,
  });

  function refresh() {
    queryClient.invalidateQueries({ queryKey: ['employees'] });
  }

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-brand-blue">Employés</h1>
          <p className="text-sm text-slate-500">{data?.length ?? 0} employé(s)</p>
        </div>
        <button className="btn-primary" onClick={() => setShowForm((v) => !v)}>
          {showForm ? 'Fermer' : '+ Nouvel employé'}
        </button>
      </div>

      {showForm && (
        <NewEmployeeForm
          onCreated={() => {
            setShowForm(false);
            queryClient.invalidateQueries({ queryKey: ['employees'] });
          }}
        />
      )}

      <div className="card overflow-x-auto !p-0">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-4 py-3">Nom</th>
              <th className="px-4 py-3">Téléphone</th>
              <th className="px-4 py-3">Rôle</th>
              <th className="px-4 py-3">Fonction</th>
              <th className="px-4 py-3">Statut</th>
              <th className="px-4 py-3">Depuis</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {isLoading && (
              <tr>
                <td colSpan={6} className="px-4 py-6 text-center text-slate-400">Chargement...</td>
              </tr>
            )}
            {data?.map((u: any) => (
              <tr key={u.id} className="hover:bg-slate-50">
                <td className="px-4 py-3 font-semibold">
                  <InlineFieldEditor userId={u.id} field="fullName" value={u.fullName} onSaved={refresh} title="Modifier le nom" />
                </td>
                <td className="px-4 py-3">
                  <InlineFieldEditor userId={u.id} field="phone" value={u.phone} onSaved={refresh} title="Modifier le téléphone" />
                </td>
                <td className="px-4 py-3">{ROLE_LABELS[u.role?.name] ?? u.role?.name}</td>
                <td className="px-4 py-3">{u.employee?.position}</td>
                <td className="px-4 py-3">
                  <span className={`badge ${u.isActive ? 'bg-green-100 text-green-700' : 'bg-slate-100 text-slate-400'}`}>
                    {u.isActive ? 'Actif' : 'Inactif'}
                  </span>
                </td>
                <td className="px-4 py-3 text-slate-500">{formatDate(u.createdAt)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
