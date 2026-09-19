'use client';

import { Suspense, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { SiteHeader } from '@/components/site-header';
import { SiteFooter } from '@/components/site-footer';
import { useRequireAuth } from '@/lib/use-require-auth';
import { api, openAuthenticatedPdf } from '@/lib/api';
import { SERVICE_DOMAIN_LABELS } from '@/lib/constants';
import { formatFcfa } from '@/lib/format';

const DOMAINS = Object.entries(SERVICE_DOMAIN_LABELS).filter(([key]) => key !== 'MOBILE');

interface CatalogService {
  id: string;
  name: string;
  unit: string;
  price: number;
}

function NouvelleDemandeForm() {
  const { user, loading } = useRequireAuth(['CLIENT']);
  const router = useRouter();
  const params = useSearchParams();

  const [domain, setDomain] = useState(params.get('domaine') ?? 'LAVERIE_PRESSING');
  const [mode, setMode] = useState(params.get('mode') ?? 'A_DOMICILE');
  const [scheduledDate, setScheduledDate] = useState('');
  const [address, setAddress] = useState('');
  const [cart, setCart] = useState<Record<string, number>>({});
  const [quantityNote, setQuantityNote] = useState('');
  const [comment, setComment] = useState('');
  const [paymentTiming, setPaymentTiming] = useState<'AVANT_PRESTATION' | 'APRES_PRESTATION'>('APRES_PRESTATION');
  const [gps, setGps] = useState<{ lat: number; lng: number } | null>(null);
  const [gpsError, setGpsError] = useState<string | null>(null);
  const [gpsLoading, setGpsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [payingNow, setPayingNow] = useState(false);
  const [result, setResult] = useState<any>(null);

  const servicesQuery = useQuery({
    queryKey: ['catalog-services', domain],
    queryFn: async () => (await api.get<CatalogService[]>(`/catalog/services?domain=${domain}`)).data,
    enabled: !!user,
  });

  if (loading || !user) {
    return <p className="p-10 text-center text-slate-400">Chargement...</p>;
  }

  const cartTotal = (servicesQuery.data ?? []).reduce(
    (sum, s) => sum + (cart[s.id] ? cart[s.id] * Number(s.price) : 0),
    0,
  );

  function setQuantity(serviceId: string, quantity: number) {
    setCart((prev) => {
      const next = { ...prev };
      if (quantity <= 0) delete next[serviceId];
      else next[serviceId] = quantity;
      return next;
    });
  }

  function locateMe() {
    if (!navigator.geolocation) {
      setGpsError("La géolocalisation n'est pas disponible sur cet appareil.");
      return;
    }
    setGpsLoading(true);
    setGpsError(null);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setGps({ lat: position.coords.latitude, lng: position.coords.longitude });
        setGpsLoading(false);
      },
      () => {
        setGpsError('Position non disponible. Vérifiez que la localisation est autorisée.');
        setGpsLoading(false);
      },
      { enableHighAccuracy: true, timeout: 10000 },
    );
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const items = Object.entries(cart)
        .filter(([, quantity]) => quantity > 0)
        .map(([serviceId, quantity]) => ({ serviceId, quantity }));

      const { data } = await api.post('/appointments', {
        domain,
        mode,
        scheduledDate: new Date(scheduledDate).toISOString(),
        address: mode === 'A_DOMICILE' ? address : undefined,
        gpsLat: gps?.lat,
        gpsLng: gps?.lng,
        items: items.length ? items : undefined,
        quantityNote: items.length ? undefined : quantityNote,
        paymentTiming,
        comment,
      });
      setResult(data);
    } catch (err: any) {
      setError(err?.response?.data?.message ?? "Impossible d'envoyer votre demande. Réessayez.");
    } finally {
      setSubmitting(false);
    }
  }

  async function handlePayNow() {
    if (!result?.quote?.id) return;
    setPayingNow(true);
    setError(null);
    try {
      const { data } = await api.post(`/online-payments/quotes/${result.quote.id}/pay`);
      window.location.href = data.paymentUrl;
    } catch (err: any) {
      setError(err?.response?.data?.message ?? 'Paiement indisponible pour le moment. Réessayez plus tard.');
      setPayingNow(false);
    }
  }

  if (result) {
    return (
      <div className="mx-auto max-w-lg px-4 py-16 text-center">
        <div className="card">
          <div className="text-4xl">✅</div>
          <h1 className="mt-3 text-xl font-bold text-brand-blue">Votre demande a bien été envoyée !</h1>
          <p className="mt-2 text-sm text-slate-600">
            Notre équipe va la confirmer rapidement. Vous pouvez suivre son évolution depuis votre espace client.
          </p>

          {result.quote && (
            <div className="mt-5 rounded-lg border border-slate-200 p-4 text-left">
              <div className="flex items-center justify-between">
                <span className="font-semibold text-brand-blue">Devis {result.quote.quoteNumber}</span>
                <span className="font-bold">{formatFcfa(result.quote.total)}</span>
              </div>
              <button
                type="button"
                className="mt-2 text-sm font-semibold text-brand-blue underline"
                onClick={() => openAuthenticatedPdf(`/quotes/${result.quote.id}/pdf`)}
              >
                Voir / télécharger le devis (PDF)
              </button>

              {paymentTiming === 'AVANT_PRESTATION' && (
                <button
                  type="button"
                  disabled={payingNow}
                  onClick={handlePayNow}
                  className="btn-primary mt-3 w-full disabled:opacity-60"
                >
                  {payingNow ? 'Redirection...' : 'Payer maintenant par Mobile Money'}
                </button>
              )}
            </div>
          )}

          {error && <p className="mt-3 text-sm text-red-600">{error}</p>}

          <button className="btn-primary mt-6 w-full" onClick={() => router.push('/espace-client')}>
            Aller à mon espace
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-lg px-4 py-10">
      <h1 className="text-2xl font-bold text-brand-blue">Nouvelle demande</h1>
      <p className="mt-1 text-sm text-slate-500">
        Choisissez vos prestations, nous calculons le devis automatiquement.
      </p>

      <form onSubmit={handleSubmit} className="card mt-6 flex flex-col gap-4">
        <div>
          <label className="label">1. Quel service ?</label>
          <select
            className="input"
            value={domain}
            onChange={(e) => {
              setDomain(e.target.value);
              setCart({});
            }}
          >
            {DOMAINS.map(([key, label]) => (
              <option key={key} value={key}>
                {label}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="label">2. À domicile ou au siège ?</label>
          <div className="grid grid-cols-2 gap-2">
            {[
              ['A_DOMICILE', 'À domicile'],
              ['AU_SIEGE', 'Au siège'],
            ].map(([value, label]) => (
              <button
                type="button"
                key={value}
                onClick={() => setMode(value)}
                className={`rounded-lg border-2 px-3 py-2.5 text-sm font-semibold ${
                  mode === value ? 'border-brand-blue bg-brand-blue-light text-brand-blue' : 'border-slate-200 text-slate-500'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        <div>
          <label className="label">3. Date et heure souhaitées</label>
          <input
            type="datetime-local"
            className="input"
            value={scheduledDate}
            onChange={(e) => setScheduledDate(e.target.value)}
            required
          />
        </div>

        {mode === 'A_DOMICILE' && (
          <div>
            <label className="label">4. Votre adresse</label>
            <input
              className="input"
              placeholder="Quartier, repère..."
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              required
            />
            <button
              type="button"
              onClick={locateMe}
              disabled={gpsLoading}
              className="mt-2 text-sm font-semibold text-brand-blue underline disabled:opacity-60"
            >
              {gpsLoading ? 'Localisation...' : gps ? '📍 Position enregistrée — actualiser' : '📍 Utiliser ma position actuelle'}
            </button>
            {gpsError && <p className="mt-1 text-xs text-red-600">{gpsError}</p>}
          </div>
        )}

        <div>
          <label className="label">5. Vos prestations</label>
          {servicesQuery.isLoading && <p className="text-sm text-slate-400">Chargement du catalogue...</p>}
          <div className="flex flex-col divide-y divide-slate-100 rounded-lg border border-slate-200">
            {(servicesQuery.data ?? []).map((s) => (
              <div key={s.id} className="flex items-center justify-between gap-3 px-3 py-2">
                <div>
                  <div className="text-sm font-medium text-slate-700">{s.name}</div>
                  <div className="text-xs text-slate-400">
                    {formatFcfa(s.price)} / {s.unit}
                  </div>
                </div>
                <input
                  type="number"
                  min={0}
                  className="input !w-20 text-center"
                  value={cart[s.id] ?? 0}
                  onChange={(e) => setQuantity(s.id, Math.max(0, Number(e.target.value)))}
                />
              </div>
            ))}
          </div>
          {cartTotal > 0 && (
            <div className="mt-2 flex justify-between text-sm font-semibold text-brand-blue">
              <span>Total estimé</span>
              <span>{formatFcfa(cartTotal)}</span>
            </div>
          )}
          {Object.keys(cart).length === 0 && (
            <input
              className="input mt-2"
              placeholder="Ou décrivez votre besoin ici (ex : 10 pièces, un divan 6 places...)"
              value={quantityNote}
              onChange={(e) => setQuantityNote(e.target.value)}
            />
          )}
        </div>

        <div>
          <label className="label">6. Quand souhaitez-vous payer ?</label>
          <div className="grid grid-cols-2 gap-2">
            {[
              ['APRES_PRESTATION', 'Après la prestation'],
              ['AVANT_PRESTATION', 'Avant la prestation'],
            ].map(([value, label]) => (
              <button
                type="button"
                key={value}
                onClick={() => setPaymentTiming(value as typeof paymentTiming)}
                className={`rounded-lg border-2 px-3 py-2.5 text-sm font-semibold ${
                  paymentTiming === value ? 'border-brand-blue bg-brand-blue-light text-brand-blue' : 'border-slate-200 text-slate-500'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        <div>
          <label className="label">Commentaire (facultatif)</label>
          <textarea className="input" rows={3} value={comment} onChange={(e) => setComment(e.target.value)} />
        </div>

        {error && <p className="text-sm text-red-600">{error}</p>}

        <button type="submit" disabled={submitting} className="btn-primary w-full disabled:opacity-60">
          {submitting ? 'Envoi...' : 'Envoyer ma demande'}
        </button>
      </form>
    </div>
  );
}

export default function NouvelleDemandePage() {
  return (
    <div className="min-h-screen">
      <SiteHeader />
      <Suspense fallback={<p className="p-10 text-center text-slate-400">Chargement...</p>}>
        <NouvelleDemandeForm />
      </Suspense>
      <SiteFooter />
    </div>
  );
}
