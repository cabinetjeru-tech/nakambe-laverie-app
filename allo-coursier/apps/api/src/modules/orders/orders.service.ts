import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import {
  LedgerTransactionType,
  OrderStatus,
  PaymentProvider,
  PaymentPurpose,
  PaymentStatus,
  Prisma,
  RatingTarget,
  StopKind,
} from '@prisma/client';
import { randomBytes, randomInt } from 'crypto';
import { AuthUser } from '../../common/auth-user';
import { paginate } from '../../common/dto/pagination.dto';
import { hasPermissions } from '../../common/guards/permissions.guard';
import { PERMISSIONS } from '../../common/permissions';
import { normalizeBurkinaPhone } from '../../common/utils/phone';
import { PrismaService } from '../../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { PricingService } from '../pricing/pricing.service';
import { PromotionsService } from '../promotions/promotions.service';
import { SettingsService } from '../settings/settings.service';
import { StorageService } from '../storage/storage.service';
import { LedgerService } from '../wallet/ledger.service';
import { DispatchService } from './dispatch.service';
import { CancelOrderDto, CreateOrderDto, OrderQueryDto, RatingDto, StopInputDto } from './dto/orders.dto';
import { OrderLifecycleService } from './order-lifecycle.service';
import { CLIENT_CANCELLABLE, PURCHASE_SERVICES } from './order-status';
import { clientView, orderDetailInclude, publicTrackingView } from './order-views';

const REFERENCE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const MIN_SCHEDULE_MINUTES = 15;
const MAX_SCHEDULE_DAYS = 7;

export function generateReference(at = new Date()): string {
  const d = at.toISOString().slice(2, 10).replace(/-/g, '');
  const suffix = Array.from({ length: 5 }, () => REFERENCE_ALPHABET[randomInt(REFERENCE_ALPHABET.length)]).join('');
  return `AC-${d}-${suffix}`;
}

@Injectable()
export class OrdersService {
  constructor(
    private prisma: PrismaService,
    private pricing: PricingService,
    private promotions: PromotionsService,
    private lifecycle: OrderLifecycleService,
    private dispatch: DispatchService,
    private ledger: LedgerService,
    private notifications: NotificationsService,
    private storage: StorageService,
    private settings: SettingsService,
  ) {}

  // ------------------------------------------------------------------ création

