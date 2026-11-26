import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PaymentKind, PaymentMethod, Prisma, SaleItemType } from '@prisma/client';
import { Type } from 'class-transformer';
import { ArrayMinSize, IsArray, IsBoolean, IsDateString, IsEnum, IsInt, IsOptional, IsString, IsUUID, MaxLength, Min, ValidateNested } from 'class-validator';
import { computeSaleTotals, hasPermission, paymentStatusOf, formatFCFA } from '@dread-royal/shared';
import { PrismaService, Tx } from '../../prisma/prisma.service';
import { AuditService } from '../../common/audit.service';
import { AuthUser } from '../../common/auth-user';
import { nextNumber } from '../../common/numbering';
import { CashEngine, CommissionEngine, LoyaltyEngine, StockEngine } from '../core/engines';
import { PageQuery, paginate } from '../../common/pagination';

export class SaleItemDto {
  @IsEnum(SaleItemType) type: SaleItemType;
  @IsOptional() @IsUUID() serviceId?: string;
  @IsOptional() @IsUUID() productId?: string;
  @IsOptional() @IsUUID() packageId?: string;
  @IsOptional() @IsUUID() staffId?: string;
  @IsInt() @Min(1) quantity: number;
  /** Prix unitaire : uniquement pour les prestations à tarif variable (entre prix et prix max) */
  @IsOptional() @IsInt() @Min(0) unitPrice?: number;
  @IsOptional() @IsInt() @Min(0) lineDiscount?: number;
}
export class PaymentDto {
  @IsEnum(PaymentMethod) method: PaymentMethod;
  @IsInt() @Min(1) amount: number;
  @IsOptional() @IsEnum(PaymentKind) kind?: PaymentKind;
  @IsOptional() @IsString() @MaxLength(100) reference?: string;
}
export class CreateSaleDto {
  @IsOptional() @IsUUID() clientId?: string;
  @IsOptional() @IsUUID() appointmentId?: string;
  @IsArray() @ArrayMinSize(1, { message: 'Ajoutez au moins une prestation ou un produit' }) @ValidateNested({ each: true }) @Type(() => SaleItemDto) items: SaleItemDto[];
  @IsOptional() @IsInt() @Min(0) discount?: number;
  @IsOptional() @IsString() @MaxLength(300) discountReason?: string;
  @IsOptional() @IsInt() @Min(0) loyaltyPoints?: number;
  @IsOptional() @IsArray() @ValidateNested({ each: true }) @Type(() => PaymentDto) payments?: PaymentDto[];
  @IsOptional() @IsString() @MaxLength(1000) notes?: string;
  @IsOptional() @IsUUID() clientOpId?: string;
  @IsOptional() @IsDateString() saleDate?: string;
}
export class CancelSaleDto {
  @IsString() @MaxLength(500) reason: string;
  @IsOptional() @IsInt() @Min(0) refundAmount?: number;
  @IsOptional() @IsEnum(PaymentMethod) refundMethod?: PaymentMethod;
  @IsOptional() @IsBoolean() restock?: boolean;
}
export class SaleQuery extends PageQuery {
  @IsOptional() @IsString() from?: string;
  @IsOptional() @IsString() to?: string;
  @IsOptional() @IsString() status?: string;
  @IsOptional() @IsString() paymentStatus?: string;
  @IsOptional() @IsUUID() clientId?: string;
  @IsOptional() @IsUUID() staffId?: string;
}

export const saleInclude = {
  client: { select: { id: true, code: true, firstName: true, lastName: true, phone: true, loyaltyPoints: true } },
  items: { include: { staff: { select: { id: true, firstName: true, lastName: true } } } },
  payments: { orderBy: { paidAt: 'asc' } },
  appointment: { select: { id: true, code: true } },
} satisfies Prisma.SaleInclude;

@Injectable()
export class SalesService {
  constructor(
    private prisma: PrismaService,
    private audit: AuditService,
    private cash: CashEngine,
    private stock: StockEngine,
    private commissions: CommissionEngine,
    private loyalty: LoyaltyEngine,
  ) {}

