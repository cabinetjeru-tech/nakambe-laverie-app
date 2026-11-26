import { Controller, Get, Injectable, Module, Query } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { RequirePermissions } from '../../common/decorators';
import { PeriodQuery } from '../../common/pagination';
import { addDays, Period, resolvePeriod, startOfDay } from '../../common/period';
import { FinanceModule } from '../finance/finance.module';
import { FinanceService } from '../finance/finance.service';
import { CashEngine } from '../core/engines';

type Bucket = 'day' | 'month';

@Injectable()
export class DashboardService {
  constructor(private prisma: PrismaService, private finance: FinanceService, private cash: CashEngine) {}

  /** Fenêtre des graphiques d'évolution selon le filtre choisi. */
  private chartWindow(kind: string, p: Period): { from: Date; to: Date; bucket: Bucket } {
    if (kind === 'year') return { from: p.from, to: p.to, bucket: 'month' };
    if (kind === 'month' || kind === 'week') return { from: p.from, to: p.to, bucket: 'day' };
    return { from: addDays(p.to, -14), to: p.to, bucket: 'day' }; // jour : 14 derniers jours
  }

  private buckets(from: Date, to: Date, bucket: Bucket) {
    const keys: string[] = [];
    let d = new Date(from);
    while (d < to) {
      keys.push(bucket === 'day' ? d.toISOString().slice(0, 10) : d.toISOString().slice(0, 7));
      d = bucket === 'day' ? addDays(d, 1) : new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1));
    }
    return keys;
  }

  async get(q: PeriodQuery) {
    const kind = q.period ?? 'day';
    const p = resolvePeriod(q);
    const today = resolvePeriod({ period: 'day', date: q.date });
    const month = resolvePeriod({ period: 'month', date: q.date });
    const w = this.chartWindow(kind, p);
    const fmt = w.bucket === 'day' ? 'YYYY-MM-DD' : 'YYYY-MM';

    const [summary, todaySum, monthSum, openSession, lastClosed, clientsTotal, newClients, appointments, upcoming, servicesDone, products, revSeries, expSeries, topServices, staffPerf, clientSeries, newClientSeries, recentSales, receivables] = await Promise.all([
      this.finance.summary(p),
      this.finance.summary(today),
      this.finance.summary(month),
      this.prisma.cashSession.findFirst({ where: { status: 'OPEN' } }),
      this.prisma.cashSession.findFirst({ where: { status: 'CLOSED' }, orderBy: { closedAt: 'desc' } }),
      this.prisma.client.count({ where: { active: true } }),
      this.prisma.client.count({ where: { createdAt: { gte: p.from, lt: p.to } } }),
      this.prisma.appointment.groupBy({ by: ['status'], where: { startAt: { gte: p.from, lt: p.to } }, _count: true }),
      this.prisma.appointment.findMany({ where: { startAt: { gte: new Date() , lt: addDays(startOfDay(new Date()), 2) }, status: { in: ['PENDING', 'CONFIRMED'] } }, orderBy: { startAt: 'asc' }, take: 8, include: { client: { select: { firstName: true, lastName: true, phone: true } }, staff: { select: { firstName: true, color: true } }, items: { include: { service: { select: { name: true } } } } } }),
      this.prisma.saleItem.aggregate({ where: { type: 'SERVICE', sale: { status: 'VALIDATED', saleDate: { gte: p.from, lt: p.to } } }, _sum: { quantity: true } }),
      this.prisma.product.findMany({ where: { active: true }, select: { quantity: true, minQuantity: true, purchasePrice: true } }),
      this.prisma.$queryRawUnsafe<{ k: string; v: bigint }[]>(`SELECT to_char("saleDate", '${fmt}') AS k, SUM("total")::bigint AS v FROM "Sale" WHERE "status" = 'VALIDATED' AND "saleDate" >= $1 AND "saleDate" < $2 GROUP BY 1`, w.from, w.to),
      this.prisma.$queryRawUnsafe<{ k: string; v: bigint }[]>(`SELECT to_char("expenseDate", '${fmt}') AS k, SUM("amount")::bigint AS v FROM "Expense" WHERE "status" <> 'CANCELLED' AND "expenseDate" >= $1 AND "expenseDate" < $2 GROUP BY 1`, w.from, w.to),
      this.prisma.$queryRaw<{ name: string; count: bigint; amount: bigint }[]>`
        SELECT i."label" AS name, SUM(i."quantity")::bigint AS count, SUM(i."total")::bigint AS amount
        FROM "SaleItem" i JOIN "Sale" s ON s."id" = i."saleId"
        WHERE i."type" = 'SERVICE' AND s."status" = 'VALIDATED' AND s."saleDate" >= ${p.from} AND s."saleDate" < ${p.to}
        GROUP BY i."label" ORDER BY count DESC, amount DESC LIMIT 8`,
      this.prisma.$queryRaw<{ staffId: string; name: string; color: string; services: bigint; amount: bigint; clients: bigint }[]>`
        SELECT st."id" AS "staffId", st."firstName" || ' ' || st."lastName" AS name, st."color" AS color,
               COALESCE(SUM(i."quantity"), 0)::bigint AS services, COALESCE(SUM(i."total"), 0)::bigint AS amount,
               COUNT(DISTINCT s."clientId")::bigint AS clients
        FROM "SaleItem" i JOIN "Sale" s ON s."id" = i."saleId" JOIN "Staff" st ON st."id" = i."staffId"
        WHERE i."type" = 'SERVICE' AND s."status" = 'VALIDATED' AND s."saleDate" >= ${p.from} AND s."saleDate" < ${p.to}
        GROUP BY st."id" ORDER BY amount DESC`,
      this.prisma.$queryRawUnsafe<{ k: string; v: bigint }[]>(`SELECT to_char("saleDate", '${fmt}') AS k, COUNT(DISTINCT "clientId")::bigint AS v FROM "Sale" WHERE "status" = 'VALIDATED' AND "clientId" IS NOT NULL AND "saleDate" >= $1 AND "saleDate" < $2 GROUP BY 1`, w.from, w.to),
      this.prisma.$queryRawUnsafe<{ k: string; v: bigint }[]>(`SELECT to_char("createdAt", '${fmt}') AS k, COUNT(*)::bigint AS v FROM "Client" WHERE "createdAt" >= $1 AND "createdAt" < $2 GROUP BY 1`, w.from, w.to),
      this.prisma.sale.findMany({ orderBy: { createdAt: 'desc' }, take: 6, include: { client: { select: { firstName: true, lastName: true } } } }),
      this.prisma.sale.aggregate({ where: { status: 'VALIDATED', balance: { gt: 0 } }, _sum: { balance: true } }),
    ]);

    const keys = this.buckets(w.from, w.to, w.bucket);
    const val = (arr: { k: string; v: bigint }[], k: string) => Number(arr.find((x) => x.k === k)?.v ?? 0);
    const commissions = await this.prisma.commission.groupBy({ by: ['staffId'], where: { status: { in: ['DUE', 'PAID'] }, earnedAt: { gte: p.from, lt: p.to } }, _sum: { amount: true } });
    const theoretical = openSession ? await this.cash.expected(this.prisma, openSession.id, openSession.openingAmount) : null;
    const apptCount = (st?: string[]) => appointments.filter((a) => !st || st.includes(a.status)).reduce((s, a) => s + a._count, 0);

    return {
      period: p,
      kpis: {
        revenueToday: todaySum.revenue.total,
        revenueMonth: monthSum.revenue.total,
        revenuePeriod: summary.revenue.total,
        expensesToday: todaySum.totalExpenses,
        expensesMonth: monthSum.totalExpenses,
        expensesPeriod: summary.totalExpenses,
        cashInPeriod: summary.cash.totalIn,
        accountingResult: summary.accountingResult,
        estimatedProfit: summary.estimatedProfit,
        cash: openSession ? { open: true, number: openSession.number, theoretical } : { open: false, lastCounted: lastClosed?.countedAmount ?? null, lastClosedAt: lastClosed?.closedAt ?? null },
        clientsTotal,
        newClients,
        appointments: apptCount(),
        appointmentsDone: apptCount(['DONE']),
        appointmentsCancelled: apptCount(['CANCELLED', 'NO_SHOW']),
        servicesDone: servicesDone._sum.quantity ?? 0,
        salesCount: summary.revenue.salesCount,
        stockAlerts: products.filter((x) => x.quantity <= x.minQuantity).length,
        stockValue: products.reduce((s, x) => s + x.quantity * x.purchasePrice, 0),
        receivables: receivables._sum.balance ?? 0,
      },
      charts: {
        bucket: w.bucket,
        finance: keys.map((k) => ({ key: k, revenue: val(revSeries, k), expenses: val(expSeries, k) })),
        clients: keys.map((k) => ({ key: k, served: val(clientSeries, k), new: val(newClientSeries, k) })),
        topServices: topServices.map((t) => ({ name: t.name, count: Number(t.count), amount: Number(t.amount) })),
        staff: staffPerf.map((s) => ({ staffId: s.staffId, name: s.name, color: s.color, services: Number(s.services), amount: Number(s.amount), clients: Number(s.clients), commissions: commissions.find((c) => c.staffId === s.staffId)?._sum.amount ?? 0 })),
      },
      upcoming,
      recentSales,
    };
  }
}

@Controller('dashboard')
export class DashboardController {
  constructor(private s: DashboardService) {}
  @Get() @RequirePermissions('dashboard.view')
  get(@Query() q: PeriodQuery) { return this.s.get(q); }
}

@Module({ imports: [FinanceModule], controllers: [DashboardController], providers: [DashboardService] })
export class DashboardModule {}
