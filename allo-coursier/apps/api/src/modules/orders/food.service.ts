import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import {
  LedgerTransactionType,
  MerchantMemberRole,
  MerchantOrderStatus,
  MerchantStatus,
  OrderStatus,
  PaymentProvider,
  PaymentPurpose,
  PaymentStatus,
  PayoutStatus,
  Prisma,
  ServiceType,
  StopKind,
} from '@prisma/client';
import { randomBytes, randomInt } from 'crypto';
import { paginate } from '../../common/dto/pagination.dto';
import { PERMISSIONS } from '../../common/permissions';
import { normalizeBurkinaPhone } from '../../common/utils/phone';
import { PrismaService } from '../../prisma/prisma.service';
import { RealtimeService } from '../../realtime/realtime.service';
import { MerchantsService } from '../merchants/merchants.service';
import { NotificationsService } from '../notifications/notifications.service';
import { PricingService } from '../pricing/pricing.service';
import { PromotionsService } from '../promotions/promotions.service';
import { SettingsService } from '../settings/settings.service';
import { StorageService } from '../storage/storage.service';
import { LedgerService } from '../wallet/ledger.service';
import { DispatchService } from './dispatch.service';
import { CartItemDto, CreateFoodOrderDto, FoodQuoteDto, MerchantOrdersQueryDto, MerchantPayoutDto } from './dto/orders.dto';
import { OrderLifecycleService, SYSTEM_ACTOR } from './order-lifecycle.service';
import { STATUS_LABELS } from './order-status';
import { adminView, orderDetailInclude } from './order-views';
import { generateReference, OrdersService } from './orders.service';

export interface PricedLine {
  productId: string;
  label: string;
  quantity: number;
  unitPrice: number;
  options: { groupName: string; name: string; extraPrice: number }[];
  note?: string;
}

interface CatalogProduct {
  id: string;
  name: string;
  price: number;
  isAvailable: boolean;
  optionGroups: { id: string; name: string; minChoices: number; maxChoices: number; options: { id: string; name: string; extraPrice: number }[] }[];
}

/**
 * Prix d'un panier, calculé uniquement à partir du catalogue en base (jamais du téléphone).
 * Vérifie la disponibilité des produits et le nombre de choix de chaque groupe d'options.
 */
export function priceCart(items: CartItemDto[], products: CatalogProduct[]): { lines: PricedLine[]; subtotal: number } {
  if (items.length === 0) throw new BadRequestException('Votre panier est vide.');
  const lines = items.map((item) => {
    const product = products.find((p) => p.id === item.productId);
    if (!product) throw new BadRequestException('Un article du panier n’existe plus : actualisez le menu.');
    if (!product.isAvailable) throw new BadRequestException(`« ${product.name} » n’est plus disponible.`);
    const chosen = [...new Set(item.optionIds ?? [])];
    const options: PricedLine['options'] = [];
    for (const group of product.optionGroups) {
      const picked = group.options.filter((o) => chosen.includes(o.id));
      if (picked.length < group.minChoices) throw new BadRequestException(`« ${product.name} » : choisissez ${group.name.toLowerCase()}.`);
      if (picked.length > group.maxChoices) throw new BadRequestException(`« ${product.name} » : ${group.maxChoices} choix au maximum pour ${group.name.toLowerCase()}.`);
      options.push(...picked.map((o) => ({ groupName: group.name, name: o.name, extraPrice: o.extraPrice })));
    }
    const known = product.optionGroups.flatMap((g) => g.options.map((o) => o.id));
    if (chosen.some((id) => !known.includes(id))) throw new BadRequestException(`« ${product.name} » : option inconnue, actualisez le menu.`);
    const unitPrice = product.price + options.reduce((s, o) => s + o.extraPrice, 0);
    return { productId: product.id, label: product.name, quantity: item.quantity, unitPrice, options, note: item.note };
  });
  return { lines, subtotal: lines.reduce((s, l) => s + l.unitPrice * l.quantity, 0) };
}