  async list(q: SaleQuery) {
    const { skip, take, page, pageSize } = paginate(q);
    const where: Prisma.SaleWhereInput = {};
    if (q.from || q.to) where.saleDate = { ...(q.from && { gte: new Date(q.from) }), ...(q.to && { lt: new Date(new Date(q.to).getTime() + 86_400_000) }) };
    if (q.status) where.status = q.status as any;
    if (q.paymentStatus) where.paymentStatus = { in: q.paymentStatus.split(',') as any };
    if (q.clientId) where.clientId = q.clientId;
    if (q.staffId) where.items = { some: { staffId: q.staffId } };
    if (q.search) where.OR = [{ number: { contains: q.search, mode: 'insensitive' } }, { client: { OR: [{ lastName: { contains: q.search, mode: 'insensitive' } }, { firstName: { contains: q.search, mode: 'insensitive' } }, { phone: { contains: q.search.replace(/\s/g, '') } }] } }];
    const [items, total, sums] = await Promise.all([
      this.prisma.sale.findMany({ where, skip, take, orderBy: { saleDate: 'desc' }, include: { client: { select: { firstName: true, lastName: true, code: true } }, _count: { select: { items: true } } } }),
      this.prisma.sale.count({ where }),
      this.prisma.sale.aggregate({ where: { ...where, status: 'VALIDATED' }, _sum: { total: true, paidAmount: true, balance: true } }),
    ]);
    return { items, total, page, pageSize, sums: sums._sum };
  }

  async get(id: string) {
    const sale = await this.prisma.sale.findUnique({ where: { id }, include: saleInclude });
    if (!sale) throw new NotFoundException('Vente introuvable');
    const cashier = await this.prisma.user.findUnique({ where: { id: sale.cashierId }, select: { fullName: true } });
    return { ...sale, cashierName: cashier?.fullName ?? '' };
  }

