'use client';

import { useState } from 'react';
import { CityFilter } from '@/components/admin/city-filter';
import { Alert, Button, Card, Field, Input, PageHeader, Select, Textarea } from '@/components/ui';
import { api } from '@/lib/api';

export default function BroadcastPage() {
  const [audience, setAudience] = useState('CLIENTS');
  const [cityId, setCityId] = useState('');
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ tone: 'green' | 'red'; text: string } | null>(null);
  return (
    <div className="max-w-xl space-y-4">
      <PageHeader title="Notifications" subtitle="Message envoyé dans l’application et en notification push à ceux qui l’ont activée." />
      <Card className="space-y-3">
        <div className="flex flex-wrap gap-2">
          <Select className="w-auto" value={audience} onChange={(e) => setAudience(e.target.value)}>
            <option value="CLIENTS">Clients</option>
            <option value="DRIVERS">Livreurs</option>
            <option value="ALL">Clients et livreurs</option>
          </Select>
          <CityFilter value={cityId} onChange={setCityId} />
        </div>
        <Field label="Titre"><Input value={title} maxLength={80} onChange={(e) => setTitle(e.target.value)} placeholder="Ex. -20 % ce week-end !" /></Field>
        <Field label="Message"><Textarea rows={3} value={body} maxLength={300} onChange={(e) => setBody(e.target.value)} /></Field>
        {message && <Alert tone={message.tone}>{message.text}</Alert>}
        <Button
          loading={busy}
          disabled={title.trim().length < 2 || body.trim().length < 2}
          onClick={async () => {
            if (!confirm('Envoyer ce message maintenant ?')) return;
            setBusy(true);
            setMessage(null);
            try {
              const res = await api<{ recipients: number }>('/admin/notifications/broadcast', { body: { audience, cityId: cityId || undefined, title, body } });
              setMessage({ tone: 'green', text: `Message envoyé à ${res.recipients} personne(s).` });
              setTitle('');
              setBody('');
            } catch (err) {
              setMessage({ tone: 'red', text: (err as Error).message });
            } finally {
              setBusy(false);
            }
          }}
        >
          Envoyer
        </Button>
      </Card>
    </div>
  );
}
