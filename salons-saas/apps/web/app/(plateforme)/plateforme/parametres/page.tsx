'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import clsx from 'clsx';
import { Plus, Trash2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Badge, Button, Card, ErrorMessage, Field, Input, Modal, PageHeader, Select, Spinner, Table, Td, Textarea } from '@/components/ui';
import { get, patch, post, put } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { FEATURE_LABELS, PLATFORM_ROLE } from '@/lib/billing';
import { dateTime, money } from '@/lib/format';

interface Settings {
  legalName: string;
  address: string;
  taxId: string;
  supportPhone: string;
  supportEmail: string;
  mobileMoney: { operator: string; number: string }[];
  trialDays: number;
  graceDays: number;
  renewalLeadDays: number;
  vatPercent: number;
  defaultPlanCode: string;
}

interface SettingsResponse {
  settings: Settings;
  technical: Record<string, string | number>;
  features: { code: string; label: string }[];
}

interface Plan {
  id: string;
  code: string;
  name: string;
  description: string | null;
  priceMonthly: number;
  priceYearly: number;
  maxSalons: number | null;
  maxStaff: number | null;
  smsQuotaMonthly: number;
  isPublic: boolean;
  isActive: boolean;
  sortOrder: number;
  features: string[];
  tenantsCount: number;
}

type Tab = 'platform' | 'plans' | 'team' | 'technical';

export default function PlatformSettingsPage() {
  const [tab, setTab] = useState<Tab>('platform');
  const { me } = useAuth();
  const owner = me?.platformRole === 'PLATFORM_OWNER';
  return (
    <div>
      <PageHeader title="Paramètres" description={owner ? 'Coordonnées de l’éditeur, règles de facturation, offres et équipe.' : 'Consultation uniquement : seul un super administrateur modifie ces réglages.'} />
      <div role="tablist" className="mb-4 flex gap-1 overflow-x-auto border-b border-stone-200">
        {(
          [
            ['platform', 'Plateforme et facturation'],
            ['plans', 'Offres'],
            ['team', 'Équipe'],
            ['technical', 'Technique'],
          ] as [Tab, string][]
        ).map(([value, label]) => (
          <button
            key={value}
            role="tab"
            aria-selected={tab === value}
            onClick={() => setTab(value)}
            className={clsx('-mb-px whitespace-nowrap border-b-2 px-3 py-2 text-sm font-medium', tab === value ? 'border-brand-600 text-brand-700' : 'border-transparent text-stone-600 hover:text-stone-900')}
          >
            {label}
          </button>
        ))}
      </div>
      {tab === 'platform' && <PlatformSettingsForm readOnly={!owner} />}
      {tab === 'plans' && <Plans readOnly={!owner} />}
      {tab === 'team' && <Team readOnly={!owner} />}
      {tab === 'technical' && <Technical />}
    </div>
  );
}

function useSettings() {
  return useQuery({ queryKey: ['platform-settings'], queryFn: () => get<SettingsResponse>('/platform/settings') });
}

