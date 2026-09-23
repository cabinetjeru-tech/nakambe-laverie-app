'use client';

import { useParams } from 'next/navigation';
import { ComplaintDetail, ComplaintThread } from '@/components/complaint-thread';
import { Alert, Card, PageHeader, Spinner, StatusBadge } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { COMPLAINT_CATEGORIES, COMPLAINT_STATUS, fcfa } from '@/lib/format';
import { useApi } from '@/lib/use-api';

export default function ComplaintPage() {
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();
  const { data, reload } = useApi<ComplaintDetail>(`/complaints/${id}`);
  if (!data || !user) return <Spinner />;
  return (
    <div className="space-y-4">
      <PageHeader back="/reclamations" title={COMPLAINT_CATEGORIES[data.category]} subtitle={`${data.reference}${data.order ? ` · ${data.order.reference}` : ''}`} action={<StatusBadge status={data.status} label={COMPLAINT_STATUS[data.status]} />} />
      {data.resolution && (
        <Alert tone="green">
          {data.resolution}
          {data.refundAmount ? ` — ${fcfa(data.refundAmount)} crédités sur votre portefeuille.` : ''}
        </Alert>
      )}
      <Card>
        <ComplaintThread complaint={data} meId={user.id} onChange={reload} />
      </Card>
    </div>
  );
}