  async create(dto: CreateSaleDto, user: AuthUser, ip?: string, txIn?: Tx) {
    const run = async (tx: Tx) => {
      // Anti-doublon (opération hors ligne rejouée)
      if (dto.clientOpId) {
        const existing = await tx.sale.findUnique({ where: { clientOpId: dto.clientOpId } });
        if (existing) return { sale: existing, duplicate: true };
      }
      const canDiscount = hasPermission(user.permissions, 'sales.discount');
      if (dto.clientId) {
        const c = await tx.client.findUnique({ where: { id: dto.clientId } });
        if (!c) throw new BadRequestException('Client inconnu');
      }
      if (dto.appointmentId) {
        const a = await tx.appointment.findUnique({ where: { id: dto.appointmentId } });
        if (!a) throw new BadRequestException('Rendez-vous inconnu');
        if (a.status === 'CANCELLED') throw new BadRequestException('Ce rendez-vous est annulé');
      }

      // 1. Construction des lignes à partir du catalogue (les prix viennent du serveur)
      const lines: (Prisma.SaleItemCreateWithoutSaleInput & { _productId?: string; _packageId?: string })[] = [];
      for (const it of dto.items) {
        if ((it.lineDiscount ?? 0) > 0 && !canDiscount) throw new ForbiddenException("Vous n'êtes pas autorisé à accorder des remises");
        if (it.type === 'SERVICE') {
          if (!it.serviceId) throw new BadRequestException('Prestation manquante');
          const s = await tx.service.findUnique({ where: { id: it.serviceId } });
          if (!s || !s.active) throw new BadRequestException('Prestation inconnue ou inactive');
          if (!it.staffId) throw new BadRequestException(`Sélectionnez le coiffeur pour « ${s.name} »`);
          const st = await tx.staff.findUnique({ where: { id: it.staffId } });
          if (!st || st.status === 'INACTIVE') throw new BadRequestException('Coiffeur inconnu ou inactif');
          let unitPrice = s.price;
          if (it.unitPrice != null && it.unitPrice !== s.price) {
            const max = s.priceMax ?? s.price;
            if (it.unitPrice < s.price || it.unitPrice > max) {
              if (!canDiscount) throw new BadRequestException(`Prix de « ${s.name} » : entre ${formatFCFA(s.price)} et ${formatFCFA(max)}`);
            }
            unitPrice = it.unitPrice;
          }
          lines.push({ type: 'SERVICE', service: { connect: { id: s.id } }, staff: { connect: { id: st.id } }, label: s.name, quantity: it.quantity, unitPrice, lineDiscount: it.lineDiscount ?? 0, total: 0 });
        } else if (it.type === 'PRODUCT') {
          if (!it.productId) throw new BadRequestException('Produit manquant');
          const p = await tx.product.findUnique({ where: { id: it.productId } });
          if (!p || !p.active || !p.sellable) throw new BadRequestException('Produit inconnu ou non vendable');
          if (it.unitPrice != null && it.unitPrice !== p.salePrice && !canDiscount) throw new ForbiddenException('Le prix de vente des produits ne peut pas être modifié');
          lines.push({ type: 'PRODUCT', product: { connect: { id: p.id } }, ...(it.staffId ? { staff: { connect: { id: it.staffId } } } : {}), label: p.name, quantity: it.quantity, unitPrice: it.unitPrice ?? p.salePrice, lineDiscount: it.lineDiscount ?? 0, total: 0, unitCost: p.purchasePrice, _productId: p.id });
        } else {
          if (!it.packageId) throw new BadRequestException('Forfait manquant');
          if (!dto.clientId) throw new BadRequestException('Un forfait doit être vendu à un client identifié');
          const pk = await tx.loyaltyPackage.findUnique({ where: { id: it.packageId } });
          if (!pk || !pk.active) throw new BadRequestException('Forfait inconnu ou inactif');
          lines.push({ type: 'PACKAGE', package: { connect: { id: pk.id } }, label: `Forfait ${pk.name}`, quantity: it.quantity, unitPrice: pk.price, lineDiscount: it.lineDiscount ?? 0, total: 0, _packageId: pk.id });
        }
      }

      // 2. Totaux, remises, fidélité
      const discount = dto.discount ?? 0;
      if (discount > 0) {
        if (!canDiscount) throw new ForbiddenException("Vous n'êtes pas autorisé à accorder des remises");
        if (!dto.discountReason?.trim()) throw new BadRequestException('Indiquez le motif de la remise');
      }
      let totals;
      try {
        totals = computeSaleTotals(lines.map((l) => ({ quantity: l.quantity!, unitPrice: l.unitPrice, lineDiscount: l.lineDiscount ?? 0 })), discount, 0);
      } catch (e) {
        throw new BadRequestException((e as Error).message);
      }
      const loyaltyDiscount = await this.loyalty.redeemValue(tx, dto.clientId, dto.loyaltyPoints ?? 0, totals.total);
      const total = totals.total - loyaltyDiscount;
      lines.forEach((l, i) => (l.total = totals.lines[i].total));

      // 3. Paiements initiaux
      const payments = dto.payments ?? [];
      const paid = payments.reduce((s, p) => s + p.amount, 0);
      if (paid > total) throw new BadRequestException(`Le montant encaissé (${formatFCFA(paid)}) dépasse le total (${formatFCFA(total)}). Rendez la monnaie au client.`);

      const saleDate = dto.saleDate ? new Date(dto.saleDate) : new Date();
      const number = await nextNumber(tx, 'FAC', 6, saleDate);
      const sale = await tx.sale.create({
        data: {
          number, clientId: dto.clientId, appointmentId: dto.appointmentId, subtotal: totals.subtotal, discount, discountReason: dto.discountReason,
          loyaltyPointsUsed: dto.loyaltyPoints ?? 0, loyaltyDiscount, total, paidAmount: 0, balance: total, paymentStatus: paymentStatusOf(total, 0),
          notes: dto.notes, cashierId: user.id, saleDate, clientOpId: dto.clientOpId,
          items: { create: lines.map(({ _productId, _packageId, ...l }) => l) },
        },
        include: { items: true },
      });

      // 4. Stock (produits) et forfaits
      for (const it of sale.items) {
        if (it.type === 'PRODUCT' && it.productId) {
          await this.stock.move(tx, { productId: it.productId, type: 'SALE', quantity: -it.quantity, unitCost: it.unitCost, reason: `Vente ${number}`, saleId: sale.id, userId: user.id });
        }
        if (it.type === 'PACKAGE' && it.packageId) {
          const pk = await tx.loyaltyPackage.findUniqueOrThrow({ where: { id: it.packageId } });
          for (let i = 0; i < it.quantity; i++) {
            await tx.clientSubscription.create({ data: { clientId: dto.clientId!, packageId: pk.id, saleId: sale.id, startDate: saleDate, endDate: new Date(saleDate.getTime() + pk.durationDays * 86_400_000), visitsTotal: pk.visits } });
          }
        }
      }

      // 5. Commissions, points utilisés
      await this.commissions.createForSale(tx, sale.id);
      if (loyaltyDiscount > 0) await this.loyalty.add(tx, dto.clientId!, 'REDEEM', -(dto.loyaltyPoints ?? 0), `Réduction de ${formatFCFA(loyaltyDiscount)} sur ${number}`, sale.id, user.id);

      // 6. Encaissements
      for (const p of payments) await this.applyPayment(tx, sale.id, p, user);
      if (total === 0) await this.afterPaid(tx, sale.id, user);

      // 7. Rendez-vous lié → terminé
      if (dto.appointmentId) await tx.appointment.updateMany({ where: { id: dto.appointmentId, status: { in: ['PENDING', 'CONFIRMED', 'IN_PROGRESS'] } }, data: { status: 'DONE' } });

      const full = await tx.sale.findUniqueOrThrow({ where: { id: sale.id }, include: saleInclude });
      await this.audit.log({ userId: user.id, action: 'CREATE', entity: 'Sale', entityId: sale.id, summary: `Vente ${number} — ${formatFCFA(total)} (payé ${formatFCFA(paid)})`, after: full, ip }, tx);
      return { sale: full, duplicate: false };
    };
    const res = txIn ? await run(txIn) : await this.prisma.tx(run);
    return res;
  }