const MERCHANT_VIEWS: Record<'PENDING' | 'ACTIVE' | 'DONE', Prisma.OrderWhereInput> = {
  PENDING: { status: OrderStatus.CREATED, merchantStatus: MerchantOrderStatus.PENDING },
  ACTIVE: {
    merchantStatus: { in: [MerchantOrderStatus.ACCEPTED, MerchantOrderStatus.READY] },
    status: { notIn: [OrderStatus.DELIVERED, OrderStatus.COMPLETED, OrderStatus.CANCELLED, OrderStatus.FAILED, OrderStatus.RETURNED] },
  },
  DONE: { status: { in: [OrderStatus.DELIVERED, OrderStatus.COMPLETED, OrderStatus.CANCELLED, OrderStatus.FAILED, OrderStatus.RETURNED] } },
};

@Injectable()
export class FoodService {
  constructor(
    private prisma: PrismaService,
    private merchants: MerchantsService,
    private pricing: PricingService,
    private promotions: PromotionsService,
    private orders: OrdersService,
    private lifecycle: OrderLifecycleService,
    private dispatch: DispatchService,
    private ledger: LedgerService,
    private notifications: NotificationsService,
    private realtime: RealtimeService,
    private settings: SettingsService,
    private storage: StorageService,
  ) {}

  private async loadMerchant(merchantId: string) {
    const merchant = await this.prisma.merchant.findUnique({
      where: { id: merchantId },
      include: {
        openingHours: true,
        closures: true,
        city: { select: { id: true, name: true, timezone: true } },
        products: { include: { optionGroups: { include: { options: true } } } },
      },
    });
    if (!merchant || merchant.status !== MerchantStatus.ACTIVE) throw new NotFoundException('Ce commerce n’est pas disponible.');
    return merchant;
  }

  // ------------------------------------------------------------------ côté client

  /** Devis d'un panier : articles + livraison (standard et express). */
  async quote(dto: FoodQuoteDto) {
    const merchant = await this.loadMerchant(dto.merchantId);
    const cart = priceCart(dto.items, merchant.products);
    const delivery = await this.pricing.quote({ pickup: merchant, dropoff: dto.dropoff, serviceType: ServiceType.FOOD, vehicleType: 'MOTO' });
    return {
      merchant: { id: merchant.id, name: merchant.name, isOpen: this.merchants.isOpen(merchant), minOrderAmount: merchant.minOrderAmount },
      lines: cart.lines,
      itemsSubtotal: cart.subtotal,
      distanceKm: delivery.distanceKm,
      standard: { deliveryFee: delivery.standard.deliveryFee, total: cart.subtotal + delivery.standard.deliveryFee, lines: delivery.standard.lines },
      express: { deliveryFee: delivery.express.deliveryFee, total: cart.subtotal + delivery.express.deliveryFee, lines: delivery.express.lines },
    };
  }

