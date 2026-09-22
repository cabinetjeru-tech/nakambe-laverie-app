import { Injectable, Logger } from '@nestjs/common';
import {
  LedgerTransactionType,
  Order,
  OrderStatus,
  PaymentProvider,
  PaymentStatus,
  Prisma,
} from '@prisma/client';
import { PERMISSIONS } from '../../common/permissions';
import { PrismaService } from '../../prisma/prisma.service';
import { RealtimeService } from '../../realtime/realtime.service';
import { NotificationsService } from '../notifications/notifications.service';
import { SettingsService } from '../settings/settings.service';
import { LedgerService } from '../wallet/ledger.service';
import { STATUS_LABELS } from './order-status';

type Tx = Prisma.TransactionClient;

export interface Actor {
  id: string | null; // null = système
  role: 'CLIENT' | 'DRIVER' | 'STAFF' | 'SYSTEM';
}

export const SYSTEM_ACTOR: Actor = { id: null, role: 'SYSTEM' };

export interface TransitionOptions {
  note?: string;
  lat?: number;
  lng?: number;
  at?: Date;
  data?: Prisma.OrderUpdateInput;
}

/** Messages envoyés au client à chaque étape importante. */
const CLIENT_MESSAGES: Partial<Record<OrderStatus, (o: Order) => { title: string; body: string }>> = {
  SEARCHING_DRIVER: (o) => ({ title: 'Recherche d’un livreur', body: `Commande ${o.reference} : nous cherchons un livreur disponible.` }),
  DRIVER_ASSIGNED: (o) => ({ title: 'Livreur trouvé 🛵', body: `Un livreur a accepté la commande ${o.reference} et se rend au ramassage.` }),
  DRIVER_AT_PICKUP: (o) => ({ title: 'Livreur au ramassage', body: `Le livreur est arrivé au point de ramassage (${o.reference}).` }),
  IN_TRANSIT: (o) => ({ title: 'En route 🚀', body: `Commande ${o.reference} récupérée, en route vers la livraison.` }),
  ARRIVED_AT_DROPOFF: (o) => ({ title: 'Livreur arrivé', body: `Le livreur est arrivé à destination (${o.reference}).` }),
  DELIVERED: (o) => ({ title: 'Livrée ✅', body: `Commande ${o.reference} livrée. Merci d’avoir choisi Allô-Coursier !` }),
  FAILED: (o) => ({ title: 'Livraison impossible', body: `La livraison ${o.reference} n’a pas pu être effectuée. Le service client vous contacte.` }),
  RETURNED: (o) => ({ title: 'Colis retourné', body: `Le colis de la commande ${o.reference} a été rapporté au point de ramassage.` }),
};

@Injectable()
export class OrderLifecycleService {
  private readonly logger = new Logger(OrderLifecycleService.name);

  constructor(
    private prisma: PrismaService,
    private realtime: RealtimeService,
    private notifications: NotificationsService,
    private ledger: LedgerService,
    private settings: SettingsService,
  ) {}

  /**
   * Change le statut dans une transaction, en vérifiant que la commande est toujours dans l'un des
   * statuts attendus (protection contre deux actions simultanées). Renvoie null si ce n'est plus le cas.
   */
  async transition(
    tx: Tx,
    orderId: string,
    from: OrderStatus[],
    to: OrderStatus,
    actor: Actor,
    opts: TransitionOptions = {},
  ): Promise<Order | null> {
    const at = opts.at ?? new Date();
    const current = await tx.order.findUnique({ where: { id: orderId }, select: { status: true } });
    if (!current || !from.includes(current.status)) return null;
    const updated = await tx.order.updateMany({
      where: { id: orderId, status: current.status },
      data: { status: to, ...this.timestampsFor(to, at) },
    });
    if (updated.count === 0) return null;
    if (opts.data) await tx.order.update({ where: { id: orderId }, data: opts.data });
    await tx.orderStatusHistory.create({
      data: {
        orderId,
        fromStatus: current.status,
        toStatus: to,
        actorId: actor.id,
        actorRole: actor.role,
        lat: opts.lat,
        lng: opts.lng,
        note: opts.note,
        createdAt: at,
      },
    });
    return tx.order.findUniqueOrThrow({ where: { id: orderId } });
  }