  async create(clientId: string, dto: CreateOrderDto, idempotencyKey?: string) {
    if (idempotencyKey) {
      const existing = await this.prisma.order.findUnique({ where: { idempotencyKey } });
      if (existing) {
        if (existing.clientId !== clientId) throw new ConflictException('Clé de requête déjà utilisée.');
        return this.getForClient(clientId, existing.id);
      }
    }

    const isPurchase = PURCHASE_SERVICES.includes(dto.serviceType);
    if (isPurchase) {
      if (!dto.purchaseBudget) throw new BadRequestException('Indiquez le budget maximum des achats.');
      if (!dto.items?.length) throw new BadRequestException('Indiquez la liste des articles à acheter.');
      if (dto.paymentMethod !== PaymentProvider.CASH) {
        throw new BadRequestException('Les courses et achats se paient en espèces à la livraison (remboursement du montant avancé).');
      }
    }
    if (dto.paymentMethod === PaymentProvider.MANUAL_MOBILE_MONEY) {
      const orange = await this.settings.get('payments.mobileMoney.orangeNumber');
      const moov = await this.settings.get('payments.mobileMoney.moovNumber');
      if (!orange && !moov) throw new BadRequestException('Le paiement Mobile Money n’est pas encore disponible : choisissez un autre moyen.');
    }
    if (dto.paymentMethod !== PaymentProvider.MANUAL_MOBILE_MONEY && dto.mobileMoney) {
      throw new BadRequestException('Référence Mobile Money fournie pour un autre moyen de paiement.');
    }
    if (dto.scheduledAt) {
      const minutes = (dto.scheduledAt.getTime() - Date.now()) / 60_000;
      if (minutes < MIN_SCHEDULE_MINUTES) throw new BadRequestException(`Programmez au moins ${MIN_SCHEDULE_MINUTES} minutes à l’avance.`);
      if (minutes > MAX_SCHEDULE_DAYS * 24 * 60) throw new BadRequestException(`Programmez au plus ${MAX_SCHEDULE_DAYS} jours à l’avance.`);
    }
    const pickup = this.normalizeStop(dto.pickup, 'ramassage');
    const dropoff = this.normalizeStop(dto.dropoff, 'livraison');

    const quote = await this.pricing.quote({
      pickup,
      dropoff,
      serviceType: dto.serviceType,
      vehicleType: dto.vehicleType,
      scheduledAt: dto.scheduledAt,
      purchaseAmount: isPurchase ? dto.purchaseBudget : undefined,
    });
    const price = dto.speed === 'EXPRESS' ? quote.express : quote.standard;

    const cashCollectAt = dto.paymentMethod === PaymentProvider.CASH ? (isPurchase ? StopKind.DROPOFF : dto.cashCollectAt ?? StopKind.DROPOFF) : null;
    const reference = generateReference();
    const deliveryCode = String(randomInt(10_000)).padStart(4, '0');
    const trackingToken = randomBytes(18).toString('base64url');

    const { order, paymentPending } = await this.prisma.$transaction(async (tx) => {
      let discount = 0;
      let promotionId: string | undefined;
      if (dto.promoCode?.trim()) {
        const promo = await this.promotions.evaluate(
          dto.promoCode,
          { userId: clientId, cityId: quote.city.id, serviceType: dto.serviceType, deliveryFee: price.deliveryFee, at: quote.at },
          tx,
        );
        discount = promo.discount;
        promotionId = promo.promotion.id;
      }
      // Les achats avancés par le livreur s'ajoutent au total une fois connus.
      const totalAmount = price.deliveryFee - discount;
      // Une commande entièrement offerte (promotion) n'a rien à payer.
      const prepaid = dto.paymentMethod === PaymentProvider.WALLET || (dto.paymentMethod !== PaymentProvider.CASH && totalAmount === 0);
      const awaitingPayment = dto.paymentMethod === PaymentProvider.MANUAL_MOBILE_MONEY && totalAmount > 0;
      const initialStatus = awaitingPayment
          ? OrderStatus.PENDING_PAYMENT
          : await this.lifecycle.readyStatus({ scheduledAt: dto.scheduledAt ?? null });

      const created = await tx.order.create({
        data: {
          reference,
          clientId,
          cityId: quote.city.id,
          serviceType: dto.serviceType,
          speed: dto.speed,
          vehicleType: dto.vehicleType,
          status: initialStatus,
          scheduledAt: dto.scheduledAt,
          packageDescription: dto.packageDescription,
          packageSize: dto.packageSize,
          isFragile: dto.isFragile ?? false,
          purchaseBudget: isPurchase ? dto.purchaseBudget : null,
          distanceMeters: Math.round(quote.distanceKm * 1000),
          pricingRuleId: quote.rule.id,
          priceBreakdown: {
            ...price,
            localTime: quote.localTime,
            routingMethod: quote.routingMethod,
            zone: quote.zone,
            ruleName: quote.rule.name,
          } as unknown as Prisma.InputJsonValue,
          deliveryFee: price.deliveryFee,
          discountAmount: discount,
          totalAmount,
          commissionAmount: price.commissionAmount - discount,
          driverEarning: price.driverEarning,
          paymentMethod: dto.paymentMethod,
          paymentStatus: prepaid ? PaymentStatus.SUCCEEDED : PaymentStatus.PENDING,
          cashCollectAt,
          promotionId,
          deliveryCode,
          trackingToken,
          idempotencyKey,
          note: dto.note,
          stops: {
            create: [
              { sequence: 0, kind: StopKind.PICKUP, ...pickup },
              { sequence: 1, kind: StopKind.DROPOFF, ...dropoff },
            ],
          },
          items: dto.items?.length
            ? { create: dto.items.map((i) => ({ label: i.label, quantity: i.quantity ?? 1, note: i.note })) }
            : undefined,
          statusHistory: {
            create: { toStatus: initialStatus, actorId: clientId, actorRole: 'CLIENT', note: 'Commande créée' },
          },
        },
      });

      if (promotionId) {
        await tx.promotionRedemption.create({
          data: { promotionId, userId: clientId, orderId: created.id, discountAmount: discount },
        });
      }

      if (dto.paymentMethod === PaymentProvider.WALLET && totalAmount > 0) {
        const clientWallet = await this.ledger.userWallet('CLIENT', clientId, tx);
        const platform = await this.ledger.systemWallet('PLATFORM_REVENUE', tx);
        const payment = await tx.payment.create({
          data: {
            orderId: created.id,
            userId: clientId,
            purpose: PaymentPurpose.ORDER,
            provider: PaymentProvider.WALLET,
            amount: totalAmount,
            status: PaymentStatus.SUCCEEDED,
            confirmedAt: new Date(),
          },
        });
        await this.ledger.post(
          {
            type: LedgerTransactionType.ORDER_PAYMENT,
            description: `Paiement de la commande ${reference} par portefeuille`,
            orderId: created.id,
            paymentId: payment.id,
            lines: [
              { walletId: clientWallet.id, amount: -totalAmount, mustStayPositive: true },
              { walletId: platform.id, amount: totalAmount },
            ],
          },
          tx,
        );
      }

      let paymentPending = false;
      if (awaitingPayment && dto.mobileMoney) {
        await this.createManualPayment(tx, clientId, created.id, totalAmount, dto.mobileMoney);
        paymentPending = true;
      }
      return { order: created, paymentPending };
    });

    if (paymentPending) await this.announceManualPayment(order.reference, order.cityId);
    await this.lifecycle.announce(order, { notifyClient: false });
    if (order.status === OrderStatus.SEARCHING_DRIVER) await this.dispatch.trigger(order.id);
    return this.getForClient(clientId, order.id);
  }

