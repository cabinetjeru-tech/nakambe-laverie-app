'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import clsx from 'clsx';
import { Check, Smartphone, Globe } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';
import { Badge, Button, Card, ErrorMessage, Field, Input, Modal, PageHeader, Select, Spinner, Table, Td } from '@/components/ui';
import { get, post, refreshSession } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { BillingStatus, CYCLE, FEATURE_LABELS, INVOICE_STATUS, SUBSCRIPTION_STATUS, TENANT_STATUS } from '@/lib/billing';
import { date, money } from '@/lib/format';

interface Plan {
  code: string;
  name: string;
  description: string | null;
  currency: string;
  priceMonthly: number;
  priceYearly: number;
  yearlyMonthlyEquivalent: number;
  maxSalons: number | null;
  maxStaff: number | null;
  smsQuotaMonthly: number;
  features: string[];
}

interface Overview extends BillingStatus {
  usage: { salons: number; staff: number };
  plans: Plan[];
  pendingPayments: { id: string; invoiceId: string; amount: number; providerReference: string; createdAt: string }[];
  paymentOptions: { mobileMoney: { operator: string; number: string }[]; online: boolean; onlineProvider: string | null };
  settings: { graceDays: number; renewalLeadDays: number; vatPercent: number; supportPhone: string; supportEmail: string };
}

interface Invoice {
  id: string;
  number: string;
  kind: 'RENEWAL' | 'UPGRADE';
  description: string;
  status: string;
  periodStart: string;
  periodEnd: string;
  total: number;
  currency: string;
  dueAt: string;
  paidAt: string | null;
}

