'use client';

import { useState } from 'react';
import { useParams } from 'next/navigation';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api, openAuthenticatedPdf } from '@/lib/api';
import { formatDateTime, formatFcfa, whatsappLink } from '@/lib/format';
import { COMPANY, ORDER_STATUS_LABELS, ORDER_STATUS_SEQUENCE, SERVICE_DOMAIN_LABELS } from '@/lib/constants';

const PAYMENT_METHODS: Record<string, string> = {
  ESPECES: 'Espèces',
  ORANGE_MONEY: 'Orange Money',
  MOOV_MONEY: 'Moov Money',
  VIREMENT: 'Virement',
  PAIEMENT_ULTERIEUR: 'Paiement ultérieur',
};

export default function CommandeDetailPage() {
  const { id } = useParams<{ id: string }>();
  const queryClient = useQueryClient();

  const { data: order, isLoading } = useQuery({
    queryKey: ['order', id],
    queryFn: async () => (await api.get(`/orders/${id}`)).data,
  });

  const { data: employees } = useQuery({
    queryKey: ['employees-for-assign'],
    queryFn: async () => (await api.get('/employees')).data,
  });

  const { data: vehicles } = useQuery({
    queryKey: ['vehicles-for-assign'],
    queryFn: async () => (await api.get('/vehicles')).data,
  });

  const [nextStatus, setNextStatus] = useState('');
  const [comment, setComment] = useState('');
  const [statusSaving, setStatusSaving] = useState(false);

  const [paymentAmount, setPaymentAmount] = useState(0);
  const [paymentMethod, setPaymentMethod] = useState('ESPECES');
  const [paymentRef, setPaymentRef] = useState('');
  const [paymentSaving, setPaymentSaving] = useState(false);

  const [invoiceGenerating, setInvoiceGenerating] = useState(false);

  async function refresh() {
    await queryClient.invalidateQueries({ queryKey: ['order', id] });
  }

  async function handleStatusUpdate() {
    if (!nextStatus) return;
    setStatusSaving(true);
    try {
      await api.patch(`/orders/${id}/status`, { status: nextStatus, comment: comment || undefined });
      setComment('');
      setNextStatus('');
      await refresh();
    } finally {
      setStatusSaving(false);
    }
  }

  async function handleAssign(field: 'assignedAgentId' | 'driverId' | 'vehicleId', value: string) {
    await api.patch(`/orders/${id}/assign`, { [field]: value || null });
    await refresh();
  }

  async function handlePayment(e: React.FormEvent) {
    e.preventDefault();
    setPaymentSaving(true);
    try {
      await api.post('/payments', {
        orderId: id,
        amount: paymentAmount,
        method: paymentMethod,
        transactionRef: paymentRef || undefined,
      });
      setPaymentAmount(0);
      setPaymentRef('');
      await refresh();
    } finally {
      setPaymentSaving(false);
    }
  }

  async function handleGenerateInvoice() {
    setInvoiceGenerating(true);
    try {
      await api.post(`/invoices/from-order/${id}`);
      await refresh();
    } finally {
      setInvoiceGenerating(false);
    }
  }

  if (isLoading || !order) return <p className="text-slate-400">Chargement...</p>;

  const agents = employees?.filter((e: any) => ['AGENT_LAVERIE', 'AGENT_NETTOYAGE'].includes(e.role?.name));
  const drivers = employees?.filter((e: any) => e.role?.name === 'CHAUFFEUR');
  const balanceDue = Number(order.total) - Number(order.amountPaid);

  return (
    <div className="grid gap-6 lg:grid-cols-3">
      <div className="lg:col-span-2 flex flex-col gap-6">
        <div className="card">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h1 className="text-xl font-bold text-brand-blue">{order.orderNumber}</h1>
              <p className="text-sm text-slate-500">
                {SERVICE_DOMAIN_LABELS[order.domain] ?? order.domain} · {order.client?.fullName} ({order.client?.phone})
              </p>
            </div>
            <span className="badge bg-brand-gold-light text-brand-blue-dark">
              {ORDER_STATUS_LABELS[order.status] ?? order.status}
            </span>
          </div>

          <div className="mt-4 flex gap-2">
            <a
              href={whatsappLink(order.client?.whatsapp ?? order.client?.phone, `Bonjour, votre commande ${order.orderNumber} est en cours de traitement chez ${COMPANY.name}.`)}
              target="_blank"
              rel="noreferrer"
              className="btn-secondary !px-3 !py-1.5 text-xs"
            >
              💬 Contacter le client
            </a>
          </div>

          <table className="mt-5 w-full text-sm">
            <thead className="text-left text-xs uppercase text-slate-400">
              <tr>
                <th className="py-1">Article</th>
                <th className="py-1">Qté</th>
                <th className="py-1">P.U.</th>
                <th className="py-1 text-right">Total</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {order.items?.map((i: any) => (
                <tr key={i.id}>
                  <td className="py-1.5">{i.label}</td>
                  <td className="py-1.5">{i.quantity}</td>
                  <td className="py-1.5">{formatFcfa(i.unitPrice)}</td>
                  <td className="py-1.5 text-right">{formatFcfa(i.total)}</td>
                </tr>
              ))}
            </tbody>
          </table>

          <div className="mt-4 ml-auto w-full max-w-xs space-y-1 text-sm">
            <div className="flex justify-between"><span className="text-slate-500">Sous-total</span><span>{formatFcfa(order.subtotal)}</span></div>
            {Number(order.discount) > 0 && <div className="flex justify-between"><span className="text-slate-500">Réduction</span><span>-{formatFcfa(order.discount)}</span></div>}
            {Number(order.travelFee) > 0 && <div className="flex justify-between"><span className="text-slate-500">Déplacement</span><span>{formatFcfa(order.travelFee)}</span></div>}
            <div className="flex justify-between font-bold text-brand-blue"><span>Total</span><span>{formatFcfa(order.total)}</span></div>
            <div className="flex justify-between"><span className="text-slate-500">Payé</span><span>{formatFcfa(order.amountPaid)}</span></div>
            <div className="flex justify-between font-semibold text-red-600"><span>Reste à payer</span><span>{formatFcfa(balanceDue)}</span></div>
          </div>
        </div>

        <div className="card">
          <h3 className="mb-3 text-sm font-bold uppercase text-slate-500">Historique du traitement</h3>
          <ol className="space-y-2">
            {order.statusHistory?.map((h: any) => (
              <li key={h.id} className="flex items-center justify-between text-sm">
                <span>{ORDER_STATUS_LABELS[h.status] ?? h.status}{h.comment ? ` — ${h.comment}` : ''}</span>
                <span className="text-xs text-slate-400">{formatDateTime(h.createdAt)}</span>
              </li>
            ))}
          </ol>

          <div className="mt-4 flex flex-wrap items-end gap-2 border-t border-slate-100 pt-4">
            <div className="flex-1 min-w-[160px]">
              <label className="label">Changer le statut</label>
              <select className="input" value={nextStatus} onChange={(e) => setNextStatus(e.target.value)}>
                <option value="">— Choisir —</option>
                {ORDER_STATUS_SEQUENCE.map((s) => (
                  <option key={s} value={s}>
                    {ORDER_STATUS_LABELS[s]}
                  </option>
                ))}
                <option value="ANNULE">Annulé</option>
              </select>
            </div>
            <div className="flex-1 min-w-[160px]">
              <label className="label">Commentaire</label>
              <input className="input" value={comment} onChange={(e) => setComment(e.target.value)} />
            </div>
            <button onClick={handleStatusUpdate} disabled={!nextStatus || statusSaving} className="btn-primary !py-2.5 disabled:opacity-60">
              Mettre à jour
            </button>
          </div>
        </div>

        <div className="card">
          <h3 className="mb-3 text-sm font-bold uppercase text-slate-500">Enregistrer un paiement</h3>
          <form onSubmit={handlePayment} className="grid gap-3 sm:grid-cols-4">
            <input
              type="number"
              min={1}
              className="input"
              placeholder="Montant"
              value={paymentAmount || ''}
              onChange={(e) => setPaymentAmount(Number(e.target.value))}
              required
            />
            <select className="input" value={paymentMethod} onChange={(e) => setPaymentMethod(e.target.value)}>
              {Object.entries(PAYMENT_METHODS).map(([k, l]) => (
                <option key={k} value={k}>
                  {l}
                </option>
              ))}
            </select>
            <input
              className="input"
              placeholder="Référence (Mobile Money)"
              value={paymentRef}
              onChange={(e) => setPaymentRef(e.target.value)}
            />
            <button type="submit" disabled={paymentSaving} className="btn-primary disabled:opacity-60">
              Encaisser
            </button>
          </form>
        </div>
      </div>

      <div className="flex flex-col gap-6">
        <div className="card">
          <h3 className="mb-3 text-sm font-bold uppercase text-slate-500">Affectation</h3>
          <label className="label">Agent</label>
          <select
            className="input"
            defaultValue={order.assignedAgent?.id ?? ''}
            onChange={(e) => handleAssign('assignedAgentId', e.target.value)}
          >
            <option value="">— Aucun —</option>
            {agents?.map((a: any) => (
              <option key={a.id} value={a.id}>
                {a.fullName}
              </option>
            ))}
          </select>

          <label className="label mt-3">Chauffeur</label>
          <select
            className="input"
            defaultValue={order.driver?.id ?? ''}
            onChange={(e) => handleAssign('driverId', e.target.value)}
          >
            <option value="">— Aucun —</option>
            {drivers?.map((d: any) => (
              <option key={d.id} value={d.id}>
                {d.fullName}
              </option>
            ))}
          </select>

          <label className="label mt-3">Véhicule</label>
          <select
            className="input"
            defaultValue={order.vehicle?.id ?? ''}
            onChange={(e) => handleAssign('vehicleId', e.target.value)}
          >
            <option value="">— Aucun —</option>
            {vehicles?.map((v: any) => (
              <option key={v.id} value={v.id}>
                {v.label}
              </option>
            ))}
          </select>
        </div>

        <div className="card">
          <h3 className="mb-3 text-sm font-bold uppercase text-slate-500">Facture</h3>
          {order.invoice ? (
            <button className="btn-secondary w-full" onClick={() => openAuthenticatedPdf(`/invoices/${order.invoice.id}/pdf`)}>
              📄 Voir la facture {order.invoice.invoiceNumber}
            </button>
          ) : (
            <button onClick={handleGenerateInvoice} disabled={invoiceGenerating} className="btn-primary w-full disabled:opacity-60">
              {invoiceGenerating ? 'Génération...' : 'Générer la facture'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
