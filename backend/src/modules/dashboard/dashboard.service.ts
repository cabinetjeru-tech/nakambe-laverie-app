import { Injectable } from '@nestjs/common';
import { OrderStatus } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';

function startOfDay(d: Date) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}
function startOfWeek(d: Date) {
  const x = startOfDay(d);
  const day = x.getDay() === 0 ? 7 : x.getDay(); // lundi = 1
  x.setDate(x.getDate() - (day - 1));
  return x;
}
function startOfMonth(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}

@Injectable()
export class DashboardService {
  constructor(private prisma: PrismaService) {}

  private async periodStats(from: Date) {
    const [orderAgg, ordersInProgress, ordersDone, newClients, deliveries, appointments] = await Promise.all([
      this.prisma.order.aggregate({
        where: { createdAt: { gte: from }, status: { not: OrderStatus.ANNULE } },
        _sum: { total: true },
        _count: true,
      }),
      this.prisma.order.count({
        where: {
          createdAt: { gte: from },
          status: { notIn: [OrderStatus.TERMINE, OrderStatus.LIVRE, OrderStatus.ANNULE] },
        },
      }),
      this.prisma.order.count({
        where: { createdAt: { gte: from }, status: { in: [OrderStatus.TERMINE, OrderStatus.LIVRE] } },
      }),
      this.prisma.client.count({ where: { createdAt: { gte: from } } }),
      this.prisma.order.count({
        where: { createdAt: { gte: from }, status: OrderStatus.LIVRAISON_PROGRAMMEE },
      }),
      this.prisma.appointment.count({ where: { createdAt: { gte: from } } }),
    ]);

    return {
      revenue: Number(orderAgg._sum.total ?? 0),
      ordersCount: orderAgg._count,
      ordersInProgress,
      ordersDone,
      newClients,
      deliveries,
      appointments,
    };
  }

  async overview() {
    const now = new Date();
    const [today, week, month, lowStock, topServices] = await Promise.all([
      this.periodStats(startOfDay(now)),
      this.periodStats(startOfWeek(now)),
      this.periodStats(startOfMonth(now)),
      this.prisma.product
        .findMany()
        .then((rows) => rows.filter((p) => Number(p.currentStock) <= Number(p.minThreshold))),
      this.topServices(startOfMonth(now)),
    ]);

    const monthExpenses = await this.prisma.expense.aggregate({
      where: { spentAt: { gte: startOfMonth(now) } },
      _sum: { amount: true },
    });

    return {
      today,
      week,
      month: {
        ...month,
        expenses: Number(monthExpenses._sum.amount ?? 0),
        estimatedProfit: month.revenue - Number(monthExpenses._sum.amount ?? 0),
      },
      lowStockAlerts: lowStock,
      topServices,
    };
  }

  private async topServices(from: Date) {
    const items = await this.prisma.orderItem.groupBy({
      by: ['label'],
      where: { order: { createdAt: { gte: from } } },
      _sum: { quantity: true, total: true },
      orderBy: { _sum: { total: 'desc' } },
      take: 5,
    });
    return items.map((i) => ({
      label: i.label,
      quantity: i._sum.quantity ?? 0,
      total: Number(i._sum.total ?? 0),
    }));
  }
}
