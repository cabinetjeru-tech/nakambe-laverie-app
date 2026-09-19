'use client';

import { useRouter } from 'next/navigation';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { formatDateTime } from '@/lib/format';
import { SERVICE_DOMAIN_LABELS } from '@/lib/constants';

const APPOINTMENT_STATUS_LABELS: Record<string, string> = {
  DEMANDE: 'Demande',
  CONFIRME: 'Confirmé',
  REPROGRAMME: 'Reprogrammé',
  ANNULE: 'Annulé',
  CONVERTI: 'Converti en commande',
};

export default function RendezVousPage() {
  const router = useRouter();
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ['appointments'],
    queryFn: async () => (await api.get('/appointments')).data,
  });

  async function updateStatus(id: string, status: string) {
    await api.patch(`/appointments/${id}/status`, { status });
    queryClient.invalidateQueries({ queryKey: ['appointments'] });
  }

  function convertToOrder(a: any) {
    const params = new URLSearchParams({
      appointmentId: a.id,
      clientId: a.client.id,
      clientLabel: `${a.client.fullName} — ${a.client.phone}`,
      domain: a.domain,
      address: a.address ?? '',
    });
    router.push(`/admin/commandes/nouvelle?${params.toString()}`);
  }

  return (
    <div>
      <h1 className="text-2xl font-bold text-brand-blue">Rendez-vous</h1>
      <p className="text-sm text-slate-500">Demandes de rendez-vous des clients.</p>

      <div className="mt-6 card overflow-x-auto !p-0">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-4 py-3">Client</th>
              <th className="px-4 py-3">Service</th>
              <th className="px-4 py-3">Mode</th>
              <th className="px-4 py-3">Date souhaitée</th>
              <th className="px-4 py-3">Statut</th>
              <th className="px-4 py-3">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {isLoading && (
              <tr>
                <td colSpan={6} className="px-4 py-6 text-center text-slate-400">Chargement...</td>
              </tr>
            )}
            {data?.map((a: any) => (
              <tr key={a.id} className="hover:bg-slate-50">
                <td className="px-4 py-3">
                  <div className="font-semibold">{a.client?.fullName}</div>
                  <div className="text-xs text-slate-400">{a.client?.phone}</div>
                </td>
                <td className="px-4 py-3">{SERVICE_DOMAIN_LABELS[a.domain] ?? a.domain}</td>
                <td className="px-4 py-3">{a.mode === 'A_DOMICILE' ? 'À domicile' : 'Au siège'}</td>
                <td className="px-4 py-3">{formatDateTime(a.scheduledDate)}</td>
                <td className="px-4 py-3">
                  <span className="badge bg-slate-100 text-slate-600">{APPOINTMENT_STATUS_LABELS[a.status] ?? a.status}</span>
                </td>
                <td className="px-4 py-3">
                  <div className="flex flex-wrap gap-2">
                    {a.status === 'DEMANDE' && (
                      <button onClick={() => updateStatus(a.id, 'CONFIRME')} className="text-xs font-semibold text-brand-blue">
                        Confirmer
                      </button>
                    )}
                    {a.status !== 'ANNULE' && a.status !== 'CONVERTI' && (
                      <>
                        <button onClick={() => convertToOrder(a)} className="text-xs font-semibold text-brand-green">
                          → Créer la commande
                        </button>
                        <button onClick={() => updateStatus(a.id, 'ANNULE')} className="text-xs font-semibold text-red-500">
                          Annuler
                        </button>
                      </>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
