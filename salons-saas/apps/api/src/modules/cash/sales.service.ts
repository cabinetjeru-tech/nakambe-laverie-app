import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { AuditService } from '../../core/audit/audit.service';
import { AuthUser } from '../../core/auth/auth-user';
import { TenantAccessService } from '../../core/auth/tenant-access.service';
import { DbService } from '../../core/db/db.service';
import { sumMoney, toMoney } from '../../core/http/money';
import { FEATURES } from '../../core/permissions/catalog';
import { assertSalonAccess, salonIdFilter } from '../../core/permissions/salon-scope';
import { LedgerLine, LedgerService } from '../../core/tenant/ledger.service';
import { SequenceService } from '../../core/tenant/sequence.service';
import { computeTiming } from '../catalog/service-timing';
import { StockLedgerService } from '../stock/stock-ledger.service';
import { accountForPaymentMethod } from './cash-accounts';
import { matchCommission } from './commission.calculator';
import { CreateSaleDto, SaleItemDto, SalesQueryDto } from './dto/cash.dto';
import { OpenSessionService } from './open-session.service';

/** Remise maximale sans la permission « Modifier les prix » (réglage tenant sales.max_discount_percent). */
const DEFAULT_MAX_DISCOUNT_PERCENT = 20;

const saleSelect = {
  id: true,
  number: true,
  salonId: true,
  status: true,
  subtotal: true,
  discountTotal: true,
  total: true,
  tipTotal: true,
  paidTotal: true,
  currency: true,
  note: true,
  voidReason: true,
  voidedAt: true,
  closedAt: true,
  createdAt: true,
  cashSessionId: true,
  appointmentId: true,
  client: { select: { id: true, fullName: true, phone: true, clientNumber: true } },
  items: {
    select: {
      id: true,
      type: true,
      label: true,
      quantity: true,
      unitPrice: true,
      discountAmount: true,
      lineTotal: true,
      serviceId: true,
      productId: true,
      staff: { select: { id: true, displayName: true } },
    },
  },
  payments: {
    select: { id: true, method: true, status: true, amount: true, providerReference: true, operator: true, paidAt: true },
    orderBy: { createdAt: 'asc' },
  },
  tips: { select: { amount: true, staff: { select: { id: true, displayName: true } } } },
} satisfies Prisma.SaleSelect;

interface BuiltLine {
  type: 'SERVICE' | 'PRODUCT';
  serviceId: string | null;
  variantId: string | null;
  serviceCategoryId: string | null;
  productId: string | null;
  appointmentItemId: string | null;
  staffId: string | null;
  label: string;
  quantity: number;
  unitPrice: bigint;
  discountAmount: bigint;
  lineTotal: bigint;
  unitCost: bigint | null;
}

@Injectable()
export class SalesService {
  constructor(
    private readonly db: DbService,
    private readonly ledger: LedgerService,
    private readonly sequences: SequenceService,
    private readonly stockLedger: StockLedgerService,
    private readonly openSessions: OpenSessionService,
    private readonly tenantAccess: TenantAccessService,
    private readonly audit: AuditService,
  ) {}

  // ------------------------------------------------------------------ Lecture

  async list(user: AuthUser, query: SalesQueryDto) {
    if (query.salonId) assertSalonAccess(user, query.salonId);
    return this.db.tx.sale.findMany({
      where: {
        salonId: query.salonId ?? salonIdFilter(user),
        ...(query.status ? { status: query.status } : {}),
        ...(query.cashSessionId ? { cashSessionId: query.cashSessionId } : {}),
        ...(query.from || query.to
          ? { createdAt: { ...(query.from ? { gte: new Date(query.from) } : {}), ...(query.to ? { lt: new Date(query.to) } : {}) } }
          : {}),
      },
      select: saleSelect,
      orderBy: { createdAt: 'desc' },
      take: 300,
    });
  }

  async get(user: AuthUser, id: string) {
    const sale = await this.db.tx.sale.findFirst({ where: { id }, select: saleSelect });
    if (!sale) throw new NotFoundException('Vente introuvable.');
    assertSalonAccess(user, sale.salonId);
    return sale;
  }

