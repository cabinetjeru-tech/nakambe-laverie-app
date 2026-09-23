import { BadRequestException, Injectable } from '@nestjs/common';
import { assertCityAccess, AuthUser } from '../../common/auth-user';
import { ComplaintStatus, DriverStatus, OrderStatus, PaymentStatus, PayoutStatus, Prisma } from '@prisma/client';
import { ROLE } from '../../common/permissions';
import { PrismaService } from '../../prisma/prisma.service';

const DELIVERED: OrderStatus[] = [OrderStatus.DELIVERED, OrderStatus.COMPLETED];
const IN_PROGRESS: OrderStatus[] = [
  OrderStatus.PENDING_PAYMENT,
  OrderStatus.SCHEDULED,
  OrderStatus.SEARCHING_DRIVER,
  OrderStatus.DRIVER_ASSIGNED,
  OrderStatus.DRIVER_AT_PICKUP,
  OrderStatus.PURCHASING,
  OrderStatus.PICKED_UP,
  OrderStatus.IN_TRANSIT,
  OrderStatus.ARRIVED_AT_DROPOFF,
];

@Injectable()
export class StatsService {
  constructor(private prisma: PrismaService) {}

  /** Ville des statistiques pour un membre limité à certaines villes. */
  scopedCity(user: AuthUser, requested?: string): string | undefined {
    if (!user.cityIds) return requested;
    if (requested) {
      assertCityAccess(user, requested);
      return requested;
    }
    if (user.cityIds.length === 1) return user.cityIds[0];
    throw new BadRequestException('Choisissez une ville.');
  }