function PlatformSettingsForm({ readOnly }: { readOnly: boolean }) {
  const queryClient = useQueryClient();
  const settings = useSettings();
  const plans = useQuery({ queryKey: ['platform-plans'], queryFn: () => get<Plan[]>('/platform/plans') });
  const [form, setForm] = useState<Settings | null>(null);
  const [saved, setSaved] = useState(false);
  useEffect(() => {
    if (settings.data && !form) setForm(settings.data.settings);
  }, [settings.data, form]);
  const save = useMutation({
    mutationFn: () => patch<Settings>('/platform/settings', form),
    onSuccess: (updated) => {
      setForm(updated);
      setSaved(true);
      queryClient.invalidateQueries({ queryKey: ['platform-settings'] });
    },
  });
  if (settings.isLoading || !form) return <Spinner />;
  const set = <K extends keyof Settings>(key: K, value: Settings[K]) => {
    setSaved(false);
    setForm({ ...form, [key]: value });
  };

  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        save.mutate();
      }}
    >
      <fieldset disabled={readOnly} className="space-y-4">
        <Card title="Éditeur (vendeur sur les factures)">
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Raison sociale">{(id) => <Input id={id} required value={form.legalName} onChange={(e) => set('legalName', e.target.value)} />}</Field>
            <Field label="IFU">{(id) => <Input id={id} value={form.taxId} onChange={(e) => set('taxId', e.target.value)} />}</Field>
            <div className="sm:col-span-2">
              <Field label="Adresse">{(id) => <Textarea id={id} rows={2} value={form.address} onChange={(e) => set('address', e.target.value)} />}</Field>
            </div>
            <Field label="Téléphone du support">{(id) => <Input id={id} value={form.supportPhone} onChange={(e) => set('supportPhone', e.target.value)} />}</Field>
            <Field label="E-mail du support">{(id) => <Input id={id} type="email" value={form.supportEmail} onChange={(e) => set('supportEmail', e.target.value)} />}</Field>
          </div>
        </Card>

        <Card title="Numéros de réception Mobile Money" actions={!readOnly && form.mobileMoney.length < 6 && (
          <Button type="button" size="sm" variant="secondary" onClick={() => set('mobileMoney', [...form.mobileMoney, { operator: 'Orange Money', number: '' }])}>
            <Plus className="h-4 w-4" aria-hidden /> Ajouter
          </Button>
        )}>
          <p className="mb-3 text-sm text-stone-600">Affichés aux salons pour le paiement par transfert ; chaque référence déclarée est vérifiée dans « Paiements ».</p>
          <div className="space-y-2">
            {form.mobileMoney.length === 0 && <p className="text-sm text-stone-500">Aucun numéro : seul le paiement en ligne sera proposé.</p>}
            {form.mobileMoney.map((entry, index) => (
              <div key={index} className="flex flex-wrap items-center gap-2">
                <Input
                  aria-label="Opérateur"
                  className="w-44"
                  value={entry.operator}
                  onChange={(e) => set('mobileMoney', form.mobileMoney.map((m, i) => (i === index ? { ...m, operator: e.target.value } : m)))}
                />
                <Input
                  aria-label="Numéro"
                  className="w-48"
                  inputMode="tel"
                  value={entry.number}
                  onChange={(e) => set('mobileMoney', form.mobileMoney.map((m, i) => (i === index ? { ...m, number: e.target.value } : m)))}
                />
                {!readOnly && (
                  <Button type="button" size="sm" variant="ghost" aria-label="Retirer ce numéro" onClick={() => set('mobileMoney', form.mobileMoney.filter((_, i) => i !== index))}>
                    <Trash2 className="h-4 w-4" aria-hidden />
                  </Button>
                )}
              </div>
            ))}
          </div>
        </Card>

        <Card title="Règles d’abonnement">
          <div className="grid gap-3 sm:grid-cols-3">
            <Field label="Durée de l’essai (jours)" hint="Pour les nouvelles inscriptions">
              {(id) => <Input id={id} type="number" min={0} max={90} value={form.trialDays} onChange={(e) => set('trialDays', Number(e.target.value))} />}
            </Field>
            <Field label="Offre à l’inscription">
              {(id) => (
                <Select id={id} value={form.defaultPlanCode} onChange={(e) => set('defaultPlanCode', e.target.value)}>
                  {plans.data?.filter((p) => p.isActive).map((p) => (
                    <option key={p.code} value={p.code}>
                      {p.name}
                    </option>
                  ))}
                </Select>
              )}
            </Field>
            <Field label="Facture émise avant l’échéance (jours)">
              {(id) => <Input id={id} type="number" min={1} max={30} value={form.renewalLeadDays} onChange={(e) => set('renewalLeadDays', Number(e.target.value))} />}
            </Field>
            <Field label="Délai de grâce avant suspension (jours)">
              {(id) => <Input id={id} type="number" min={0} max={30} value={form.graceDays} onChange={(e) => set('graceDays', Number(e.target.value))} />}
            </Field>
            <Field label="TVA appliquée (%)" hint="Nouvelles factures uniquement">
              {(id) => <Input id={id} type="number" min={0} max={30} step={0.5} value={form.vatPercent} onChange={(e) => set('vatPercent', Number(e.target.value))} />}
            </Field>
          </div>
        </Card>
      </fieldset>
      {!readOnly && (
        <div className="flex items-center justify-end gap-3">
          {saved && <span className="text-sm text-emerald-700">Enregistré.</span>}
          <ErrorMessage error={save.error} />
          <Button type="submit" loading={save.isPending}>
            Enregistrer
          </Button>
        </div>
      )}
    </form>
  );
}