  private normalizeStop(stop: StopInputDto, label: string) {
    const contactPhone = normalizeBurkinaPhone(stop.contactPhone);
    if (!contactPhone) throw new BadRequestException(`Numéro du contact au ${label} invalide (8 chiffres).`);
    return { ...stop, contactPhone, contactName: stop.contactName.trim(), landmark: stop.landmark.trim() };
  }

  /** Enregistre une déclaration de paiement Mobile Money à valider par l'administration. */
  async createManualPayment(
    tx: Prisma.TransactionClient,
    userId: string,
    orderId: string | null,
    amount: number,
    mm: { operator: 'ORANGE' | 'MOOV'; reference: string; payerPhone: string },
  ) {
    const payerPhone = normalizeBurkinaPhone(mm.payerPhone);
    if (!payerPhone) throw new BadRequestException('Numéro Mobile Money invalide.');
    const providerReference = mm.reference.trim().toUpperCase();
    const duplicate = await tx.payment.findUnique({
      where: { provider_providerReference: { provider: PaymentProvider.MANUAL_MOBILE_MONEY, providerReference } },
    });
    if (duplicate) throw new ConflictException('Cette référence de transaction a déjà été déclarée.');
    return tx.payment.create({
      data: {
        orderId,
        userId,
        purpose: orderId ? PaymentPurpose.ORDER : PaymentPurpose.WALLET_TOPUP,
        provider: PaymentProvider.MANUAL_MOBILE_MONEY,
        operator: mm.operator,
        amount,
        providerReference,
        payerPhone,
        status: PaymentStatus.PENDING,
      },
    });
  }

  async announceManualPayment(label: string, cityId?: string) {
    await this.notifications.notifyStaff(
      PERMISSIONS.PAYMENTS_VALIDATE.code,
      { type: 'ADMIN_ALERT', title: 'Paiement Mobile Money à vérifier', body: `${label} : un client a déclaré un paiement.`, url: '/admin/paiements' },
      cityId,
    );
  }