  /** Enregistre un paiement / acompte dans la transaction en cours et met à jour la vente. */
  private async applyPayment(tx: Tx, saleId: string, p: PaymentDto, user: AuthUser) {
    // Verrou ligne : deux encaissements simultanés ne peuvent pas dépasser le solde
    await tx.$queryRaw`SELECT id FROM "Sale" WHERE id = ${saleId} FOR UPDATE`;
    const sale = await tx.sale.findUniqueOrThrow({ where: { id: saleId } });
    if (sale.status !== 'VALIDATED') throw new BadRequestException('Vente annulée : encaissement impossible');
    if (p.amount > sale.balance) throw new BadRequestException(`Le montant dépasse le reste à payer (${formatFCFA(sale.balance)})`);
    if (['ORANGE_MONEY', 'MOOV_MONEY', 'BANK_TRANSFER'].includes(p.method) && !p.reference?.trim()) {
      throw new BadRequestException('Indiquez la référence de la transaction (Orange Money, Moov Money ou virement)');
    }
    const number = await nextNumber(tx, 'REC');
    const kind: PaymentKind = p.kind === 'DEPOSIT' || (p.kind === undefined && p.amount < sale.balance && sale.paidAmount === 0) ? 'DEPOSIT' : 'PAYMENT';
    let cashSessionId: string | undefined;
    if (p.method === 'CASH') {
      const mv = await this.cash.record(tx, { type: 'IN', source: 'SALE_PAYMENT', amount: p.amount, label: `${kind === 'DEPOSIT' ? 'Acompte' : 'Paiement'} ${sale.number}`, referenceId: saleId, userId: user.id });
      cashSessionId = mv.sessionId;
    }
    const payment = await tx.payment.create({ data: { number, saleId, kind, method: p.method, amount: p.amount, reference: p.reference, cashSessionId, receivedById: user.id } });
    const paidAmount = sale.paidAmount + p.amount;
    const balance = sale.total - paidAmount;
    const status = paymentStatusOf(sale.total, paidAmount);
    await tx.sale.update({ where: { id: saleId }, data: { paidAmount, balance, paymentStatus: status } });
    if (status === 'PAID') await this.afterPaid(tx, saleId, user);
    return payment;
  }