function Plans({ readOnly }: { readOnly: boolean }) {
  const plans = useQuery({ queryKey: ['platform-plans'], queryFn: () => get<Plan[]>('/platform/plans') });
  const settings = useSettings();
  const [editing, setEditing] = useState<Plan | 'new' | null>(null);
  if (plans.isLoading) return <Spinner />;
  return (
    <div className="space-y-3">
      {!readOnly && (
        <div className="flex justify-end">
          <Button onClick={() => setEditing('new')}>
            <Plus className="h-4 w-4" aria-hidden /> Nouvelle offre
          </Button>
        </div>
      )}
      <Table head={['Offre', 'Mensuel', 'Annuel', 'Limites', 'Fonctionnalités', 'Salons', 'État', '']}>
        {plans.data?.map((p) => (
          <tr key={p.id}>
            <Td>
              <span className="font-medium">{p.name}</span>
              <span className="block text-xs text-stone-400">{p.code}</span>
            </Td>
            <Td className="tabular-nums">{money(p.priceMonthly)}</Td>
            <Td className="tabular-nums">{money(p.priceYearly)}</Td>
            <Td className="text-xs">
              {p.maxSalons ?? '∞'} salon(s) · {p.maxStaff ?? '∞'} employés · {p.smsQuotaMonthly} SMS
            </Td>
            <Td className="max-w-xs whitespace-normal text-xs text-stone-600">{p.features.map((f) => FEATURE_LABELS[f] ?? f).join(', ') || '—'}</Td>
            <Td className="tabular-nums">{p.tenantsCount}</Td>
            <Td>
              {!p.isActive ? <Badge>Désactivée</Badge> : p.isPublic ? <Badge tone="green">Publique</Badge> : <Badge tone="amber">Sur invitation</Badge>}
            </Td>
            <Td className="text-right">
              {!readOnly && (
                <Button size="sm" variant="ghost" onClick={() => setEditing(p)}>
                  Modifier
                </Button>
              )}
            </Td>
          </tr>
        ))}
      </Table>
      {editing && <PlanModal plan={editing === 'new' ? null : editing} features={settings.data?.features ?? []} onClose={() => setEditing(null)} />}
    </div>
  );
}

