'use client';

import { useState } from 'react';
import { ChangeSecretCard } from '@/components/account';
import { PushToggle } from '@/components/pwa';
import { Alert, Button, Card, Input, PageHeader, Spinner } from '@/components/ui';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useApi } from '@/lib/use-api';

interface Setting {
  key: string;
  value: number | string | boolean;
  defaultValue: number | string | boolean;
  description: string;
  isDefault: boolean;
}

export default function SettingsPage() {
  const { can } = useAuth();
  const { data, reload } = useApi<Setting[]>(can('settings.manage') ? '/admin/settings' : null, { persist: false });
  const [values, setValues] = useState<Record<string, string>>({});
  const [message, setMessage] = useState<{ tone: 'green' | 'red'; text: string } | null>(null);

  const save = async (s: Setting, raw: string | boolean) => {
    setMessage(null);
    const value = typeof s.defaultValue === 'number' ? Number(raw) : typeof s.defaultValue === 'boolean' ? raw === true || raw === 'true' : String(raw).trim();
    try {
      await api(`/admin/settings/${s.key}`, { method: 'PUT', body: { value } });
      setMessage({ tone: 'green', text: 'Paramètre enregistré.' });
      setValues((v) => { const { [s.key]: _, ...rest } = v; return rest; });
      void reload();
    } catch (err) {
      setMessage({ tone: 'red', text: (err as Error).message });
    }
  };

  return (
    <div className="space-y-4">
      <PageHeader title="Paramètres" />
      {message && <Alert tone={message.tone}>{message.text}</Alert>}
      {can('settings.manage') && (
        <Card className="divide-y divide-slate-100">
          {!data && <Spinner />}
          {data?.map((s) => (
            <div key={s.key} className="flex flex-col gap-2 py-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0">
                <p className="text-sm font-medium text-slate-800">{s.description}</p>
                <p className="font-mono text-xs text-slate-400">{s.key}{s.isDefault ? ' · valeur par défaut' : ''}</p>
              </div>
              {typeof s.defaultValue === 'boolean' ? (
                <label className="flex items-center gap-2 text-sm">
                  <input type="checkbox" className="h-5 w-5 accent-brand" checked={Boolean(s.value)} onChange={(e) => save(s, e.target.checked)} />
                  {s.value ? 'Oui' : 'Non'}
                </label>
              ) : (
                <div className="flex gap-2">
                  <Input className="w-44" type={typeof s.defaultValue === 'number' ? 'number' : 'text'} step="any" value={values[s.key] ?? String(s.value)} onChange={(e) => setValues({ ...values, [s.key]: e.target.value })} />
                  <Button size="sm" variant="secondary" disabled={values[s.key] === undefined} onClick={() => save(s, values[s.key])}>
                    OK
                  </Button>
                </div>
              )}
            </div>
          ))}
        </Card>
      )}
      <ChangeSecretCard password />
      <Card>
        <h2 className="mb-2 font-semibold text-brand">Alertes sur cet appareil</h2>
        <PushToggle />
      </Card>
    </div>
  );
}
