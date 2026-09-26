import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { DriverStatus, OfferStatus, OrderStatus, Prisma, StopKind, UserStatus, WalletKind } from '@prisma/client';
import { PERMISSIONS } from '../../common/permissions';
import { haversineKm } from '../../common/utils/geo';
import { PrismaService } from '../../prisma/prisma.service';
import { RealtimeService } from '../../realtime/realtime.service';
import { NotificationsService } from '../notifications/notifications.service';
import { SettingsService } from '../settings/settings.service';
import { Actor, OrderLifecycleService, SYSTEM_ACTOR } from './order-lifecycle.service';
import { ACTIVE_DRIVER_STATUSES, STATUS_LABELS } from './order-status';
import { amountToCollectAt } from './order-views';

type Tx = Prisma.TransactionClient;

export interface DriverCandidate {
  userId: string;
  lastLat: number;
  lastLng: number;
  ratingAvg: number;
  ratingCount: number;
  balance: number;
  cashDebtLimit: number;
}

/**
 * Choisit le livreur à solliciter : le plus proche dans le rayon de recherche, puis dans 2× et 3× le rayon.
 * À distance égale (à 300 m près), le mieux noté. Les livreurs dont la dette espèces dépasse le plafond sont exclus.
 */
export function pickCandidate(
  candidates: DriverCandidate[],
  pickup: { lat: number; lng: number },
  radiusKm: number,
): { candidate: DriverCandidate; distanceKm: number } | null {
  const eligible = candidates
    .filter((c) => -c.balance <= c.cashDebtLimit)
    .map((c) => ({ candidate: c, distanceKm: haversineKm(pickup, { lat: c.lastLat, lng: c.lastLng }) }));
  for (const factor of [1, 2, 3]) {
    const inRange = eligible
      .filter((e) => e.distanceKm <= radiusKm * factor)
      .sort((a, b) => {
        const d = a.distanceKm - b.distanceKm;
        if (Math.abs(d) > 0.3) return d;
        const rating = (x: DriverCandidate) => (x.ratingCount > 0 ? x.ratingAvg : 4);
        return rating(b.candidate) - rating(a.candidate) || d;
      });
    if (inRange.length) return inRange[0];
  }
  return null;
}

@Injectable()
export class DispatchService {
  private readonly logger = new Logger(DispatchService.name);

  constructor(
    private prisma: PrismaService,
    private settings: SettingsService,
    private lifecycle: OrderLifecycleService,
    private realtime: RealtimeService,
    private notifications: NotificationsService,
  ) {}

  /** Lance (ou relance) la recherche d'un livreur pour une commande. Sans effet si une offre est en cours. */
  async trigger(orderId: string): Promise<'OFFERED' | 'NO_DRIVER' | 'SKIPPED'> {
    try {
      return await this.dispatchOnce(orderId);
    } catch (err) {
      this.logger.error(`Échec de l'attribution de la commande ${orderId}`, err as Error);
      return 'SKIPPED';
    }
  }

