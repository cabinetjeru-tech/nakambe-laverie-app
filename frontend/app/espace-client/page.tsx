'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { SiteHeader } from '@/components/site-header';
import { SiteFooter } from '@/components/site-footer';
import { useRequireAuth } from '@/lib/use-require-auth';
import { api, openAuthenticatedPdf } from '@/lib/api';
import { formatDate, formatDateTime, formatFcfa } from '@/lib/format';
import {
  APPOINTMENT_STATUS_LABELS,
  CLIENT_TYPE_LABELS,
  COMPANY,
  COMPLAINT_STATUS_LABELS,
  ORDER_STATUS_LABELS,
  PAYMENT_TIMING_LABELS,
  SERVICE_DOMAIN_LABELS,
} from '@/lib/constants';

export default function EspaceClientPage() {
  const { user, loading } = useRequireAuth(['CLIENT']);
  const queryClient = useQueryClient();
  const [payingId, setPayingId] = useState<string | null>(null);
  const [payError, setPayError] = useState<string | null>(null);
  const [showNotifications, setShowNotifications] = useState(false);
  const [showComplaintForm, setShowComplaintForm] = useState(false);
  const [complaintSubject, setComplaintSubject] = useState('');
  const [complaintDescription, setComplaintDescription] = useState('');
  const [complaintError, setComplaintError] = useState<string | null>(null);
  const [complaintSubmitting, setComplaintSubmitting] = useState(false);

  const clientQuery = useQuery({
    queryKey: ['mon-profil'],
    queryFn: async () => (await api.get('/clients/mine')).data,
    enabled: !!user,
  });
  const ordersQuery = useQuery({
    queryKey: ['mes-commandes'],
    queryFn: async () => (await api.get('/orders/mine')).data,
    enabled: !!user,
  });
  const appointmentsQuery = useQuery({
    queryKey: ['mes-rdv'],
    queryFn: async () => (await api.get('/appointments/mine')).data,
    enabled: !!user,
  });
  const quotesQuery = useQuery({
    queryKey: ['mes-devis'],
    queryFn: async () => (await api.get('/quotes/mine')).data,
    enabled: !!user,
  });
  const invoicesQuery = useQuery({
    queryKey: ['mes-factures'],
    queryFn: async () => (await api.get('/invoices/mine')).data,
    enabled: !!user,
  });
  const notificationsQuery = useQuery({
    queryKey: ['mes-notifications'],
    queryFn: async () => (await api.get('/notifications/mine')).data,
    enabled: !!user,
  });

  async function payNow(type: 'quotes' | 'invoices', id: string) {
    setPayingId(id);
    setPayError(null);
    try {
      const { data } = await api.post(`/online-payments/${type}/${id}/pay`);
      window.location.href = data.paymentUrl;
    } catch (err: any) {
      setPayError(err?.response?.data?.message ?? 'Paiement indisponible pour le moment. Réessayez plus tard.');
      setPayingId(null);
    }
  }

  async function markNotificationRead(id: string) {
    await api.patch(`/notifications/${id}/read`);
    queryClient.invalidateQueries({ queryKey: ['mes-notifications'] });
  }

  async function submitComplaint(e: React.FormEvent) {
    e.preventDefault();
    setComplaintError(null);
    setComplaintSubmitting(true);
    try {
      await api.post('/complaints', { subject: complaintSubject, description: complaintDescription });
      setComplaintSubject('');
      setComplaintDescription('');
      setShowComplaintForm(false);
      queryClient.invalidateQueries({ queryKey: ['mon-profil'] });
    } catch (err: any) {
      setComplaintError(err?.response?.data?.message ?? "Impossible d'envoyer votre message. Réessayez.");
    } finally {
      setComplaintSubmitting(false);
    }
  }

  if (loading || !user) return <p className="p-10 text-center text-slate-400">Chargement...</p>;

  const client = clientQuery.data;
  const unreadCount = (notificationsQuery.data ?? []).filter((n: any) => !n.isRead).length;
  const isB2B = client && client.type !== 'PARTICULIER';

  return (
    <div className="min-h-screen">
      <SiteHeader />
      <div className="mx-auto max-w-4xl px-4 py-10">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold text-brand-blue">Bonjour {user.fullName.split(' ')[0]} 👋</h1>
            <p className="text-sm text-slate-500">Voici le suivi de vos prestations {COMPANY.name}.</p>
          </div>
          <div className="flex items-center gap-2">
            {client && (
              <span className="badge bg-brand-gold-light text-brand-blue-dark">🏆 {client.loyaltyPoints} pts fidélité</span>
            )}
            <button
              type="button"
              onClick={() => setShowNotifications((v) => !v)}
              className="relative rounded-full border border-slate-200 p-2 text-lg"
              aria-label="Notifications"
            >
              🔔
              {unreadCount > 0 && (
                <span className="absolute -right-1 -top-1 flex h-5 w-5 items-center justify-center rounded-full bg-red-600 text-[10px] font-bold text-white">
                  {unreadCount}
                </span>
              )}
            </button>
            <Link href="/nouvelle-demande" className="btn-primary !px-4 !py-2 text-sm">
              + Nouvelle demande
            </Link>
          </div>
        </div>

        {showNotifications && (
          <div className="card mt-3 max-h-80 overflow-y-auto">
            {notificationsQuery.data?.length ? (
              <div className="flex flex-col divide-y divide-slate-100">
                {notificationsQuery.data.map((n: any) => (
                  <button
                    key={n.id}
                    type="button"
                    onClick={() => !n.isRead && markNotificationRead(n.id)}
                    className={`flex flex-col gap-0.5 px-1 py-2 text-left ${n.isRead ? 'opacity-60' : ''}`}
                  >
                    <span className="text-sm font-semibold text-brand-blue">{n.title}</span>
                    <span className="text-xs text-slate-600">{n.message}</span>
                    <span className="text-[10px] text-slate-400">{formatDateTime(n.createdAt)}</span>
                  </button>
                ))}
              </div>
            ) : (
              <p className="text-sm text-slate-400">Aucune notification.</p>
            )}
          </div>
        )}

        {isB2B && (
          <section className="mt-8">
            <h2 className="mb-3 text-lg font-bold text-slate-800">
              Mon compte {CLIENT_TYPE_LABELS[client.type] ?? client.type}
              {client.companyName ? ` — ${client.companyName}` : ''}
            </h2>
            <div className="flex flex-col gap-3">
              {client.contracts?.filter((c: any) => c.status === 'ACTIF').map((c: any) => (
                <div key={c.id} className="card">
                  <div className="flex items-center justify-between">
                    <div className="font-semibold text-brand-blue">{c.title}</div>
                    <span className="badge bg-brand-gold-light text-brand-blue-dark">{formatFcfa(c.price)}</span>
                  </div>
                  {c.frequency && <div className="text-xs text-slate-500">Fréquence : {c.frequency}</div>}
                  {c.endDate && <div className="text-xs text-slate-500">Échéance : {formatDate(c.endDate)}</div>}
                </div>
              ))}
              {client.subscriptions?.filter((s: any) => s.status === 'ACTIF').map((s: any) => (
                <div key={s.id} className="card">
                  <div className="flex items-center justify-between">
                    <div className="font-semibold text-brand-blue">{s.planName}</div>
                    <span className="badge bg-brand-gold-light text-brand-blue-dark">{formatFcfa(s.price)}/mois</span>
                  </div>
                  {s.quotaPerMonth && <div className="text-xs text-slate-500">Quota : {s.quotaPerMonth}/mois</div>}
                </div>
              ))}
              {!client.contracts?.some((c: any) => c.status === 'ACTIF') && !client.subscriptions?.some((s: any) => s.status === 'ACTIF') && (
                <p className="text-sm text-slate-400">Aucun contrat ou abonnement actif pour le moment.</p>
              )}
            </div>
          </section>
        )}

        <section className="mt-8">
          <h2 className="mb-3 text-lg font-bold text-slate-800">Mes demandes récentes</h2>
          <div className="flex flex-col gap-3">
            {appointmentsQuery.data?.length ? (
              appointmentsQuery.data.map((a: any) => (
                <div key={a.id} className="card flex items-center justify-between">
                  <div>
                    <div className="font-semibold text-brand-blue">
                      {SERVICE_DOMAIN_LABELS[a.domain] ?? a.domain}
                    </div>
                    <div className="text-xs text-slate-500">{formatDateTime(a.scheduledDate)}</div>
                    {a.address && <div className="text-xs text-slate-400">📍 {a.address}</div>}
                    <div className="text-xs text-slate-400">{PAYMENT_TIMING_LABELS[a.paymentTiming] ?? a.paymentTiming}</div>
                  </div>
                  <span
                    className={`badge ${
                      a.status === 'DEMANDE'
                        ? 'bg-brand-gold-light text-brand-blue-dark'
                        : a.status === 'ANNULE'
                          ? 'bg-red-100 text-red-700'
                          : 'bg-slate-100 text-slate-600'
                    }`}
                  >
                    {a.status === 'DEMANDE' ? '🕓 En attente de confirmation' : (APPOINTMENT_STATUS_LABELS[a.status] ?? a.status)}
                  </span>
                </div>
              ))
            ) : (
              <p className="text-sm text-slate-400">Aucune demande pour le moment.</p>
            )}
          </div>
        </section>

        <section className="mt-8">
          <h2 className="mb-3 text-lg font-bold text-slate-800">Mes commandes</h2>
          <div className="flex flex-col gap-3">
            {ordersQuery.data?.length ? (
              ordersQuery.data.map((o: any) => (
                <Link
                  key={o.id}
                  href={`/espace-client/commandes/${o.id}`}
                  className="card flex items-center justify-between hover:shadow-md"
                >
                  <div>
                    <div className="font-semibold text-brand-blue">{o.orderNumber}</div>
                    <div className="text-xs text-slate-500">
                      {SERVICE_DOMAIN_LABELS[o.domain] ?? o.domain} — {formatDate(o.createdAt)}
                    </div>
                    {o.address && <div className="text-xs text-slate-400">📍 {o.address}</div>}
                  </div>
                  <div className="text-right">
                    <span className="badge bg-brand-gold-light text-brand-blue-dark">
                      {ORDER_STATUS_LABELS[o.status] ?? o.status}
                    </span>
                    <div className="mt-1 text-sm font-semibold">{formatFcfa(o.total)}</div>
                    {Number(o.amountPaid) > 0 && Number(o.amountPaid) < Number(o.total) && (
                      <div className="text-xs text-brand-gold">Payé : {formatFcfa(o.amountPaid)}</div>
                    )}
                  </div>
                </Link>
              ))
            ) : (
              <p className="text-sm text-slate-400">Aucune commande pour le moment.</p>
            )}
          </div>
        </section>

        <section className="mt-8">
          <h2 className="mb-3 text-lg font-bold text-slate-800">Mes devis</h2>
          <div className="flex flex-col gap-3">
            {quotesQuery.data?.length ? (
              quotesQuery.data.map((q: any) => (
                <div key={q.id} className="card flex items-center justify-between">
                  <div>
                    <div className="font-semibold text-brand-blue">{q.quoteNumber}</div>
                    <div className="text-xs text-slate-500">{formatDate(q.createdAt)}</div>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="text-sm font-semibold">{formatFcfa(q.total)}</div>
                    <button
                      type="button"
                      className="text-sm font-semibold text-brand-blue underline"
                      onClick={() => openAuthenticatedPdf(`/quotes/${q.id}/pdf`)}
                    >
                      PDF
                    </button>
                    {q.status !== 'ACCEPTE' && q.status !== 'REFUSE' && q.status !== 'EXPIRE' && (
                      <button
                        type="button"
                        disabled={payingId === q.id}
                        className="btn-primary !px-3 !py-1.5 text-xs disabled:opacity-60"
                        onClick={() => payNow('quotes', q.id)}
                      >
                        {payingId === q.id ? '...' : 'Payer'}
                      </button>
                    )}
                  </div>
                </div>
              ))
            ) : (
              <p className="text-sm text-slate-400">Aucun devis pour le moment.</p>
            )}
            {payError && <p className="text-sm text-red-600">{payError}</p>}
          </div>
        </section>

        <section className="mt-8">
          <h2 className="mb-3 text-lg font-bold text-slate-800">Mes factures</h2>
          <div className="flex flex-col gap-3">
            {invoicesQuery.data?.length ? (
              invoicesQuery.data.map((inv: any) => (
                <div key={inv.id} className="card flex items-center justify-between">
                  <div>
                    <div className="font-semibold text-brand-blue">{inv.invoiceNumber}</div>
                    <div className="text-xs text-slate-500">{formatDate(inv.createdAt)}</div>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="badge bg-brand-gold-light text-brand-blue-dark">{inv.status}</span>
                    <button
                      type="button"
                      className="text-sm font-semibold text-brand-blue underline"
                      onClick={() => openAuthenticatedPdf(`/invoices/${inv.id}/pdf`)}
                    >
                      PDF
                    </button>
                    {inv.status !== 'PAYEE' && inv.status !== 'ANNULEE' && (
                      <button
                        type="button"
                        disabled={payingId === inv.id}
                        className="btn-primary !px-3 !py-1.5 text-xs disabled:opacity-60"
                        onClick={() => payNow('invoices', inv.id)}
                      >
                        {payingId === inv.id ? '...' : 'Payer'}
                      </button>
                    )}
                  </div>
                </div>
              ))
            ) : (
              <p className="text-sm text-slate-400">Aucune facture pour le moment.</p>
            )}
          </div>
        </section>

        <section className="mt-8 mb-16">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-lg font-bold text-slate-800">Mes réclamations</h2>
            <button
              type="button"
              onClick={() => setShowComplaintForm((v) => !v)}
              className="text-sm font-semibold text-brand-blue underline"
            >
              {showComplaintForm ? 'Annuler' : 'Signaler un problème'}
            </button>
          </div>

          {showComplaintForm && (
            <form onSubmit={submitComplaint} className="card mb-3 flex flex-col gap-3">
              <input
                className="input"
                placeholder="Sujet (ex : article manquant, retard...)"
                value={complaintSubject}
                onChange={(e) => setComplaintSubject(e.target.value)}
                required
              />
              <textarea
                className="input"
                rows={3}
                placeholder="Décrivez le problème rencontré"
                value={complaintDescription}
                onChange={(e) => setComplaintDescription(e.target.value)}
                required
              />
              {complaintError && <p className="text-sm text-red-600">{complaintError}</p>}
              <button type="submit" disabled={complaintSubmitting} className="btn-primary disabled:opacity-60">
                {complaintSubmitting ? 'Envoi...' : 'Envoyer'}
              </button>
            </form>
          )}

          <div className="flex flex-col gap-3">
            {client?.complaints?.length ? (
              client.complaints.map((c: any) => (
                <div key={c.id} className="card">
                  <div className="flex items-center justify-between">
                    <div className="font-semibold text-brand-blue">{c.subject}</div>
                    <span className="badge bg-slate-100 text-slate-600">
                      {COMPLAINT_STATUS_LABELS[c.status] ?? c.status}
                    </span>
                  </div>
                  <p className="mt-1 text-sm text-slate-600">{c.description}</p>
                  {c.resolution && (
                    <p className="mt-2 text-sm text-brand-blue">
                      <strong>Réponse :</strong> {c.resolution}
                    </p>
                  )}
                  <div className="mt-1 text-xs text-slate-400">{formatDate(c.createdAt)}</div>
                </div>
              ))
            ) : (
              <p className="text-sm text-slate-400">Aucune réclamation envoyée.</p>
            )}
          </div>
        </section>
      </div>
      <SiteFooter />
    </div>
  );
}
