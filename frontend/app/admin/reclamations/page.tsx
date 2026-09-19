'use client';

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { formatDate } from '@/lib/format';

const COMPLAINT_STATUS_LABELS: Record<string, string> = {
  NOUVELLE: 'Nouvelle',
  EN_COURS: 'En cours',
  TRAITEE: 'Traitée',
  CLOTUREE: 'Clôturée',
};

export default function ReclamationsPage() {
  const queryClient = useQueryClient();

  const { data: complaints, isLoading } = useQuery({
    queryKey: ['complaints'],
    queryFn: async () => (await api.get('/complaints')).data,
  });

  const { data: reviews } = useQuery({
    queryKey: ['reviews'],
    queryFn: async () => (await api.get('/reviews')).data,
  });

  async function updateStatus(id: string, status: string) {
    await api.patch(`/complaints/${id}`, { status });
    queryClient.invalidateQueries({ queryKey: ['complaints'] });
  }

  return (
    <div className="flex flex-col gap-10">
      <div>
        <h1 className="text-2xl font-bold text-brand-blue">Réclamations</h1>
        <p className="mb-4 text-sm text-slate-500">{complaints?.length ?? 0} réclamation(s)</p>
        <div className="flex flex-col gap-3">
          {isLoading && <p className="text-slate-400">Chargement...</p>}
          {complaints?.map((c: any) => (
            <div key={c.id} className="card">
              <div className="flex items-start justify-between">
                <div>
                  <div className="font-semibold text-brand-blue">{c.subject}</div>
                  <div className="text-xs text-slate-500">
                    {c.client?.fullName} · {formatDate(c.createdAt)} · {c.complaintNumber}
                  </div>
                  <p className="mt-2 text-sm text-slate-700">{c.description}</p>
                </div>
                <select
                  className="input !w-40 !py-1.5 text-xs"
                  value={c.status}
                  onChange={(e) => updateStatus(c.id, e.target.value)}
                >
                  {Object.entries(COMPLAINT_STATUS_LABELS).map(([k, l]) => (
                    <option key={k} value={k}>
                      {l}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          ))}
          {complaints?.length === 0 && <p className="text-slate-400">Aucune réclamation.</p>}
        </div>
      </div>

      <div>
        <h2 className="text-xl font-bold text-brand-blue">Avis clients</h2>
        <div className="mt-4 flex flex-col gap-3">
          {reviews?.map((r: any) => (
            <div key={r.id} className="card">
              <div className="flex items-center justify-between">
                <div className="font-semibold">{r.client?.fullName}</div>
                <div className="text-brand-gold">{'★'.repeat(r.rating)}{'☆'.repeat(5 - r.rating)}</div>
              </div>
              {r.comment && <p className="mt-1 text-sm text-slate-600">{r.comment}</p>}
              <div className="mt-1 text-xs text-slate-400">{formatDate(r.createdAt)}</div>
            </div>
          ))}
          {reviews?.length === 0 && <p className="text-slate-400">Aucun avis pour le moment.</p>}
        </div>
      </div>
    </div>
  );
}
