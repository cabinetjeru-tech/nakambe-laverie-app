'use client';

import { LogOut, Trash2, UserPlus } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { ChangeSecretCard } from '@/components/account';
import { MerchantLogo } from '@/components/food';
import { LocationPicker } from '@/components/map/location-picker';
import { PhoneInput } from '@/components/phone-input';
import { PhotoInput } from '@/components/photo-input';
import { Alert, Badge, Button, Card, Field, FieldGroup, Input, Select, Sheet, Textarea } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { MERCHANT_TYPES } from '@/lib/cart';
import { phoneDisplay } from '@/lib/format';
import { LatLng } from '@/lib/geo';
import { MEMBER_ROLES, MERCHANT_STATUS_LABELS, MerchantSpace, useMerchant } from '@/lib/merchant';

const localPhone = (phone: string) => phone.replace(/^\+226/, '').replace(/(\d{2})(?=\d)/g, '$1 ');

function ProfileForm() {
  const { merchant, call, setMerchant, canManage } = useMerchant();
  const m = merchant!;
  const [form, setForm] = useState({ name: '', phone: '', description: '', landmark: '', addressText: '', avgPrepMinutes: '20', minOrderAmount: '' });
  const [point, setPoint] = useState<LatLng | null>(null);
  const [logoKey, setLogoKey] = useState<string | undefined>();
  const [coverKey, setCoverKey] = useState<string | undefined>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    setForm({
      name: m.name,
      phone: localPhone(m.phone),
      description: m.description ?? '',
      landmark: m.landmark ?? '',
      addressText: m.addressText ?? '',
      avgPrepMinutes: String(m.avgPrepMinutes),
      minOrderAmount: m.minOrderAmount ? String(m.minOrderAmount) : '',
    });
    setPoint({ lat: m.lat, lng: m.lng });
  }, [m]);

  const set = (k: keyof typeof form, v: string) => {
    setSaved(false);
    setForm((f) => ({ ...f, [k]: v }));
  };

  const save = async () => {
    setBusy(true);
    setError(null);
    try {
      const moved = point && (point.lat !== m.lat || point.lng !== m.lng);
      const updated = await call<MerchantSpace>('', {
        method: 'PATCH',
        body: {
          name: form.name.trim(),
          phone: form.phone,
          description: form.description.trim(),
          landmark: form.landmark.trim(),
          addressText: form.addressText.trim(),
          avgPrepMinutes: Number(form.avgPrepMinutes) || 20,
          minOrderAmount: form.minOrderAmount ? Math.round(Number(form.minOrderAmount)) : null,
          ...(moved ? { lat: point!.lat, lng: point!.lng } : {}),
          logoKey,
          coverKey,
        },
      });
      setMerchant(updated);
      setLogoKey(undefined);
      setCoverKey(undefined);
      setSaved(true);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const status = MERCHANT_STATUS_LABELS[m.status];
  return (
    <Card className="space-y-4">
      <div className="flex items-center gap-3">
        <MerchantLogo name={m.name} url={m.logoUrl} className="h-14 w-14" />
        <div>
          <p className="font-bold text-brand">{m.name}</p>
          <p className="text-xs text-slate-500">
            {MERCHANT_TYPES[m.type]} · {m.city.name} · commission {m.commissionPercent} %
          </p>
          <Badge tone={status.tone} className="mt-1">{status.label}</Badge>
        </div>
      </div>
      {m.status === 'ACTIVE' && (
        <Link href={`/restaurants/${m.slug}`} className="block text-sm font-semibold text-brand-light">
          Voir ma page telle que les clients la voient →
        </Link>
      )}
      <fieldset disabled={!canManage} className="space-y-4">
        <Field label="Nom du commerce">
          <Input value={form.name} maxLength={80} onChange={(e) => set('name', e.target.value)} />
        </Field>
        <Field label="Téléphone du commerce">
          <PhoneInput value={form.phone} onChange={(v) => set('phone', v)} />
        </Field>
        <Field label="Présentation">
          <Textarea rows={2} maxLength={500} value={form.description} onChange={(e) => set('description', e.target.value)} />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Préparation habituelle (min)">
            <Input type="number" inputMode="numeric" min={5} max={180} value={form.avgPrepMinutes} onChange={(e) => set('avgPrepMinutes', e.target.value)} />
          </Field>
          <Field label="Commande minimum (FCFA)" hint="Vide = aucun minimum">
            <Input type="number" inputMode="numeric" min={0} step={100} value={form.minOrderAmount} onChange={(e) => set('minOrderAmount', e.target.value)} />
          </Field>
        </div>
        {canManage && (
          <div className="grid gap-3 sm:grid-cols-2">
            <FieldGroup label="Logo">
              <PhotoInput purpose="MERCHANT_MEDIA" label="Changer le logo" capture={false} onUploaded={(k) => setLogoKey(k ?? undefined)} />
            </FieldGroup>
            <FieldGroup label="Photo de couverture">
              <PhotoInput purpose="MERCHANT_MEDIA" label="Changer la photo" capture={false} onUploaded={(k) => setCoverKey(k ?? undefined)} />
            </FieldGroup>
          </div>
        )}
        <FieldGroup label="Emplacement (point de ramassage des livreurs)">
          <LocationPicker value={point} onChange={setPoint} fallbackCenter={{ lat: m.lat, lng: m.lng }} color="pickup" />
        </FieldGroup>
        <Field label="Repère">
          <Input value={form.landmark} maxLength={200} onChange={(e) => set('landmark', e.target.value)} />
        </Field>
        <Field label="Adresse (facultatif)">
          <Input value={form.addressText} maxLength={200} onChange={(e) => set('addressText', e.target.value)} />
        </Field>
      </fieldset>
      <Alert>{error}</Alert>
      {saved && <Alert tone="green">Modifications enregistrées.</Alert>}
      {canManage && (
        <Button block loading={busy} onClick={save}>
          Enregistrer
        </Button>
      )}
    </Card>
  );
}

function Team() {
  const { merchant, call, reload, canManage } = useMerchant();
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ phone: '', firstName: '', lastName: '', role: 'STAFF' });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pin, setPin] = useState<string | null>(null);
  const m = merchant!;

  const add = async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await call<{ temporaryPin?: string }>('members', { body: { ...form, firstName: form.firstName || undefined, lastName: form.lastName || undefined } });
      setPin(res.temporaryPin ?? null);
      setForm({ phone: '', firstName: '', lastName: '', role: 'STAFF' });
      await reload();
      if (!res.temporaryPin) setOpen(false);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="font-semibold text-brand">Équipe</h2>
        {canManage && (
          <Button
            size="sm"
            variant="secondary"
            onClick={() => {
              setPin(null);
              setError(null);
              setOpen(true);
            }}
          >
            <UserPlus className="h-4 w-4" /> Ajouter
          </Button>
        )}
      </div>
      <div className="divide-y divide-slate-100 text-sm">
        {m.members.map((mb) => (
          <div key={mb.user.id} className="flex items-center justify-between py-2">
            <span>
              <span className="font-semibold">
                {mb.user.firstName} {mb.user.lastName}
              </span>
              <span className="block text-xs text-slate-500">
                {MEMBER_ROLES[mb.role]} · {phoneDisplay(mb.user.phone)}
              </span>
            </span>
            {canManage && mb.role !== 'OWNER' && mb.user.id !== user?.id && (
              <button
                type="button"
                className="p-1.5 text-slate-400 hover:text-red-600"
                aria-label="Retirer"
                onClick={async () => {
                  if (!confirm(`Retirer ${mb.user.firstName} de l’équipe ?`)) return;
                  await call(`members/${mb.user.id}`, { method: 'DELETE' }).catch((err) => alert((err as Error).message));
                  await reload();
                }}
              >
                <Trash2 className="h-4 w-4" />
              </button>
            )}
          </div>
        ))}
      </div>
      <p className="text-xs text-slate-500">Employé : reçoit et prépare les commandes, peut marquer un plat épuisé. Gérant : peut aussi modifier le menu, les horaires et le profil.</p>

      <Sheet open={open} onClose={() => setOpen(false)} title="Ajouter à l’équipe">
        {pin ? (
          <div className="space-y-3">
            <Alert tone="green">Compte créé. Communiquez ce code secret provisoire à la personne : elle pourra le changer après sa première connexion.</Alert>
            <p className="text-center text-3xl font-extrabold tracking-[0.3em] text-brand">{pin}</p>
            <Button block onClick={() => setOpen(false)}>
              Terminé
            </Button>
          </div>
        ) : (
          <div className="space-y-3">
            <Field label="Téléphone">
              <PhoneInput value={form.phone} onChange={(v) => setForm({ ...form, phone: v })} />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Prénom" hint="Si pas encore de compte">
                <Input value={form.firstName} maxLength={60} onChange={(e) => setForm({ ...form, firstName: e.target.value })} />
              </Field>
              <Field label="Nom">
                <Input value={form.lastName} maxLength={60} onChange={(e) => setForm({ ...form, lastName: e.target.value })} />
              </Field>
            </div>
            <Field label="Rôle">
              <Select value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}>
                <option value="STAFF">Employé</option>
                <option value="MANAGER">Gérant</option>
                {m.myRole === 'OWNER' && <option value="OWNER">Propriétaire</option>}
              </Select>
            </Field>
            <Alert>{error}</Alert>
            <Button block loading={busy} disabled={form.phone.replace(/\D/g, '').length !== 8} onClick={add}>
              Ajouter
            </Button>
          </div>
        )}
      </Sheet>
    </Card>
  );
}

export default function MerchantProfilePage() {
  const { user, logout } = useAuth();
  const router = useRouter();
  return (
    <div className="space-y-4">
      <ProfileForm />
      <Team />
      <ChangeSecretCard />
      <Card className="space-y-2 text-sm">
        <p className="text-slate-600">
          Connecté : {user?.firstName} {user?.lastName} ({phoneDisplay(user?.phone)})
        </p>
        {user?.roles.includes('CLIENT') && (
          <Link href="/accueil" className="block font-semibold text-brand-light">
            Passer à l’espace client →
          </Link>
        )}
        <Button
          variant="outline"
          onClick={async () => {
            await logout();
            router.replace('/connexion');
          }}
        >
          <LogOut className="h-4 w-4" /> Se déconnecter
        </Button>
      </Card>
    </div>
  );
}
