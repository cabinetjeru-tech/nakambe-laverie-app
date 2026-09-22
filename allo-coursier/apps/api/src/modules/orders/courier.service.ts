import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import {
  DocumentType,
  DriverStatus,
  FilePurpose,
  LedgerTransactionType,
  OrderStatus,
  PaymentProvider,
  PaymentPurpose,
  PaymentStatus,
  Prisma,
  ProofType,
  StopKind,
  UserStatus,
} from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { RealtimeService } from '../../realtime/realtime.service';
import { computeQuote } from '../pricing/pricing.engine';
import { toParams } from '../pricing/pricing.service';
import { SettingsService } from '../settings/settings.service';
import { StorageService } from '../storage/storage.service';
import { LedgerService } from '../wallet/ledger.service';
import { computeSettlement } from '../wallet/money-flows';
import { DeliverDto, DriverActionDto, LocationPointDto, OnlineDto, PurchaseDto } from './dto/orders.dto';
import { OrderLifecycleService } from './order-lifecycle.service';
import { ACTIVE_DRIVER_STATUSES, PURCHASE_SERVICES, resolveDriverAction } from './order-status';
import { driverView, orderDetailInclude } from './order-views';

const MAX_CODE_ATTEMPTS = 5;

@Injectable()
export class CourierService {
  constructor(
    private prisma: PrismaService,
    private lifecycle: OrderLifecycleService,
    private realtime: RealtimeService,
    private settings: SettingsService,
    private storage: StorageService,
    private ledger: LedgerService,
  ) {}

  // ------------------------------------------------------------------ profil et disponibilité

  private async approvedDriver(driverId: string) {
    const driver = await this.prisma.driverProfile.findUnique({ where: { userId: driverId }, include: { user: true } });
    if (!driver) throw new ForbiddenException('Ce compte n’est pas un compte livreur.');
    if (driver.status !== DriverStatus.APPROVED || driver.user.status !== UserStatus.ACTIVE) {
      throw new ForbiddenException(
        driver.status === DriverStatus.PENDING
          ? 'Votre inscription est en cours de validation par l’équipe Allô-Coursier.'
          : 'Votre compte livreur n’est pas actif. Contactez l’équipe Allô-Coursier.',
      );
    }
    return driver;
  }

  async profile(driverId: string) {
    const driver = await this.prisma.driverProfile.findUnique({
      where: { userId: driverId },
      include: { city: { select: { id: true, name: true } }, documents: { orderBy: { createdAt: 'desc' } } },
    });
    if (!driver) throw new ForbiddenException('Ce compte n’est pas un compte livreur.');
    const debt = await this.ledger.driverCashDebt(driverId);
    const limit = driver.cashDebtLimit ?? (await this.settings.get('drivers.defaultCashDebtLimit'));
    return {
      ...driver,
      documents: driver.documents.map((d) => ({ ...d, url: this.storage.signedUrl(d.fileKey) })),
      cashDebt: debt,
      cashDebtLimit: limit,
      blockedByDebt: debt > limit,
    };
  }

  async setOnline(driverId: string, dto: OnlineDto) {
    const driver = await this.approvedDriver(driverId);
    if (!dto.online) {
      const active = await this.prisma.order.count({ where: { driverId, status: { in: ACTIVE_DRIVER_STATUSES } } });
      if (active > 0) throw new BadRequestException('Terminez votre mission en cours avant de vous déconnecter.');
    }
    const now = new Date();
    await this.prisma.$transaction(async (tx) => {
      await tx.driverProfile.update({
        where: { userId: driverId },
        data: {
          isOnline: dto.online,
          ...(dto.lat != null && dto.lng != null ? { lastLat: dto.lat, lastLng: dto.lng, lastLocationAt: now } : {}),
        },
      });
      if (dto.online && !driver.isOnline) await tx.driverShift.create({ data: { driverId, startedAt: now } });
      if (!dto.online && driver.isOnline) {
        await tx.driverShift.updateMany({ where: { driverId, endedAt: null }, data: { endedAt: now } });
        // Les offres en attente sont libérées pour d'autres livreurs.
        await tx.dispatchOffer.updateMany({ where: { driverId, status: 'OFFERED' }, data: { status: 'REJECTED', respondedAt: now, rejectReason: 'Hors ligne' } });
      }
    });
    this.realtime.toStaff('driver.location', { driverId, online: dto.online, lat: dto.lat, lng: dto.lng, at: now });
    return { online: dto.online };
  }