  async pendingPayments(user: AuthUser, salonId?: string) {
    if (salonId) assertSalonAccess(user, salonId);
    return this.db.tx.payment.findMany({
      where: { status: 'PENDING', method: 'MOBILE_MONEY_MANUAL', sale: { salonId: salonId ?? salonIdFilter(user) } },
      select: {
        id: true,
        amount: true,
        operator: true,
        providerReference: true,
        createdAt: true,
        sale: { select: { id: true, number: true, salonId: true, client: { select: { fullName: true } } } },
      },
      orderBy: { createdAt: 'asc' },
    });
  }

  // ------------------------------------------------------------------ Encaissement

  async create(user: AuthUser, dto: CreateSaleDto) {
    assertSalonAccess(user, dto.salonId);
    if (dto.offlineId) {
      const existing = await this.db.tx.sale.findFirst({ where: { offlineId: dto.offlineId }, select: { id: true } });
      if (existing) return this.get(user, existing.id);
    }
    const salon = await this.db.tx.salon.findFirst({ where: { id: dto.salonId, deletedAt: null }, select: { id: true, currency: true } });
    if (!salon) throw new NotFoundException('Salon introuvable.');

    if (dto.clientId) {
      const client = await this.db.tx.clientProfile.findFirst({ where: { id: dto.clientId, deletedAt: null }, select: { id: true } });
      if (!client) throw new BadRequestException('Client inconnu.');
    }
    const appointment = dto.appointmentId ? await this.billableAppointment(dto.appointmentId, salon.id) : null;
    const clientId = dto.clientId ?? appointment?.clientId ?? null;

    const lines = await Promise.all(dto.items.map((item) => this.buildLine(user, item, appointment)));
    const gross = sumMoney(lines.map((l) => l.unitPrice * BigInt(l.quantity)));
    const subtotal = sumMoney(lines.map((l) => l.lineTotal));
    const globalDiscount = toMoney(dto.discount);
    if (globalDiscount > subtotal) throw new BadRequestException('La remise dépasse le montant du ticket.');
    const discountTotal = sumMoney(lines.map((l) => l.discountAmount)) + globalDiscount;
    await this.assertDiscountAllowed(user, discountTotal, gross);

    const total = subtotal - globalDiscount;
    const tips = dto.tips ?? [];
    for (const tip of tips) await this.assertStaff(tip.staffId);
    const tipTotal = sumMoney(tips.map((t) => toMoney(t.amount)));
    const paid = sumMoney(dto.payments.map((p) => toMoney(p.amount)));
    if (paid !== total + tipTotal) {
      throw new BadRequestException(`Les paiements (${paid}) doivent égaler le total à encaisser (${total + tipTotal}, pourboires compris).`);
    }
    const hasCash = dto.payments.some((p) => p.method === 'CASH');
    const session = hasCash ? await this.openSessions.require(salon.id) : await this.openSessions.find(salon.id);

    const tenantId = this.db.tenantId!;
    const sale = await this.db.tx.sale.create({
      data: {
        tenantId,
        salonId: salon.id,
        number: await this.sequences.next('SALE'),
        clientId,
        appointmentId: appointment?.id ?? null,
        cashSessionId: session?.id ?? null,
        status: 'OPEN',
        subtotal,
        discountTotal,
        total,
        tipTotal,
        currency: salon.currency,
        note: dto.note ?? null,
        offlineId: dto.offlineId ?? null,
        createdBy: user.userId,
      },
      select: { id: true },
    });
    for (const line of lines) {
      await this.db.tx.saleItem.create({
        data: {
          tenantId,
          saleId: sale.id,
          type: line.type,
          serviceId: line.serviceId,
          variantId: line.variantId,
          productId: line.productId,
          appointmentItemId: line.appointmentItemId,
          staffId: line.staffId,
          label: line.label,
          quantity: line.quantity,
          unitPrice: line.unitPrice,
          discountAmount: line.discountAmount,
          lineTotal: line.lineTotal,
          unitCost: line.unitCost,
        },
      });
    }
    if (tips.length) {
      await this.db.tx.tip.createMany({ data: tips.map((t) => ({ tenantId, saleId: sale.id, staffId: t.staffId, amount: toMoney(t.amount) })) });
    }

    const canValidate = user.permissions.includes('payments.validate');
    for (const [index, payment] of dto.payments.entries()) {
      const pending = payment.method === 'MOBILE_MONEY_MANUAL' && !canValidate;
      try {
        await this.db.tx.payment.create({
          data: {
            tenantId,
            saleId: sale.id,
            cashSessionId: payment.method === 'CASH' ? session!.id : null,
            method: payment.method,
            status: pending ? 'PENDING' : 'SUCCEEDED',
            amount: toMoney(payment.amount),
            currency: salon.currency,
            operator: payment.operator ?? null,
            providerReference: payment.reference?.trim() ?? null,
            idempotencyKey: `${sale.id}:${index}`,
            validatedBy: pending ? null : payment.method === 'MOBILE_MONEY_MANUAL' ? user.userId : null,
            validatedAt: pending || payment.method !== 'MOBILE_MONEY_MANUAL' ? null : new Date(),
            paidAt: pending ? null : new Date(),
            createdBy: user.userId,
          },
        });
      } catch (error) {
        if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
          throw new ConflictException('Cette référence de transaction a déjà été utilisée pour un autre paiement.');
        }
        throw error;
      }
    }