  async overview(params: { cityId?: string; from?: Date; to?: Date }) {
    const to = params.to ?? new Date();
    const from = params.from ?? new Date(to.getTime() - 30 * 24 * 3600_000);
    const inPeriod: Prisma.OrderWhereInput = { cityId: params.cityId, createdAt: { gte: from, lte: to } };
    const deliveredInPeriod: Prisma.OrderWhereInput = { cityId: params.cityId, status: { in: DELIVERED }, deliveredAt: { gte: from, lte: to } };

    const [created, byStatus, byService, money, timings, newClients, driversOnline, driversApproved, driversPending, pendingPayments, openComplaints, pendingPayouts, inProgressNow] =
      await Promise.all([
        this.prisma.order.count({ where: inPeriod }),
        this.prisma.order.groupBy({ by: ['status'], where: inPeriod, _count: true }),
        this.prisma.order.groupBy({ by: ['serviceType'], where: deliveredInPeriod, _count: true, _sum: { deliveryFee: true } }),
        this.prisma.order.aggregate({
          where: deliveredInPeriod,
          _sum: { deliveryFee: true, waitingFee: true, discountAmount: true, commissionAmount: true, driverEarning: true, purchaseActualAmount: true },
          _count: true,
        }),
        this.prisma.$queryRaw<{ avg_accept: number | null; avg_delivery: number | null }[]>`
          SELECT AVG(EXTRACT(EPOCH FROM ("acceptedAt" - "createdAt")) / 60)::float AS avg_accept,
                 AVG(EXTRACT(EPOCH FROM ("deliveredAt" - COALESCE("acceptedAt", "createdAt"))) / 60)::float AS avg_delivery
          FROM orders
          WHERE "deliveredAt" BETWEEN ${from} AND ${to}
            ${params.cityId ? Prisma.sql`AND "cityId" = ${params.cityId}` : Prisma.empty}`,
        this.prisma.user.count({ where: { createdAt: { gte: from, lte: to }, roles: { some: { role: { code: ROLE.CLIENT } } } } }),
        this.prisma.driverProfile.count({ where: { isOnline: true, status: DriverStatus.APPROVED, cityId: params.cityId } }),
        this.prisma.driverProfile.count({ where: { status: DriverStatus.APPROVED, cityId: params.cityId } }),
        this.prisma.driverProfile.count({ where: { status: DriverStatus.PENDING, cityId: params.cityId } }),
        this.prisma.payment.count({ where: { status: PaymentStatus.PENDING, provider: 'MANUAL_MOBILE_MONEY' } }),
        this.prisma.complaint.count({ where: { status: { in: [ComplaintStatus.OPEN, ComplaintStatus.IN_PROGRESS] } } }),
        this.prisma.payoutRequest.count({ where: { status: { in: [PayoutStatus.PENDING, PayoutStatus.APPROVED] } } }),
        this.prisma.order.count({ where: { cityId: params.cityId, status: { in: IN_PROGRESS } } }),
      ]);

    const daily = await this.prisma.$queryRaw<{ day: Date; created: number; delivered: number; revenue: number }[]>`
      SELECT d::date AS day,
             (SELECT COUNT(*)::int FROM orders o WHERE o."createdAt"::date = d::date ${params.cityId ? Prisma.sql`AND o."cityId" = ${params.cityId}` : Prisma.empty}) AS created,
             (SELECT COUNT(*)::int FROM orders o WHERE o."deliveredAt"::date = d::date AND o.status IN ('DELIVERED','COMPLETED') ${params.cityId ? Prisma.sql`AND o."cityId" = ${params.cityId}` : Prisma.empty}) AS delivered,
             (SELECT COALESCE(SUM(o."deliveryFee" + o."waitingFee" - o."discountAmount"), 0)::int FROM orders o WHERE o."deliveredAt"::date = d::date AND o.status IN ('DELIVERED','COMPLETED') ${params.cityId ? Prisma.sql`AND o."cityId" = ${params.cityId}` : Prisma.empty}) AS revenue
      FROM generate_series(${from}::date, ${to}::date, interval '1 day') AS d
      ORDER BY day`;

    const count = (s: OrderStatus[]) => byStatus.filter((b) => s.includes(b.status)).reduce((n, b) => n + b._count, 0);
    const sum = money._sum;
    return {
      period: { from, to },
      orders: {
        created,
        delivered: money._count,
        cancelled: count([OrderStatus.CANCELLED]),
        failed: count([OrderStatus.FAILED, OrderStatus.RETURNED]),
        inProgressNow,
        byService: byService.map((b) => ({ serviceType: b.serviceType, delivered: b._count, deliveryFees: b._sum.deliveryFee ?? 0 })),
      },
      money: {
        deliveryRevenue: (sum.deliveryFee ?? 0) + (sum.waitingFee ?? 0) - (sum.discountAmount ?? 0),
        discounts: sum.discountAmount ?? 0,
        commissions: sum.commissionAmount ?? 0,
        driverEarnings: sum.driverEarning ?? 0,
        purchasesAdvanced: sum.purchaseActualAmount ?? 0,
        averageBasket: money._count ? Math.round(((sum.deliveryFee ?? 0) - (sum.discountAmount ?? 0)) / money._count) : 0,
      },
      timings: {
        averageAcceptMinutes: timings[0]?.avg_accept != null ? Math.round(timings[0].avg_accept * 10) / 10 : null,
        averageDeliveryMinutes: timings[0]?.avg_delivery != null ? Math.round(timings[0].avg_delivery * 10) / 10 : null,
      },
      people: { newClients, driversOnline, driversApproved, driversPending },
      todo: { pendingPayments, openComplaints, pendingPayouts, driversPending },
      daily: daily.map((d) => ({ day: d.day.toISOString().slice(0, 10), created: d.created, delivered: d.delivered, revenue: d.revenue })),
    };
  }

  /** Classement des livreurs sur la période (livraisons, gains, note). */
  async drivers(params: { cityId?: string; from?: Date; to?: Date }) {
    const to = params.to ?? new Date();
    const from = params.from ?? new Date(to.getTime() - 30 * 24 * 3600_000);
    const rows = await this.prisma.order.groupBy({
      by: ['driverId'],
      where: { cityId: params.cityId, status: { in: DELIVERED }, deliveredAt: { gte: from, lte: to }, driverId: { not: null } },
      _count: true,
      _sum: { driverEarning: true, deliveryFee: true },
      orderBy: { _count: { driverId: 'desc' } },
      take: 50,
    });
    const profiles = await this.prisma.driverProfile.findMany({
      where: { userId: { in: rows.map((r) => r.driverId!) } },
      select: { userId: true, employmentType: true, vehicleType: true, ratingAvg: true, ratingCount: true, user: { select: { firstName: true, lastName: true } } },
    });
    return rows.map((r) => {
      const p = profiles.find((x) => x.userId === r.driverId);
      return {
        driverId: r.driverId,
        name: p ? `${p.user.firstName} ${p.user.lastName}` : '—',
        employmentType: p?.employmentType,
        vehicleType: p?.vehicleType,
        rating: p && p.ratingCount ? Math.round(p.ratingAvg * 10) / 10 : null,
        deliveries: r._count,
        earnings: r._sum.driverEarning ?? 0,
        deliveryFees: r._sum.deliveryFee ?? 0,
      };
    });
  }
}