function PlanModal({ plan, features, onClose }: { plan: Plan | null; features: { code: string; label: string }[]; onClose: () => void }) {
  const queryClient = useQueryClient();
  const [form, setForm] = useState({
    code: plan?.code ?? '',
    name: plan?.name ?? '',
    description: plan?.description ?? '',
    priceMonthly: String(plan?.priceMonthly ?? ''),
    priceYearly: String(plan?.priceYearly ?? ''),
    maxSalons: plan?.maxSalons === null || plan?.maxSalons === undefined ? '' : String(plan.maxSalons),
    maxStaff: plan?.maxStaff === null || plan?.maxStaff === undefined ? '' : String(plan.maxStaff),
    smsQuotaMonthly: String(plan?.smsQuotaMonthly ?? 0),
    features: new Set(plan?.features ?? []),
    isPublic: plan?.isPublic ?? true,
    isActive: plan?.isActive ?? true,
    sortOrder: String(plan?.sortOrder ?? 10),
  });
  const save = useMutation({
    mutationFn: () => {
      const body = {
        code: form.code,
        name: form.name,
        description: form.description,
        priceMonthly: Number(form.priceMonthly),
        priceYearly: Number(form.priceYearly),
        ...(form.maxSalons ? { maxSalons: Number(form.maxSalons) } : { maxSalons: null }),
        ...(form.maxStaff ? { maxStaff: Number(form.maxStaff) } : { maxStaff: null }),
        smsQuotaMonthly: Number(form.smsQuotaMonthly),
        features: [...form.features],
        isPublic: form.isPublic,
        isActive: form.isActive,
        sortOrder: Number(form.sortOrder),
      };
      return plan ? put(`/platform/plans/${plan.id}`, body) : post('/platform/plans', body);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['platform-plans'] });
      onClose();
    },
  });
  const set = (key: keyof typeof form, value: string | boolean) => setForm({ ...form, [key]: value });

  return (
    <Modal
      open
      wide
      title={plan ? `Modifier l’offre ${plan.name}` : 'Nouvelle offre'}
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Annuler
          </Button>
          <Button loading={save.isPending} onClick={() => save.mutate()}>
            Enregistrer
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        {plan && plan.tenantsCount > 0 && (
          <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900">
            {plan.tenantsCount} salon(s) sur cette offre : les nouveaux prix s’appliquent à leur prochain renouvellement ; limites et fonctionnalités
            s’appliquent immédiatement.
          </p>
        )}
        <div className="grid gap-3 sm:grid-cols-3">
          <Field label="Code">{(id) => <Input id={id} disabled={!!plan} value={form.code} onChange={(e) => set('code', e.target.value.toUpperCase())} />}</Field>
          <Field label="Nom">{(id) => <Input id={id} value={form.name} onChange={(e) => set('name', e.target.value)} />}</Field>
          <Field label="Ordre d’affichage">{(id) => <Input id={id} type="number" value={form.sortOrder} onChange={(e) => set('sortOrder', e.target.value)} />}</Field>
          <div className="sm:col-span-3">
            <Field label="Description">{(id) => <Input id={id} value={form.description} onChange={(e) => set('description', e.target.value)} />}</Field>
          </div>
          <Field label="Prix mensuel (FCFA)">{(id) => <Input id={id} type="number" min={0} value={form.priceMonthly} onChange={(e) => set('priceMonthly', e.target.value)} />}</Field>
          <Field label="Prix annuel (FCFA)">{(id) => <Input id={id} type="number" min={0} value={form.priceYearly} onChange={(e) => set('priceYearly', e.target.value)} />}</Field>
          <Field label="SMS inclus / mois">{(id) => <Input id={id} type="number" min={0} value={form.smsQuotaMonthly} onChange={(e) => set('smsQuotaMonthly', e.target.value)} />}</Field>
          <Field label="Salons max." hint="Vide = illimité">{(id) => <Input id={id} type="number" min={1} value={form.maxSalons} onChange={(e) => set('maxSalons', e.target.value)} />}</Field>
          <Field label="Employés max." hint="Vide = illimité">{(id) => <Input id={id} type="number" min={1} value={form.maxStaff} onChange={(e) => set('maxStaff', e.target.value)} />}</Field>
        </div>
        <fieldset>
          <legend className="text-sm font-medium text-stone-700">Fonctionnalités incluses</legend>
          <div className="mt-2 grid gap-2 sm:grid-cols-2">
            {features.map((f) => (
              <label key={f.code} className="flex items-center gap-2 text-sm text-stone-700">
                <input
                  type="checkbox"
                  className="rounded border-stone-300"
                  checked={form.features.has(f.code)}
                  onChange={(e) => {
                    const next = new Set(form.features);
                    if (e.target.checked) next.add(f.code);
                    else next.delete(f.code);
                    setForm({ ...form, features: next });
                  }}
                />
                {f.label}
              </label>
            ))}
          </div>
        </fieldset>
        <div className="flex flex-wrap gap-4 text-sm text-stone-700">
          <label className="flex items-center gap-2">
            <input type="checkbox" className="rounded border-stone-300" checked={form.isActive} onChange={(e) => set('isActive', e.target.checked)} />
            Active
          </label>
          <label className="flex items-center gap-2">
            <input type="checkbox" className="rounded border-stone-300" checked={form.isPublic} onChange={(e) => set('isPublic', e.target.checked)} />
            Proposée aux salons (publique)
          </label>
        </div>
        <ErrorMessage error={save.error} />
      </div>
    </Modal>
  );
}

interface StaffMember {
  role: string;
  isActive: boolean;
  createdAt: string;
  user: { id: string; fullName: string; phone: string; email: string | null; lastLoginAt: string | null };
}