  /**
   * Enregistre des positions (une, ou plusieurs accumulées pendant une coupure réseau).
   * Hors mission, seule la dernière position est conservée ; en mission, la trace est gardée
   * pour le suivi et en cas de litige.
   */
  async recordLocations(driverId: string, points: LocationPointDto[]) {
    if (points.length === 0) return { received: 0 };
    const now = new Date();
    const sorted = points
      .map((p) => ({ ...p, recordedAt: p.recordedAt && p.recordedAt <= now ? p.recordedAt : now }))
      .sort((a, b) => a.recordedAt.getTime() - b.recordedAt.getTime());
    const last = sorted[sorted.length - 1];
    const driver = await this.prisma.driverProfile.findUnique({ where: { userId: driverId }, select: { lastLocationAt: true, status: true } });
    if (!driver) throw new ForbiddenException('Ce compte n’est pas un compte livreur.');
    if (!driver.lastLocationAt || last.recordedAt >= driver.lastLocationAt) {
      await this.prisma.driverProfile.update({
        where: { userId: driverId },
        data: { lastLat: last.lat, lastLng: last.lng, lastLocationAt: last.recordedAt },
      });
    }
    const active = await this.prisma.order.findFirst({
      where: { driverId, status: { in: ACTIVE_DRIVER_STATUSES } },
      select: { id: true },
    });
    if (active) {
      await this.prisma.driverLocationLog.createMany({
        data: sorted.map((p) => ({
          driverId,
          orderId: active.id,
          lat: p.lat,
          lng: p.lng,
          speed: p.speed,
          heading: p.heading,
          accuracy: p.accuracy,
          recordedAt: p.recordedAt,
        })),
      });
      this.realtime.toOrder(active.id, 'driver.location', { orderId: active.id, lat: last.lat, lng: last.lng, heading: last.heading, at: last.recordedAt });
    }
    this.realtime.toStaff('driver.location', { driverId, lat: last.lat, lng: last.lng, at: last.recordedAt, orderId: active?.id ?? null });
    return { received: points.length };
  }

  // ------------------------------------------------------------------ missions

  async activeMission(driverId: string) {
    const order = await this.prisma.order.findFirst({
      where: { driverId, status: { in: [...ACTIVE_DRIVER_STATUSES, OrderStatus.FAILED] } },
      orderBy: { acceptedAt: 'desc' },
      include: orderDetailInclude,
    });
    if (!order || (order.status === OrderStatus.FAILED && order.updatedAt < new Date(Date.now() - 24 * 3600_000))) return null;
    return this.withLiveAmounts(driverView(order, (k) => this.storage.signedUrl(k)), order);
  }

  async missionDetail(driverId: string, orderId: string) {
    const order = await this.prisma.order.findFirst({ where: { id: orderId, driverId }, include: orderDetailInclude });
    if (!order) throw new NotFoundException('Mission introuvable.');
    return this.withLiveAmounts(driverView(order, (k) => this.storage.signedUrl(k)), order);
  }

  /** Ajoute le montant d'attente en cours (espèces à la livraison) pour que le livreur sache quoi encaisser. */
  private async withLiveAmounts<T extends { stops: { kind: StopKind; amountToCollect: number }[] }>(view: T, order: { status: OrderStatus; paymentMethod: PaymentProvider; cashCollectAt: StopKind | null; id: string }) {
    if (order.status !== OrderStatus.ARRIVED_AT_DROPOFF || order.paymentMethod !== PaymentProvider.CASH || order.cashCollectAt !== StopKind.DROPOFF) {
      return view;
    }
    const waitingFee = await this.computeWaitingFee(order.id, new Date());
    return {
      ...view,
      liveWaitingFee: waitingFee,
      stops: view.stops.map((s) => (s.kind === StopKind.DROPOFF ? { ...s, amountToCollect: s.amountToCollect + waitingFee } : s)),
    };
  }

