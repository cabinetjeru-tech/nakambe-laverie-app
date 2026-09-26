'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { FormEvent, useState } from 'react';
import { AuthShell } from '@/components/auth-shell';
import { LocationPicker } from '@/components/map/location-picker';
import { PhoneInput } from '@/components/phone-input';
import { Alert, Button, Field, FieldGroup, Input, Select, Textarea } from '@/components/ui';
import { api, refreshTokens } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { MERCHANT_TYPES } from '@/lib/cart';
import { CITY_CENTERS, LatLng } from '@/lib/geo';
import type { City } from '@/lib/types';
import { useApi } from '@/lib/use-api';

/** Inscription d'un restaurant ou d'une boutique : le commerce reste invisible jusqu'à sa validation par l'équipe. */
export default function PartnerSignupPage() {
  const { user, login, refreshUser } = useAuth();
  const router = useRouter();
  const cities = useApi<City[]>('/cities');
  const [business, setBusiness] = useState({ name: '', type: 'RESTAURANT', phone: '', cityId: '', landmark: '', addressText: '', description: '' });
  const [point, setPoint] = useState<LatLng | null>(null);
  const [owner, setOwner] = useState({ firstName: '', lastName: '', phone: '', pin: '', pin2: '' });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  const cityId = business.cityId || cities.data?.[0]?.id || '';
  const city = cities.data?.find((c) => c.id === cityId);
  const center = city ? { lat: city.centerLat, lng: city.centerLng } : CITY_CENTERS.ouagadougou;
  const setB = (k: keyof typeof business, v: string) => setBusiness((b) => ({ ...b, [k]: v }));
  const setO = (k: keyof typeof owner, v: string) => setOwner((o) => ({ ...o, [k]: v }));

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!point) return setError('Placez votre commerce sur la carte : c’est là que le livreur viendra chercher les commandes.');
    if (!user && owner.pin !== owner.pin2) return setError('Les deux codes secrets ne sont pas identiques.');
    setBusy(true);
    setError(null);
    const body = {
      ...business,
      cityId,
      lat: point.lat,
      lng: point.lng,
      landmark: business.landmark.trim() || undefined,
      addressText: business.addressText.trim() || undefined,
      description: business.description.trim() || undefined,
    };
    try {
      if (user) {
        await api('/partners/apply', { body });
        await refreshTokens();
        await refreshUser();
      } else {
        await api('/partners/register', { auth: false, body: { business: body, owner: { firstName: owner.firstName, lastName: owner.lastName, phone: owner.phone, pin: owner.pin } } });
        await login(owner.phone, owner.pin);
      }
      setDone(true);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  if (done) {
    return (
      <AuthShell title="Demande envoyée 🎉" subtitle="Merci ! Notre équipe vous appelle pour valider votre commerce.">
        <div className="space-y-3 text-sm text-slate-600">
          <p>En attendant, préparez votre menu (plats, prix, photos) et vos horaires dans votre espace commerçant : tout sera prêt le jour de l’ouverture.</p>
          <Button block size="lg" onClick={() => router.replace('/commercant')}>
            Ouvrir mon espace commerçant
          </Button>
        </div>
      </AuthShell>
    );
  }

  return (
    <AuthShell
      title="Devenir partenaire"
      subtitle="Restaurant, maquis, boutique, pharmacie : recevez des commandes livrées par Allô-Coursier."
      suffix="PARTENAIRE"
      footer={
        !user && (
          <>
            Déjà un compte Allô-Coursier ? <Link href="/connexion?next=/partenaires/inscription" className="font-semibold text-white underline">Se connecter</Link>
          </>
        )
      }
    >
      <form onSubmit={submit} className="space-y-4">
        <h2 className="font-semibold text-brand">Votre commerce</h2>
        <Field label="Nom du commerce">
          <Input value={business.name} onChange={(e) => setB('name', e.target.value)} required minLength={2} maxLength={80} placeholder="Ex. Maquis Le Palmier" />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Type">
            <Select value={business.type} onChange={(e) => setB('type', e.target.value)}>
              {Object.entries(MERCHANT_TYPES).map(([code, label]) => (
                <option key={code} value={code}>{label}</option>
              ))}
            </Select>
          </Field>
          <Field label="Ville">
            <Select value={cityId} onChange={(e) => setB('cityId', e.target.value)}>
              {cities.data?.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </Select>
          </Field>
        </div>
        <Field label="Téléphone du commerce" hint="Le livreur appellera ce numéro en arrivant.">
          <PhoneInput value={business.phone} onChange={(v) => setB('phone', v)} required />
        </Field>
        <FieldGroup label="Emplacement du commerce">
          <LocationPicker key={cityId} value={point} onChange={setPoint} fallbackCenter={center} color="pickup" />
        </FieldGroup>
        <Field label="Repère" hint="Ex. : « En face de la station, enseigne verte »">
          <Input value={business.landmark} maxLength={200} onChange={(e) => setB('landmark', e.target.value)} />
        </Field>
        <Field label="Présentation (facultatif)">
          <Textarea rows={2} maxLength={500} value={business.description} onChange={(e) => setB('description', e.target.value)} placeholder="Vos spécialités, ce qui vous rend unique…" />
        </Field>

        {user ? (
          <p className="rounded-xl bg-brand-sky p-3 text-sm text-brand">
            Le commerce sera rattaché à votre compte ({user.firstName} {user.lastName}).
          </p>
        ) : (
          <>
            <h2 className="pt-2 font-semibold text-brand">Le responsable</h2>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Prénom">
                <Input value={owner.firstName} onChange={(e) => setO('firstName', e.target.value)} required maxLength={60} />
              </Field>
              <Field label="Nom">
                <Input value={owner.lastName} onChange={(e) => setO('lastName', e.target.value)} required maxLength={60} />
              </Field>
            </div>
            <Field label="Votre numéro (pour vous connecter)">
              <PhoneInput value={owner.phone} onChange={(v) => setO('phone', v)} required />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Code secret" hint="4 à 6 chiffres">
                <Input type="password" inputMode="numeric" maxLength={6} value={owner.pin} onChange={(e) => setO('pin', e.target.value.replace(/\D/g, ''))} required />
              </Field>
              <Field label="Confirmation">
                <Input type="password" inputMode="numeric" maxLength={6} value={owner.pin2} onChange={(e) => setO('pin2', e.target.value.replace(/\D/g, ''))} required />
              </Field>
            </div>
          </>
        )}
        <Alert>{error}</Alert>
        <Button type="submit" block size="lg" variant="success" loading={busy}>
          Envoyer ma demande
        </Button>
        <p className="text-center text-xs text-slate-500">Allô-Coursier prélève une commission sur les ventes livrées. Les conditions vous sont présentées lors de la validation.</p>
      </form>
    </AuthShell>
  );
}