function Team({ readOnly }: { readOnly: boolean }) {
  const queryClient = useQueryClient();
  const { me } = useAuth();
  const staff = useQuery({ queryKey: ['platform-staff'], queryFn: () => get<StaffMember[]>('/platform/staff') });
  const [phone, setPhone] = useState('');
  const [role, setRole] = useState('PLATFORM_SUPPORT');
  const refresh = () => queryClient.invalidateQueries({ queryKey: ['platform-staff'] });
  const grant = useMutation({
    mutationFn: () => post('/platform/staff', { phone, role }),
    onSuccess: () => {
      setPhone('');
      refresh();
    },
  });
  const revoke = useMutation({ mutationFn: (userId: string) => post(`/platform/staff/${userId}/revoke`), onSuccess: refresh });

  return (
    <div className="space-y-4">
      {!readOnly && (
        <Card title="Ajouter un membre de l’équipe">
          <form
            className="flex flex-wrap items-end gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              grant.mutate();
            }}
          >
            <Field label="Téléphone du compte" hint="La personne doit avoir créé son compte.">
              {(id) => <Input id={id} className="w-52" inputMode="tel" required value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+226 70 00 00 00" />}
            </Field>
            <Field label="Rôle">
              {(id) => (
                <Select id={id} className="w-52" value={role} onChange={(e) => setRole(e.target.value)}>
                  {Object.entries(PLATFORM_ROLE).map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </Select>
              )}
            </Field>
            <div className="pb-5">
              <Button type="submit" loading={grant.isPending}>
                Ajouter
              </Button>
            </div>
          </form>
          <ErrorMessage error={grant.error} />
          <ul className="mt-2 space-y-1 text-xs text-stone-500">
            <li>
              <strong>Super administrateur</strong> : tout, y compris paramètres, offres et équipe.
            </li>
            <li>
              <strong>Facturation</strong> : abonnements, paiements, revenus, suspension des salons.
            </li>
            <li>
              <strong>Support</strong> : salons, utilisateurs, demandes de support, prolongation d’essai.
            </li>
          </ul>
        </Card>
      )}
      <ErrorMessage error={revoke.error} />
      <Table head={['Nom', 'Téléphone', 'Rôle', 'Dernière connexion', '']}>
        {staff.data?.map((s) => (
          <tr key={s.user.id} className={s.isActive ? '' : 'opacity-50'}>
            <Td className="font-medium">{s.user.fullName}</Td>
            <Td className="tabular-nums">{s.user.phone}</Td>
            <Td>{s.isActive ? PLATFORM_ROLE[s.role] : 'Accès retiré'}</Td>
            <Td>{s.user.lastLoginAt ? dateTime(s.user.lastLoginAt) : '—'}</Td>
            <Td className="text-right">
              {!readOnly && s.isActive && s.user.id !== me?.user.id && (
                <Button size="sm" variant="ghost" loading={revoke.isPending && revoke.variables === s.user.id} onClick={() => revoke.mutate(s.user.id)}>
                  Retirer l’accès
                </Button>
              )}
            </Td>
          </tr>
        ))}
      </Table>
    </div>
  );
}

const TECHNICAL_LABELS: Record<string, string> = {
  paymentProvider: 'Paiement en ligne (PAYMENT_PROVIDER)',
  billingScheduler: 'Planificateur de facturation (BILLING_SCHEDULER)',
  billingTickSeconds: 'Fréquence du planificateur, en secondes',
  otpDriver: 'Envoi des codes (OTP_DRIVER)',
  appPublicUrl: 'Adresse de l’application',
  apiPublicUrl: 'Adresse de l’API (notifications de paiement)',
  environment: 'Environnement',
};

function Technical() {
  const settings = useSettings();
  if (settings.isLoading || !settings.data) return <Spinner />;
  return (
    <Card title="Réglages techniques (fichier .env)">
      <p className="mb-3 text-sm text-stone-600">Modifiables uniquement par l’hébergeur, sur le serveur, puis redémarrage de l’API : ils ne sont pas éditables depuis la console.</p>
      <dl className="divide-y divide-stone-100 text-sm">
        {Object.entries(settings.data.technical).map(([key, value]) => (
          <div key={key} className="flex flex-wrap justify-between gap-2 py-2">
            <dt className="text-stone-600">{TECHNICAL_LABELS[key] ?? key}</dt>
            <dd className="font-mono text-xs text-stone-900">{String(value)}</dd>
          </div>
        ))}
      </dl>
    </Card>
  );
}
