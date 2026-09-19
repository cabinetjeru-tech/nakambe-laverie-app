import { BadRequestException, Injectable } from '@nestjs/common';
import { InvoiceStatus } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { NumberingService } from '../../common/numbering.service';
import { AuditLogService } from '../../common/audit-log.service';
import { CreatePaymentDto } from './dto/create-payment.dto';

@Injectable()
export class PaymentsService {
  constructor(
    private prisma: PrismaService,
    private numbering: NumberingService,
    private auditLog: AuditLogService,
  ) {}

  async create(dto: CreatePaymentDto, userId?: string) {
    let clientId = dto.clientId;

    if (dto.invoiceId) {
      const invoice = await this.prisma.invoice.findUnique({ where: { id: dto.invoiceId } });
      if (!invoice) throw new BadRequestException('Facture introuvable.');
      clientId = clientId ?? invoice.clientId;
    }
    if (dto.orderId && !clientId) {
      const order = await this.prisma.order.findUnique({ where: { id: dto.orderId } });
      if (!order) throw new BadRequestException('Commande introuvable.');
      clientId = order.clientId;
    }
    if (!clientId) throw new BadRequestException('clientId, orderId ou invoiceId est requis.');

    const paymentNumber = await this.numbering.next('PAI');

    const payment = await this.prisma.$transaction(async (tx) => {
      const created = await tx.payment.create({
        data: {
          paymentNumber,
          clientId: clientId!,
          orderId: dto.orderId,
          invoiceId: dto.invoiceId,
          amount: dto.amount,
          method: dto.method,
          transactionRef: dto.transactionRef,
          receivedById: userId,
        },
      });

      if (dto.orderId) {
        await tx.order.update({
          where: { id: dto.orderId },
          data: { amountPaid: { increment: dto.amount } },
        });
      }

      if (dto.invoiceId) {
        const invoice = await tx.invoice.update({
          where: { id: dto.invoiceId },
          data: { amountPaid: { increment: dto.amount } },
        });
        const status: InvoiceStatus =
          Number(invoice.amountPaid) >= Number(invoice.total)
            ? InvoiceStatus.PAYEE
            : Number(invoice.amountPaid) > 0
              ? InvoiceStatus.PARTIELLEMENT_PAYEE
              : InvoiceStatus.IMPAYEE;
        await tx.invoice.update({ where: { id: dto.invoiceId }, data: { status } });
      }

      return created;
    });

    await this.auditLog.log({
      userId,
      action: 'PAYMENT_RECORDED',
      entityType: 'Payment',
      entityId: payment.id,
      details: { amount: dto.amount, method: dto.method },
    });

    await this.awardLoyaltyPoints(clientId, dto.amount);

    return payment;
  }

  /** Attribue des points de fidélité selon la règle active (§24 du cahier des charges). */
  private async awardLoyaltyPoints(clientId: string, amount: number) {
    const rule = await this.prisma.loyaltyRule.findFirst({ where: { isActive: true } });
    if (!rule || Number(rule.unitAmount) <= 0) return;
    const points = Math.floor(amount / Number(rule.unitAmount)) * rule.pointsPerUnit;
    if (points > 0) {
      await this.prisma.client.update({
        where: { id: clientId },
        data: { loyaltyPoints: { increment: points } },
      });
    }
  }

  findAll(clientId?: string) {
    return this.prisma.payment.findMany({
      where: clientId ? { clientId } : {},
      include: { client: true, order: true, invoice: true },
      orderBy: { createdAt: 'desc' },
    });
  }
}