  /** Le client déclare (ou redéclare) son paiement Mobile Money pour une commande en attente. */
  async submitPayment(clientId: string, orderId: string, mm: { operator: 'ORANGE' | 'MOOV'; reference: string; payerPhone: string }) {
    const order = await this.prisma.order.findFirst({ where: { id: orderId, clientId } });
    if (!order) throw new NotFoundException('Commande introuvable.');
    if (order.status !== OrderStatus.PENDING_PAYMENT) throw new BadRequestException('Cette commande n’attend pas de paiement.');
    await this.prisma.$transaction(async (tx) => {
      const pending = await tx.payment.count({ where: { orderId, status: PaymentStatus.PENDING } });
      if (pending > 0) throw new BadRequestException('Un paiement est déjà en cours de vérification.');
      await this.createManualPayment(tx, clientId, orderId, order.totalAmount, mm);
    });
    await this.announceManualPayment(order.reference, order.cityId);
    return this.getForClient(clientId, orderId);
  }

  // ------------------------------------------------------------------ consultation

  async listForClient(clientId: string, query: OrderQueryDto) {
    const statuses = query.status ? (Array.isArray(query.status) ? query.status : [query.status]) : undefined;
    const where: Prisma.OrderWhereInput = { clientId, status: statuses ? { in: statuses } : undefined };
    const [items, total] = await this.prisma.$transaction([
      this.prisma.order.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        ...paginate(query),
        select: {
          id: true,
          reference: true,
          status: true,
          serviceType: true,
          speed: true,
          totalAmount: true,
          createdAt: true,
          scheduledAt: true,
          stops: { select: { kind: true, landmark: true }, orderBy: { sequence: 'asc' } },
        },
      }),
      this.prisma.order.count({ where }),
    ]);
    return { items, total, page: query.page, pageSize: query.pageSize };
  }

  async getForClient(clientId: string, orderId: string) {
    const order = await this.prisma.order.findFirst({ where: { id: orderId, clientId }, include: orderDetailInclude });
    if (!order) throw new NotFoundException('Commande introuvable.');
    const payments = await this.prisma.payment.findMany({
      where: { orderId },
      orderBy: { createdAt: 'desc' },
      select: { id: true, provider: true, operator: true, amount: true, status: true, providerReference: true, failureReason: true, createdAt: true },
    });
    return { ...clientView(order, (k) => this.storage.signedUrl(k)), payments };
  }

  async track(token: string) {
    const order = await this.prisma.order.findUnique({ where: { trackingToken: token }, include: orderDetailInclude });
    if (!order) throw new NotFoundException('Lien de suivi invalide.');
    return publicTrackingView(order);
  }

  // ------------------------------------------------------------------ annulation

  async cancelByClient(clientId: string, orderId: string, dto: CancelOrderDto) {
    const order = await this.prisma.order.findFirst({ where: { id: orderId, clientId } });
    if (!order) throw new NotFoundException('Commande introuvable.');
    if (!CLIENT_CANCELLABLE.includes(order.status)) {
      throw new BadRequestException('Le livreur est déjà sur place : contactez le service client pour annuler.');
    }
    if (order.serviceType === 'FOOD' && order.merchantStatus && order.merchantStatus !== 'PENDING') {
      throw new BadRequestException('Le commerçant prépare déjà votre repas : contactez le service client pour annuler.');
    }
    return this.cancel(orderId, CLIENT_CANCELLABLE, { id: clientId, role: 'CLIENT' }, dto.reason);
  }

  /** Annulation commune (client, équipe, système) : offres fermées, paiement remboursé sur le portefeuille. */
  async cancel(orderId: string, allowedFrom: OrderStatus[], actor: { id: string | null; role: 'CLIENT' | 'STAFF' | 'SYSTEM' }, reason: string) {
    let closedDrivers: string[] = [];
    let refunded = 0;
    const order = await this.prisma.$transaction(async (tx) => {
      const updated = await this.lifecycle.transition(tx, orderId, allowedFrom, OrderStatus.CANCELLED, actor, {
        note: reason,
        data: { cancelReason: reason, cancelledById: actor.id },
      });
      if (!updated) throw new BadRequestException('Cette commande ne peut plus être annulée.');
      closedDrivers = await this.lifecycle.closeOpenOffers(tx, orderId);
      refunded = await this.lifecycle.refundIfPrepaid(tx, updated, actor.id);
      await tx.payment.updateMany({
        where: { orderId, status: PaymentStatus.PENDING },
        data: { status: PaymentStatus.CANCELLED, failureReason: 'Commande annulée' },
      });
      return tx.order.findUniqueOrThrow({ where: { id: orderId } });
    });
    this.lifecycle.notifyOffersClosed(orderId, closedDrivers);
    await this.lifecycle.announce(order, {
      notifyClient: false,
      notifyDriver: { title: 'Mission annulée', body: `La commande ${order.reference} a été annulée.` },
    });
    if (actor.role !== 'CLIENT') {
      await this.notifications.notify(order.clientId, {
        type: 'ORDER_STATUS',
        title: 'Commande annulée',
        body: `La commande ${order.reference} a été annulée${refunded ? ` ; ${refunded} FCFA ont été remboursés sur votre portefeuille` : ''}.`,
        url: `/commandes/${order.id}`,
      });
    }
    return { id: order.id, status: order.status, refunded };
  }

  // ------------------------------------------------------------------ notation

  async rate(user: AuthUser, orderId: string, dto: RatingDto) {
    const order = await this.prisma.order.findUnique({ where: { id: orderId } });
    if (!order) throw new NotFoundException('Commande introuvable.');
    const isClient = order.clientId === user.id;
    const isDriver = order.driverId === user.id;
    if (!isClient && !isDriver) throw new ForbiddenException();
    if (order.status !== OrderStatus.DELIVERED && order.status !== OrderStatus.COMPLETED) {
      throw new BadRequestException('La notation est possible une fois la commande livrée.');
    }
    if (isClient && !order.driverId) throw new BadRequestException('Aucun livreur à noter.');
    const targetType = isClient ? RatingTarget.DRIVER : RatingTarget.CLIENT;
    const targetId = isClient ? order.driverId! : order.clientId;

    const rating = await this.prisma.$transaction(async (tx) => {
      const created = await tx.rating
        .create({
          data: { orderId, raterId: user.id, targetType, targetId, score: dto.score, tags: dto.tags ?? [], comment: dto.comment },
        })
        .catch((e) => {
          if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
            throw new ConflictException('Vous avez déjà noté cette commande.');
          }
          throw e;
        });
      if (targetType === RatingTarget.DRIVER) {
        const agg = await tx.rating.aggregate({ where: { targetType, targetId }, _avg: { score: true }, _count: true });
        await tx.driverProfile.update({
          where: { userId: targetId },
          data: { ratingAvg: agg._avg.score ?? 0, ratingCount: agg._count },
        });
      }
      return created;
    });
    if (isClient && order.status === OrderStatus.DELIVERED) {
      const completed = await this.prisma.$transaction((tx) =>
        this.lifecycle.transition(tx, orderId, [OrderStatus.DELIVERED], OrderStatus.COMPLETED, { id: user.id, role: 'CLIENT' }),
      );
      if (completed) await this.lifecycle.announce(completed, { notifyClient: false });
    }
    return rating;
  }

  /** Accès en lecture à une commande (client, livreur affecté, équipe). */
  async assertCanView(user: AuthUser, orderId: string) {
    const order = await this.prisma.order.findUnique({ where: { id: orderId }, select: { id: true, clientId: true, driverId: true, cityId: true } });
    if (!order) throw new NotFoundException('Commande introuvable.');
    const staff = hasPermissions(user, [PERMISSIONS.ORDERS_READ.code]) && (!user.cityIds || user.cityIds.includes(order.cityId));
    if (!staff && order.clientId !== user.id && order.driverId !== user.id) throw new NotFoundException('Commande introuvable.');
    return { order, staff };
  }
}