  private async afterPaid(tx: Tx, saleId: string, user: AuthUser) {
    await this.commissions.onSalePaid(tx, saleId);
    await this.loyalty.earnForSale(tx, saleId, user.id);
  }

  async addPayment(id: string, dto: PaymentDto, user: AuthUser, ip?: string) {
    return this.prisma.tx(async (tx) => {
      const payment = await this.applyPayment(tx, id, dto, user);
      const sale = await tx.sale.findUniqueOrThrow({ where: { id }, include: saleInclude });
      await this.audit.log({ userId: user.id, action: 'PAYMENT', entity: 'Sale', entityId: id, summary: `Encaissement ${payment.number} de ${formatFCFA(dto.amount)} sur ${sale.number}`, after: payment, ip }, tx);
      return { payment, sale };
    });
  }

  /**
   * Annulation : la vente reste en base (statut CANCELLED, motif, auteur, date).
   * Stock réintégré, commissions annulées/régularisées, points de fidélité corrigés,
   * remboursement facultatif (total ou partiel). La part non remboursée reste en chiffre d'affaires.
   */
  async cancel(id: string, dto: CancelSaleDto, user: AuthUser, ip?: string) {
    if (!dto.reason?.trim() || dto.reason.trim().length < 3) throw new BadRequestException("Le motif d'annulation est obligatoire");
    return this.prisma.tx(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "Sale" WHERE id = ${id} FOR UPDATE`;
      const sale = await tx.sale.findUnique({ where: { id }, include: { items: true } });
      if (!sale) throw new NotFoundException('Vente introuvable');
      if (sale.status === 'CANCELLED') throw new BadRequestException('Cette vente est déjà annulée');
      const refundable = sale.paidAmount - sale.refundedAmount;
      const refund = dto.refundAmount ?? refundable;
      if (refund > refundable) throw new BadRequestException(`Remboursement maximum : ${formatFCFA(refundable)}`);
      if (refund > 0) {
        const method = dto.refundMethod ?? 'CASH';
        const number = await nextNumber(tx, 'REC');
        let cashSessionId: string | undefined;
        if (method === 'CASH') {
          const mv = await this.cash.record(tx, { type: 'OUT', source: 'REFUND', amount: refund, label: `Remboursement ${sale.number}`, referenceId: id, userId: user.id });
          cashSessionId = mv.sessionId;
        }
        await tx.payment.create({ data: { number, saleId: id, kind: 'REFUND', method, amount: refund, reason: dto.reason, cashSessionId, receivedById: user.id } });
      }
      if (dto.restock !== false) {
        for (const it of sale.items) {
          if (it.type === 'PRODUCT' && it.productId) await this.stock.move(tx, { productId: it.productId, type: 'SALE_CANCEL', quantity: it.quantity, unitCost: it.unitCost, reason: `Annulation ${sale.number}`, saleId: id, userId: user.id });
        }
      }
      await tx.clientSubscription.updateMany({ where: { saleId: id }, data: { status: 'CANCELLED' } });
      await this.commissions.onSaleCancelled(tx, id);
      await this.loyalty.reverseForSale(tx, id, user.id);
      const updated = await tx.sale.update({
        where: { id },
        data: { status: 'CANCELLED', cancelledAt: new Date(), cancelledById: user.id, cancelReason: dto.reason.trim(), refundedAmount: sale.refundedAmount + refund, balance: 0 },
        include: saleInclude,
      });
      await this.audit.log({ userId: user.id, action: 'CANCEL', entity: 'Sale', entityId: id, summary: `Annulation ${sale.number} (${dto.reason}) — remboursé ${formatFCFA(refund)}`, before: sale, after: updated, ip }, tx);
      return updated;
    });
  }
}