  async history(driverId: string, page = 1, pageSize = 20) {
    const where: Prisma.OrderWhereInput = { driverId, status: { in: [OrderStatus.DELIVERED, OrderStatus.COMPLETED, OrderStatus.FAILED, OrderStatus.RETURNED, OrderStatus.CANCELLED] } };
    const [items, total] = await this.prisma.$transaction([
      this.prisma.order.findMany({
        where,
        orderBy: { updatedAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
        select: { id: true, reference: true, status: true, serviceType: true, driverEarning: true, deliveredAt: true, updatedAt: true, stops: { select: { kind: true, landmark: true }, orderBy: { sequence: 'asc' } } },
      }),
      this.prisma.order.count({ where }),
    ]);
    return { items, total, page, pageSize };
  }

  async act(driverId: string, orderId: string, dto: DriverActionDto) {
    await this.approvedDriver(driverId);
    const current = await this.prisma.order.findFirst({ where: { id: orderId, driverId }, include: { stops: true } });
    if (!current) throw new NotFoundException('Mission introuvable.');
    const result = resolveDriverAction(dto.action, current.status, current.serviceType);
    if ('error' in result) throw new BadRequestException(result.error);
    if (dto.action === 'FAIL' && !dto.note?.trim()) throw new BadRequestException('Expliquez la raison de l’échec.');
    if (dto.action === 'PICKED_UP' && current.serviceType === 'FOOD' && current.merchantStatus !== 'READY') {
      throw new BadRequestException('Le commerçant n’a pas encore indiqué que la commande est prête.');
    }
    if (dto.action === 'PICKED_UP' && PURCHASE_SERVICES.includes(current.serviceType) && current.purchaseActualAmount == null) {
      throw new BadRequestException('Indiquez d’abord le montant des achats et la photo du ticket.');
    }
    const at = dto.occurredAt && dto.occurredAt <= new Date() ? dto.occurredAt : new Date();
    const pickupStop = current.stops.find((s) => s.kind === StopKind.PICKUP)!;
    const dropoffStop = current.stops.find((s) => s.kind === StopKind.DROPOFF)!;

    const order = await this.prisma.$transaction(async (tx) => {
      const updated = await this.lifecycle.transition(tx, orderId, [current.status], result.to, { id: driverId, role: 'DRIVER' }, {
        note: dto.note ?? (dto.action === 'PICKED_UP' ? 'Colis récupéré' : undefined),
        lat: dto.lat,
        lng: dto.lng,
        at,
      });
      if (!updated) throw new BadRequestException('La mission a changé entre-temps : actualisez l’écran.');
      if (dto.action === 'ARRIVED_PICKUP') await tx.orderStop.update({ where: { id: pickupStop.id }, data: { arrivedAt: at } });
      if (dto.action === 'PICKED_UP') {
        const waited = pickupStop.arrivedAt ? Math.max(0, Math.round((at.getTime() - pickupStop.arrivedAt.getTime()) / 1000)) : 0;
        await tx.orderStop.update({ where: { id: pickupStop.id }, data: { completedAt: at, waitingSeconds: waited } });
      }
      if (dto.action === 'ARRIVED_DROPOFF') await tx.orderStop.update({ where: { id: dropoffStop.id }, data: { arrivedAt: at } });
      return updated;
    });
    await this.lifecycle.announce(order);
    return this.missionDetail(driverId, orderId);
  }

  /** Courses/achats : montant réellement dépensé + photo du ticket ; les frais d'achat sont recalculés. */
  async recordPurchase(driverId: string, orderId: string, dto: PurchaseDto) {
    await this.approvedDriver(driverId);
    const order = await this.prisma.order.findFirst({ where: { id: orderId, driverId } });
    if (!order) throw new NotFoundException('Mission introuvable.');
    if (order.status !== OrderStatus.PURCHASING) throw new BadRequestException('Commencez d’abord les achats (étape « Achats en cours »).');
    await this.storage.assertOwned(dto.receiptFileKey, driverId, [FilePurpose.RECEIPT]);
    if (order.purchaseBudget && dto.actualAmount > Math.round(order.purchaseBudget * 1.2)) {
      throw new BadRequestException('Montant très supérieur au budget du client : appelez-le avant d’acheter.');
    }
    const rule = order.pricingRuleId ? await this.prisma.pricingRule.findUnique({ where: { id: order.pricingRuleId } }) : null;
    const breakdown = order.priceBreakdown as { distanceKm: number; localTime: string; speed: 'STANDARD' | 'EXPRESS' };
    const repriced = rule
      ? computeQuote(toParams(rule), { distanceKm: breakdown.distanceKm, speed: breakdown.speed, localTime: breakdown.localTime, purchaseAmount: dto.actualAmount })
      : null;
    const deliveryFee = repriced?.deliveryFee ?? order.deliveryFee;
    const discount = Math.min(order.discountAmount, deliveryFee);

    await this.prisma.$transaction(async (tx) => {
      await tx.order.update({
        where: { id: orderId },
        data: {
          purchaseActualAmount: dto.actualAmount,
          deliveryFee,
          discountAmount: discount,
          totalAmount: deliveryFee - discount + dto.actualAmount,
          ...(repriced ? { priceBreakdown: { ...(order.priceBreakdown as object), ...repriced, repricedAfterPurchase: true } as unknown as Prisma.InputJsonValue } : {}),
        },
      });
      await tx.deliveryProof.create({ data: { orderId, type: ProofType.RECEIPT, fileKey: dto.receiptFileKey, verified: true } });
    });
    const updated = await this.prisma.order.findUniqueOrThrow({ where: { id: orderId } });
    await this.lifecycle.announce(updated, { notifyClient: false });
    return this.missionDetail(driverId, orderId);
  }

  private async computeWaitingFee(orderId: string, at: Date): Promise<number> {
    const order = await this.prisma.order.findUniqueOrThrow({ where: { id: orderId }, include: { stops: true } });
    if (order.paymentMethod !== PaymentProvider.CASH || order.cashCollectAt !== StopKind.DROPOFF || !order.pricingRuleId) return 0;
    const rule = await this.prisma.pricingRule.findUnique({ where: { id: order.pricingRuleId } });
    if (!rule) return 0;
    const pickup = order.stops.find((s) => s.kind === StopKind.PICKUP);
    const dropoff = order.stops.find((s) => s.kind === StopKind.DROPOFF);
    const dropoffWait = dropoff?.arrivedAt ? Math.max(0, (at.getTime() - dropoff.arrivedAt.getTime()) / 1000) : 0;
    const minutes = ((pickup?.waitingSeconds ?? 0) + dropoffWait) / 60;
    const quote = computeQuote({ ...toParams(rule), roundingStep: 1 }, { distanceKm: 0, speed: 'STANDARD', localTime: '12:00', waitingMinutes: minutes });
    return quote.lines.find((l) => l.code === 'WAITING')?.amount ?? 0;
  }

  /** Remise au destinataire : code de livraison (ou photo si le code n'est pas exigé), puis règlement. */
  async deliver(driverId: string, orderId: string, dto: DeliverDto) {
    const driver = await this.approvedDriver(driverId);
    const order = await this.prisma.order.findFirst({ where: { id: orderId, driverId }, include: { stops: true } });
    if (!order) throw new NotFoundException('Mission introuvable.');
    if (order.status !== OrderStatus.ARRIVED_AT_DROPOFF) throw new BadRequestException('Indiquez d’abord que vous êtes arrivé à destination.');

    const requireCode = await this.settings.get('orders.requireDeliveryCode');
    if (dto.photoFileKey) await this.storage.assertOwned(dto.photoFileKey, driverId, [FilePurpose.DELIVERY_PROOF]);
    if (requireCode || dto.code) {
      const failed = await this.prisma.deliveryProof.count({ where: { orderId, type: ProofType.OTP, verified: false } });
      if (failed >= MAX_CODE_ATTEMPTS) {
        throw new ForbiddenException('Trop de codes erronés : appelez le service client pour valider la livraison.');
      }
      if (!dto.code) throw new BadRequestException('Demandez le code de livraison au destinataire.');
      if (dto.code !== order.deliveryCode) {
        await this.prisma.deliveryProof.create({ data: { orderId, type: ProofType.OTP, verified: false, lat: dto.lat, lng: dto.lng } });
        throw new BadRequestException(`Code incorrect (${MAX_CODE_ATTEMPTS - failed - 1} essai(s) restant(s)).`);
      }
    } else if (!dto.photoFileKey) {
      throw new BadRequestException('Prenez une photo de la remise du colis.');
    }

    const at = dto.occurredAt && dto.occurredAt <= new Date() ? dto.occurredAt : new Date();
    const waitingFee = await this.computeWaitingFee(orderId, at);
    const dropoff = order.stops.find((s) => s.kind === StopKind.DROPOFF)!;

    const delivered = await this.prisma.$transaction(async (tx) => {
      const proofs: Prisma.DeliveryProofCreateManyInput[] = [];
      if (dto.code) proofs.push({ orderId, stopId: dropoff.id, type: ProofType.OTP, verified: true, lat: dto.lat, lng: dto.lng });
      if (dto.photoFileKey) proofs.push({ orderId, stopId: dropoff.id, type: ProofType.PHOTO, fileKey: dto.photoFileKey, verified: true, lat: dto.lat, lng: dto.lng });
      await tx.deliveryProof.createMany({ data: proofs });
      const waited = dropoff.arrivedAt ? Math.max(0, Math.round((at.getTime() - dropoff.arrivedAt.getTime()) / 1000)) : 0;
      await tx.orderStop.update({ where: { id: dropoff.id }, data: { completedAt: at, waitingSeconds: waited } });
      return this.settleDelivery(tx, orderId, driver.employmentType, driver.commissionPercent, waitingFee, { id: driverId, role: 'DRIVER' }, at, dto);
    });
    await this.lifecycle.announce(delivered);
    return this.missionDetail(driverId, orderId);
  }

  /**
   * Passe la commande en « livrée » et répartit l'argent (voir money-flows.ts).
   * Utilisé par le livreur et, en cas de litige, par l'équipe (livraison confirmée manuellement).
   */
  async settleDelivery(
    tx: Prisma.TransactionClient,
    orderId: string,
    employmentType: 'SALARIE' | 'INDEPENDANT',
    driverCommissionPercent: number | null,
    waitingFee: number,
    actor: { id: string; role: 'DRIVER' | 'STAFF' },
    at: Date,
    position: { lat?: number; lng?: number } = {},
  ) {
    const order = await tx.order.findUniqueOrThrow({ where: { id: orderId } });
    if (!order.driverId) throw new BadRequestException('Aucun livreur affecté.');
    const breakdown = order.priceBreakdown as { commissionPercent?: number };
    const settlement = computeSettlement({
      deliveryFee: order.deliveryFee,
      waitingFee,
      discountAmount: order.discountAmount,
      commissionPercent: driverCommissionPercent ?? breakdown.commissionPercent ?? 0,
      employmentType,
      paymentMethod: order.paymentMethod,
    });
    const delivered = await this.lifecycle.transition(tx, orderId, ACTIVE_DRIVER_STATUSES, OrderStatus.DELIVERED, actor, {
      at,
      lat: position.lat,
      lng: position.lng,
      note: actor.role === 'STAFF' ? 'Livraison confirmée par l’équipe' : undefined,
      data: {
        waitingFee,
        commissionAmount: settlement.commissionAmount,
        driverEarning: settlement.driverEarning,
        totalAmount: settlement.clientDeliveryTotal + (order.purchaseActualAmount ?? 0) + order.itemsSubtotal,
        paymentStatus: order.paymentMethod === PaymentProvider.CASH ? PaymentStatus.SUCCEEDED : undefined,
      },
    });
    if (!delivered) throw new BadRequestException('La mission a changé entre-temps : actualisez l’écran.');

    if (order.paymentMethod === PaymentProvider.CASH) {
      await tx.payment.create({
        data: {
          orderId,
          userId: order.clientId,
          purpose: PaymentPurpose.ORDER,
          provider: PaymentProvider.CASH,
          amount: settlement.clientDeliveryTotal + (order.purchaseActualAmount ?? 0) + order.itemsSubtotal,
          status: PaymentStatus.SUCCEEDED,
          confirmedAt: at,
          metadata: { collectedBy: order.driverId, deliveryPart: settlement.clientDeliveryTotal, purchases: order.purchaseActualAmount ?? 0, items: order.itemsSubtotal },
        },
      });
    }
    if (settlement.driverWalletDelta !== 0) {
      const driverWallet = await this.ledger.userWallet('DRIVER', order.driverId, tx);
      const platform = await this.ledger.systemWallet('PLATFORM_REVENUE', tx);
      await this.ledger.post(
        {
          type: order.paymentMethod === PaymentProvider.CASH ? LedgerTransactionType.CASH_COLLECTED : LedgerTransactionType.DRIVER_EARNING,
          description:
            order.paymentMethod === PaymentProvider.CASH
              ? `Espèces encaissées — commande ${order.reference} (part plateforme)`
              : `Gain du livreur — commande ${order.reference}`,
          orderId,
          lines: [
            { walletId: driverWallet.id, amount: settlement.driverWalletDelta },
            { walletId: platform.id, amount: settlement.platformWalletDelta },
          ],
        },
        tx,
      );
    }
    if (order.merchantId && order.itemsSubtotal > 0) {
      await this.settleMerchant(tx, order);
    }
    return delivered;
  }

  /**
   * Part du commerçant : il reçoit le montant des articles moins la commission de la plateforme.
   * Espèces : le livreur a encaissé les articles et les doit à la plateforme ; prépayé : la plateforme les détient.
   */
  private async settleMerchant(tx: Prisma.TransactionClient, order: { id: string; reference: string; merchantId: string | null; driverId: string | null; paymentMethod: PaymentProvider; itemsSubtotal: number; merchantCommissionAmount: number }) {
    const merchantWallet = await this.ledger.merchantWallet(order.merchantId!, tx);
    const platform = await this.ledger.systemWallet('PLATFORM_REVENUE', tx);
    const earning = order.itemsSubtotal - order.merchantCommissionAmount;
    const lines =
      order.paymentMethod === PaymentProvider.CASH
        ? [
            { walletId: (await this.ledger.userWallet('DRIVER', order.driverId!, tx)).id, amount: -order.itemsSubtotal },
            { walletId: merchantWallet.id, amount: earning },
            { walletId: platform.id, amount: order.merchantCommissionAmount },
          ]
        : [
            { walletId: platform.id, amount: -earning },
            { walletId: merchantWallet.id, amount: earning },
          ];
    await this.ledger.post(
      {
        type: LedgerTransactionType.MERCHANT_EARNING,
        description: `Vente du commerçant — commande ${order.reference}${order.paymentMethod === PaymentProvider.CASH ? ' (articles encaissés par le livreur)' : ''}`,
        orderId: order.id,
        lines,
      },
      tx,
    );
    await tx.order.update({ where: { id: order.id }, data: { merchantEarning: earning } });
  }

  // ------------------------------------------------------------------ gains

  async earnings(driverId: string) {
    const startOfDay = new Date();
    startOfDay.setUTCHours(0, 0, 0, 0); // Burkina Faso : UTC+0
    const startOfWeek = new Date(startOfDay);
    startOfWeek.setUTCDate(startOfWeek.getUTCDate() - ((startOfWeek.getUTCDay() + 6) % 7));
    const startOfMonth = new Date(Date.UTC(startOfDay.getUTCFullYear(), startOfDay.getUTCMonth(), 1));
    const sum = async (from: Date) => {
      const agg = await this.prisma.order.aggregate({
        where: { driverId, status: { in: [OrderStatus.DELIVERED, OrderStatus.COMPLETED] }, deliveredAt: { gte: from } },
        _sum: { driverEarning: true },
        _count: true,
      });
      return { earnings: agg._sum.driverEarning ?? 0, deliveries: agg._count };
    };
    const wallet = await this.ledger.userWallet('DRIVER', driverId);
    return {
      today: await sum(startOfDay),
      week: await sum(startOfWeek),
      month: await sum(startOfMonth),
      balance: wallet.balance,
      cashDebt: Math.max(0, -wallet.balance),
      walletId: wallet.id,
    };
  }

  // ------------------------------------------------------------------ documents

  async addDocument(driverId: string, type: DocumentType, fileKey: string, expiresAt?: Date) {
    const driver = await this.prisma.driverProfile.findUnique({ where: { userId: driverId } });
    if (!driver) throw new ForbiddenException('Ce compte n’est pas un compte livreur.');
    await this.storage.assertOwned(fileKey, driverId, [FilePurpose.DRIVER_DOCUMENT]);
    const doc = await this.prisma.driverDocument.create({ data: { driverId, type, fileKey, expiresAt } });
    return { ...doc, url: this.storage.signedUrl(doc.fileKey) };
  }
}
