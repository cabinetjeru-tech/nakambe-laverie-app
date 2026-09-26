'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useState } from 'react';
import { PhotoInput } from '@/components/photo-input';
import { Alert, Button, Card, Field, PageHeader, Select, Spinner, Textarea } from '@/components/ui';
import { api } from '@/lib/api';
import { COMPLAINT_CATEGORIES } from '@/lib/format';

function NewComplaint() {
  const params = useSearchParams();
  const router = useRouter();
  const orderId = params.get('commande') ?? undefined;
  const [category, setCategory] = useState('RETARD');
  const [description, setDescription] = useState('');
  const [photo, setPhoto] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  return (
    <div>
      <PageHeader title="Signaler un problème" back="/reclamations" />
      <Card className="space-y-4">
        <Field label="Type de problème">
          <Select value={category} onChange={(e) => setCategory(e.target.value)}>
            {Object.entries(COMPLAINT_CATEGORIES).map(([k, v]) => (
              <option key={k} value={k}>{v}</option>
            ))}
          </Select>
        </Field>
        <Field label="Décrivez ce qui s’est passé" hint="10 caractères minimum">
          <Textarea rows={4} value={description} maxLength={2000} onChange={(e) => setDescription(e.target.value)} />
        </Field>
        <PhotoInput purpose="COMPLAINT" label="Ajouter une photo (facultatif)" onUploaded={setPhoto} capture={false} />
        <Alert>{error}</Alert>
        <Button
          block
          loading={busy}
          disabled={description.trim().length < 10}
          onClick={async () => {
            setBusy(true);
            setError(null);
            try {
              const c = await api<{ id: string }>('/complaints', { body: { orderId, category, description: description.trim(), attachmentKey: photo ?? undefined } });
              router.replace(`/reclamations/${c.id}`);
            } catch (err) {
              setError((err as Error).message);
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

export default function NewComplaintPage() {
  return (
    <Suspense fallback={<Spinner />}>
      <NewComplaint />
    </Suspense>
  );
}