export default function AbonnementPage() {
  const queryClient = useQueryClient();
  const overview = useQuery({ queryKey: ['billing'], queryFn: () => get<Overview>('/billing') });
  const invoices = useQuery({ queryKey: ['billing-invoices'], queryFn: () => get<Invoice[]>('/billing/invoices') });
  const [cycle, setCycle] = useState<'MONTHLY' | 'YEARLY'>('MONTHLY');
  const [choosing, setChoosing] = useState<Plan | null>(null);
  const [paying, setPaying] = useState<Invoice | null>(null);
  const [cancelling, setCancelling] = useState(false);

  const refresh = () => {
    for (const key of ['billing', 'billing-invoices', 'billing-status', 'notifications-count']) queryClient.invalidateQueries({ queryKey: [key] });
  };
  const resume = useMutation({ mutationFn: () => post('/billing/resume'), onSuccess: refresh });

  if (overview.isLoading) return <Spinner />;
  if (overview.error || !overview.data) return <ErrorMessage error={overview.error} />;
  const o = overview.data;
  const current = o.plans.find((p) => p.code === o.plan?.code);
  const locked = o.tenantStatus === 'SUSPENDED' || o.tenantStatus === 'CANCELLED';
  const open = (invoices.data ?? []).filter((i) => i.status === 'OPEN');
  const pendingFor = new Set(o.pendingPayments.map((p) => p.invoiceId));

  return (
    <div className="space-y-6">
      <PageHeader title="Abonnement" description="Votre offre, vos factures et vos paiements à la plateforme." />

      {/* ------------------------------------------------ État */}
      <Card>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-stone-500">Offre actuelle</p>
            <p className="mt-1 text-2xl font-semibold text-stone-900">
              {o.plan?.name ?? '—'} <span className="text-base font-normal text-stone-500">· {CYCLE[o.cycle ?? 'MONTHLY']}</span>
            </p>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <Badge tone={TENANT_STATUS[o.tenantStatus]?.tone}>{TENANT_STATUS[o.tenantStatus]?.label ?? o.tenantStatus}</Badge>
              {o.subscriptionStatus && o.subscriptionStatus !== 'TRIALING' && o.subscriptionStatus !== o.tenantStatus && (
                <Badge tone={SUBSCRIPTION_STATUS[o.subscriptionStatus]?.tone}>Abonnement : {SUBSCRIPTION_STATUS[o.subscriptionStatus]?.label}</Badge>
              )}
            </div>
            <p className="mt-3 text-sm text-stone-600">
              {o.subscriptionStatus === 'TRIALING' && o.currentPeriodEnd && <>Essai gratuit jusqu’au {date(o.currentPeriodEnd)} ({o.daysLeft} jour{o.daysLeft === 1 ? '' : 's'}).</>}
              {o.subscriptionStatus === 'ACTIVE' && o.currentPeriodEnd && !o.cancelAtPeriodEnd && <>Prochain renouvellement le {date(o.currentPeriodEnd)}.</>}
              {o.tenantStatus === 'PAST_DUE' && o.graceEndsAt && <>Échéance dépassée : réglez votre facture avant le {date(o.graceEndsAt)}.</>}
              {o.tenantStatus === 'SUSPENDED' && <>Salon en consultation seule depuis le {date(o.suspendedAt!)}. Le paiement réactive tout immédiatement.</>}
              {o.tenantStatus === 'CANCELLED' && <>Abonnement résilié. Choisissez une offre ci-dessous pour vous réabonner.</>}
            </p>
            {o.pendingPlan && (
              <p className="mt-1 text-sm text-stone-600">
                Changement programmé au renouvellement : offre <strong>{o.pendingPlan.name}</strong>
                {o.pendingCycle ? ` (${CYCLE[o.pendingCycle].toLowerCase()})` : ''}.
              </p>
            )}
            {o.cancelAtPeriodEnd && o.currentPeriodEnd && (
              <div className="mt-2 flex flex-wrap items-center gap-2 text-sm text-amber-800">
                Résiliation programmée le {date(o.currentPeriodEnd)}.
                <Button size="sm" variant="secondary" loading={resume.isPending} onClick={() => resume.mutate()}>
                  Annuler la résiliation
                </Button>
              </div>
            )}
          </div>
          <dl className="grid grid-cols-2 gap-x-6 gap-y-1 text-sm">
            <dt className="text-stone-500">Salons</dt>
            <dd className="tabular-nums text-stone-900">
              {o.usage.salons} / {current?.maxSalons ?? '∞'}
            </dd>
            <dt className="text-stone-500">Employés actifs</dt>
            <dd className="tabular-nums text-stone-900">
              {o.usage.staff} / {current?.maxStaff ?? '∞'}
            </dd>
            <dt className="text-stone-500">SMS inclus / mois</dt>
            <dd className="tabular-nums text-stone-900">{current?.smsQuotaMonthly ?? 0}</dd>
          </dl>
        </div>
        {open.length > 0 && (
          <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-lg bg-amber-50 px-4 py-3">
            <p className="text-sm text-amber-900">
              {open.length === 1 ? `Facture ${open[0].number} à régler` : `${open.length} factures à régler`} :{' '}
              <strong>{money(open.reduce((s, i) => s + Number(i.total), 0))}</strong>
              {open.length === 1 && <> avant le {date(open[0].dueAt)}</>}.
            </p>
            {pendingFor.has(open[0].id) ? (
              <Badge tone="amber">Paiement en cours de vérification</Badge>
            ) : (
              <Button onClick={() => setPaying(open[0])}>Payer maintenant</Button>
            )}
          </div>
        )}
      </Card>

      {/* ------------------------------------------------ Offres */}
      <section>
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-base font-semibold text-stone-900">Offres</h2>
          <div role="radiogroup" aria-label="Cycle de facturation" className="inline-flex rounded-lg border border-stone-300 bg-white p-0.5">
            {(['MONTHLY', 'YEARLY'] as const).map((c) => (
              <button
                key={c}
                role="radio"
                aria-checked={cycle === c}
                onClick={() => setCycle(c)}
                className={clsx('rounded-md px-3 py-1.5 text-sm font-medium', cycle === c ? 'bg-brand-600 text-white' : 'text-stone-700 hover:bg-stone-100')}
              >
                {c === 'MONTHLY' ? 'Mensuel' : 'Annuel · 2 mois offerts'}
              </button>
            ))}
          </div>
        </div>
        <div className="grid gap-4 md:grid-cols-3">
          {o.plans.map((plan) => {
            const isCurrent = plan.code === o.plan?.code && cycle === o.cycle && !locked;
            const price = cycle === 'YEARLY' ? plan.priceYearly : plan.priceMonthly;
            return (
              <div key={plan.code} className={clsx('flex flex-col rounded-xl border bg-white p-5', isCurrent ? 'border-brand-500 ring-1 ring-brand-500' : 'border-stone-200')}>
                <div className="flex items-center justify-between">
                  <h3 className="text-base font-semibold text-stone-900">{plan.name}</h3>
                  {isCurrent && <Badge tone="violet">Votre offre</Badge>}
                </div>
                {plan.description && <p className="mt-1 text-sm text-stone-500">{plan.description}</p>}
                <p className="mt-3">
                  <span className="text-2xl font-semibold tabular-nums text-stone-900">{money(price, plan.currency)}</span>
                  <span className="text-sm text-stone-500"> / {cycle === 'YEARLY' ? 'an' : 'mois'}</span>
                </p>
                {cycle === 'YEARLY' && <p className="text-xs text-stone-500">soit {money(plan.yearlyMonthlyEquivalent)} par mois</p>}
                <ul className="mt-4 flex-1 space-y-1.5 text-sm text-stone-700">
                  <li className="flex gap-2">
                    <Check className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" aria-hidden />
                    {plan.maxSalons === null ? 'Salons illimités' : `${plan.maxSalons} salon${plan.maxSalons > 1 ? 's' : ''}`}
                  </li>
                  <li className="flex gap-2">
                    <Check className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" aria-hidden />
                    {plan.maxStaff === null ? 'Employés illimités' : `Jusqu’à ${plan.maxStaff} employés`}
                  </li>
                  {plan.smsQuotaMonthly > 0 && (
                    <li className="flex gap-2">
                      <Check className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" aria-hidden />
                      {plan.smsQuotaMonthly} SMS de rappel / mois
                    </li>
                  )}
                  {plan.features.map((f) => (
                    <li key={f} className="flex gap-2">
                      <Check className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" aria-hidden />
                      {FEATURE_LABELS[f] ?? f}
                    </li>
                  ))}
                </ul>
                <Button className="mt-5" variant={isCurrent ? 'secondary' : 'primary'} disabled={isCurrent} onClick={() => setChoosing(plan)}>
                  {isCurrent ? 'Offre actuelle' : locked ? 'Choisir et payer' : 'Choisir cette offre'}
                </Button>
              </div>
            );
          })}
        </div>
      </section>

      {/* ------------------------------------------------ Factures */}
      <Card title="Factures">
        {invoices.isLoading ? (
          <Spinner />
        ) : (
          <Table head={['N°', 'Objet', 'Période', 'Montant', 'Échéance', 'Statut', '']} empty={invoices.data?.length === 0}>
            {invoices.data?.map((invoice) => (
              <tr key={invoice.id}>
                <Td className="font-medium">{invoice.number}</Td>
                <Td className="max-w-[16rem] truncate">{invoice.description}</Td>
                <Td>
                  {date(invoice.periodStart)} → {date(invoice.periodEnd)}
                </Td>
                <Td className="tabular-nums">{money(invoice.total, invoice.currency)}</Td>
                <Td>{invoice.paidAt ? `Payée le ${date(invoice.paidAt)}` : date(invoice.dueAt)}</Td>
                <Td>
                  {pendingFor.has(invoice.id) ? (
                    <Badge tone="amber">Vérification en cours</Badge>
                  ) : (
                    <Badge tone={INVOICE_STATUS[invoice.status]?.tone}>{INVOICE_STATUS[invoice.status]?.label}</Badge>
                  )}
                </Td>
                <Td className="text-right">
                  <div className="flex justify-end gap-2">
                    {invoice.status === 'OPEN' && !pendingFor.has(invoice.id) && (
                      <Button size="sm" onClick={() => setPaying(invoice)}>
                        Payer
                      </Button>
                    )}
                    <Link href={`/abonnement/factures/${invoice.id}`} className="inline-flex h-8 items-center rounded-lg px-3 text-sm font-medium text-brand-700 hover:bg-brand-50">
                      Voir
                    </Link>
                  </div>
                </Td>
              </tr>
            ))}
          </Table>
        )}
      </Card>

      {!locked && !o.cancelAtPeriodEnd && (
        <Card title="Résilier">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="max-w-2xl text-sm text-stone-600">
              La résiliation prend effet à la fin de la période en cours : jusque-là, tout reste accessible. Ensuite, le salon passe en consultation
              seule : vos données sont conservées et vous pouvez vous réabonner à tout moment.
            </p>
            <Button variant="secondary" onClick={() => setCancelling(true)}>
              Résilier l’abonnement
            </Button>
          </div>
        </Card>
      )}

      {choosing && <ChoosePlanModal plan={choosing} cycle={cycle} overview={o} onClose={() => setChoosing(null)} onDone={(invoice) => { setChoosing(null); refresh(); if (invoice) setPaying(invoice); }} />}
      {paying && <PayModal invoice={paying} overview={o} onClose={() => setPaying(null)} onDone={() => { setPaying(null); refresh(); }} />}
      {cancelling && <CancelModal endsAt={o.currentPeriodEnd} onClose={() => setCancelling(false)} onDone={() => { setCancelling(false); refresh(); }} />}
    </div>
  );
}

