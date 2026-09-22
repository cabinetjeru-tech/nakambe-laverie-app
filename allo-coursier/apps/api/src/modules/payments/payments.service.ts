import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { LedgerTransactionType, Order, OrderStatus, PaymentProvider, PaymentPurpose, PaymentStatus, Prisma } from '@prisma/client';
import { AuditService } from '../../audit/audit.service';
import { paginate } from '../../common/dto/pagination.dto';
import { PrismaService } from '../../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { DispatchService } from '../orders/dispatch.service';
import { FoodService } from '../orders/food.service';
import { OrderLifecycleService } from '../orders/order-lifecycle.service';
import { OrdersService } from '../orders/orders.service';
import { LedgerService } from '../wallet/ledger.service';
import { PaymentQueryDto, TopupDto } from './payments.dto';
import { PAYMENT_PROVIDERS, PaymentProviderAdapter } from './providers/payment-provider.interface';

@Injectable()
export class PaymentsService {
  constructor(
    private prisma: PrismaService,
    @Inject(PAYMENT_PROVIDERS) private providers: PaymentProviderAdapter[],
    private ledger: LedgerService,
    private orders: OrdersService,
    private lifecycle: OrderLifecycleService,
    private dispatch: DispatchService,
    private notifications: NotificationsService,
    private audit: AuditService,
    private food: FoodService,
  ) {}

  methods() {
    return Promise.all(this.providers.map((p) => p.describe()));
  }

  async requestTopup(userId: string, dto: TopupDto) {
    const payment = await this.prisma.$transaction((tx) => this.orders.createManualPayment(tx, userId, null, dto.amount, dto));
    await this.orders.announceManualPayment(`Rechargement de ${dto.amount} FCFA`);
    return payment;
  }

  myPayments(userId: string) {
    return this.prisma.payment.findMany({ where: { userId }, orderBy: { createdAt: 'desc' }, take: 50 });
  }

  async list(query: PaymentQueryDto) {
    const where: Prisma.PaymentWhereInput = { status: query.status, provider: query.provider, purpose: query.purpose };
    const [items, total] = await this.prisma.$transaction([
      this.prisma.payment.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        ...paginate(query),
        include: { order: { select: { id: true, reference: true, status: true } } },
      }),
      this.prisma.payment.count({ where }),
    ]);
    const users = await this.prisma.user.findMany({
      where: { id: { in: [...new Set(items.map((p) => p.userId))] } },
      select: { id: true, firstName: true, lastName: true, phone: true },
    });
    return {
      items: items.map((p) => ({ ...p, user: users.find((u) => u.id === p.userId) ?? null })),
      total,
      page: query.page,
      pageSize: query.pageSize,
    };
  }

  /**
   * L'équipe a vérifié la réception de l'argent sur le compte Mobile Money de l'entreprise.
   * Commande : payée puis mise en recherche de livreur. Rechargement (ou commande annulée entre-temps) :
   * le montant est crédité sur le portefeuille du client.
   */
  async validate(paymentId: string, actorId: string) {
    let orderToAnnounce: Order | null = null;
    const payment = await this.prisma.$transaction(async (tx) => {
      const p = await tx.payment.findUnique({ where: { id: paymentId }, include: { order: true } });
      if (!p) throw new NotFoundException('Paiement introuvable.');
      if (p.provider !== PaymentProvider.MANUAL_MOBILE_MONEY) throw new BadRequestException('Seuls les paiements Mobile Money manuels se valident ici.');
      const claimed = await tx.payment.updateMany({
        where: { id: paymentId, status: { in: [PaymentStatus.PENDING, PaymentStatus.CANCELLED] } },
        data: { status: PaymentStatus.SUCCEEDED, validatedById: actorId, confirmedAt: new Date(), failureReason: null },
      });
      if (claimed.count === 0) throw new BadRequestException('Ce paiement a déjà été traité.');

      const external = await this.ledger.systemWallet('CASH_CLEARING', tx);
      const payToOrder = p.purpose === PaymentPurpose.ORDER && p.order?.status === OrderStatus.PENDING_PAYMENT;
      if (payToOrder) {
        const platform = await this.ledger.systemWallet('PLATFORM_REVENUE', tx);
        await this.ledger.post(
          {
            type: LedgerTransactionType.ORDER_PAYMENT,
            description: `Mobile Money reçu — commande ${p.order!.reference}`,
            orderId: p.orderId!,
            paymentId,
            createdById: actorId,
            lines: [
              { walletId: external.id, amount: -p.amount },
              { walletId: platform.id, amount: p.amount },
            ],
          },
          tx,
        );
        const next = await this.lifecycle.readyStatus(p.order!);
        orderToAnnounce = await this.lifecycle.transition(tx, p.orderId!, [OrderStatus.PENDING_PAYMENT], next, { id: actorId, role: 'STAFF' }, {
          note: 'Paiement Mobile Money vérifié',
          data: { paymentStatus: PaymentStatus.SUCCEEDED },
        });
      } else {
        const wallet = await this.ledger.userWallet('CLIENT', p.userId, tx);
        await this.ledger.post(
          {
            type: LedgerTransactionType.TOPUP,
            description: p.orderId ? `Paiement reçu après annulation de ${p.order?.reference} : crédité sur le portefeuille` : 'Rechargement du portefeuille (Mobile Money)',
            paymentId,
            createdById: actorId,
            lines: [
              { walletId: external.id, amount: -p.amount },
              { walletId: wallet.id, amount: p.amount },
            ],
          },
          tx,
        );
      }
      return tx.payment.findUniqueOrThrow({ where: { id: paymentId } });
    });

    await this.audit.log({ actorId, action: 'payment.validate', entityType: 'Payment', entityId: paymentId, after: payment });
    const order = orderToAnnounce as Order | null;
    if (order) {
      await this.lifecycle.announce(order);
      if (order.status === OrderStatus.SEARCHING_DRIVER) await this.dispatch.trigger(order.id);
      // Repas : la commande payée part maintenant chez le commerçant.
      if (order.status === OrderStatus.CREATED && order.merchantId) await this.food.notifyMerchantNewOrder(order.id);
    } else {
      await this.notifications.notify(payment.userId, {
        type: 'PAYMENT',
        title: 'Portefeuille crédité 💰',
        body: `${payment.amount} FCFA ont été ajoutés à votre portefeuille Allô-Coursier.`,
        url: '/portefeuille',
      });
    }
    return payment;
  }

  async reject(paymentId: string, reason: string, actorId: string) {
    const updated = await this.prisma.payment.updateMany({
      where: { id: paymentId, provider: PaymentProvider.MANUAL_MOBILE_MONEY, status: PaymentStatus.PENDING },
      data: { status: PaymentStatus.FAILED, failureReason: reason, validatedById: actorId },
    });
    if (updated.count === 0) throw new BadRequestException('Paiement introuvable ou déjà traité.');
    const payment = await this.prisma.payment.findUniqueOrThrow({ where: { id: paymentId }, include: { order: true } });
    await this.audit.log({ actorId, action: 'payment.reject', entityType: 'Payment', entityId: paymentId, after: { reason } });
    await this.notifications.notify(payment.userId, {
      type: 'PAYMENT',
      title: 'Paiement non reconnu',
      body: `Référence ${payment.providerReference} : ${reason}. Vérifiez la référence ou contactez-nous.`,
      url: payment.orderId ? `/commandes/${payment.orderId}` : '/portefeuille',
    });
    return payment;
  }
}