    if (dto.payments.every((p) => p.method !== 'MOBILE_MONEY_MANUAL' || canValidate)) {
      await this.finalize(sale.id);
    }
    await this.audit.log({ action: 'sale.create', entityType: 'sale', entityId: sale.id, salonId: salon.id, after: { total: Number(total), tips: Number(tipTotal) } });
    return this.get(user, sale.id);
  }

  /** Validation d'un paiement Mobile Money manuel après vérification sur le téléphone du salon. */
  async validatePayment(user: AuthUser, paymentId: string, accept: boolean) {
    const payment = await this.db.tx.payment.findFirst({
      where: { id: paymentId, status: 'PENDING' },
      select: { id: true, saleId: true, sale: { select: { salonId: true } } },
    });
    if (!payment || !payment.saleId || !payment.sale) throw new NotFoundException('Paiement en attente introuvable.');
    assertSalonAccess(user, payment.sale.salonId);

    if (!accept) {
      await this.db.tx.payment.update({ where: { id: paymentId }, data: { status: 'FAILED', failureReason: 'Refusé à la vérification' } });
      // Paiement introuvable chez l'opérateur : la vente est annulée, elle sera ressaisie.
      await this.db.tx.payment.updateMany({ where: { saleId: payment.saleId, status: 'SUCCEEDED' }, data: { status: 'CANCELLED' } });
      await this.db.tx.sale.update({
        where: { id: payment.saleId },
        data: { status: 'VOIDED', voidReason: 'Paiement Mobile Money refusé', voidedBy: user.userId, voidedAt: new Date() },
      });
      await this.audit.log({ action: 'payment.reject', entityType: 'payment', entityId: paymentId, salonId: payment.sale.salonId });
      return this.get(user, payment.saleId);
    }

    await this.db.tx.payment.update({
      where: { id: paymentId },
      data: { status: 'SUCCEEDED', validatedBy: user.userId, validatedAt: new Date(), paidAt: new Date() },
    });
    const stillPending = await this.db.tx.payment.count({ where: { saleId: payment.saleId, status: 'PENDING' } });
    if (stillPending === 0) await this.finalize(payment.saleId);
    await this.audit.log({ action: 'payment.validate', entityType: 'payment', entityId: paymentId, salonId: payment.sale.salonId });
    return this.get(user, payment.saleId);
  }

  /**
   * Annulation d'une vente : écritures inverses au registre, produits remis en stock,
   * commissions annulées, remboursements tracés. Une vente payée en espèces ne s'annule
   * que tant que sa caisse est ouverte (l'argent rendu sort de cette caisse).
   */
  async void(user: AuthUser, id: string, reason: string) {
    const sale = await this.db.tx.sale.findFirst({
      where: { id },
      select: {
        id: true,
        salonId: true,
        status: true,
        total: true,
        currency: true,
        clientId: true,
        cashSessionId: true,
        payments: { select: { id: true, method: true, status: true, amount: true, cashSessionId: true } },
        items: { select: { id: true, type: true, productId: true, quantity: true, unitCost: true } },
      },
    });
    if (!sale) throw new NotFoundException('Vente introuvable.');
    assertSalonAccess(user, sale.salonId);
    if (sale.status === 'VOIDED') throw new ConflictException('Cette vente est déjà annulée.');

    const cashSessions = [...new Set(sale.payments.filter((p) => p.method === 'CASH' && p.cashSessionId).map((p) => p.cashSessionId!))];
    for (const sessionId of cashSessions) {
      const session = await this.db.tx.cashSession.findFirst({ where: { id: sessionId }, select: { status: true } });
      if (session?.status !== 'OPEN') {
        throw new ConflictException('La caisse de cette vente est clôturée : l’annulation n’est plus possible.');
      }
    }

    const tenantId = this.db.tenantId!;
    if (sale.status === 'PAID') {
      await this.ledger.post(this.ledger.reverse(await this.ledgerLines(sale.id)), {
        salonId: sale.salonId,
        currency: sale.currency,
        saleId: sale.id,
        cashSessionId: cashSessions[0],
        description: `Annulation vente : ${reason}`,
      });
      for (const payment of sale.payments.filter((p) => p.status === 'SUCCEEDED')) {
        await this.db.tx.refund.create({
          data: {
            tenantId,
            paymentId: payment.id,
            cashSessionId: payment.method === 'CASH' ? payment.cashSessionId : null,
            method: payment.method === 'CASH' ? 'CASH' : payment.method === 'MOBILE_MONEY_MANUAL' ? 'MOBILE_MONEY' : 'PROVIDER',
            amount: payment.amount,
            reason,
            status: 'SUCCEEDED',
            createdBy: user.userId,
          },
        });
      }
      const features = await this.tenantAccess.features(tenantId);
      if (features.has(FEATURES.STOCK)) {
        for (const item of sale.items.filter((i) => i.type === 'PRODUCT' && i.productId)) {
          await this.stockLedger.apply({
            salonId: sale.salonId,
            productId: item.productId!,
            type: 'RETURN',
            quantity: item.quantity,
            unitCost: item.unitCost,
            saleId: sale.id,
            reason: `Annulation vente : ${reason}`,
          });
        }
      }
      const commissions = await this.db.tx.commissionEntry.findMany({ where: { saleItem: { saleId: sale.id } } });
      if (commissions.length) {
        await this.db.tx.commissionEntry.createMany({
          data: commissions.map((c) => ({
            tenantId,
            staffId: c.staffId,
            saleItemId: c.saleItemId,
            ruleId: c.ruleId,
            baseAmount: -c.baseAmount,
            amount: -c.amount,
            earnedAt: new Date(),
          })),
        });
      }
      if (sale.clientId) {
        await this.db.tx.clientProfile.update({
          where: { id: sale.clientId },
          data: { visitCount: { decrement: 1 }, totalSpent: { decrement: sale.total } },
        });
      }
    } else {
      await this.db.tx.payment.updateMany({ where: { saleId: sale.id, status: { in: ['PENDING', 'SUCCEEDED'] } }, data: { status: 'CANCELLED' } });
    }

    await this.db.tx.sale.update({
      where: { id },
      data: { status: 'VOIDED', voidReason: reason, voidedBy: user.userId, voidedAt: new Date(), version: { increment: 1 } },
    });
    await this.audit.log({ action: 'sale.void', entityType: 'sale', entityId: id, salonId: sale.salonId, after: { reason, total: Number(sale.total) } });
    return this.get(user, id);
  }

  // ------------------------------------------------------------------ Finalisation

  /** Vente entièrement payée : registre, stock, commissions, fiche client, rendez-vous. */
  private async finalize(saleId: string) {
    const tx = this.db.tx;
    const tenantId = this.db.tenantId!;
    const sale = await tx.sale.findFirstOrThrow({
      where: { id: saleId },
      select: {
        id: true,
        salonId: true,
        currency: true,
        total: true,
        clientId: true,
        appointmentId: true,
        payments: { where: { status: 'SUCCEEDED' }, select: { amount: true, method: true, cashSessionId: true } },
        items: {
          select: {
            id: true,
            type: true,
            serviceId: true,
            productId: true,
            staffId: true,
            quantity: true,
            lineTotal: true,
            service: { select: { categoryId: true, consumptions: { select: { productId: true, quantity: true } } } },
          },
        },
      },
    });
    const paidTotal = sumMoney(sale.payments.map((p) => p.amount));
    const cashSessionId = sale.payments.find((p) => p.method === 'CASH')?.cashSessionId ?? undefined;

    await this.ledger.post(await this.ledgerLines(saleId), {
      salonId: sale.salonId,
      currency: sale.currency,
      saleId,
      cashSessionId,
      description: 'Vente',
    });
    await tx.sale.update({ where: { id: saleId }, data: { status: 'PAID', paidTotal, closedAt: new Date() } });

    const features = await this.tenantAccess.features(tenantId);
    if (features.has(FEATURES.STOCK)) {
      for (const item of sale.items) {
        if (item.type === 'PRODUCT' && item.productId) {
          const result = await this.stockLedger.apply({
            salonId: sale.salonId,
            productId: item.productId,
            type: 'SALE',
            quantity: -item.quantity,
            saleId,
          });
          await tx.saleItem.update({ where: { id: item.id }, data: { unitCost: result.averageCost } });
        }
        for (const consumption of item.service?.consumptions ?? []) {
          await this.stockLedger.apply({
            salonId: sale.salonId,
            productId: consumption.productId,
            type: 'CONSUMPTION',
            quantity: consumption.quantity.times(item.quantity).negated(),
            saleId,
            reason: 'Consommation automatique de la prestation',
          });
        }
      }
    }

    if (features.has(FEATURES.COMMISSIONS)) {
      const today = new Date();
      const rules = await tx.commissionRule.findMany({
        where: { validFrom: { lte: today }, OR: [{ validTo: null }, { validTo: { gte: today } }] },
      });
      const entries = sale.items
        .filter((item) => item.staffId && (item.type === 'SERVICE' || item.type === 'PRODUCT'))
        .map((item) => {
          const match = matchCommission(rules, {
            type: item.type as 'SERVICE' | 'PRODUCT',
            staffId: item.staffId!,
            serviceId: item.serviceId,
            serviceCategoryId: item.service?.categoryId ?? null,
            productId: item.productId,
            quantity: item.quantity,
            lineTotal: item.lineTotal,
          });
          return match && match.amount > 0n
            ? { tenantId, staffId: item.staffId!, saleItemId: item.id, ruleId: match.rule.id, baseAmount: item.lineTotal, amount: match.amount, earnedAt: today }
            : null;
        })
        .filter((e): e is NonNullable<typeof e> => e !== null);
      if (entries.length) await tx.commissionEntry.createMany({ data: entries });
    }

    if (sale.clientId) {
      await tx.clientProfile.update({
        where: { id: sale.clientId },
        data: { visitCount: { increment: 1 }, totalSpent: { increment: sale.total }, lastVisitAt: new Date() },
      });
    }
    if (sale.appointmentId) {
      const appointment = await tx.appointment.findFirst({ where: { id: sale.appointmentId }, select: { status: true } });
      if (appointment && ['CONFIRMED', 'CHECKED_IN', 'IN_PROGRESS'].includes(appointment.status)) {
        await tx.appointment.update({ where: { id: sale.appointmentId }, data: { status: 'COMPLETED', completedAt: new Date() } });
        await tx.appointmentStatusHistory.createMany({
          data: [{ tenantId, appointmentId: sale.appointmentId, fromStatus: appointment.status, toStatus: 'COMPLETED', reason: 'Encaissé', changedBy: this.db.userId }],
        });
      }
    }
  }

  /**
   * Écriture d'une vente : débit des moyens de paiement et des remises globales,
   * crédit du chiffre d'affaires (prestations / produits) et des pourboires dus.
   */
  private async ledgerLines(saleId: string): Promise<LedgerLine[]> {
    const sale = await this.db.tx.sale.findFirstOrThrow({
      where: { id: saleId },
      select: {
        subtotal: true,
        total: true,
        tipTotal: true,
        payments: { where: { status: 'SUCCEEDED' }, select: { method: true, amount: true } },
        items: { select: { type: true, lineTotal: true } },
      },
    });
    const byAccount = new Map<string, bigint>();
    for (const payment of sale.payments) {
      const account = accountForPaymentMethod(payment.method);
      byAccount.set(account, (byAccount.get(account) ?? 0n) + payment.amount);
    }
    const lines: LedgerLine[] = [...byAccount.entries()].map(([account, amount]) => ({ account: account as LedgerLine['account'], debit: amount }));
    lines.push({ account: 'DISCOUNTS', debit: sale.subtotal - sale.total });
    lines.push({ account: 'REVENUE_SERVICES', credit: sumMoney(sale.items.filter((i) => i.type === 'SERVICE').map((i) => i.lineTotal)) });
    lines.push({ account: 'REVENUE_PRODUCTS', credit: sumMoney(sale.items.filter((i) => i.type === 'PRODUCT').map((i) => i.lineTotal)) });
    lines.push({ account: 'TIPS_PAYABLE', credit: sale.tipTotal });
    return lines;
  }

  // ------------------------------------------------------------------ Construction des lignes

  private async buildLine(
    user: AuthUser,
    item: SaleItemDto,
    appointment: { id: string; items: { id: string; serviceId: string; variantId: string | null; staffId: string; price: bigint; serviceName: string }[] } | null,
  ): Promise<BuiltLine> {
    const quantity = item.quantity ?? 1;
    if (item.type === 'PRODUCT') {
      const product = await this.db.tx.product.findFirst({
        where: { id: item.productId, deletedAt: null, isActive: true, kind: { in: ['RETAIL', 'BOTH'] } },
        select: { id: true, name: true, salePrice: true, purchasePrice: true },
      });
      if (!product || product.salePrice === null) throw new BadRequestException('Produit inconnu ou non destiné à la vente.');
      if (item.unitPrice !== undefined && !user.permissions.includes('prices.manage')) {
        throw new ForbiddenException('Modifier le prix d’un produit nécessite la permission « Modifier les prix ».');
      }
      const staffId = item.staffId ? await this.assertStaff(item.staffId) : null;
      return this.finishLine({
        type: 'PRODUCT',
        serviceId: null,
        variantId: null,
        serviceCategoryId: null,
        productId: product.id,
        appointmentItemId: null,
        staffId,
        label: product.name,
        quantity,
        unitPrice: item.unitPrice !== undefined ? toMoney(item.unitPrice) : product.salePrice,
        discountAmount: toMoney(item.discountAmount),
        unitCost: product.purchasePrice,
      });
    }

    const fromAppointment = item.appointmentItemId ? appointment?.items.find((i) => i.id === item.appointmentItemId) : undefined;
    if (item.appointmentItemId && !fromAppointment) throw new BadRequestException('Ligne de rendez-vous inconnue pour ce ticket.');
    const serviceId = fromAppointment?.serviceId ?? item.serviceId!;
    const service = await this.db.tx.service.findFirst({
      where: { id: serviceId, deletedAt: null },
      select: {
        id: true,
        name: true,
        categoryId: true,
        basePrice: true,
        priceIsFrom: true,
        durationMinutes: true,
        steps: { select: { position: true, durationMinutes: true, blocksStaff: true } },
        variants: { where: { isActive: true }, select: { id: true, name: true, price: true, durationMinutes: true } },
      },
    });
    if (!service) throw new BadRequestException('Prestation inconnue.');
    const variantId = fromAppointment?.variantId ?? item.variantId ?? null;
    const variant = variantId ? service.variants.find((v) => v.id === variantId) : null;
    if (variantId && !variant) throw new BadRequestException('Variante inconnue.');
    const staffId = item.staffId ? await this.assertStaff(item.staffId) : (fromAppointment?.staffId ?? null);
    const skill = staffId ? await this.db.tx.staffSkill.findFirst({ where: { staffId, serviceId: service.id } }) : null;
    const defaultPrice = fromAppointment?.price ?? computeTiming(service, variant, skill).price;

    if (item.unitPrice !== undefined && toMoney(item.unitPrice) !== defaultPrice) {
      const allowed = service.priceIsFrom ? toMoney(item.unitPrice) >= service.basePrice : false;
      if (!allowed && !user.permissions.includes('prices.manage')) {
        throw new ForbiddenException('Ce prix ne peut pas être modifié (prix fixe) : utilisez une remise.');
      }
    }
    return this.finishLine({
      type: 'SERVICE',
      serviceId: service.id,
      variantId: variant?.id ?? null,
      serviceCategoryId: service.categoryId,
      productId: null,
      appointmentItemId: fromAppointment?.id ?? null,
      staffId,
      label: fromAppointment?.serviceName ?? (variant ? `${service.name} — ${variant.name}` : service.name),
      quantity,
      unitPrice: item.unitPrice !== undefined ? toMoney(item.unitPrice) : defaultPrice,
      discountAmount: toMoney(item.discountAmount),
      unitCost: null,
    });
  }

  private finishLine(line: Omit<BuiltLine, 'lineTotal'>): BuiltLine {
    const gross = line.unitPrice * BigInt(line.quantity);
    if (line.discountAmount > gross) throw new BadRequestException(`La remise dépasse le prix de « ${line.label} ».`);
    return { ...line, lineTotal: gross - line.discountAmount };
  }

  private async assertDiscountAllowed(user: AuthUser, discount: bigint, gross: bigint) {
    if (discount === 0n) return;
    if (!user.permissions.includes('sales.discount')) {
      throw new ForbiddenException("Vous n'avez pas la permission d'accorder une remise.");
    }
    if (user.permissions.includes('prices.manage')) return;
    const setting = await this.db.tx.tenantSetting.findFirst({ where: { key: 'sales.max_discount_percent' }, select: { value: true } });
    const maxPercent = typeof setting?.value === 'number' ? setting.value : DEFAULT_MAX_DISCOUNT_PERCENT;
    if (discount * 100n > gross * BigInt(maxPercent)) {
      throw new ForbiddenException(`Remise limitée à ${maxPercent} % du ticket pour votre rôle.`);
    }
  }

  private async assertStaff(staffId: string): Promise<string> {
    const staff = await this.db.tx.staffMember.findFirst({ where: { id: staffId }, select: { id: true } });
    if (!staff) throw new BadRequestException('Employé inconnu.');
    return staff.id;
  }

  private async billableAppointment(appointmentId: string, salonId: string) {
    const appointment = await this.db.tx.appointment.findFirst({
      where: { id: appointmentId, salonId },
      select: {
        id: true,
        clientId: true,
        status: true,
        items: { select: { id: true, serviceId: true, variantId: true, staffId: true, price: true, serviceName: true } },
        sales: { where: { status: { not: 'VOIDED' } }, select: { id: true } },
      },
    });
    if (!appointment) throw new BadRequestException('Rendez-vous inconnu dans ce salon.');
    if (['CANCELLED_BY_CLIENT', 'CANCELLED_BY_SALON', 'NO_SHOW'].includes(appointment.status)) {
      throw new ConflictException('Ce rendez-vous est annulé.');
    }
    if (appointment.sales.length > 0) throw new ConflictException('Ce rendez-vous a déjà été encaissé.');
    return appointment;
  }
}