function ChoosePlanModal({ plan, cycle, overview, onClose, onDone }: { plan: Plan; cycle: 'MONTHLY' | 'YEARLY'; overview: Overview; onClose: () => void; onDone: (invoice: Invoice | null) => void }) {
  const { reload } = useAuth();
  const current = overview.plans.find((p) => p.code === overview.plan?.code);
  const price = cycle === 'YEARLY' ? plan.priceYearly : plan.priceMonthly;
  const currentPrice = current ? (cycle === 'YEARLY' ? current.priceYearly : current.priceMonthly) : 0;
  const trial = overview.subscriptionStatus === 'TRIALING';
  const locked = overview.tenantStatus === 'SUSPENDED' || overview.tenantStatus === 'CANCELLED' || overview.tenantStatus === 'PAST_DUE';
  const upgrade = !trial && !locked && cycle === overview.cycle && price > currentPrice;

  const change = useMutation({
    mutationFn: () => post<{ applied: 'now' | 'on_payment' | 'at_renewal'; invoiceId: string | null }>('/billing/plan', { planCode: plan.code, cycle }),
    onSuccess: async (result) => {
      // Les fonctionnalités ont pu changer : on renouvelle la session pour mettre le menu à jour.
      await refreshSession();
      await reload().catch(() => undefined);
      if (result.invoiceId) onDone(await get<Invoice>(`/billing/invoices/${result.invoiceId}`));
      else onDone(null);
    },
  });

  return (
    <Modal
      open
      title={`Offre ${plan.name} — ${CYCLE[cycle].toLowerCase()}`}
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Annuler
          </Button>
          <Button loading={change.isPending} onClick={() => change.mutate()}>
            Confirmer
          </Button>
        </>
      }
    >
      <div className="space-y-3 text-sm text-stone-700">
        <p>
          <strong>{money(price, plan.currency)}</strong> par {cycle === 'YEARLY' ? 'an' : 'mois'}.
        </p>
        {trial && <p>Vous êtes en période d’essai : l’offre change tout de suite, et votre essai continue jusqu’à son terme. Rien à payer maintenant.</p>}
        {locked && <p>Une facture est émise ; dès son paiement, votre salon est pleinement réactivé avec cette offre.</p>}
        {upgrade && (
          <p>
            Offre supérieure : une facture de la différence, calculée au prorata des jours restants, est émise. La nouvelle offre s’active dès son
            paiement.
          </p>
        )}
        {!trial && !locked && !upgrade && (
          <p>
            Le changement s’appliquera au prochain renouvellement{overview.currentPeriodEnd ? `, le ${date(overview.currentPeriodEnd)}` : ''}. Vous gardez
            votre offre actuelle d’ici là.
          </p>
        )}
        <ErrorMessage error={change.error} />
      </div>
    </Modal>
  );
}

