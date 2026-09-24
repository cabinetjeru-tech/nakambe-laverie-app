import { ConflictException, ForbiddenException, Inject, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { APP_CONFIG, AppConfig } from '../../config/env';
import { AuditService } from '../../core/audit/audit.service';
import { AuthUser } from '../../core/auth/auth-user';
import { DbService } from '../../core/db/db.service';
import { PlatformDbService } from '../../core/platform/platform-db.service';
import { PlatformSettingsService } from '../../core/platform/platform-settings.service';
import { BillingEngine } from './billing-engine.service';
import { DAY_MS, monthlyEquivalent } from './billing-periods';
import { ChangePlanDto, PayInvoiceDto } from './dto/billing.dto';
import { PAYMENT_GATEWAY, PaymentGateway } from './gateways/payment-gateway';
import { SandboxGateway } from './gateways/sandbox.gateway';

const READ_ONLY = new Set(['SUSPENDED', 'CANCELLED']);

/**
 * Côté salon : lecture de l'abonnement et des factures par la connexion de l'API (RLS :
 * un salon ne voit que ses propres lignes), écritures déléguées au moteur de facturation.
 */
@Injectable()
export class BillingService {
  private readonly logger = new Logger(BillingService.name);

  constructor(
    private readonly db: DbService,
    private readonly platform: PlatformDbService,
    private readonly engine: BillingEngine,
    private readonly audit: AuditService,
    private readonly platformSettings: PlatformSettingsService,
    @Inject(PAYMENT_GATEWAY) private readonly gateway: PaymentGateway | null,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}

  // ================================================================== Lecture

  /** État résumé pour le bandeau de l'application (tout membre). */
  async status(user: AuthUser) {
    if (!user.tenantId) return null;
    const tx = this.db.tx;
    const [tenant, sub] = await Promise.all([
      tx.tenant.findUniqueOrThrow({
        where: { id: user.tenantId },
        select: { status: true, trialEndsAt: true, graceEndsAt: true, suspendedAt: true, suspensionReason: true },
      }),
      tx.saasSubscription.findUnique({
        where: { tenantId: user.tenantId },
        include: { plan: { select: { code: true, name: true } }, pendingPlan: { select: { code: true, name: true } } },
      }),
    ]);
    const openInvoice = await tx.saasInvoice.findFirst({
      where: { status: 'OPEN' },
      orderBy: { dueAt: 'asc' },
      select: { id: true, number: true, total: true, currency: true, dueAt: true, kind: true },
    });
    const now = Date.now();
    const deadline = tenant.status === 'PAST_DUE' ? tenant.graceEndsAt : sub?.currentPeriodEnd ?? null;
    return {
      tenantStatus: tenant.status,
      subscriptionStatus: sub?.status ?? null,
      plan: sub?.plan ?? null,
      pendingPlan: sub?.pendingPlan ?? null,
      pendingCycle: sub?.pendingCycle ?? null,
      cycle: sub?.cycle ?? null,
      currentPeriodEnd: sub?.currentPeriodEnd ?? null,
      cancelAtPeriodEnd: sub?.cancelAtPeriodEnd ?? false,
      trialEndsAt: tenant.trialEndsAt,
      graceEndsAt: tenant.graceEndsAt,
      suspendedAt: tenant.suspendedAt,
      suspensionReason: tenant.suspensionReason,
      readOnly: READ_ONLY.has(tenant.status),
      daysLeft: deadline ? Math.max(0, Math.ceil((deadline.getTime() - now) / DAY_MS)) : null,
      openInvoice,
      canManage: user.permissions.includes('billing.manage'),
    };
  }

  /** Page « Abonnement » : état, offres, utilisation, moyens de paiement. */
  async overview(user: AuthUser) {
    const tx = this.db.tx;
    const settings = await this.platformSettings.get();
    const [status, plans, salons, staff, pendingPayments] = await Promise.all([
      this.status(user),
      tx.plan.findMany({
        where: { isActive: true, isPublic: true },
        orderBy: { sortOrder: 'asc' },
        include: { features: { select: { featureCode: true } } },
      }),
      tx.salon.count({ where: { deletedAt: null } }),
      tx.staffMember.count({ where: { isActive: true } }),
      tx.saasPayment.findMany({
        where: { status: 'PENDING', method: 'MOBILE_MONEY_MANUAL' },
        select: { id: true, invoiceId: true, amount: true, providerReference: true, createdAt: true },
      }),
    ]);
    return {
      ...status,
      usage: { salons, staff },
      plans: plans.map((plan) => ({
        code: plan.code,
        name: plan.name,
        description: plan.description,
        currency: plan.currency,
        priceMonthly: plan.priceMonthly,
        priceYearly: plan.priceYearly,
        yearlyMonthlyEquivalent: monthlyEquivalent(plan, 'YEARLY'),
        maxSalons: plan.maxSalons,
        maxStaff: plan.maxStaff,
        smsQuotaMonthly: plan.smsQuotaMonthly,
        features: plan.features.map((f) => f.featureCode),
      })),
      pendingPayments,
      paymentOptions: {
        mobileMoney: settings.mobileMoney,
        online: this.gateway !== null,
        onlineProvider: this.gateway?.name ?? null,
      },
      settings: {
        graceDays: settings.graceDays,
        renewalLeadDays: settings.renewalLeadDays,
        vatPercent: settings.vatPercent,
        supportPhone: settings.supportPhone,
        supportEmail: settings.supportEmail,
      },
    };
  }

  invoices() {
    return this.db.tx.saasInvoice.findMany({
      orderBy: [{ createdAt: 'desc' }],
      take: 100,
      select: {
        id: true,
        number: true,
        kind: true,
        description: true,
        status: true,
        periodStart: true,
        periodEnd: true,
        total: true,
        currency: true,
        dueAt: true,
        paidAt: true,
        createdAt: true,
        payments: { select: { id: true, method: true, status: true }, orderBy: { createdAt: 'desc' }, take: 1 },
      },
    });
  }

  /** Facture complète (impression) : vendeur = éditeur, acheteur = identité figée à l'émission. */
  async invoice(id: string) {
    const invoice = await this.db.tx.saasInvoice.findFirst({
      where: { id },
      include: {
        plan: { select: { code: true, name: true } },
        payments: {
          orderBy: { createdAt: 'asc' },
          select: {
            id: true,
            method: true,
            provider: true,
            status: true,
            amount: true,
            currency: true,
            providerReference: true,
            operator: true,
            failureReason: true,
            paidAt: true,
            createdAt: true,
          },
        },
      },
    });
    if (!invoice) throw new NotFoundException('Facture introuvable.');
    const settings = await this.platformSettings.get();
    return {
      ...invoice,
      seller: { legalName: settings.legalName, address: settings.address, taxId: settings.taxId },
      vatPercent: invoice.subtotal > 0n ? Number((invoice.taxAmount * 10_000n) / invoice.subtotal) / 100 : 0,
    };
  }

  // ================================================================== Actions

  async changePlan(user: AuthUser, dto: ChangePlanDto) {
    const result = await this.engine.changePlan(user.tenantId!, dto.planCode, dto.cycle, new Date());
    await this.audit.log({ action: 'billing.plan_change', entityType: 'subscription', after: { ...dto, applied: result.applied } });
    return result;
  }

  async cancel() {
    await this.engine.cancelAtPeriodEnd(this.db.tenantId!, new Date());
    await this.audit.log({ action: 'billing.cancel', entityType: 'subscription' });
  }

  async resume() {
    await this.engine.resume(this.db.tenantId!, new Date());
    await this.audit.log({ action: 'billing.resume', entityType: 'subscription' });
  }

  /**
   * Règlement d'une facture.
   * - Mobile Money manuel : le paiement reste « à vérifier » jusqu'à la validation de l'éditeur.
   * - En ligne : paiement en attente + page de paiement de l'agrégateur ; la confirmation vient
   *   de la notification de l'agrégateur ou du suivi (`paymentStatus`), toujours vérifiée.
   * Pas de transaction de requête (ManualTransaction) : l'appel à l'agrégateur peut prendre
   * plusieurs secondes et ne doit pas garder une transaction ouverte.
   */
  async pay(user: AuthUser, invoiceId: string, dto: PayInvoiceDto) {
    const tenantId = user.tenantId!;
    if (dto.method === 'MOBILE_MONEY_MANUAL') {
      const payment = await this.engine.submitManualPayment(tenantId, invoiceId, {
        reference: dto.reference!,
        operator: dto.operator,
        payerPhone: dto.payerPhone,
        userId: user.userId,
      });
      await this.auditAs(user, 'billing.payment_declared', payment.id, { invoiceId, reference: payment.providerReference });
      return { paymentId: payment.id, status: payment.status, checkoutUrl: null };
    }

    if (!this.gateway) throw new ConflictException('Le paiement en ligne n’est pas disponible : payez par Mobile Money.');
    const { payment, invoice } = await this.engine.createOnlinePayment(tenantId, invoiceId, this.gateway.name, user.userId);
    const buyer = invoice.buyerSnapshot as { displayName?: string };
    const payer = await this.platform.client.user.findUnique({ where: { id: user.userId }, select: { fullName: true, phone: true } });
    try {
      const checkout = await this.gateway.createCheckout({
        transactionId: payment.providerToken!,
        amount: invoice.total,
        currency: invoice.currency,
        description: `Facture ${invoice.number}`,
        customerName: payer?.fullName ?? buyer.displayName ?? 'Client',
        customerPhone: payer?.phone,
        returnUrl: `${this.config.APP_PUBLIC_URL}/abonnement/retour?paiement=${payment.id}`,
        notifyUrl: `${this.config.API_PUBLIC_URL}/api/v1/billing/webhooks/${this.gateway.name}`,
      });
      await this.platform.client.saasPayment.update({ where: { id: payment.id }, data: { checkoutUrl: checkout.checkoutUrl } });
      await this.auditAs(user, 'billing.payment_started', payment.id, { invoiceId, provider: this.gateway.name });
      return { paymentId: payment.id, status: payment.status, checkoutUrl: checkout.checkoutUrl };
    } catch (error) {
      await this.platform.client.saasPayment.update({
        where: { id: payment.id },
        data: { status: 'FAILED', failureReason: 'Page de paiement indisponible' },
      });
      throw error;
    }
  }

  /** Suivi d'un paiement (page de retour) : un paiement en ligne en attente est revérifié. */
  async paymentStatus(user: AuthUser, paymentId: string) {
    const found = await this.platform.client.saasPayment.findFirst({
      where: { id: paymentId, tenantId: user.tenantId! },
      select: { status: true, providerToken: true, method: true },
    });
    if (!found) throw new NotFoundException('Paiement introuvable.');
    if (found.status === 'PENDING' && found.providerToken) await this.confirmOnline(found.providerToken);
    const payment = await this.platform.client.saasPayment.findFirstOrThrow({
      where: { id: paymentId, tenantId: user.tenantId! },
      select: {
        id: true,
        status: true,
        method: true,
        amount: true,
        currency: true,
        failureReason: true,
        paidAt: true,
        invoice: { select: { id: true, number: true, status: true } },
      },
    });
    return payment;
  }

  // ================================================================== Paiement en ligne

  /**
   * Confirmation d'un paiement en ligne à partir de son identifiant de transaction.
   * Appelée par la notification de l'agrégateur ET par le suivi côté salon : on ne se fie
   * jamais au contenu reçu, on interroge l'agrégateur puis on contrôle montant et devise.
   */
  async confirmOnline(providerToken: string): Promise<string> {
    if (!this.gateway) return 'UNAVAILABLE';
    const payment = await this.platform.client.saasPayment.findUnique({ where: { providerToken } });
    if (!payment || payment.provider !== this.gateway.name) return 'UNKNOWN';
    if (payment.status !== 'PENDING') return payment.status;

    const verification = await this.gateway.verify(providerToken);
    const raw = JSON.parse(JSON.stringify(verification.raw));
    if (verification.status === 'PENDING') return 'PENDING';

    return this.platform.transaction(async (tx) => {
      if (verification.status === 'FAILED') {
        await tx.saasPayment.update({ where: { id: payment.id }, data: { rawPayload: raw } });
        await this.engine.failPayment(tx, payment.id, 'Paiement refusé ou abandonné');
        return 'FAILED';
      }
      const amountOk = verification.amount !== undefined && BigInt(Math.round(verification.amount)) === payment.amount;
      const currencyOk = !verification.currency || verification.currency.toUpperCase() === payment.currency;
      if (!amountOk || !currencyOk) {
        this.logger.warn(
          `Paiement ${payment.id} : montant ou devise incohérent (reçu ${verification.amount} ${verification.currency}, attendu ${payment.amount} ${payment.currency})`,
        );
        await tx.saasPayment.update({ where: { id: payment.id }, data: { rawPayload: raw } });
        await this.engine.failPayment(tx, payment.id, 'Montant reçu différent du montant de la facture');
        return 'FAILED';
      }
      await tx.saasPayment.update({
        where: { id: payment.id },
        data: { rawPayload: raw, operator: verification.operator ?? payment.operator },
      });
      await this.engine.applyPayment(tx, payment.id, new Date());
      return 'SUCCEEDED';
    });
  }

  /** Simulateur : l'issue choisie sur la page de test, puis la même confirmation qu'un webhook. */
  async sandboxComplete(user: AuthUser, providerToken: string, outcome: 'SUCCEEDED' | 'FAILED', amount?: number) {
    if (!(this.gateway instanceof SandboxGateway) || this.config.NODE_ENV === 'production') {
      throw new NotFoundException('Simulateur de paiement indisponible.');
    }
    const payment = await this.platform.client.saasPayment.findUnique({ where: { providerToken }, select: { tenantId: true } });
    if (!payment || payment.tenantId !== user.tenantId) throw new ForbiddenException('Transaction inconnue.');
    if (!this.gateway.settle(providerToken, outcome, amount !== undefined ? BigInt(amount) : undefined)) {
      throw new NotFoundException('Transaction inconnue du simulateur.');
    }
    return { status: await this.confirmOnline(providerToken) };
  }

  /** Audit hors transaction de requête (routes ManualTransaction). */
  private auditAs(user: AuthUser, action: string, entityId: string, after: Record<string, unknown>) {
    return this.db.withContext({ tenantId: user.tenantId, userId: user.userId }, () =>
      this.audit.log({ action, entityType: 'saas_payment', entityId, after: JSON.parse(JSON.stringify(after, (_k, v) => (typeof v === 'bigint' ? Number(v) : v))) }),
    );
  }
}
