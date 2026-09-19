import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class FinanceService {
  constructor(private prisma: PrismaService) {}

  createExpense(dto: any) {
    return this.prisma.expense.create({ data: dto });
  }

  findExpenses(from?: Date, to?: Date) {
    return this.prisma.expense.findMany({
      where: from && to ? { spentAt: { gte: from, lte: to } } : {},
      orderBy: { spentAt: 'desc' },
    });
  }

  createRevenue(dto: any) {
    return this.prisma.revenue.create({ data: dto });
  }

  findRevenues(from?: Date, to?: Date) {
    return this.prisma.revenue.findMany({
      where: from && to ? { receivedAt: { gte: from, lte: to } } : {},
      orderBy: { receivedAt: 'desc' },
    });
  }

  async summary(from: Date, to: Date) {
    const [expenses, revenues, ordersRevenue] = await Promise.all([
      this.prisma.expense.aggregate({ where: { spentAt: { gte: from, lte: to } }, _sum: { amount: true } }),
      this.prisma.revenue.aggregate({ where: { receivedAt: { gte: from, lte: to } }, _sum: { amount: true } }),
      this.prisma.order.aggregate({
        where: { createdAt: { gte: from, lte: to }, status: { not: 'ANNULE' } },
        _sum: { total: true },
      }),
    ]);

    const totalRevenue = Number(revenues._sum.amount ?? 0) + Number(ordersRevenue._sum.total ?? 0);
    const totalExpenses = Number(expenses._sum.amount ?? 0);

    return {
      totalRevenue,
      totalExpenses,
      estimatedProfit: totalRevenue - totalExpenses,
    };
  }
}