  private async dispatchOnce(orderId: string): Promise<'OFFERED' | 'NO_DRIVER' | 'SKIPPED'> {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: { stops: { orderBy: { sequence: 'asc' } }, offers: { select: { driverId: true, status: true } } },
    });
    if (!order || order.status !== OrderStatus.SEARCHING_DRIVER) return 'SKIPPED';
    // Repas en préparation : le livreur est cherché pour arriver quand la commande sera prête.
    if (order.dispatchAfter && order.dispatchAfter > new Date()) return 'SKIPPED';
    if (order.offers.some((o) => o.status === OfferStatus.OFFERED)) return 'SKIPPED';
    const maxAttempts = await this.settings.get('dispatch.maxAttempts');
    if (order.dispatchAttempts >= maxAttempts) return 'SKIPPED';

    const pickup = order.stops.find((s) => s.kind === StopKind.PICKUP)!;
    const locationMaxAge = await this.settings.get('dispatch.locationMaxAgeMinutes');
    const alreadyAsked = order.offers.map((o) => o.driverId);
    const drivers = await this.prisma.driverProfile.findMany({
      where: {
        status: DriverStatus.APPROVED,
        isOnline: true,
        cityId: order.cityId,
        vehicleType: order.vehicleType,
        lastLat: { not: null },
        lastLng: { not: null },
        lastLocationAt: { gte: new Date(Date.now() - locationMaxAge * 60_000) },
        userId: { notIn: alreadyAsked },
        user: { status: UserStatus.ACTIVE, driverOrders: { none: { status: { in: ACTIVE_DRIVER_STATUSES } } } },
        offers: { none: { status: OfferStatus.OFFERED } },
      },
      select: { userId: true, lastLat: true, lastLng: true, ratingAvg: true, ratingCount: true, cashDebtLimit: true },
    });
    const wallets = await this.prisma.wallet.findMany({
      where: { kind: WalletKind.DRIVER, userId: { in: drivers.map((d) => d.userId) } },
      select: { userId: true, balance: true },
    });
    const defaultLimit = await this.settings.get('drivers.defaultCashDebtLimit');
    const candidates: DriverCandidate[] = drivers.map((d) => ({
      userId: d.userId,
      lastLat: d.lastLat!,
      lastLng: d.lastLng!,
      ratingAvg: d.ratingAvg,
      ratingCount: d.ratingCount,
      balance: wallets.find((w) => w.userId === d.userId)?.balance ?? 0,
      cashDebtLimit: d.cashDebtLimit ?? defaultLimit,
    }));
    const radius = await this.settings.get('dispatch.searchRadiusKm');
    const choice = pickCandidate(candidates, pickup, radius);

    if (!choice) {
      await this.prisma.order.update({ where: { id: orderId }, data: { lastDispatchAt: new Date() } });
      return 'NO_DRIVER';
    }

    const timeout = await this.settings.get('dispatch.offerTimeoutSeconds');
    const offer = await this.prisma.$transaction(async (tx) => {
      // Protection contre deux attributions simultanées de la même commande.
      const locked = await tx.order.updateMany({
        where: { id: orderId, status: OrderStatus.SEARCHING_DRIVER, dispatchAttempts: order.dispatchAttempts },
        data: { dispatchAttempts: { increment: 1 }, lastDispatchAt: new Date() },
      });
      if (locked.count === 0) return null;
      return tx.dispatchOffer.create({
        data: {
          orderId,
          driverId: choice.candidate.userId,
          attempt: order.dispatchAttempts + 1,
          distanceMeters: Math.round(choice.distanceKm * 1000),
          expiresAt: new Date(Date.now() + timeout * 1000),
        },
      });
    });
    if (!offer) return 'SKIPPED';

    const dropoff = order.stops.find((s) => s.kind === StopKind.DROPOFF)!;
    const payload = {
      offerId: offer.id,
      orderId,
      reference: order.reference,
      serviceType: order.serviceType,
      speed: order.speed,
      expiresAt: offer.expiresAt,
      distanceToPickupKm: Math.round(choice.distanceKm * 10) / 10,
      tripDistanceKm: Math.round(order.distanceMeters / 100) / 10,
      pickup: { landmark: pickup.landmark, lat: pickup.lat, lng: pickup.lng },
      dropoff: { landmark: dropoff.landmark, lat: dropoff.lat, lng: dropoff.lng },
      driverEarning: order.driverEarning,
      amountToCollect: amountToCollectAt(order, StopKind.PICKUP) + amountToCollectAt(order, StopKind.DROPOFF),
      purchaseBudget: order.purchaseBudget,
    };
    this.realtime.toUser(choice.candidate.userId, 'offer.new', payload);
    await this.notifications.notify(choice.candidate.userId, {
      type: 'NEW_OFFER',
      title: 'Nouvelle mission 🛵',
      body: `${payload.distanceToPickupKm} km du ramassage — ${pickup.landmark}. Répondez vite !`,
      url: '/livreur',
      data: { offerId: offer.id, orderId },
    });
    return 'OFFERED';
  }

  // ------------------------------------------------------------------ réponses du livreur

  async listOffers(driverId: string) {
    const offers = await this.prisma.dispatchOffer.findMany({
      where: { driverId, status: OfferStatus.OFFERED, expiresAt: { gt: new Date() } },
      include: { order: { include: { stops: { orderBy: { sequence: 'asc' } } } } },
    });
    return offers.map((o) => ({
      offerId: o.id,
      orderId: o.orderId,
      reference: o.order.reference,
      serviceType: o.order.serviceType,
      speed: o.order.speed,
      expiresAt: o.expiresAt,
      distanceToPickupKm: Math.round((o.distanceMeters ?? 0) / 100) / 10,
      tripDistanceKm: Math.round(o.order.distanceMeters / 100) / 10,
      pickup: { landmark: o.order.stops[0].landmark, lat: o.order.stops[0].lat, lng: o.order.stops[0].lng },
      dropoff: { landmark: o.order.stops[1].landmark, lat: o.order.stops[1].lat, lng: o.order.stops[1].lng },
      driverEarning: o.order.driverEarning,
      amountToCollect: amountToCollectAt(o.order, StopKind.PICKUP) + amountToCollectAt(o.order, StopKind.DROPOFF),
      purchaseBudget: o.order.purchaseBudget,
    }));
  }

  async accept(driverId: string, offerId: string) {
    const order = await this.prisma.$transaction(async (tx) => {
      const offer = await tx.dispatchOffer.findFirst({ where: { id: offerId, driverId } });
      if (!offer) throw new NotFoundException('Offre introuvable.');
      if (offer.status !== OfferStatus.OFFERED) throw new BadRequestException('Cette offre n’est plus disponible.');
      if (offer.expiresAt < new Date()) {
        await tx.dispatchOffer.update({ where: { id: offerId }, data: { status: OfferStatus.EXPIRED } });
        throw new BadRequestException('Délai dépassé : l’offre a expiré.');
      }
      const busy = await tx.order.count({ where: { driverId, status: { in: ACTIVE_DRIVER_STATUSES } } });
      if (busy > 0) throw new BadRequestException('Terminez votre mission en cours avant d’en accepter une autre.');

      const taken = await tx.dispatchOffer.updateMany({
        where: { id: offerId, status: OfferStatus.OFFERED },
        data: { status: OfferStatus.ACCEPTED, respondedAt: new Date() },
      });
      if (taken.count === 0) throw new BadRequestException('Cette offre n’est plus disponible.');
      const updated = await this.assignInTx(tx, offer.orderId, driverId, [OrderStatus.SEARCHING_DRIVER], { id: driverId, role: 'DRIVER' });
      if (!updated) throw new BadRequestException('Cette commande n’est plus disponible.');
      return updated;
    });
    await this.lifecycle.announce(order);
    return order;
  }

  async reject(driverId: string, offerId: string, reason?: string) {
    const updated = await this.prisma.dispatchOffer.updateMany({
      where: { id: offerId, driverId, status: OfferStatus.OFFERED },
      data: { status: OfferStatus.REJECTED, respondedAt: new Date(), rejectReason: reason },
    });
    if (updated.count === 0) throw new BadRequestException('Cette offre n’est plus disponible.');
    const offer = await this.prisma.dispatchOffer.findUniqueOrThrow({ where: { id: offerId } });
    await this.trigger(offer.orderId);
    return { success: true };
  }

  /** Expire les offres sans réponse et relance la recherche pour les commandes concernées. */
  async expireDueOffers(): Promise<number> {
    const due = await this.prisma.dispatchOffer.findMany({
      where: { status: OfferStatus.OFFERED, expiresAt: { lt: new Date() } },
      select: { id: true, orderId: true, driverId: true },
    });
    for (const offer of due) {
      const updated = await this.prisma.dispatchOffer.updateMany({
        where: { id: offer.id, status: OfferStatus.OFFERED },
        data: { status: OfferStatus.EXPIRED },
      });
      if (updated.count === 0) continue;
      this.realtime.toUser(offer.driverId, 'offer.closed', { orderId: offer.orderId, reason: 'EXPIRED' });
      await this.trigger(offer.orderId);
    }
    return due.length;
  }

  // ------------------------------------------------------------------ administration

  /** Affectation ou réaffectation manuelle par l'équipe. */
  async adminAssign(orderId: string, driverId: string, actorId: string) {
    const driver = await this.prisma.driverProfile.findUnique({ where: { userId: driverId }, include: { user: true } });
    if (!driver || driver.status !== DriverStatus.APPROVED || driver.user.status !== UserStatus.ACTIVE) {
      throw new BadRequestException('Ce livreur n’est pas validé ou est suspendu.');
    }
    const before = await this.prisma.order.findUnique({ where: { id: orderId } });
    if (!before) throw new NotFoundException('Commande introuvable.');
    if (before.cityId !== driver.cityId) throw new BadRequestException('Ce livreur travaille dans une autre ville.');
    if (before.driverId === driverId) throw new BadRequestException('Ce livreur est déjà affecté à la commande.');
    const busy = await this.prisma.order.count({ where: { driverId, status: { in: ACTIVE_DRIVER_STATUSES } } });
    if (busy > 0) throw new BadRequestException('Ce livreur a déjà une mission en cours.');

    let closed: string[] = [];
    const order = await this.prisma.$transaction(async (tx) => {
      closed = await this.lifecycle.closeOpenOffers(tx, orderId);
      const updated = await this.assignInTx(
        tx,
        orderId,
        driverId,
        [OrderStatus.SEARCHING_DRIVER, OrderStatus.SCHEDULED, OrderStatus.DRIVER_ASSIGNED, OrderStatus.DRIVER_AT_PICKUP],
        { id: actorId, role: 'STAFF' },
        'Affectation manuelle',
      );
      if (!updated) throw new BadRequestException(`Affectation impossible : la commande est « ${STATUS_LABELS[before.status]} ».`);
      return updated;
    });
    this.lifecycle.notifyOffersClosed(orderId, closed);
    if (before.driverId) {
      await this.notifications.notify(before.driverId, {
        type: 'ORDER_STATUS',
        title: 'Mission retirée',
        body: `La commande ${before.reference} a été confiée à un autre livreur.`,
        url: '/livreur',
      });
      this.realtime.toUser(before.driverId, 'order.updated', { id: orderId, status: 'REASSIGNED' });
    }
    await this.lifecycle.announce(order, {
      notifyDriver: { title: 'Nouvelle mission attribuée 🛵', body: `L’équipe vous a confié la commande ${order.reference}.` },
    });
    return order;
  }

  /** Retire le livreur et relance la recherche (livreur injoignable, panne...). */
  async redispatch(orderId: string, actor: Actor, note = 'Nouvelle recherche de livreur') {
    let previousDriver: string | null = null;
    const order = await this.prisma.$transaction(async (tx) => {
      const current = await tx.order.findUnique({ where: { id: orderId } });
      if (!current) throw new NotFoundException('Commande introuvable.');
      previousDriver = current.driverId;
      await this.lifecycle.closeOpenOffers(tx, orderId);
      const allowed: OrderStatus[] = [OrderStatus.SEARCHING_DRIVER, OrderStatus.DRIVER_ASSIGNED, OrderStatus.DRIVER_AT_PICKUP];
      if (!allowed.includes(current.status)) {
        throw new BadRequestException(`Relance impossible : la commande est « ${STATUS_LABELS[current.status]} ».`);
      }
      if (current.status === OrderStatus.SEARCHING_DRIVER) {
        return tx.order.update({ where: { id: orderId }, data: { dispatchAttempts: 0, dispatchAlertedAt: null, lastDispatchAt: null } });
      }
      const updated = await this.lifecycle.transition(tx, orderId, allowed, OrderStatus.SEARCHING_DRIVER, actor, {
        note,
        data: { driver: { disconnect: true }, dispatchAttempts: 0, dispatchAlertedAt: null, lastDispatchAt: null, acceptedAt: null },
      });
      if (!updated) throw new BadRequestException('Relance impossible.');
      return updated;
    });
    if (previousDriver) {
      this.realtime.toUser(previousDriver, 'order.updated', { id: orderId, status: 'REASSIGNED' });
      await this.notifications.notify(previousDriver, {
        type: 'ORDER_STATUS',
        title: 'Mission retirée',
        body: `La commande ${order.reference} vous a été retirée.`,
        url: '/livreur',
      });
    }
    await this.lifecycle.announce(order);
    await this.trigger(orderId);
    return order;
  }

  /** Alerte l'équipe pour les commandes sans livreur depuis trop longtemps (une seule fois par recherche). */
  async alertStuckOrders() {
    const minutes = await this.settings.get('dispatch.alertAfterMinutes');
    const maxAttempts = await this.settings.get('dispatch.maxAttempts');
    const since = new Date(Date.now() - minutes * 60_000);
    const stuck = await this.prisma.order.findMany({
      where: {
        status: OrderStatus.SEARCHING_DRIVER,
        dispatchAlertedAt: null,
        OR: [{ dispatchAttempts: { gte: maxAttempts } }, { statusHistory: { some: { toStatus: OrderStatus.SEARCHING_DRIVER, createdAt: { lt: since } } } }],
      },
      select: { id: true, reference: true, cityId: true },
    });
    for (const order of stuck) {
      await this.prisma.order.update({ where: { id: order.id }, data: { dispatchAlertedAt: new Date() } });
      await this.notifications.notifyStaff(
        PERMISSIONS.ORDERS_ASSIGN.code,
        {
          type: 'ADMIN_ALERT',
          title: 'Commande sans livreur',
          body: `${order.reference} : aucun livreur n’a accepté. Affectez-la manuellement.`,
          url: `/admin/commandes/${order.id}`,
        },
        order.cityId,
      );
    }
    return stuck.length;
  }

  private async assignInTx(tx: Tx, orderId: string, driverId: string, from: OrderStatus[], actor: Actor, note?: string) {
    const driver = await tx.driverProfile.findUniqueOrThrow({ where: { userId: driverId } });
    const order = await tx.order.findUniqueOrThrow({ where: { id: orderId } });
    const breakdown = order.priceBreakdown as { commissionPercent?: number };
    const percent = driver.commissionPercent ?? breakdown.commissionPercent ?? 0;
    // Estimation affichée au livreur ; le montant définitif est calculé à la livraison.
    const driverEarning = driver.employmentType === 'SALARIE' ? 0 : order.deliveryFee - Math.round((order.deliveryFee * percent) / 100);
    const updated = await this.lifecycle.transition(tx, orderId, from, OrderStatus.DRIVER_ASSIGNED, actor, {
      note,
      data: {
        driver: { connect: { id: driverId } },
        driverEarning,
        commissionAmount: order.deliveryFee - order.discountAmount - driverEarning,
      },
    });
    if (!updated) return null;
    await this.ensureConversation(tx, orderId, order.clientId, driverId);
    return updated;
  }

  private async ensureConversation(tx: Tx, orderId: string, clientId: string, driverId: string) {
    let conversation = await tx.conversation.findFirst({ where: { orderId, type: 'ORDER' } });
    if (!conversation) conversation = await tx.conversation.create({ data: { orderId, type: 'ORDER' } });
    await tx.conversationParticipant.upsert({
      where: { conversationId_userId: { conversationId: conversation.id, userId: clientId } },
      create: { conversationId: conversation.id, userId: clientId, role: 'CLIENT' },
      update: {},
    });
    await tx.conversationParticipant.upsert({
      where: { conversationId_userId: { conversationId: conversation.id, userId: driverId } },
      create: { conversationId: conversation.id, userId: driverId, role: 'DRIVER' },
      update: {},
    });
  }

  /** Passe en recherche de livreur les livraisons programmées arrivées à échéance. */
  async releaseScheduledOrders() {
    const lead = await this.settings.get('orders.scheduleLeadMinutes');
    const due = await this.prisma.order.findMany({
      where: { status: OrderStatus.SCHEDULED, scheduledAt: { lte: new Date(Date.now() + lead * 60_000) } },
      select: { id: true },
    });
    for (const { id } of due) {
      const order = await this.prisma.$transaction((tx) =>
        this.lifecycle.transition(tx, id, [OrderStatus.SCHEDULED], OrderStatus.SEARCHING_DRIVER, SYSTEM_ACTOR, {
          note: 'Heure de la livraison programmée',
        }),
      );
      if (order) {
        await this.lifecycle.announce(order);
        await this.trigger(id);
      }
    }
    return due.length;
  }
}
