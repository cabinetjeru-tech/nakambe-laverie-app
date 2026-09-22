'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useState } from 'react';
import { ComplaintDetail, ComplaintThread } from '@/components/complaint-thread';
import { Alert, Button, Card, Field, Input, PageHeader, Select, Spinner, StatusBadge, Textarea } from '@/components/ui';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { COMPLAINT_CATEGORIES, COMPLAINT_STATUS, fcfa, phoneDisplay } from '@/lib/format';
import { useApi } from '@/lib/use-api';

export default function AdminComplaintPage() {
  const { id } = useParams<{ id: string }>();
  const { user, can } = useAuth();
  const { data, reload } = useApi<ComplaintDetail>(`/complaints/${id}`, { persist: false });
  const [status, setStatus] = useState('');
  const [resolution, setResolution] = useState('');
  const [refund, setRefund] = useState('');
  const [message, setMessage] = useState<{ tone: 'green' | 'red'; text: string } | null>(null);
  if (!data || !user) return <Spinner />;
  return (
    <div className="space-y-4">
      <PageHeader back="/admin/reclamations" title={`${data.reference} — ${COMPLAINT_CATEGORIES[data.category]}`} subtitle={`${data.user.firstName} ${data.user.lastName} · ${phoneDisplay(data.user.phone)}`} action={<StatusBadge status={data.status} label={COMPLAINT_STATUS[data.status]} />} />
      {data.order && <Link href={`/admin/commandes/${data.order.id}`} className="text-sm text-brand-light">Voir la commande {data.order.reference} →</Link>}
      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <ComplaintThread complaint={data} meId={user.id} staff onChange={reload} />
        </Card>
        <Card className="space-y-3">
          <h2 className="font-semibold text-brand">Traitement</h2>
          {data.refundAmount ? <Alert tone="green">Remboursé : {fcfa(data.refundAmount)}</Alert> : null}
          <Field label="Statut">
            <Select value={status || data.status} onChange={(e) => setStatus(e.target.value)}>
              {Object.entries(COMPLAINT_STATUS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </Select>
          </Field>
          <Field label="Réponse finale (visible par le client)">
            <Textarea rows={3} value={resolution || data.resolution || ''} onChange={(e) => setResolution(e.target.value)} />
          </Field>
          {can('payments.validate') && !data.refundAmount && (
            <Field label="Geste commercial (FCFA, crédité sur le portefeuille)">
              <Input type="number" value={refund} onChange={(e) => setRefund(e.target.value)} />
            </Field>
          )}
          {message && <Alert tone={message.tone}>{message.text}</Alert>}
          <Button
            block
            onClick={async () => {
              setMessage(null);
              try {
                await api(`/admin/complaints/${id}`, { method: 'PATCH', body: { status: status || undefined, resolution: resolution || undefined, refundAmount: refund ? Number(refund) : undefined } });
                setMessage({ tone: 'green', text: 'Réclamation mise à jour ; le client est prévenu.' });
                setRefund('');
                void reload();
              } catch (err) {
                setMessage({ tone: 'red', text: (err as Error).message });
              }
            }}
          >
            Enregistrer
          </Button>
        </Card>
      </div>
    </div>
  );
}
