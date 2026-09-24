'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft } from 'lucide-react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useState } from 'react';
import { canPlatform } from '@/components/platform-shell';
import { Badge, Button, Card, ErrorMessage, Field, Input, Modal, Spinner, Stat, Table, Td, Textarea } from '@/components/ui';
import { get, post } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { CYCLE, INVOICE_STATUS, SAAS_PAYMENT_METHOD, SAAS_PAYMENT_STATUS, SUBSCRIPTION_STATUS, TENANT_STATUS, TICKET_STATUS_PLATFORM, USER_STATUS } from '@/lib/billing';
import { date, dateTime, money, number } from '@/lib/format';

interface TenantDetail {
  id: string;
  slug: string;
  legalName: string;
  displayName: string;
  countryCode: string;
  timezone: string;
  taxId: string | null;
  tradeRegister: string | null;
  status: string;
  createdAt: string;
  trialEndsAt: string | null;
  graceEndsAt: string | null;
  suspendedAt: string | null;
  suspensionReason: string | null;
  plan: { code: string; name: string; maxSalons: number | null; maxStaff: number | null };
  salons: { id: string; name: string; city: string | null; createdAt: string }[];
  subscription: {
    status: string;
    cycle: string;
    unitPrice: number;
    currentPeriodStart: string;
    currentPeriodEnd: string;
    cancelAtPeriodEnd: boolean;
    plan: { name: string };
    pendingPlan: { name: string } | null;
  } | null;
  invoices: { id: string; number: string; description: string; status: string; total: number; dueAt: string; paidAt: string | null }[];
  payments: { id: string; method: string; status: string; amount: number; providerReference: string | null; failureReason: string | null; createdAt: string; invoice: { number: string } }[];
  members: { id: string; status: string; joinedAt: string; roles: string[]; user: { id: string; fullName: string; phone: string; status: string; lastLoginAt: string | null } }[];
  activity: { staff: number; clients: number; appointments30d: number; sales30d: number; lastLoginAt: string | null };
  platformActions: { id: string; action: string; after: Record<string, unknown> | null; createdAt: string }[];
  tickets: { id: string; number: number; subject: string; status: string; lastMessageAt: string }[];
}

const ACTION_LABELS: Record<string, string> = {
  'platform.trial_extended': 'Essai prolongé',
  'platform.tenant_suspended': 'Salon suspendu',
  'platform.tenant_reactivated': 'Salon réactivé',
  'platform.payment_validated': 'Paiement validé',
  'platform.payment_rejected': 'Paiement rejeté',
  'platform.invoice_voided': 'Facture annulée',
  'platform.ticket_updated': 'Demande de support mise à jour',
};