  private timestampsFor(status: OrderStatus, at: Date): Prisma.OrderUpdateManyMutationInput {
    switch (status) {
      case OrderStatus.DRIVER_ASSIGNED:
        return { acceptedAt: at };
      case OrderStatus.IN_TRANSIT:
        return { pickedUpAt: at };
      case OrderStatus.DELIVERED:
        return { deliveredAt: at };
      case OrderStatus.COMPLETED:
        return { completedAt: at };
      case OrderStatus.CANCELLED:
        return { cancelledAt: at };
      default:
        return {};
    }
  }

  /** À appeler après la validation de la transaction : temps réel + notifications. */
  async announce(order: Order, opts: { notifyClient?: boolean; notifyDriver?: { title: string; body: string } } = {}) {
    const summary = {
      id: order.id,
      reference: order.reference,
      status: order.status,
      statusLabel: STATUS_LABELS[order.status],
      driverId: order.driverId,
      updatedAt: order.updatedAt,
    };
    this.realtime.toOrder(order.id, 'order.updated', summary);
    this.realtime.toUser(order.clientId, 'order.updated', summary);
    if (order.driverId) this.realtime.toUser(order.driverId, 'order.updated', summary);
    this.realtime.toStaff('order.updated', { ...summary, cityId: order.cityId });

    try {
      const message = CLIENT_MESSAGES[order.status];
      if (opts.notifyClient !== false && message) {
        await this.notifications.notify(order.clientId, {
          type: 'ORDER_STATUS',
          ...message(order),
          url: `/commandes/${order.id}`,
          data: { orderId: order.id, status: order.status },
        });
      }
      if (opts.notifyDriver && order.driverId) {
        await this.notifications.notify(order.driverId, {
          type: 'ORDER_STATUS',
          ...opts.notifyDriver,
          url: `/livreur/missions/${order.id}`,
          data: { orderId: order.id },
        });
      }
      if (order.status === OrderStatus.FAILED) {
        await this.notifications.notifyStaff(
          PERMISSIONS.ORDERS_MANAGE.code,
          { type: 'ADMIN_ALERT', title: 'Échec de livraison', body: `Commande ${order.reference} : livraison impossible.`, url: `/admin/commandes/${order.id}` },
          order.cityId,
        );
      }
    } catch (err) {
      this.logger.error(`Échec de notification pour ${order.reference}`, err as Error);
    }
  }

  /** Statut à atteindre une fois la commande payée (ou payable à la livraison). */
  async readyStatus(order: Pick<Order, 'scheduledAt'>): Promise<OrderStatus> {
    if (!order.scheduledAt) return OrderStatus.SEARCHING_DRIVER;
    const leadMinutes = await this.settings.get('orders.scheduleLeadMinutes');
    return order.scheduledAt.getTime() - leadMinutes * 60_000 > Date.now()
      ? OrderStatus.SCHEDULED
      : OrderStatus.SEARCHING_DRIVER;
  }

  /**
   * Rembourse sur le portefeuille client une commande prépayée non livrée.
   * Le montant revient du compte plateforme, où il avait été placé au paiement.
   */
  async refundIfPrepaid(tx: Tx, order: Order, actorId: string | null) {
    if (order.paymentStatus !== PaymentStatus.SUCCEEDED || order.paymentMethod === PaymentProvider.CASH) return 0;
    const amount = order.totalAmount;
    if (amount <= 0) return 0;
    const platform = await this.ledger.systemWallet('PLATFORM_REVENUE', tx);
    const client = await this.ledger.userWallet('CLIENT', order.clientId, tx);
    await this.ledger.post(
      {
        type: LedgerTransactionType.REFUND,
        description: `Remboursement de la commande ${order.reference}`,
        orderId: order.id,
        createdById: actorId ?? undefined,
        lines: [
          { walletId: platform.id, amount: -amount },
          { walletId: client.id, amount },
        ],
      },
      tx,
    );
    await tx.order.update({ where: { id: order.id }, data: { paymentStatus: PaymentStatus.REFUNDED } });
    return amount;
  }

  /** Annule les offres encore ouvertes et prévient les livreurs concernés (après transaction). */
  async closeOpenOffers(tx: Tx, orderId: string): Promise<string[]> {
    const open = await tx.dispatchOffer.findMany({ where: { orderId, status: 'OFFERED' }, select: { id: true, driverId: true } });
    if (open.length) {
      await tx.dispatchOffer.updateMany({ where: { id: { in: open.map((o) => o.id) } }, data: { status: 'CANCELLED', respondedAt: new Date() } });
    }
    return open.map((o) => o.driverId);
  }

  notifyOffersClosed(orderId: string, driverIds: string[]) {
    for (const driverId of driverIds) this.realtime.toUser(driverId, 'offer.closed', { orderId });
  }
}
