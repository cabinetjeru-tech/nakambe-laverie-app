'use client';

import { useState } from 'react';
import { useParams } from 'next/navigation';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { SiteHeader } from '@/components/site-header';
import { SiteFooter } from '@/components/site-footer';
import { useRequireAuth } from '@/lib/use-require-auth';
import { api, openAuthenticatedPdf } from '@/lib/api';
import { formatDateTime, formatFcfa, mapLink, timeAgo, whatsappLink } from '@/lib/format';
import { ORDER_STATUS_LABELS, ORDER_STATUS_SEQUENCE, SERVICE_DOMAIN_LABELS } from '@/lib/constants';

const ACTIVE_TRANSIT_STATUSES = ['COLLECTE_PROGRAMMEE', 'LIVRAISON_PROGRAMMEE'];
const LOCATION_FRESH_MINUTES = 45;

export default function OrderDetailPage() {
  const { user, loading } = useRequireAuth(['CLIENT']);
  const { id } = useParams<{ id: string }>();
  const queryClient = useQueryClient();

  const [rating, setRating] = useState(5);
  const [comment, setComment] = useState('');
  const [reviewSubmitting, setReviewSubmitting] = useState(false);
  const [reviewError, setReviewError] = useState<string | null>(null);
  const [showComplaintForm, setShowComplaintForm] = useState(false);
  const [complaintSubject, setComplaintSubject] = useState('');
  const [complaintDescription, setComplaintDescription] = useState('');
  const [complaintSubmitting, setComplaintSubmitting] = useState(false);
  const [complaintDone, setComplaintDone] = useState(false);

  const orderQuery = useQuery({
    queryKey: ['commande', id],
    queryFn: async () => (await api.get(`/orders/${id}`)).data,
    enabled: !!user && !!id,
    // Rafraîchit automatiquement pendant une collecte/livraison pour suivre le tricycle en direct,
    // sans sollicitation inutile une fois la commande terminée.
    refetchInterval: (query) => (ACTIVE_TRANSIT_STATUSES.includes(query.state.data?.status) ? 15000 : false),
  });
  const reviewsQuery = useQuery({
    queryKey: ['mes-avis'],
    queryFn: async () => (await api.get('/reviews/mine')).data,
    enabled: !!user,
  });

  async function submitReview(e: React.FormEvent) {
    e.preventDefault();
    setReviewError(null);
    setReviewSubmitting(true);
    try {
      await api.post('/reviews', { orderId: id, rating, comment: comment || undefined });
      queryClient.invalidateQueries({ queryKey: ['mes-avis'] });
    } catch (err: any) {
      setReviewError(err?.response?.data?.message ?? "Impossible d'envoyer votre avis.");
    } finally {
      setReviewSubmitting(false);
    }
  }

  async function submitComplaint(e: React.FormEvent) {
    e.preventDefault();
    setComplaintSubmitting(true);
    try {
      await api.post('/complaints', { subject: complaintSubject, description: complaintDescription, orderId: id });
      setComplaintDone(true);
      setShowComplaintForm(false);
    } finally {
      setComplaintSubmitting(false);
    }
  }

  if (loading || !user) return <p className="p-10 text-center text-slate-400">Chargement...</p>;
  if (orderQuery.isLoading) {
    return (
      <div className="min-h-screen">
        <SiteHeader />
        <p className="p-10 text-center text-slate-400">Chargement de la commande...</p>
        <SiteFooter />
      </div>
    );
  }

  const order = orderQuery.data;
  if (!order) {
    return (
      <div className="min-h-screen">
        <SiteHeader />
        <p className="p-10 text-center text-slate-400">Commande introuvable.</p>
        <SiteFooter />
      </div>
    );
  }

  const currentStepIndex = ORDER_STATUS_SEQUENCE.indexOf(order.status);
  const hasReview = reviewsQuery.data?.some((r: any) => r.orderId === order.id);

  const vehicle = order.vehicle;
  const hasLiveLocation = vehicle?.currentLat && vehicle?.currentLng && vehicle?.locationUpdatedAt;
  const minutesSinceLocation = hasLiveLocation
    ? Math.floor((Date.now() - new Date(vehicle.locationUpdatedAt).getTime()) / 60000)
    : null;
  const isFreshLocation = minutesSinceLocation !== null && minutesSinceLocation <= LOCATION_FRESH_MINUTES;
  const isInTransit = ACTIVE_TRANSIT_STATUSES.includes(order.status);

  const pickupLat = order.appointment?.gpsLat;
  const pickupLng = order.appointment?.gpsLng;

  return (
    <div className="min-h-screen">
      <SiteHeader />
      <div className="mx-auto max-w-2xl px-4 py-10">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-brand-blue">{order.orderNumber}</h1>
            <p className="text-sm text-slate-500">
              {SERVICE_DOMAIN_LABELS[order.domain] ?? order.domain} — {formatDateTime(order.createdAt)}
            </p>
          </div>
          <span className="badge bg-brand-gold-light text-brand-blue-dark">
            {ORDER_STATUS_LABELS[order.status] ?? order.status}
          </span>
        </div>

        {/* Chronologie */}
        <div className="card mt-6">
          <h2 className="mb-3 font-bold text-slate-800">Suivi</h2>
          <div className="flex flex-col gap-2">
            {ORDER_STATUS_SEQUENCE.map((status, i) => {
              const done = i <= currentStepIndex;
              const historyEntry = order.statusHistory?.find((h: any) => h.status === status);
              return (
                <div key={status} className="flex items-start gap-3">
                  <div className={`mt-0.5 h-3 w-3 flex-none rounded-full ${done ? 'bg-brand-blue' : 'bg-slate-200'}`} />
                  <div>
                    <div className={`text-sm ${done ? 'font-semibold text-brand-blue' : 'text-slate-400'}`}>
                      {ORDER_STATUS_LABELS[status] ?? status}
                    </div>
                    {historyEntry && (
                      <div className="text-xs text-slate-400">{formatDateTime(historyEntry.createdAt)}</div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Position du chauffeur / tricycle */}
        {order.driver && (
          <div className="card mt-4">
            <h2 className="mb-2 font-bold text-slate-800">Chauffeur</h2>
            <div className="flex items-center justify-between">
              <div>
                <div className="font-medium text-slate-700">{order.driver.fullName}</div>
                {vehicle && <div className="text-xs text-slate-500">{vehicle.label}</div>}
              </div>
              {order.driver.phone && (
                <a
                  href={whatsappLink(order.driver.phone, `Bonjour, je vous contacte au sujet de ma commande ${order.orderNumber}.`)}
                  target="_blank"
                  rel="noreferrer"
                  className="btn-secondary !px-3 !py-1.5 text-xs"
                >
                  💬 WhatsApp
                </a>
              )}
            </div>

            {hasLiveLocation ? (
              <div className="mt-3 rounded-lg bg-slate-50 p-3">
                <div className="text-sm text-slate-700">
                  {isInTransit && isFreshLocation ? '🚚 En route — ' : ''}
                  Dernière position connue {timeAgo(vehicle.locationUpdatedAt)}
                </div>
                <a
                  href={mapLink(vehicle.currentLat, vehicle.currentLng)}
                  target="_blank"
                  rel="noreferrer"
                  className="mt-1 inline-block text-sm font-semibold text-brand-blue underline"
                >
                  Voir sur la carte
                </a>
              </div>
            ) : (
              isInTransit && <p className="mt-3 text-sm text-slate-400">Position du chauffeur pas encore disponible.</p>
            )}
          </div>
        )}

        {/* Adresse / lieu de collecte */}
        {(order.address || (pickupLat && pickupLng)) && (
          <div className="card mt-4">
            <h2 className="mb-2 font-bold text-slate-800">Adresse</h2>
            {order.address && <p className="text-sm text-slate-700">{order.address}</p>}
            {pickupLat && pickupLng && (
              <a href={mapLink(pickupLat, pickupLng)} target="_blank" rel="noreferrer" className="text-sm font-semibold text-brand-blue underline">
                Voir le lieu de collecte sur la carte
              </a>
            )}
          </div>
        )}

        {/* Articles */}
        <div className="card mt-4">
          <h2 className="mb-2 font-bold text-slate-800">Articles</h2>
          <div className="flex flex-col divide-y divide-slate-100">
            {order.items?.map((item: any) => (
              <div key={item.id} className="flex items-center justify-between py-1.5 text-sm">
                <span className="text-slate-700">
                  {item.label} × {item.quantity}
                </span>
                <span className="font-medium">{formatFcfa(item.total)}</span>
              </div>
            ))}
          </div>
          <div className="mt-3 flex flex-col gap-1 border-t border-slate-100 pt-3 text-sm">
            <div className="flex justify-between text-slate-500">
              <span>Sous-total</span>
              <span>{formatFcfa(order.subtotal)}</span>
            </div>
            {Number(order.discount) > 0 && (
              <div className="flex justify-between text-slate-500">
                <span>Réduction</span>
                <span>-{formatFcfa(order.discount)}</span>
              </div>
            )}
            {Number(order.travelFee) > 0 && (
              <div className="flex justify-between text-slate-500">
                <span>Frais de déplacement</span>
                <span>{formatFcfa(order.travelFee)}</span>
              </div>
            )}
            <div className="flex justify-between font-bold text-brand-blue">
              <span>Total</span>
              <span>{formatFcfa(order.total)}</span>
            </div>
            <div className="flex justify-between text-slate-500">
              <span>Payé</span>
              <span>{formatFcfa(order.amountPaid)}</span>
            </div>
          </div>
          {order.invoice && (
            <button
              type="button"
              className="mt-3 text-sm font-semibold text-brand-blue underline"
              onClick={() => openAuthenticatedPdf(`/invoices/${order.invoice.id}/pdf`)}
            >
              Voir la facture (PDF)
            </button>
          )}
        </div>

        {/* Avis */}
        {order.status === 'TERMINE' && (
          <div className="card mt-4">
            <h2 className="mb-2 font-bold text-slate-800">Votre avis</h2>
            {hasReview ? (
              <p className="text-sm text-slate-500">Merci, vous avez déjà laissé un avis pour cette commande.</p>
            ) : (
              <form onSubmit={submitReview} className="flex flex-col gap-3">
                <div className="flex gap-1 text-2xl">
                  {[1, 2, 3, 4, 5].map((n) => (
                    <button
                      key={n}
                      type="button"
                      onClick={() => setRating(n)}
                      className={n <= rating ? 'text-brand-gold' : 'text-slate-200'}
                    >
                      ★
                    </button>
                  ))}
                </div>
                <textarea
                  className="input"
                  rows={2}
                  placeholder="Un commentaire (facultatif)"
                  value={comment}
                  onChange={(e) => setComment(e.target.value)}
                />
                {reviewError && <p className="text-sm text-red-600">{reviewError}</p>}
                <button type="submit" disabled={reviewSubmitting} className="btn-primary !px-4 !py-2 text-sm disabled:opacity-60">
                  {reviewSubmitting ? 'Envoi...' : 'Envoyer mon avis'}
                </button>
              </form>
            )}
          </div>
        )}

        {/* Réclamation */}
        <div className="card mt-4 mb-16">
          <div className="flex items-center justify-between">
            <h2 className="font-bold text-slate-800">Un problème avec cette commande ?</h2>
            {!complaintDone && (
              <button
                type="button"
                onClick={() => setShowComplaintForm((v) => !v)}
                className="text-sm font-semibold text-brand-blue underline"
              >
                {showComplaintForm ? 'Annuler' : 'Signaler'}
              </button>
            )}
          </div>
          {complaintDone && <p className="mt-2 text-sm text-slate-500">Votre réclamation a été envoyée. Merci.</p>}
          {showComplaintForm && (
            <form onSubmit={submitComplaint} className="mt-3 flex flex-col gap-3">
              <input
                className="input"
                placeholder="Sujet"
                value={complaintSubject}
                onChange={(e) => setComplaintSubject(e.target.value)}
                required
              />
              <textarea
                className="input"
                rows={3}
                placeholder="Décrivez le problème"
                value={complaintDescription}
                onChange={(e) => setComplaintDescription(e.target.value)}
                required
              />
              <button type="submit" disabled={complaintSubmitting} className="btn-primary !px-4 !py-2 text-sm disabled:opacity-60">
                {complaintSubmitting ? 'Envoi...' : 'Envoyer'}
              </button>
            </form>
          )}
        </div>
      </div>
      <SiteFooter />
    </div>
  );
}