export default function PlatformTenantPage() {
  const { id } = useParams<{ id: string }>();
  const { me } = useAuth();
  const queryClient = useQueryClient();
  const tenant = useQuery({ queryKey: ['platform-tenant', id], queryFn: () => get<TenantDetail>(`/platform/tenants/${id}`) });
  const [dialog, setDialog] = useState<'extend' | 'suspend' | null>(null);
  const refresh = () => queryClient.invalidateQueries({ queryKey: ['platform-tenant', id] });
  const reactivate = useMutation({ mutationFn: () => post(`/platform/tenants/${id}/reactivate`), onSuccess: refresh });

  if (tenant.isLoading) return <Spinner />;
  if (tenant.error || !tenant.data) return <ErrorMessage error={tenant.error} />;
  const t = tenant.data;
  const role = me?.platformRole;
  const trialLike = t.subscription?.status === 'TRIALING' || (t.status === 'PAST_DUE' && !t.invoices.some((i) => i.status === 'PAID'));

  return (
    <div className="space-y-5">
      <Link href="/plateforme/salons" className="inline-flex items-center gap-1 text-sm text-stone-600 hover:text-stone-900">
        <ArrowLeft className="h-4 w-4" aria-hidden /> Salons
      </Link>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-stone-900">{t.displayName}</h1>
          <p className="mt-1 text-sm text-stone-500">
            {t.legalName} · {t.slug} · inscrit le {date(t.createdAt)}
            {t.taxId ? ` · IFU ${t.taxId}` : ''}
          </p>
          <div className="mt-2 flex flex-wrap gap-2">
            <Badge tone={TENANT_STATUS[t.status]?.tone}>{TENANT_STATUS[t.status]?.label}</Badge>
            <Badge>{t.plan.name}</Badge>
          </div>
          {t.status === 'SUSPENDED' && (
            <p className="mt-2 text-sm text-red-700">
              Suspendu le {date(t.suspendedAt!)}
              {t.suspensionReason ? ` : ${t.suspensionReason}` : ''}.
            </p>
          )}
        </div>
        <div className="flex flex-wrap gap-2">
          {trialLike && canPlatform(role, ['PLATFORM_BILLING', 'PLATFORM_SUPPORT']) && (
            <Button variant="secondary" onClick={() => setDialog('extend')}>
              Prolonger l’essai
            </Button>
          )}
          {t.status === 'SUSPENDED'
            ? canPlatform(role, ['PLATFORM_BILLING']) && (
                <Button loading={reactivate.isPending} onClick={() => reactivate.mutate()}>
                  Lever la suspension
                </Button>
              )
            : canPlatform(role, ['PLATFORM_BILLING']) && (
                <Button variant="danger" onClick={() => setDialog('suspend')}>
                  Suspendre
                </Button>
              )}
        </div>
      </div>
      <ErrorMessage error={reactivate.error} />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        <Stat label="Employés actifs" value={number(t.activity.staff)} sub={t.plan.maxStaff ? `sur ${t.plan.maxStaff}` : 'illimité'} />
        <Stat label="Clients" value={number(t.activity.clients)} />
        <Stat label="RDV (30 j)" value={number(t.activity.appointments30d)} />
        <Stat label="Ventes (30 j)" value={number(t.activity.sales30d)} />
        <Stat label="Dernière connexion" value={<span className="text-base">{t.activity.lastLoginAt ? dateTime(t.activity.lastLoginAt) : '—'}</span>} />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="Abonnement">
          {t.subscription ? (
            <dl className="grid grid-cols-2 gap-y-2 text-sm">
              <dt className="text-stone-500">Statut</dt>
              <dd>
                <Badge tone={SUBSCRIPTION_STATUS[t.subscription.status]?.tone}>{SUBSCRIPTION_STATUS[t.subscription.status]?.label}</Badge>
              </dd>
              <dt className="text-stone-500">Offre</dt>
              <dd>
                {t.subscription.plan.name} · {CYCLE[t.subscription.cycle]}
                {t.subscription.pendingPlan && <span className="block text-xs text-stone-500">→ {t.subscription.pendingPlan.name} au renouvellement</span>}
              </dd>
              <dt className="text-stone-500">Prix</dt>
              <dd className="tabular-nums">{money(t.subscription.unitPrice)}</dd>
              <dt className="text-stone-500">Période</dt>
              <dd>
                {date(t.subscription.currentPeriodStart)} → {date(t.subscription.currentPeriodEnd)}
              </dd>
              {t.graceEndsAt && (
                <>
                  <dt className="text-stone-500">Fin du délai de grâce</dt>
                  <dd>{dateTime(t.graceEndsAt)}</dd>
                </>
              )}
              {t.subscription.cancelAtPeriodEnd && (
                <>
                  <dt className="text-stone-500">Résiliation</dt>
                  <dd className="text-amber-700">programmée en fin de période</dd>
                </>
              )}
            </dl>
          ) : (
            <p className="text-sm text-stone-500">Aucun abonnement.</p>
          )}
        </Card>
        <Card title={`Salons (${t.salons.length})`}>
          <ul className="divide-y divide-stone-100 text-sm">
            {t.salons.map((s) => (
              <li key={s.id} className="flex justify-between py-2">
                <span className="font-medium text-stone-900">{s.name}</span>
                <span className="text-stone-500">
                  {s.city ?? '—'} · {date(s.createdAt)}
                </span>
              </li>
            ))}
          </ul>
        </Card>
      </div>

      <Card title="Membres">
        <Table head={['Nom', 'Téléphone', 'Rôles', 'Compte', 'Dernière connexion']}>
          {t.members.map((m) => (
            <tr key={m.id}>
              <Td>
                {canPlatform(role, ['PLATFORM_SUPPORT']) ? (
                  <Link href={`/plateforme/utilisateurs?user=${m.user.id}`} className="font-medium text-brand-700 hover:underline">
                    {m.user.fullName}
                  </Link>
                ) : (
                  m.user.fullName
                )}
                {m.status !== 'ACTIVE' && <span className="ml-2 text-xs text-stone-500">({m.status.toLowerCase()})</span>}
              </Td>
              <Td className="tabular-nums">{m.user.phone}</Td>
              <Td>{m.roles.join(', ')}</Td>
              <Td>
                <Badge tone={USER_STATUS[m.user.status]?.tone}>{USER_STATUS[m.user.status]?.label}</Badge>
              </Td>
              <Td>{m.user.lastLoginAt ? dateTime(m.user.lastLoginAt) : '—'}</Td>
            </tr>
          ))}
        </Table>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="Factures">
          <Table head={['N°', 'Montant', 'Échéance', 'Statut']} empty={t.invoices.length === 0}>
            {t.invoices.map((i) => (
              <tr key={i.id}>
                <Td className="font-medium">{i.number}</Td>
                <Td className="tabular-nums">{money(i.total)}</Td>
                <Td>{i.paidAt ? `Payée ${date(i.paidAt)}` : date(i.dueAt)}</Td>
                <Td>
                  <Badge tone={INVOICE_STATUS[i.status]?.tone}>{INVOICE_STATUS[i.status]?.label}</Badge>
                </Td>
              </tr>
            ))}
          </Table>
        </Card>
        <Card title="Paiements">
          <Table head={['Date', 'Moyen', 'Montant', 'Statut']} empty={t.payments.length === 0}>
            {t.payments.map((p) => (
              <tr key={p.id}>
                <Td>{dateTime(p.createdAt)}</Td>
                <Td>
                  {SAAS_PAYMENT_METHOD[p.method] ?? p.method}
                  {p.providerReference && <span className="block text-xs text-stone-500">{p.providerReference}</span>}
                </Td>
                <Td className="tabular-nums">{money(p.amount)}</Td>
                <Td>
                  <Badge tone={SAAS_PAYMENT_STATUS[p.status]?.tone}>{SAAS_PAYMENT_STATUS[p.status]?.label}</Badge>
                </Td>
              </tr>
            ))}
          </Table>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="Demandes de support">
          {t.tickets.length === 0 ? (
            <p className="text-sm text-stone-500">Aucune demande.</p>
          ) : (
            <ul className="divide-y divide-stone-100 text-sm">
              {t.tickets.map((ticket) => (
                <li key={ticket.id} className="flex items-center justify-between gap-2 py-2">
                  <Link href={`/plateforme/support/${ticket.id}`} className="truncate text-brand-700 hover:underline">
                    #{ticket.number} · {ticket.subject}
                  </Link>
                  <Badge tone={TICKET_STATUS_PLATFORM[ticket.status]?.tone}>{TICKET_STATUS_PLATFORM[ticket.status]?.label}</Badge>
                </li>
              ))}
            </ul>
          )}
        </Card>
        <Card title="Historique des actions de la plateforme">
          {t.platformActions.length === 0 ? (
            <p className="text-sm text-stone-500">Aucune action.</p>
          ) : (
            <ul className="divide-y divide-stone-100 text-sm">
              {t.platformActions.map((a) => (
                <li key={a.id} className="py-2">
                  <span className="font-medium text-stone-900">{ACTION_LABELS[a.action] ?? a.action}</span>
                  <span className="text-stone-500"> · {dateTime(a.createdAt)}</span>
                  {typeof a.after?.reason === 'string' && <span className="block text-xs text-stone-500">{a.after.reason}</span>}
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      {dialog === 'extend' && <ExtendTrialModal tenantId={id} onClose={() => setDialog(null)} onDone={() => { setDialog(null); refresh(); }} />}
      {dialog === 'suspend' && <SuspendModal tenantId={id} onClose={() => setDialog(null)} onDone={() => { setDialog(null); refresh(); }} />}
    </div>
  );
}

function ExtendTrialModal({ tenantId, onClose, onDone }: { tenantId: string; onClose: () => void; onDone: () => void }) {
  const [days, setDays] = useState('14');
  const extend = useMutation({ mutationFn: () => post(`/platform/tenants/${tenantId}/extend-trial`, { days: Number(days) }), onSuccess: onDone });
  return (
    <Modal
      open
      title="Prolonger l’essai"
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Annuler
          </Button>
          <Button loading={extend.isPending} onClick={() => extend.mutate()}>
            Prolonger
          </Button>
        </>
      }
    >
      <Field label="Nombre de jours supplémentaires" hint="Un essai expiré sans paiement est relancé ; la facture en attente est annulée.">
        {(id) => <Input id={id} type="number" min={1} max={90} className="w-32" value={days} onChange={(e) => setDays(e.target.value)} />}
      </Field>
      <ErrorMessage error={extend.error} />
    </Modal>
  );
}

function SuspendModal({ tenantId, onClose, onDone }: { tenantId: string; onClose: () => void; onDone: () => void }) {
  const [reason, setReason] = useState('');
  const suspend = useMutation({ mutationFn: () => post(`/platform/tenants/${tenantId}/suspend`, { reason }), onSuccess: onDone });
  return (
    <Modal
      open
      title="Suspendre ce salon"
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Annuler
          </Button>
          <Button variant="danger" loading={suspend.isPending} disabled={reason.trim().length < 3} onClick={() => suspend.mutate()}>
            Suspendre
          </Button>
        </>
      }
    >
      <p className="mb-3 text-sm text-stone-600">Le salon passe en consultation seule ; ses responsables sont prévenus (application et SMS) avec le motif.</p>
      <Field label="Motif (communiqué au salon)">{(id) => <Textarea id={id} value={reason} onChange={(e) => setReason(e.target.value)} />}</Field>
      <ErrorMessage error={suspend.error} />
    </Modal>
  );
}
