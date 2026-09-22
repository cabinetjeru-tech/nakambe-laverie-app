'use client';

import { FormEvent, useState } from 'react';
import { api } from '@/lib/api';
import { Alert, Button, Card, Field, Input } from './ui';

export function ChangeSecretCard({ password }: { password?: boolean }) {
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [message, setMessage] = useState<{ tone: 'green' | 'red'; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setMessage(null);
    try {
      await api('/auth/change-secret', { body: { currentSecret: current, newSecret: next } });
      setMessage({ tone: 'green', text: 'Modifié. Vos autres appareils devront se reconnecter.' });
      setCurrent('');
      setNext('');
    } catch (err) {
      setMessage({ tone: 'red', text: (err as Error).message });
    } finally {
      setBusy(false);
    }
  };
  return (
    <Card>
      <form onSubmit={submit} className="space-y-3">
        <h2 className="font-semibold text-brand">{password ? 'Changer mon mot de passe' : 'Changer mon code secret'}</h2>
        <div className="grid grid-cols-2 gap-2">
          <Field label="Actuel">
            <Input type="password" inputMode={password ? 'text' : 'numeric'} value={current} onChange={(e) => setCurrent(e.target.value)} required />
          </Field>
          <Field label="Nouveau">
            <Input type="password" inputMode={password ? 'text' : 'numeric'} value={next} onChange={(e) => setNext(e.target.value)} required />
          </Field>
        </div>
        {message && <Alert tone={message.tone}>{message.text}</Alert>}
        <Button type="submit" variant="secondary" loading={busy}>
          Enregistrer
        </Button>
      </form>
    </Card>
  );
}