  async create(clientId: string, dto: CreateFoodOrderDto, idempotencyKey?: string) {
    if (idempotencyKey) {
      const existing = await this.prisma.order.findUnique({ where: { idempotencyKey } });
      if (existing) {
        if (existing.clientId !== clientId) throw new ConflictException('Clé de requête déjà utilisée.');
        return this.orders.getForClient(clientId, existing.id);
      }
    }
    const merchant = await this.loadMerchant(dto.merchantId);
    if (!this.merchants.isOpen(merchant)) throw new BadRequestException(`${merchant.name} est fermé pour le moment.`);
    const cart = priceCart(dto.items, merchant.products);
    if (merchant.minOrderAmount && cart.subtotal < merchant.minOrderAmount) {
      throw new BadRequestException(`Commande minimum chez ${merchant.name} : ${merchant.minOrderAmount} FCFA d’articles.`);
    }
    if (dto.paymentMethod === PaymentProvider.MANUAL_MOBILE_MONEY) {
      const orange = await this.settings.get('payments.mobileMoney.orangeNumber');
      const moov = await this.settings.get('payments.mobileMoney.moovNumber');
      if (!orange && !moov) throw new BadRequestException('Le paiement Mobile Money n’est pas encore disponible : choisissez un autre moyen.');
    }
    const contactPhone = normalizeBurkinaPhone(dto.dropoff.contactPhone);
    if (!contactPhone) throw new BadRequestException('Numéro du contact à la livraison invalide (8 chiffres).');

    const quote = await this.pricing.quote({ pickup: merchant, dropoff: dto.dropoff, serviceType: ServiceType.FOOD, vehicleType: 'MOTO' });
    if (quote.city.id !== merchant.cityId) throw new BadRequestException('Cette adresse n’est pas dans la ville du commerce.');
    const price = dto.speed === 'EXPRESS' ? quote.express : quote.standard;
    const merchantPercent = await this.merchants.commissionPercent(merchant);
    const merchantCommission = Math.round((cart.subtotal * merchantPercent) / 100);
    const reference = generateReference();

    const { order, paymentPending } = await this.prisma.$transaction(async (tx) => {
      let discount = 0;
      let promotionId: string | undefined;
      if (dto.promoCode?.trim()) {
        const promo = await this.promotions.evaluate(dto.promoCode, { userId: clientId, cityId: merchant.cityId, serviceType: ServiceType.FOOD, deliveryFee: price.deliveryFee, at: new Date() }, tx);
        discount = promo.discount;
        promotionId = promo.promotion.id;
      }
      const totalAmount = cart.subtotal + price.deliveryFee - discount;
      const awaitingPayment = dto.paymentMethod === PaymentProvider.MANUAL_MOBILE_MONEY;
      const status = awaitingPayment ? OrderStatus.PENDING_PAYMENT : OrderStatus.CREATED;

      const created = await tx.order.create({
        data: {
          reference,
          clientId,
          merchantId: merchant.id,
          cityId: merchant.cityId,
          serviceType: ServiceType.FOOD,
          speed: dto.speed,
          vehicleType: 'MOTO',
          status,
          merchantStatus: MerchantOrderStatus.PENDING,
          prepMinutes: merchant.avgPrepMinutes,
          distanceMeters: Math.round(quote.distanceKm * 1000),
          pricingRuleId: quote.rule.id,
          priceBreakdown: { ...price, localTime: quote.localTime, routingMethod: quote.routingMethod, zone: quote.zone, ruleName: quote.rule.name, merchantCommissionPercent: merchantPercent } as unknown as Prisma.InputJsonValue,
          itemsSubtotal: cart.subtotal,
          deliveryFee: price.deliveryFee,
          discountAmount: discount,
          totalAmount,
          commissionAmount: price.commissionAmount - discount,
          driverEarning: price.driverEarning,
          merchantCommissionAmount: merchantCommission,
          merchantEarning: cart.subtotal - merchantCommission,
          paymentMethod: dto.paymentMethod,
          paymentStatus: dto.paymentMethod === PaymentProvider.WALLET ? PaymentStatus.SUCCEEDED : PaymentStatus.PENDING,
          cashCollectAt: dto.paymentMethod === PaymentProvider.CASH ? StopKind.DROPOFF : null,
          promotionId,
          deliveryCode: String(randomInt(10_000)).padStart(4, '0'),
          trackingToken: randomBytes(18).toString('base64url'),
          idempotencyKey,
          note: dto.note,
          stops: {
            create: [
              { sequence: 0, kind: StopKind.PICKUP, lat: merchant.lat, lng: merchant.lng, addressText: merchant.addressText, landmark: merchant.landmark || merchant.name, contactName: merchant.name, contactPhone: merchant.phone },
              { sequence: 1, kind: StopKind.DROPOFF, lat: dto.dropoff.lat, lng: dto.dropoff.lng, addressText: dto.dropoff.addressText, landmark: dto.dropoff.landmark.trim(), contactName: dto.dropoff.contactName.trim(), contactPhone },
            ],
          },
          items: {
            create: cart.lines.map((l) => ({ productId: l.productId, label: l.label, quantity: l.quantity, unitPrice: l.unitPrice, options: l.options as unknown as Prisma.InputJsonValue, note: l.note })),
          },
          statusHistory: { create: { toStatus: status, actorId: clientId, actorRole: 'CLIENT', note: `Commande envoyée à ${merchant.name}` } },
        },
      });
      if (promotionId) await tx.promotionRedemption.create({ data: { promotionId, userId: clientId, orderId: created.id, discountAmount: discount } });

      if (dto.paymentMethod === PaymentProvider.WALLET) {
        const clientWallet = await this.ledger.userWallet('CLIENT', clientId, tx);
        const platform = await this.ledger.systemWallet('PLATFORM_REVENUE', tx);
        const payment = await tx.payment.create({
          data: { orderId: created.id, userId: clientId, purpose: PaymentPurpose.ORDER, provider: PaymentProvider.WALLET, amount: totalAmount, status: PaymentStatus.SUCCEEDED, confirmedAt: new Date() },
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
        await this.orders.createManualPayment(tx, clientId, created.id, totalAmount, dto.mobileMoney);
        paymentPending = true;
      }
      return { order: created, paymentPending };
    });

    if (paymentPending) await this.orders.announceManualPayment(order.reference, order.cityId);
    await this.lifecycle.announce(order, { notifyClient: false });
    if (order.status === OrderStatus.CREATED) await this.notifyMerchantNewOrder(order.id);
    return this.orders.getForClient(clientId, order.id);
  }

  /** Alerte les membres du commerce (temps réel + notification push) qu'une commande attend leur réponse. */
  async notifyMerchantNewOrder(orderId: string) {
    const order = await this.prisma.order.findUnique({ where: { id: orderId }, include: { merchant: { include: { members: true } } } });
    if (!order?.merchant) return;
    this.realtime.toMerchant(order.merchant.id, 'merchant.order', { id: order.id, reference: order.reference, status: order.status, merchantStatus: order.merchantStatus, isNew: true });
    await this.notifications.notify(
      order.merchant.members.map((m) => m.userId),
      { type: 'NEW_OFFER', title: 'Nouvelle commande 🛎️', body: `${order.reference} — ${order.itemsSubtotal} FCFA d’articles. Acceptez-la vite !`, url: '/commercant', data: { orderId } },
    );
  }

  // ------------------------------------------------------------------ côté commerçant

  private async merchantOrder(userId: string, merchantId: string, orderId: string) {
    await this.merchants.assertMember(userId, merchantId);
    const order = await this.prisma.order.findFirst({ where: { id: orderId, merchantId } });
    if (!order) throw new NotFoundException('Commande introuvable.');
    return order;
  }

  async listForMerchant(userId: string, merchantId: string, query: MerchantOrdersQueryDto) {
    await this.merchants.assertMember(userId, merchantId);
    const where: Prisma.OrderWhereInput = { merchantId, ...(query.view ? MERCHANT_VIEWS[query.view] : { status: { not: OrderStatus.PENDING_PAYMENT } }) };
    const [items, total] = await this.prisma.$transaction([
      this.prisma.order.findMany({
        where,
        orderBy: { createdAt: query.view === 'DONE' ? 'desc' : 'asc' },
        ...paginate(query),
        include: {
          items: true,
          client: { select: { firstName: true } },
          driver: { select: { firstName: true, lastName: true, phone: true } },
        },
      }),
      this.prisma.order.count({ where }),
    ]);
    return {
      items: items.map((o) => ({
        id: o.id,
        reference: o.reference,
        status: o.status,
        statusLabel: STATUS_LABELS[o.status],
        merchantStatus: o.merchantStatus,
        prepMinutes: o.prepMinutes,
        merchantAcceptedAt: o.merchantAcceptedAt,
        readyAt: o.readyAt,
        createdAt: o.createdAt,
        note: o.note,
        itemsSubtotal: o.itemsSubtotal,
        merchantCommissionAmount: o.merchantCommissionAmount,
        merchantEarning: o.itemsSubtotal - o.merchantCommissionAmount,
        paymentMethod: o.paymentMethod,
        items: o.items.map((i) => ({ label: i.label, quantity: i.quantity, unitPrice: i.unitPrice, options: i.options, note: i.note })),
        clientFirstName: o.client.firstName,
        driver: o.driver,
      })),
      total,
      page: query.page,
      pageSize: query.pageSize,
    };
  }

  /** Le commerçant accepte : la préparation commence, le livreur sera cherché pour arriver à temps. */
  async accept(userId: string, merchantId: string, orderId: string, prepMinutes: number) {
    await this.merchantOrder(userId, merchantId, orderId);
    const lead = await this.settings.get('merchants.driverLeadMinutes');
    const now = Date.now();
    const dispatchAfter = new Date(now + Math.max(0, prepMinutes - lead) * 60_000);
    const order = await this.prisma.$transaction(async (tx) => {
      const claimed = await tx.order.updateMany({
        where: { id: orderId, status: OrderStatus.CREATED, merchantStatus: MerchantOrderStatus.PENDING },
        data: { merchantStatus: MerchantOrderStatus.ACCEPTED, merchantAcceptedAt: new Date(now), prepMinutes, dispatchAfter },
      });
      if (!claimed.count) throw new BadRequestException('Cette commande n’attend plus de réponse.');
      const updated = await this.lifecycle.transition(tx, orderId, [OrderStatus.CREATED], OrderStatus.SEARCHING_DRIVER, { id: userId, role: 'STAFF' }, {
        note: `Acceptée par le commerçant — préparation ${prepMinutes} min`,
      });
      if (!updated) throw new BadRequestException('Cette commande n’attend plus de réponse.');
      return updated;
    });
    await this.lifecycle.announce(order);
    if (dispatchAfter.getTime() <= Date.now()) await this.dispatch.trigger(orderId);
    return { id: order.id, merchantStatus: order.merchantStatus, dispatchAfter };
  }

  async reject(userId: string, merchantId: string, orderId: string, reason: string) {
    const order = await this.merchantOrder(userId, merchantId, orderId);
    if (order.merchantStatus !== MerchantOrderStatus.PENDING) throw new BadRequestException('Commande déjà acceptée : contactez l’équipe Allô-Coursier pour l’annuler.');
    const cancelled = await this.orders.cancel(orderId, [OrderStatus.CREATED, OrderStatus.PENDING_PAYMENT], { id: userId, role: 'STAFF' }, `Refusée par le commerçant : ${reason}`);
    await this.prisma.order.update({ where: { id: orderId }, data: { merchantStatus: MerchantOrderStatus.REJECTED } });
    return cancelled;
  }

  /** Commande prête : le livreur peut la récupérer ; s'il n'est pas encore cherché, on le cherche maintenant. */
  async ready(userId: string, merchantId: string, orderId: string) {
    await this.merchantOrder(userId, merchantId, orderId);
    const updated = await this.prisma.order.updateMany({
      where: { id: orderId, merchantStatus: MerchantOrderStatus.ACCEPTED },
      data: { merchantStatus: MerchantOrderStatus.READY, readyAt: new Date() },
    });
    if (!updated.count) throw new BadRequestException('La commande doit d’abord être acceptée.');
    await this.prisma.order.updateMany({ where: { id: orderId, dispatchAfter: { gt: new Date() } }, data: { dispatchAfter: new Date() } });
    const order = await this.prisma.order.findUniqueOrThrow({ where: { id: orderId } });
    await this.lifecycle.announce(order, {
      notifyClient: false,
      notifyDriver: { title: 'Commande prête 🛍️', body: `${order.reference} vous attend chez le commerçant.` },
    });
    if (order.status === OrderStatus.SEARCHING_DRIVER) await this.dispatch.trigger(orderId);
    return { id: order.id, merchantStatus: order.merchantStatus };
  }

  async orderDetail(userId: string, merchantId: string, orderId: string) {
    await this.merchantOrder(userId, merchantId, orderId);
    const order = await this.prisma.order.findUniqueOrThrow({ where: { id: orderId }, include: orderDetailInclude });
    const view = adminView(order, (k) => this.storage.signedUrl(k));
    // Le commerçant ne voit ni le code de livraison ni les coordonnées complètes du client.
    return {
      ...view,
      deliveryCode: undefined,
      trackingToken: undefined,
      client: { firstName: order.client.firstName },
      stops: view.stops.map((s) => (s.kind === 'DROPOFF' ? { ...s, contactPhone: undefined, lat: undefined, lng: undefined } : s)),
      commissionAmount: undefined,
      driverEarning: undefined,
    };
  }

  async stats(userId: string, merchantId: string) {
    await this.merchants.assertMember(userId, merchantId);
    const startOfDay = new Date();
    startOfDay.setUTCHours(0, 0, 0, 0);
    const since = (days: number) => new Date(startOfDay.getTime() - days * 86400_000);
    const sold = [OrderStatus.DELIVERED, OrderStatus.COMPLETED];
    const agg = async (from: Date) => {
      const r = await this.prisma.order.aggregate({
        where: { merchantId, status: { in: sold }, deliveredAt: { gte: from } },
        _sum: { itemsSubtotal: true, merchantEarning: true },
        _count: true,
      });
      return { orders: r._count, sales: r._sum.itemsSubtotal ?? 0, earnings: r._sum.merchantEarning ?? 0 };
    };
    const [today, week, month, cancelled, top] = await Promise.all([
      agg(startOfDay),
      agg(since(6)),
      agg(since(29)),
      this.prisma.order.count({ where: { merchantId, status: OrderStatus.CANCELLED, createdAt: { gte: since(29) } } }),
      this.prisma.orderItem.groupBy({
        by: ['label'],
        where: { order: { merchantId, status: { in: sold }, deliveredAt: { gte: since(29) } } },
        _sum: { quantity: true },
        orderBy: { _sum: { quantity: 'desc' } },
        take: 5,
      }),
    ]);
    const wallet = await this.ledger.merchantWallet(merchantId);
    return {
      today,
      week,
      month,
      cancelledLast30Days: cancelled,
      topProducts: top.map((t) => ({ label: t.label, quantity: t._sum.quantity ?? 0 })),
      balance: wallet.balance,
    };
  }

  async wallet(userId: string, merchantId: string) {
    await this.merchants.assertMember(userId, merchantId, true);
    const wallet = await this.ledger.merchantWallet(merchantId);
    const [entries, payouts] = await Promise.all([
      this.ledger.entries(wallet.id, 50),
      this.prisma.payoutRequest.findMany({ where: { walletId: wallet.id }, orderBy: { createdAt: 'desc' }, take: 20 }),
    ]);
    return { id: wallet.id, balance: wallet.balance, entries: entries.items, payouts };
  }

  async requestPayout(userId: string, merchantId: string, dto: MerchantPayoutDto) {
    const member = await this.merchants.assertMember(userId, merchantId, true);
    if (member.role !== MerchantMemberRole.OWNER) throw new ForbiddenException('Seul le propriétaire peut demander un reversement.');
    const phone = normalizeBurkinaPhone(dto.destinationPhone);
    if (!phone) throw new BadRequestException('Numéro Mobile Money invalide.');
    const wallet = await this.ledger.merchantWallet(merchantId);
    if (dto.amount > wallet.balance) throw new BadRequestException(`Solde disponible : ${Math.max(0, wallet.balance)} FCFA.`);
    const pending = await this.prisma.payoutRequest.count({ where: { walletId: wallet.id, status: { in: [PayoutStatus.PENDING, PayoutStatus.APPROVED] } } });
    if (pending) throw new BadRequestException('Une demande de reversement est déjà en cours.');
    const payout = await this.prisma.payoutRequest.create({ data: { walletId: wallet.id, amount: dto.amount, method: 'MOBILE_MONEY', destinationPhone: phone } });
    await this.notifications.notifyStaff(PERMISSIONS.WALLETS_MANAGE.code, {
      type: 'ADMIN_ALERT',
      title: 'Reversement commerçant demandé',
      body: `${dto.amount} FCFA à envoyer au ${phone}.`,
      url: '/admin/finances',
    });
    return payout;
  }

  // ------------------------------------------------------------------ tâche automatique

  /** Annule les commandes que le commerçant n'a pas acceptées à temps (le client est remboursé). */
  async cancelUnansweredOrders() {
    const minutes = await this.settings.get('merchants.acceptTimeoutMinutes');
    const stale = await this.prisma.order.findMany({
      where: { status: OrderStatus.CREATED, merchantStatus: MerchantOrderStatus.PENDING, updatedAt: { lt: new Date(Date.now() - minutes * 60_000) } },
      select: { id: true },
    });
    for (const { id } of stale) {
      const cancelled = await this.orders.cancel(id, [OrderStatus.CREATED], SYSTEM_ACTOR as { id: null; role: 'SYSTEM' }, 'Le commerce n’a pas répondu à temps').catch(() => null);
      if (cancelled) await this.prisma.order.updateMany({ where: { id, merchantStatus: MerchantOrderStatus.PENDING }, data: { merchantStatus: MerchantOrderStatus.REJECTED } });
    }
    return stale.length;
  }
}
