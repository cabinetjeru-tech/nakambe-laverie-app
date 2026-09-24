import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { PaymentStatus, Prisma, SaasSubscriptionStatus } from '@prisma/client';
import { PlatformDbService, PlatformTx } from '../../core/platform/platform-db.service';
import { BillingEngine } from '../billing/billing-engine.service';
import { platformAudit } from './platform-audit';

/**
 * Super administrateur — Abonnements et Paiements (connexion salons_platform).
 * Chaque action est journalisée avec le tenant concerné et l'agent.
 */
@Injectable()
export class PlatformBillingService {
  constructor(
    private readonly platform: PlatformDbService,
    private readonly engine: BillingEngine,
  ) {}

  async subscriptions(filter: { status?: SaasSubscriptionStatus; plan?: string; endingWithinDays?: number }) {
    const where: Prisma.SaasSubscriptionWhereInput = {};
    if (filter.status) where.status = filter.status;
    if (filter.plan) where.plan = { code: filter.plan };
    if (filter.endingWithinDays) where.currentPeriodEnd = { lte: new Date(Date.now() + filter.endingWithinDays * 86_400_000) };
    const rows = await this.platform.client.saasSubscription.findMany({
      where,
      orderBy: { currentPeriodEnd: 'asc' },
      take: 300,
      select: {
        id: true,
        status: true,
        cycle: true,
        unitPrice: true,
        currency: true,
        currentPeriodStart: true,
        currentPeriodEnd: true,
        cancelAtPeriodEnd: true,
        pastDueSince: true,
        plan: { select: { code: true, name: true } },
        pendingPlan: { select: { code: true, name: true } },
        pendingCycle: true,
        tenant: { select: { id: true, displayName: true, slug: true, status: true, graceEndsAt: true } },
      },
    });
    const counts = await this.platform.client.saasSubscription.groupBy({ by: ['status'], _count: { _all: true } });
    return { counts: Object.fromEntries(counts.map((c) => [c.status, c._count._all])), items: rows };
  }

  async payments(filter: { status?: PaymentStatus; method?: string; tenantId?: string; days?: number }) {
    const where: Prisma.SaasPaymentWhereInput = {};
    if (filter.status) where.status = filter.status;
    if (filter.method === 'MOBILE_MONEY_MANUAL') where.method = 'MOBILE_MONEY_MANUAL';
    if (filter.method === 'ONLINE') where.method = { not: 'MOBILE_MONEY_MANUAL' };
    if (filter.tenantId) where.tenantId = filter.tenantId;
    if (filter.days) where.createdAt = { gte: new Date(Date.now() - filter.days * 86_400_000) };
    return this.platform.client.saasPayment.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: 300,
      select: {
        id: true,
        method: true,
        provider: true,
        status: true,
        amount: true,
        currency: true,
        providerReference: true,
        operator: true,
        payerPhone: true,
        failureReason: true,
        paidAt: true,
        createdAt: true,
        tenant: { select: { id: true, displayName: true, slug: true } },
        invoice: { select: { id: true, number: true, total: true, description: true, status: true } },
      },
    });
  }

  invoices(filter: { status?: 'OPEN' | 'PAID' | 'VOID'; tenantId?: string }) {
    return this.platform.client.saasInvoice.findMany({
      where: { status: filter.status, tenantId: filter.tenantId },
      orderBy: { createdAt: 'desc' },
      take: 300,
      select: {
        id: true,
        number: true,
        kind: true,
        description: true,
        status: true,
        total: true,
        currency: true,
        dueAt: true,
        paidAt: true,
        voidReason: true,
        createdAt: true,
        tenant: { select: { id: true, displayName: true } },
      },
    });
  }

  /** L'agent a retrouvé la transaction sur le relevé Mobile Money : la facture est réglée. */
  validatePayment(actorUserId: string, paymentId: string) {
    return this.platform.transaction(async (tx) => {
      const payment = await this.manualPayment(tx, paymentId);
      await this.engine.applyPayment(tx, paymentId, new Date(), actorUserId);
      await platformAudit(tx, {
        tenantId: payment.tenantId,
        actorUserId,
        action: 'platform.payment_validated',
        entityType: 'saas_payment',
        entityId: paymentId,
        after: { reference: payment.providerReference, amount: Number(payment.amount) },
      });
    });
  }

  rejectPayment(actorUserId: string, paymentId: string, reason: string) {
    return this.platform.transaction(async (tx) => {
      const payment = await this.manualPayment(tx, paymentId);
      await this.engine.failPayment(tx, paymentId, reason);
      await tx.saasPayment.update({ where: { id: paymentId }, data: { validatedBy: actorUserId } });
      await platformAudit(tx, { tenantId: payment.tenantId, actorUserId, action: 'platform.payment_rejected', entityType: 'saas_payment', entityId: paymentId, after: { reason } });
    });
  }

  async voidInvoice(actorUserId: string, invoiceId: string, reason: string) {
    const invoice = await this.platform.client.saasInvoice.findUnique({ where: { id: invoiceId }, select: { tenantId: true } });
    if (!invoice) throw new NotFoundException('Facture introuvable.');
    await this.engine.voidInvoice(invoiceId, reason);
    await this.platform.transaction((tx) =>
      platformAudit(tx, { tenantId: invoice.tenantId, actorUserId, action: 'platform.invoice_voided', entityType: 'saas_invoice', entityId: invoiceId, after: { reason } }),
    );
  }

  /** Passage manuel du planificateur (exploitation, rattrapage après une panne). */
  async runBilling(actorUserId: string) {
    const result = await this.engine.runDue(new Date());
    await this.platform.transaction((tx) =>
      platformAudit(tx, { tenantId: null, actorUserId, action: 'platform.billing_run', entityType: 'platform', after: result }),
    );
    return result;
  }

  private async manualPayment(tx: PlatformTx, paymentId: string) {
    const payment = await tx.saasPayment.findUnique({ where: { id: paymentId } });
    if (!payment) throw new NotFoundException('Paiement introuvable.');
    if (payment.method !== 'MOBILE_MONEY_MANUAL') throw new ConflictException('Seuls les paiements Mobile Money manuels se valident ici.');
    if (payment.status !== 'PENDING') throw new ConflictException('Ce paiement a déjà été traité.');
    return payment;
  }
}