function PayModal({ invoice, overview, onClose, onDone }: { invoice: Invoice; overview: Overview; onClose: () => void; onDone: () => void }) {
  const hasMobileMoney = overview.paymentOptions.mobileMoney.length > 0;
  const [method, setMethod] = useState<'MOBILE_MONEY_MANUAL' | 'ONLINE'>(overview.paymentOptions.online ? 'ONLINE' : 'MOBILE_MONEY_MANUAL');
  const [reference, setReference] = useState('');
  const [operator, setOperator] = useState(overview.paymentOptions.mobileMoney[0]?.operator ?? '');
  const [payerPhone, setPayerPhone] = useState('');
  const [declared, setDeclared] = useState(false);

  const pay = useMutation({
    mutationFn: () =>
      post<{ paymentId: string; status: string; checkoutUrl: string | null }>(
        `/billing/invoices/${invoice.id}/pay`,
        method === 'ONLINE' ? { method } : { method, reference: reference.trim(), operator: operator || undefined, payerPhone: payerPhone.trim() || undefined },
      ),
    onSuccess: (result) => {
      if (result.checkoutUrl) window.location.href = result.checkoutUrl;
      else setDeclared(true);
    },
  });

  if (declared) {
    return (
      <Modal open title="Paiement déclaré" onClose={onDone} footer={<Button onClick={onDone}>Fermer</Button>}>
        <p className="text-sm text-stone-700">
          Merci ! Notre équipe vérifie la transaction <strong>{reference.trim().toUpperCase()}</strong> sur son relevé Mobile Money, en général dans la
          journée ouvrée. Vous recevrez une notification dès la validation.
        </p>
      </Modal>
    );
  }

  return (
    <Modal open title={`Payer la facture ${invoice.number}`} onClose={onClose}>
      <p className="text-sm text-stone-600">{invoice.description}</p>
      <p className="mt-1 text-2xl font-semibold tabular-nums text-stone-900">{money(invoice.total, invoice.currency)}</p>

      <div role="radiogroup" aria-label="Mode de paiement" className="mt-4 grid gap-2 sm:grid-cols-2">
        {overview.paymentOptions.online && (
          <button
            role="radio"
            aria-checked={method === 'ONLINE'}
            onClick={() => setMethod('ONLINE')}
            className={clsx('flex items-start gap-3 rounded-lg border p-3 text-left', method === 'ONLINE' ? 'border-brand-500 ring-1 ring-brand-500' : 'border-stone-200')}
          >
            <Globe className="mt-0.5 h-5 w-5 text-brand-600" aria-hidden />
            <span>
              <span className="block text-sm font-medium text-stone-900">Paiement en ligne</span>
              <span className="block text-xs text-stone-500">Orange Money, Moov Money, carte — confirmé automatiquement</span>
            </span>
          </button>
        )}
        {hasMobileMoney && (
          <button
            role="radio"
            aria-checked={method === 'MOBILE_MONEY_MANUAL'}
            onClick={() => setMethod('MOBILE_MONEY_MANUAL')}
            className={clsx('flex items-start gap-3 rounded-lg border p-3 text-left', method === 'MOBILE_MONEY_MANUAL' ? 'border-brand-500 ring-1 ring-brand-500' : 'border-stone-200')}
          >
            <Smartphone className="mt-0.5 h-5 w-5 text-brand-600" aria-hidden />
            <span>
              <span className="block text-sm font-medium text-stone-900">Transfert Mobile Money</span>
              <span className="block text-xs text-stone-500">Vous envoyez, puis saisissez la référence reçue par SMS</span>
            </span>
          </button>
        )}
      </div>

      {method === 'MOBILE_MONEY_MANUAL' ? (
        <form
          className="mt-4 space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            pay.mutate();
          }}
        >
          <ol className="list-decimal space-y-1 pl-5 text-sm text-stone-700">
            <li>
              Envoyez <strong>{money(invoice.total, invoice.currency)}</strong> à l’un de ces numéros :
              <ul className="mt-1 space-y-0.5">
                {overview.paymentOptions.mobileMoney.map((m) => (
                  <li key={m.number}>
                    {m.operator} : <strong className="tabular-nums">{m.number}</strong>
                  </li>
                ))}
              </ul>
            </li>
            <li>Saisissez la référence de la transaction indiquée dans le SMS de confirmation.</li>
          </ol>
          <Field label="Référence de la transaction">{(id) => <Input id={id} required value={reference} onChange={(e) => setReference(e.target.value)} placeholder="ex. PP240925.1532.A12345" />}</Field>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Opérateur">
              {(id) => (
                <Select id={id} value={operator} onChange={(e) => setOperator(e.target.value)}>
                  {overview.paymentOptions.mobileMoney.map((m) => (
                    <option key={m.operator}>{m.operator}</option>
                  ))}
                </Select>
              )}
            </Field>
            <Field label="Numéro utilisé (facultatif)">{(id) => <Input id={id} value={payerPhone} onChange={(e) => setPayerPhone(e.target.value)} inputMode="tel" />}</Field>
          </div>
          <ErrorMessage error={pay.error} />
          <div className="flex justify-end gap-2 pt-1">
            <Button type="button" variant="secondary" onClick={onClose}>
              Annuler
            </Button>
            <Button type="submit" loading={pay.isPending} disabled={reference.trim().length < 4}>
              Déclarer mon paiement
            </Button>
          </div>
        </form>
      ) : (
        <div className="mt-4 space-y-3">
          <p className="text-sm text-stone-600">Vous allez être redirigé vers la page de paiement sécurisée. La facture est réglée dès la confirmation de l’opérateur.</p>
          <ErrorMessage error={pay.error} />
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={onClose}>
              Annuler
            </Button>
            <Button loading={pay.isPending} onClick={() => pay.mutate()}>
              Continuer vers le paiement
            </Button>
          </div>
        </div>
      )}
    </Modal>
  );
}

function CancelModal({ endsAt, onClose, onDone }: { endsAt: string | null; onClose: () => void; onDone: () => void }) {
  const cancel = useMutation({ mutationFn: () => post('/billing/cancel'), onSuccess: onDone });
  return (
    <Modal
      open
      title="Résilier l’abonnement ?"
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Garder mon abonnement
          </Button>
          <Button variant="danger" loading={cancel.isPending} onClick={() => cancel.mutate()}>
            Résilier
          </Button>
        </>
      }
    >
      <p className="text-sm text-stone-700">
        Tout reste accessible jusqu’au {endsAt ? date(endsAt) : 'terme de la période'}. Ensuite, le salon passe en consultation seule ; vos données sont
        conservées. Vous pourrez annuler la résiliation d’ici là.
      </p>
      <ErrorMessage error={cancel.error} />
    </Modal>
  );
}
