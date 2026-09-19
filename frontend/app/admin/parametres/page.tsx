'use client';

import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';

const FIELDS: { key: string; label: string }[] = [
  { key: 'company_name', label: "Nom de l'entreprise" },
  { key: 'company_slogan', label: 'Slogan' },
  { key: 'company_address', label: 'Adresse du siège' },
  { key: 'company_phone_1', label: 'Téléphone 1' },
  { key: 'company_phone_2', label: 'Téléphone 2' },
  { key: 'opening_hours', label: "Horaires d'ouverture" },
];

export default function ParametresPage() {
  const { data, isLoading } = useQuery({
    queryKey: ['settings'],
    queryFn: async () => (await api.get('/settings')).data,
  });

  const [values, setValues] = useState<Record<string, string>>({});
  const [saved, setSaved] = useState<string | null>(null);

  useEffect(() => {
    if (data) setValues(data);
  }, [data]);

  async function saveField(key: string) {
    await api.put(`/settings/${key}`, { value: values[key] ?? '' });
    setSaved(key);
    setTimeout(() => setSaved(null), 1500);
  }

  if (isLoading) return <p className="text-slate-400">Chargement...</p>;

  return (
    <div className="max-w-2xl">
      <h1 className="text-2xl font-bold text-brand-blue">Paramètres de l&apos;entreprise</h1>
      <p className="mb-6 text-sm text-slate-500">
        Ces informations apparaissent sur les devis, factures et la page d&apos;accueil.
      </p>

      <div className="card flex flex-col gap-4">
        {FIELDS.map((field) => (
          <div key={field.key}>
            <label className="label">{field.label}</label>
            <div className="flex gap-2">
              <input
                className="input"
                value={values[field.key] ?? ''}
                onChange={(e) => setValues((v) => ({ ...v, [field.key]: e.target.value }))}
              />
              <button onClick={() => saveField(field.key)} className="btn-secondary !px-4 !py-2 text-sm shrink-0">
                {saved === field.key ? '✓ Enregistré' : 'Enregistrer'}
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
