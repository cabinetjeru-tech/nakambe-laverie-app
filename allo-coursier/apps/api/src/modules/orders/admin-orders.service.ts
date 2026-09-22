import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { DriverStatus, OrderStatus, Prisma } from '@prisma/client';
import { paginate } from '../../common/dto/pagination.dto';
import { PrismaService } from '../../prisma/prisma.service';
import { StorageService } from '../storage/storage.service';
import { CourierService } from './courier.service';
import { AdminOrderQueryDto, AdminStatusDto } from './dto/orders.dto';
import { OrderLifecycleService } from './order-lifecycle.service';
import { ACTIVE_DRIVER_STATUSES, canAdminForce, FINAL_STATUSES, STATUS_LABELS } from './order-status';
import { adminView, orderDetailInclude } from './order-views';
import { OrdersService } from './orders.service';

@Injectable()
export class AdminOrdersService {
  constructor(
    private prisma: PrismaService,
    private orders: OrdersService,
    private courier: CourierService,
    private lifecycle: OrderLifecycleService,
    private storage: StorageService,
  ) {}

  async list(query: AdminOrderQueryDto) {
    const statuses = query.status ? (Array.isArray(query.status) ? query.status : [query.status]) : undefined;
    const search = query.search?.trim();
    const digits = search?.replace(/\D/g, '');
    const where: Prisma.OrderWhereInput = {
      status: statuses ? { in: statuses } : undefined,
      cityId: query.cityId,
      driverId: query.driverId,
      clientId: query.clientId,
      createdAt: query.from || query.to ? { gte: query.from, lte: query.to } : undefined,
      OR: search
        ? [
            { reference: { contains: search.toUpperCase() } },
            { client: { OR: [{ firstName: { contains: search, mode: 'insensitive' } }, { lastName: { contains: search, mode: 'insensitive' } }] } },
            ...(digits && digits.length >= 4 ? [{ client: { phone: { contains: digits } } }, { stops: { some: { contactPhone: { contains: digits } } } }] : []),
          ]
        : undefined,
    };
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
          vehicleType: true,
          totalAmount: true,
          deliveryFee: true,
          paymentMethod: true,
          paymentStatus: true,
          scheduledAt: true,
          createdAt: true,
          dispatchAttempts: true,
          city: { select: { id: true, name: true } },
          client: { select: { id: true, firstName: true, lastName: true, phone: true } },
          driver: { select: { id: true, firstName: true, lastName: true, phone: true } },
          stops: { select: { kind: true, landmark: true }, orderBy: { sequence: 'asc' } },
        },
      }),
      this.prisma.order.count({ where }),
    ]);
    return {
      items: items.map((o) => ({ ...o, statusLabel: STATUS_LABELS[o.status] })),
      total,
      page: query.page,
      pageSize: query.pageSize,
    };
  }

  async detail(orderId: string) {
    const order = await this.prisma.order.findUnique({ where: { id: orderId }, include: orderDetailInclude });
    if (!order) throw new NotFoundException('Commande introuvable.');
    const [offers, payments, trail] = await Promise.all([
      this.prisma.dispatchOffer.findMany({
        where: { orderId },
        orderBy: { offeredAt: 'asc' },
        include: { driver: { select: { user: { select: { firstName: true, lastName: true, phone: true } } } } },
      }),
      this.prisma.payment.findMany({ where: { orderId }, orderBy: { createdAt: 'asc' } }),
      this.prisma.driverLocationLog.findMany({
        where: { orderId },
        orderBy: { recordedAt: 'asc' },
        select: { lat: true, lng: true, recordedAt: true },
        take: 2000,
      }),
    ]);
    return {
      ...adminView(order, (k) => this.storage.signedUrl(k)),
      offers: offers.map((o) => ({
        id: o.id,
        attempt: o.attempt,
        status: o.status,
        driver: o.driver.user,
        driverId: o.driverId,
        distanceMeters: o.distanceMeters,
        offeredAt: o.offeredAt,
        respondedAt: o.respondedAt,
        rejectReason: o.rejectReason,
      })),
      payments,
      trail,
    };
  }

  /** Corrections par l'équipe : livraison confirmée, échec, retour, annulation. */
  async forceStatus(orderId: string, dto: AdminStatusDto, actorId: string) {
    const order = await this.prisma.order.findUnique({ where: { id: orderId } });
    if (!order) throw new NotFoundException('Commande introuvable.');
    if (!canAdminForce(order.status, dto.status)) {
      throw new BadRequestException(`Passage impossible de « ${STATUS_LABELS[order.status]} » à « ${STATUS_LABELS[dto.status]} ».`);
    }
    if (dto.status === OrderStatus.CANCELLED) {
      const cancellable = Object.values(OrderStatus).filter((s) => !FINAL_STATUSES.includes(s));
      await this.orders.cancel(orderId, cancellable, { id: actorId, role: 'STAFF' }, dto.reason);
      return this.detail(orderId);
    }
    const actor = { id: actorId, role: 'STAFF' as const };
    const updated = await this.prisma.$transaction(async (tx) => {
      if (dto.status === OrderStatus.DELIVERED) {
        const driver = await tx.driverProfile.findUniqueOrThrow({ where: { userId: order.driverId! } });
        return this.courier.settleDelivery(tx, orderId, driver.employmentType, driver.commissionPercent, 0, actor, new Date());
      }
      const from = dto.status === OrderStatus.RETURNED ? [OrderStatus.FAILED] : ACTIVE_DRIVER_STATUSES;
      const res = await this.lifecycle.transition(tx, orderId, from, dto.status, actor, { note: dto.reason });
      if (!res) throw new BadRequestException('La commande a changé entre-temps.');
      return res;
    });
    await this.lifecycle.announce(updated, {
      notifyDriver: { title: 'Mission mise à jour', body: `L’équipe a indiqué « ${STATUS_LABELS[updated.status]} » pour ${updated.reference}.` },
    });
    return this.detail(orderId);
  }

  /** Carte en direct : livreurs en ligne et commandes en cours. */
  async live(cityId?: string) {
    const [drivers, orders] = await Promise.all([
      this.prisma.driverProfile.findMany({
        where: { status: DriverStatus.APPROVED, isOnline: true, cityId },
        select: {
          userId: true,
          vehicleType: true,
          employmentType: true,
          lastLat: true,
          lastLng: true,
          lastLocationAt: true,
          user: { select: { firstName: true, lastName: true, phone: true } },
        },
      }),
      this.prisma.order.findMany({
        where: {
          cityId,
          status: { in: [OrderStatus.SEARCHING_DRIVER, OrderStatus.PENDING_PAYMENT, ...ACTIVE_DRIVER_STATUSES] },
        },
        select: {
          id: true,
          reference: true,
          status: true,
          driverId: true,
          serviceType: true,
          createdAt: true,
          stops: { select: { kind: true, lat: true, lng: true, landmark: true }, orderBy: { sequence: 'asc' } },
        },
        orderBy: { createdAt: 'asc' },
      }),
    ]);
    const busy = new Set(orders.map((o) => o.driverId).filter(Boolean));
    return {
      drivers: drivers.map((d) => ({ ...d, busy: busy.has(d.userId) })),
      orders: orders.map((o) => ({ ...o, statusLabel: STATUS_LABELS[o.status] })),
    };
  }
}
