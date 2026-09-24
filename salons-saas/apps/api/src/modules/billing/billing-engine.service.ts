import { randomBytes } from 'node:crypto';
import { BadRequestException, ConflictException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { BillingCycle, Prisma, SaasSubscription, Tenant } from '@prisma/client';
import { PlatformDbService, PlatformTx } from '../../core/platform/platform-db.service';
import { PlatformSettingsService } from '../../core/platform/platform-settings.service';
import { addCycle, DAY_MS, daysBetween, priceFor, prorata } from './billing-periods';
import { BillingNotifier, formatDate, formatMoney } from './billing-notifier.service';

type Sub = SaasSubscription & { tenant: Tenant; plan: { id: string; code: string; name: string; priceMonthly: bigint; priceYearly: bigint } };

const TRIAL_REMINDER_DAYS = [7, 3, 1];
const INVOICE_REMINDER_DAYS = [3, 1];
const UPGRADE_DUE_DAYS = 3;
const ACTIVE_SUBSCRIPTIONS = ['TRIALING', 'ACTIVE', 'PAST_DUE'] as const;

/**
 * Moteur de facturation de la plateforme (connexion salons_platform).
 *
 * Cycle de vie d'un abonnement :
 *   essai (période gratuite) ─┐
 *                             ├─ facture de la période suivante émise N jours avant l'échéance
 *   actif ────────────────────┘      │ payée → période prolongée depuis l'échéance, sans trou
 *                                    │ impayée à l'échéance → IMPAYÉ (accès complet, délai de grâce)
 *                                    │   └─ fin du délai → SUSPENDU (lecture seule, données conservées)
 *                                    │        └─ paiement → réactivé, nouvelle période depuis le paiement
 *   résiliation demandée → fin de période → RÉSILIÉ (lecture seule)
 *
 * Chaque opération verrouille la ligne d'abonnement (FOR UPDATE) : planificateur, webhooks
 * et actions manuelles ne peuvent pas se marcher dessus. Toutes les méthodes reçoivent
 * `now`, ce qui rend le cycle entièrement testable.
 */
@Injectable()
export class BillingEngine {
  private readonly logger = new Logger(BillingEngine.name);

  constructor(
    private readonly platform: PlatformDbService,
    private readonly notifier: BillingNotifier,
    private readonly settings: PlatformSettingsService,
  ) {}

  // ================================================================== Planificateur

  /** Passe quotidienne (ou plus fréquente) : idempotente, rejouable, un salon à la fois. */
  async runDue(now = new Date()): Promise<{ processed: number; errors: number }> {
    const horizon = new Date(now.getTime() + Math.max((await this.settings.get()).renewalLeadDays, 7) * DAY_MS);
    const candidates = await this.platform.client.saasSubscription.findMany({
      where: {
        OR: [
          { status: { in: [...ACTIVE_SUBSCRIPTIONS] }, currentPeriodEnd: { lte: horizon } },
          { status: 'PAST_DUE' },
        ],
      },
      select: { id: true },
    });
    let errors = 0;
    for (const { id } of candidates) {
      try {
        await this.platform.transaction((tx) => this.processSubscription(tx, id, now));
      } catch (error) {
        errors += 1;
        this.logger.error(`Facturation : échec sur l'abonnement ${id} : ${(error as Error).message}`);
      }
    }
    return { processed: candidates.length, errors };
  }

  private async processSubscription(tx: PlatformTx, subscriptionId: string, now: Date) {
    let sub = await this.lockSubscription(tx, subscriptionId);
    const tz = sub.tenant.timezone;
    const end = sub.currentPeriodEnd;

    if (sub.status === 'TRIALING' || sub.status === 'ACTIVE') {
      // 1. Facture de la période suivante, N jours avant l'échéance.
      if (!sub.cancelAtPeriodEnd && now.getTime() >= end.getTime() - (await this.settings.get()).renewalLeadDays * DAY_MS) {
        await this.ensureRenewalInvoice(tx, sub, now);
      }
      // 2. Rappels avant échéance.
      if (now < end) {
        const daysLeft = daysBetween(now, end);
        if (sub.status === 'TRIALING' && !sub.cancelAtPeriodEnd) {
          const step = TRIAL_REMINDER_DAYS.find((d) => daysLeft <= d && daysLeft > (TRIAL_REMINDER_DAYS[TRIAL_REMINDER_DAYS.indexOf(d) + 1] ?? 0));
          if (step !== undefined) {
            await this.notifier.notify(tx, sub.tenantId, {
              event: 'trial.ending',
              title: step === 1 ? 'Votre essai se termine demain' : `Votre essai se termine dans ${step} jours`,
              body: `Fin de l'essai le ${formatDate(end, tz)}. Réglez votre première facture pour continuer sans interruption.`,
              dedupeKey: `trial-ending-${step}-${end.toISOString()}`,
              sms: step === 1,
            });
          }
        }
        const open = await this.openRenewalInvoice(tx, sub);
        if (open && sub.status === 'ACTIVE') {
          const step = INVOICE_REMINDER_DAYS.find((d) => daysLeft <= d && daysLeft > (INVOICE_REMINDER_DAYS[INVOICE_REMINDER_DAYS.indexOf(d) + 1] ?? 0));
          if (step !== undefined) {
            await this.notifier.notify(tx, sub.tenantId, {
              event: 'invoice.due',
              title: `Facture ${open.number} à régler ${step === 1 ? 'demain' : `dans ${step} jours`}`,
              body: `${formatMoney(open.total, open.currency)} avant le ${formatDate(open.dueAt, tz)}.`,
              dedupeKey: `invoice-due-${step}-${open.id}`,
              sms: step === 1,
            });
          }
        }
      }
      // 3. Échéance atteinte.
      if (now >= end) {
        if (sub.cancelAtPeriodEnd) {
          await this.terminate(tx, sub, now);
          return;
        }
        const wasTrial = sub.status === 'TRIALING';
        const graceEndsAt = new Date(end.getTime() + (await this.settings.get()).graceDays * DAY_MS);
        await tx.saasSubscription.update({ where: { id: sub.id }, data: { status: 'PAST_DUE', pastDueSince: end } });
        await tx.tenant.update({ where: { id: sub.tenantId }, data: { status: 'PAST_DUE', graceEndsAt } });
        await this.ensureRenewalInvoice(tx, sub, now);
        await this.notifier.notify(tx, sub.tenantId, {
          event: wasTrial ? 'trial.expired' : 'subscription.past_due',
          title: wasTrial ? 'Votre période d’essai est terminée' : 'Votre abonnement est arrivé à échéance',
          body: `Réglez votre facture avant le ${formatDate(graceEndsAt, tz)} : passé ce délai, votre salon passera en consultation seule.`,
          dedupeKey: `past-due-${end.toISOString()}`,
          sms: true,
        });
        sub = await this.lockSubscription(tx, subscriptionId);
      }
    }

    // 4. Fin du délai de grâce → suspension automatique (lecture seule, données conservées).
    if (sub.status === 'PAST_DUE' && sub.tenant.status === 'PAST_DUE' && sub.tenant.graceEndsAt && now >= sub.tenant.graceEndsAt) {
      await tx.tenant.update({
        where: { id: sub.tenantId },
        data: { status: 'SUSPENDED', suspendedAt: now, suspensionReason: 'Abonnement impayé' },
      });
      await this.notifier.notify(tx, sub.tenantId, {
        event: 'subscription.suspended',
        title: 'Votre salon est passé en consultation seule',
        body: 'Abonnement impayé : vos données sont conservées et consultables. Réglez votre facture pour tout réactiver immédiatement.',
        dedupeKey: `suspended-${sub.pastDueSince?.toISOString() ?? now.toISOString()}`,
        sms: true,
      });
    }
  }

  // ================================================================== Factures

  /** Facture de la période qui suit l'échéance courante (unique par période). */
  private async ensureRenewalInvoice(tx: PlatformTx, sub: Sub, now: Date) {
    const existing = await tx.saasInvoice.findFirst({
      where: { subscriptionId: sub.id, kind: 'RENEWAL', periodStart: sub.currentPeriodEnd, status: { not: 'VOID' } },
    });
    if (existing) return existing;
    const planId = sub.pendingPlanId ?? sub.planId;
    const cycle = sub.pendingCycle ?? sub.cycle;
    const plan = await tx.plan.findUniqueOrThrow({ where: { id: planId } });
    const amount = priceFor(plan, cycle);
    if (amount <= 0n) return null;
    const periodStart = sub.currentPeriodEnd;
    const periodEnd = addCycle(periodStart, cycle);
    const invoice = await this.createInvoice(tx, {
      tenant: sub.tenant,
      subscriptionId: sub.id,
      kind: 'RENEWAL',
      planId,
      cycle,
      description: `Abonnement ${plan.name} — ${cycle === 'YEARLY' ? 'annuel' : 'mensuel'}`,
      subtotal: amount,
      periodStart,
      periodEnd,
      dueAt: periodStart < now ? now : periodStart,
    });
    await this.notifier.notify(tx, sub.tenantId, {
      event: 'invoice.created',
      title: `Nouvelle facture ${invoice.number}`,
      body: `${formatMoney(invoice.total, invoice.currency)} — ${invoice.description}, à régler avant le ${formatDate(invoice.dueAt, sub.tenant.timezone)}.`,
      dedupeKey: `invoice-created-${invoice.id}`,
    });
    return invoice;
  }

  private async createInvoice(
    tx: PlatformTx,
    params: {
      tenant: Tenant;
      subscriptionId: string;
      kind: 'RENEWAL' | 'UPGRADE';
      planId: string;
      cycle: BillingCycle;
      description: string;
      subtotal: bigint;
      periodStart: Date;
      periodEnd: Date;
      dueAt: Date;
    },
  ) {
    const taxAmount = (params.subtotal * BigInt(Math.round((await this.settings.get()).vatPercent * 100))) / 10_000n;
    const year = new Date().getUTCFullYear();
    const sequence = await tx.platformSequence.upsert({
      where: { docType_year: { docType: 'SAAS_INVOICE', year } },
      create: { docType: 'SAAS_INVOICE', year, value: 1 },
      update: { value: { increment: 1 } },
    });
    return tx.saasInvoice.create({
      data: {
        tenantId: params.tenant.id,
        subscriptionId: params.subscriptionId,
        number: `FS-${year}-${String(sequence.value).padStart(6, '0')}`,
        kind: params.kind,
        planId: params.planId,
        cycle: params.cycle,
        description: params.description,
        status: 'OPEN',
        periodStart: params.periodStart,
        periodEnd: params.periodEnd,
        subtotal: params.subtotal,
        taxAmount,
        total: params.subtotal + taxAmount,
        currency: params.tenant.currency,
        dueAt: params.dueAt,
        buyerSnapshot: {
          legalName: params.tenant.legalName,
          displayName: params.tenant.displayName,
          taxId: params.tenant.taxId,
          tradeRegister: params.tenant.tradeRegister,
          countryCode: params.tenant.countryCode,
        },
      },
    });
  }

  private openRenewalInvoice(tx: PlatformTx, sub: Sub) {
    return tx.saasInvoice.findFirst({ where: { subscriptionId: sub.id, kind: 'RENEWAL', status: 'OPEN' }, orderBy: { periodStart: 'desc' } });
  }

  /** Annule les factures ouvertes sans paiement en cours (changement d'offre, résiliation…). */
  private async voidOpenInvoices(tx: PlatformTx, sub: Sub, reason: string, kinds: ('RENEWAL' | 'UPGRADE')[] = ['RENEWAL', 'UPGRADE']) {
    const open = await tx.saasInvoice.findMany({
      where: { subscriptionId: sub.id, status: 'OPEN', kind: { in: kinds }, payments: { none: { status: 'PENDING' } } },
      select: { id: true },
    });
    if (open.length === 0) return 0;
    await tx.saasInvoice.updateMany({ where: { id: { in: open.map((i) => i.id) } }, data: { status: 'VOID', voidedAt: new Date(), voidReason: reason } });
    return open.length;
  }

  // ================================================================== Paiements

  /**
   * Paiement confirmé (Mobile Money validé par l'éditeur, ou agrégateur vérifié).
   * Idempotent : un paiement déjà appliqué n'a aucun effet.
   */
  async applyPayment(tx: PlatformTx, paymentId: string, now: Date, validatedBy?: string) {
    await tx.$queryRaw`SELECT id FROM saas_payments WHERE id = ${paymentId}::uuid FOR UPDATE`;
    const payment = await tx.saasPayment.findUniqueOrThrow({ where: { id: paymentId }, include: { invoice: true } });
    if (payment.status === 'SUCCEEDED') return payment;
    if (payment.status !== 'PENDING') throw new ConflictException('Ce paiement a déjà été traité.');

    await tx.saasPayment.update({
      where: { id: paymentId },
      data: { status: 'SUCCEEDED', paidAt: now, validatedBy: validatedBy ?? null },
    });
    const invoice = payment.invoice;
    if (invoice.status === 'PAID') {
      // Deuxième paiement d'une facture déjà réglée : l'argent est reçu, on le signale.
      await tx.saasPayment.update({ where: { id: paymentId }, data: { failureReason: 'Facture déjà réglée : paiement en double, à rembourser' } });
      this.logger.warn(`Paiement en double sur la facture ${invoice.number}`);
      return payment;
    }
    await tx.saasInvoice.update({ where: { id: invoice.id }, data: { status: 'PAID', paidAt: now, voidedAt: null, voidReason: null } });

    const sub = await this.lockSubscription(tx, invoice.subscriptionId!);
    const tz = sub.tenant.timezone;
    const planChanged = sub.tenant.planId !== invoice.planId;
    const wasLocked = sub.tenant.status === 'SUSPENDED' || sub.tenant.status === 'CANCELLED';

    if (invoice.kind === 'RENEWAL') {
      // Réactivation après suspension : la nouvelle période démarre au paiement (on ne fait pas
      // payer le temps passé en lecture seule). Sinon : continuité depuis l'échéance, sans trou.
      const start = wasLocked && invoice.periodStart < now ? now : invoice.periodStart;
      const end = wasLocked && invoice.periodStart < now ? addCycle(now, invoice.cycle) : invoice.periodEnd;
      await tx.saasSubscription.update({
        where: { id: sub.id },
        data: {
          status: 'ACTIVE',
          planId: invoice.planId,
          cycle: invoice.cycle,
          unitPrice: invoice.subtotal,
          currentPeriodStart: start,
          currentPeriodEnd: end,
          pendingPlanId: sub.pendingPlanId === invoice.planId ? null : sub.pendingPlanId,
          pendingCycle: sub.pendingCycle === invoice.cycle ? null : sub.pendingCycle,
          pastDueSince: null,
          cancelAtPeriodEnd: false,
          cancelledAt: null,
        },
      });
    } else {
      const plan = await tx.plan.findUniqueOrThrow({ where: { id: invoice.planId } });
      await tx.saasSubscription.update({
        where: { id: sub.id },
        data: { planId: plan.id, unitPrice: priceFor(plan, sub.cycle), pendingPlanId: null },
      });
      // La facture de renouvellement déjà émise portait l'ancienne offre : elle est refaite.
      if (await this.voidOpenInvoices(tx, sub, 'Remplacée après changement d’offre', ['RENEWAL'])) {
        await this.ensureRenewalInvoice(tx, await this.lockSubscription(tx, sub.id), now);
      }
    }

    await tx.tenant.update({
      where: { id: sub.tenantId },
      data: {
        status: sub.status === 'TRIALING' && invoice.kind === 'UPGRADE' ? 'TRIAL' : 'ACTIVE',
        planId: invoice.planId,
        graceEndsAt: null,
        suspendedAt: null,
        suspensionReason: null,
        cancelledAt: null,
      },
    });
    if (planChanged) await this.refreshAccess(tx, sub.tenantId);

    const refreshed = await this.lockSubscription(tx, sub.id);
    await this.notifier.notify(tx, sub.tenantId, {
      event: 'payment.received',
      title: 'Paiement reçu, merci !',
      body: `${formatMoney(payment.amount, payment.currency)} pour la facture ${invoice.number}. Abonnement ${refreshed.plan.name} actif jusqu'au ${formatDate(refreshed.currentPeriodEnd, tz)}.`,
      dedupeKey: `payment-received-${paymentId}`,
      sms: true,
    });
    if (wasLocked) {
      await this.notifier.notify(tx, sub.tenantId, {
        event: 'subscription.reactivated',
        title: 'Votre salon est de nouveau pleinement accessible',
        body: 'Toutes les fonctions sont réactivées. Vos données ont été conservées.',
        dedupeKey: `reactivated-${paymentId}`,
      });
    }
    return payment;
  }

  async failPayment(tx: PlatformTx, paymentId: string, reason: string) {
    const payment = await tx.saasPayment.findUniqueOrThrow({ where: { id: paymentId }, include: { invoice: true } });
    if (payment.status !== 'PENDING') return payment;
    await tx.saasPayment.update({ where: { id: paymentId }, data: { status: 'FAILED', failureReason: reason } });
    await this.notifier.notify(tx, payment.tenantId, {
      event: 'payment.failed',
      title: 'Paiement non abouti',
      body: `Le paiement de ${formatMoney(payment.amount, payment.currency)} pour la facture ${payment.invoice.number} n'a pas pu être confirmé (${reason}). Vous pouvez réessayer.`,
      dedupeKey: `payment-failed-${paymentId}`,
    });
    return payment;
  }

  /** Paiement Mobile Money envoyé au numéro de la plateforme : en attente de vérification. */
  async submitManualPayment(
    tenantId: string,
    invoiceId: string,
    input: { reference: string; operator?: string; payerPhone?: string; userId: string },
  ) {
    return this.platform.transaction(async (tx) => {
      const invoice = await this.payableInvoice(tx, tenantId, invoiceId);
      try {
        return await tx.saasPayment.create({
          data: {
            tenantId,
            invoiceId: invoice.id,
            method: 'MOBILE_MONEY_MANUAL',
            provider: 'manual',
            amount: invoice.total,
            currency: invoice.currency,
            providerReference: input.reference.trim().toUpperCase(),
            operator: input.operator ?? null,
            payerPhone: input.payerPhone ?? null,
            idempotencyKey: `manual-${invoice.id}-${randomBytes(6).toString('hex')}`,
            createdBy: input.userId,
          },
        });
      } catch (error) {
        if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
          throw new ConflictException('Cette référence de transaction a déjà été déclarée.');
        }
        throw error;
      }
    });
  }

  /** Crée le paiement en ligne en attente ; l'appel à l'agrégateur se fait hors transaction. */
  async createOnlinePayment(tenantId: string, invoiceId: string, provider: string, userId: string) {
    return this.platform.transaction(async (tx) => {
      const invoice = await this.payableInvoice(tx, tenantId, invoiceId);
      const payment = await tx.saasPayment.create({
        data: {
          tenantId,
          invoiceId: invoice.id,
          method: provider === 'cinetpay' ? 'CINETPAY' : 'CARD',
          provider,
          amount: invoice.total,
          currency: invoice.currency,
          providerToken: `SAAS${Date.now()}${randomBytes(5).toString('hex')}`.toUpperCase(),
          idempotencyKey: `online-${invoice.id}-${randomBytes(6).toString('hex')}`,
          createdBy: userId,
        },
      });
      return { payment, invoice };
    });
  }

  private async payableInvoice(tx: PlatformTx, tenantId: string, invoiceId: string) {
    const invoice = await tx.saasInvoice.findFirst({ where: { id: invoiceId, tenantId } });
    if (!invoice) throw new NotFoundException('Facture introuvable.');
    if (invoice.status !== 'OPEN') throw new ConflictException('Cette facture n’est plus à régler.');
    const pending = await tx.saasPayment.count({ where: { invoiceId, status: 'PENDING', method: 'MOBILE_MONEY_MANUAL' } });
    if (pending > 0) throw new ConflictException('Un paiement Mobile Money est déjà en cours de vérification pour cette facture.');
    return invoice;
  }

  // ================================================================== Offre, résiliation

  /**
   * Changement d'offre ou de cycle :
   * - pendant l'essai : immédiat ;
   * - offre supérieure en cours de période : facture de la différence au prorata, l'offre
   *   change dès le paiement ;
   * - offre inférieure ou changement de cycle : appliqué au prochain renouvellement.
   * Refusé si l'utilisation actuelle dépasse les limites de l'offre visée.
   */
  async changePlan(tenantId: string, planCode: string, cycle: BillingCycle, now: Date) {
    return this.platform.transaction(async (tx) => {
      const sub = await this.subscriptionOf(tx, tenantId);
      const plan = await tx.plan.findFirst({ where: { code: planCode, isActive: true, isPublic: true } });
      if (!plan) throw new BadRequestException('Offre inconnue.');
      await this.assertUsageFits(tx, tenantId, plan);
      const tz = sub.tenant.timezone;
      const samePlan = sub.planId === plan.id && sub.cycle === cycle;

      if (sub.status === 'TRIALING' || (sub.status === 'PAST_DUE' && sub.tenant.status !== 'SUSPENDED' && !(await this.hasPaid(tx, sub)))) {
        if (samePlan) throw new BadRequestException('C’est déjà votre offre.');
        await tx.saasSubscription.update({
          where: { id: sub.id },
          data: { planId: plan.id, cycle, unitPrice: priceFor(plan, cycle), pendingPlanId: null, pendingCycle: null },
        });
        await tx.tenant.update({ where: { id: tenantId }, data: { planId: plan.id } });
        await this.refreshAccess(tx, tenantId);
        await this.regenerateRenewal(tx, sub.id, now);
        await this.notifier.notify(tx, tenantId, {
          event: 'plan.changed',
          title: `Offre ${plan.name} activée`,
          body: `Votre essai continue avec l’offre ${plan.name} (${cycle === 'YEARLY' ? 'annuelle' : 'mensuelle'}).`,
          dedupeKey: `plan-changed-${sub.id}-${now.toISOString()}`,
        });
        return { applied: 'now' as const, invoiceId: null };
      }

      if (sub.status === 'CANCELLED' || sub.tenant.status === 'CANCELLED' || sub.tenant.status === 'SUSPENDED' || sub.status === 'PAST_DUE') {
        // Reprise : nouvelle facture pour une période qui démarrera au paiement.
        await tx.saasSubscription.update({ where: { id: sub.id }, data: { pendingPlanId: plan.id, pendingCycle: cycle, cancelAtPeriodEnd: false } });
        await this.voidOpenInvoices(tx, sub, 'Remplacée : nouvelle offre choisie');
        const refreshed = await this.lockSubscription(tx, sub.id);
        const invoice = await this.createInvoice(tx, {
          tenant: refreshed.tenant,
          subscriptionId: sub.id,
          kind: 'RENEWAL',
          planId: plan.id,
          cycle,
          description: `Abonnement ${plan.name} — ${cycle === 'YEARLY' ? 'annuel' : 'mensuel'}`,
          subtotal: priceFor(plan, cycle),
          periodStart: sub.status === 'PAST_DUE' ? sub.currentPeriodEnd : now,
          periodEnd: addCycle(sub.status === 'PAST_DUE' ? sub.currentPeriodEnd : now, cycle),
          dueAt: now,
        });
        return { applied: 'on_payment' as const, invoiceId: invoice.id };
      }

      if (samePlan && !sub.pendingPlanId && !sub.pendingCycle) throw new BadRequestException('C’est déjà votre offre.');
      const isUpgrade = cycle === sub.cycle && priceFor(plan, cycle) > priceFor(sub.plan, sub.cycle);
      if (isUpgrade) {
        const difference = prorata(priceFor(plan, cycle) - priceFor(sub.plan, sub.cycle), now, sub.currentPeriodStart, sub.currentPeriodEnd);
        await this.voidOpenInvoices(tx, sub, 'Remplacée par un nouveau changement d’offre', ['UPGRADE']);
        const invoice = await this.createInvoice(tx, {
          tenant: sub.tenant,
          subscriptionId: sub.id,
          kind: 'UPGRADE',
          planId: plan.id,
          cycle,
          description: `Passage à l’offre ${plan.name} (prorata jusqu’au ${formatDate(sub.currentPeriodEnd, tz)})`,
          subtotal: difference,
          periodStart: now,
          periodEnd: sub.currentPeriodEnd,
          dueAt: new Date(now.getTime() + UPGRADE_DUE_DAYS * DAY_MS),
        });
        await this.notifier.notify(tx, tenantId, {
          event: 'invoice.created',
          title: `Facture ${invoice.number} : passage à l’offre ${plan.name}`,
          body: `${formatMoney(invoice.total, invoice.currency)} au prorata. L’offre ${plan.name} s’active dès le paiement.`,
          dedupeKey: `invoice-created-${invoice.id}`,
        });
        return { applied: 'on_payment' as const, invoiceId: invoice.id };
      }

      // Offre inférieure ou changement de cycle : au prochain renouvellement.
      await tx.saasSubscription.update({
        where: { id: sub.id },
        data: { pendingPlanId: plan.id === sub.planId ? null : plan.id, pendingCycle: cycle === sub.cycle ? null : cycle },
      });
      await this.regenerateRenewal(tx, sub.id, now);
      await this.notifier.notify(tx, tenantId, {
        event: 'plan.change_scheduled',
        title: 'Changement d’offre programmé',
        body: `L’offre ${plan.name} (${cycle === 'YEARLY' ? 'annuelle' : 'mensuelle'}) s’appliquera au renouvellement du ${formatDate(sub.currentPeriodEnd, tz)}.`,
        dedupeKey: `plan-scheduled-${sub.id}-${now.toISOString()}`,
      });
      return { applied: 'at_renewal' as const, invoiceId: null };
    });
  }

  /** Résiliation à la fin de la période en cours (l'accès reste complet jusque-là). */
  async cancelAtPeriodEnd(tenantId: string, now: Date) {
    return this.platform.transaction(async (tx) => {
      const sub = await this.subscriptionOf(tx, tenantId);
      if (sub.status === 'CANCELLED') throw new ConflictException('L’abonnement est déjà résilié.');
      await tx.saasSubscription.update({ where: { id: sub.id }, data: { cancelAtPeriodEnd: true } });
      await this.voidOpenInvoices(tx, sub, 'Résiliation demandée', ['RENEWAL']);
      await this.notifier.notify(tx, tenantId, {
        event: 'subscription.cancel_scheduled',
        title: 'Résiliation enregistrée',
        body: `Votre salon reste pleinement accessible jusqu’au ${formatDate(sub.currentPeriodEnd, sub.tenant.timezone)}, puis passera en consultation seule. Vous pouvez annuler cette résiliation à tout moment.`,
        dedupeKey: `cancel-scheduled-${sub.id}-${now.toISOString()}`,
      });
    });
  }

  async resume(tenantId: string, now: Date) {
    return this.platform.transaction(async (tx) => {
      const sub = await this.subscriptionOf(tx, tenantId);
      if (!sub.cancelAtPeriodEnd) throw new ConflictException('Aucune résiliation en cours.');
      await tx.saasSubscription.update({ where: { id: sub.id }, data: { cancelAtPeriodEnd: false } });
      if (now.getTime() >= sub.currentPeriodEnd.getTime() - (await this.settings.get()).renewalLeadDays * DAY_MS) {
        await this.ensureRenewalInvoice(tx, await this.lockSubscription(tx, sub.id), now);
      }
    });
  }

  private async terminate(tx: PlatformTx, sub: Sub, now: Date) {
    await tx.saasSubscription.update({ where: { id: sub.id }, data: { status: 'CANCELLED', cancelledAt: now } });
    await tx.tenant.update({ where: { id: sub.tenantId }, data: { status: 'CANCELLED', cancelledAt: now } });
    await this.voidOpenInvoices(tx, sub, 'Abonnement résilié');
    await this.notifier.notify(tx, sub.tenantId, {
      event: 'subscription.cancelled',
      title: 'Abonnement résilié',
      body: 'Votre salon est en consultation seule : vos données restent accessibles et exportables. Vous pouvez vous réabonner à tout moment.',
      dedupeKey: `cancelled-${sub.id}-${sub.currentPeriodEnd.toISOString()}`,
      sms: true,
    });
  }

  // ================================================================== Console éditeur

  /** Prolonge l'essai (geste commercial) ; relance un essai expiré non payé. */
  async extendTrial(tenantId: string, days: number, now: Date) {
    return this.platform.transaction(async (tx) => {
      const sub = await this.subscriptionOf(tx, tenantId);
      const trialLike = sub.status === 'TRIALING' || (sub.status === 'PAST_DUE' && !(await this.hasPaid(tx, sub)));
      if (!trialLike) throw new ConflictException('Seul un essai (en cours ou expiré sans paiement) peut être prolongé.');
      const base = sub.currentPeriodEnd > now ? sub.currentPeriodEnd : now;
      const end = new Date(base.getTime() + days * DAY_MS);
      await this.voidOpenInvoices(tx, sub, 'Essai prolongé', ['RENEWAL']);
      await tx.saasSubscription.update({ where: { id: sub.id }, data: { status: 'TRIALING', currentPeriodEnd: end, pastDueSince: null } });
      await tx.tenant.update({
        where: { id: tenantId },
        data: { status: 'TRIAL', trialEndsAt: end, graceEndsAt: null, suspendedAt: null, suspensionReason: null },
      });
      await this.notifier.notify(tx, tenantId, {
        event: 'trial.extended',
        title: 'Votre essai est prolongé',
        body: `Profitez de toutes les fonctions jusqu’au ${formatDate(end, sub.tenant.timezone)}.`,
        dedupeKey: `trial-extended-${sub.id}-${end.toISOString()}`,
      });
      return end;
    });
  }

  async suspendManually(tenantId: string, reason: string, now: Date) {
    return this.platform.transaction(async (tx) => {
      const tenant = await tx.tenant.findUnique({ where: { id: tenantId } });
      if (!tenant) throw new NotFoundException('Salon introuvable.');
      if (tenant.status === 'SUSPENDED') throw new ConflictException('Ce salon est déjà suspendu.');
      await tx.tenant.update({ where: { id: tenantId }, data: { status: 'SUSPENDED', suspendedAt: now, suspensionReason: reason } });
      await this.notifier.notify(tx, tenantId, {
        event: 'subscription.suspended',
        title: 'Votre salon est passé en consultation seule',
        body: `Motif : ${reason}. Contactez le support pour plus d’informations.`,
        dedupeKey: `suspended-manual-${tenantId}-${now.toISOString()}`,
        sms: true,
      });
    });
  }

  /** Levée d'une suspension : le statut est recalculé à partir de l'abonnement. */
  async reactivateManually(tenantId: string, now: Date) {
    return this.platform.transaction(async (tx) => {
      const sub = await this.subscriptionOf(tx, tenantId);
      if (sub.tenant.status !== 'SUSPENDED') throw new ConflictException('Ce salon n’est pas suspendu.');
      const status = sub.status === 'TRIALING' ? 'TRIAL' : sub.status === 'ACTIVE' && sub.currentPeriodEnd > now ? 'ACTIVE' : 'PAST_DUE';
      await tx.tenant.update({
        where: { id: tenantId },
        data: {
          status,
          suspendedAt: null,
          suspensionReason: null,
          graceEndsAt: status === 'PAST_DUE' ? new Date(now.getTime() + (await this.settings.get()).graceDays * DAY_MS) : null,
        },
      });
      if (status === 'PAST_DUE' && sub.status !== 'PAST_DUE') {
        await tx.saasSubscription.update({ where: { id: sub.id }, data: { status: 'PAST_DUE', pastDueSince: now } });
      }
      await this.notifier.notify(tx, tenantId, {
        event: 'subscription.reactivated',
        title: 'Votre salon est de nouveau pleinement accessible',
        body: status === 'PAST_DUE' ? 'Pensez à régler votre facture en attente.' : 'Toutes les fonctions sont réactivées.',
        dedupeKey: `reactivated-manual-${tenantId}-${now.toISOString()}`,
      });
      return status;
    });
  }

  async voidInvoice(invoiceId: string, reason: string) {
    return this.platform.transaction(async (tx) => {
      const invoice = await tx.saasInvoice.findUnique({ where: { id: invoiceId } });
      if (!invoice) throw new NotFoundException('Facture introuvable.');
      if (invoice.status !== 'OPEN') throw new ConflictException('Seule une facture ouverte peut être annulée.');
      await tx.saasInvoice.update({ where: { id: invoiceId }, data: { status: 'VOID', voidedAt: new Date(), voidReason: reason } });
      await tx.saasPayment.updateMany({ where: { invoiceId, status: 'PENDING' }, data: { status: 'CANCELLED', failureReason: 'Facture annulée' } });
    });
  }

  // ================================================================== Outils

  private async lockSubscription(tx: PlatformTx, id: string): Promise<Sub> {
    await tx.$queryRaw`SELECT id FROM saas_subscriptions WHERE id = ${id}::uuid FOR UPDATE`;
    return tx.saasSubscription.findUniqueOrThrow({
      where: { id },
      include: { tenant: true, plan: { select: { id: true, code: true, name: true, priceMonthly: true, priceYearly: true } } },
    });
  }

  async subscriptionOf(tx: PlatformTx, tenantId: string): Promise<Sub> {
    const sub = await tx.saasSubscription.findUnique({ where: { tenantId }, select: { id: true } });
    if (!sub) throw new NotFoundException('Abonnement introuvable.');
    return this.lockSubscription(tx, sub.id);
  }

  private async hasPaid(tx: PlatformTx, sub: Sub): Promise<boolean> {
    return (await tx.saasInvoice.count({ where: { subscriptionId: sub.id, status: 'PAID' } })) > 0;
  }

  /** Refait la facture de renouvellement ouverte (offre ou cycle modifié). */
  private async regenerateRenewal(tx: PlatformTx, subscriptionId: string, now: Date) {
    const sub = await this.lockSubscription(tx, subscriptionId);
    const voided = await this.voidOpenInvoices(tx, sub, 'Remplacée après changement d’offre', ['RENEWAL']);
    const inWindow = now.getTime() >= sub.currentPeriodEnd.getTime() - (await this.settings.get()).renewalLeadDays * DAY_MS;
    if (voided > 0 || inWindow || sub.status === 'PAST_DUE') await this.ensureRenewalInvoice(tx, await this.lockSubscription(tx, subscriptionId), now);
  }

  private async assertUsageFits(tx: PlatformTx, tenantId: string, plan: { name: string; maxSalons: number | null; maxStaff: number | null }) {
    if (plan.maxSalons !== null) {
      const salons = await tx.salon.count({ where: { tenantId, deletedAt: null } });
      if (salons > plan.maxSalons) {
        throw new ConflictException(`L’offre ${plan.name} est limitée à ${plan.maxSalons} salon(s) : vous en avez ${salons}. Fermez-en d’abord.`);
      }
    }
    if (plan.maxStaff !== null) {
      const staff = await tx.staffMember.count({ where: { tenantId, isActive: true } });
      if (staff > plan.maxStaff) {
        throw new ConflictException(`L’offre ${plan.name} est limitée à ${plan.maxStaff} employés actifs : vous en avez ${staff}.`);
      }
    }
  }

  /** Les fonctionnalités de l'offre ont changé : les jetons des membres sont renouvelés. */
  private async refreshAccess(tx: PlatformTx, tenantId: string) {
    await tx.membership.updateMany({ where: { tenantId }, data: { permissionsVersion: { increment: 1 } } });
  }
}
