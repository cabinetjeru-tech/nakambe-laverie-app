import { Injectable } from '@nestjs/common';
import { PlatformDbService } from '../../core/platform/platform-db.service';
import { monthlyEquivalent } from '../billing/billing-periods';

const DAY_MS = 86_400_000;

/** 12 derniers mois (clé AAAA-MM, UTC), du plus ancien au plus récent. */
function lastMonths(count = 12): string[] {
  const now = new Date();
  const months: string[] = [];
  for (let i = count - 1; i >= 0; i -= 1) {
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1));
    months.push(`${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`);
  }
  return months;
}

function monthStart(offset = 0): Date {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + offset, 1));
}

/**
 * Super administrateur — Revenus et Statistiques de la plateforme.
 * Uniquement des agrégats : aucun chiffre d'un salon en particulier n'en ressort.
 */
@Injectable()
export class PlatformStatsService {
  constructor(private readonly platform: PlatformDbService) {}

  async revenue() {
    const db = this.platform.client;
    const now = new Date();
    const months = lastMonths();
    const [subs, monthly, byMethod, open, overdue, thisMonth, lastMonth] = await Promise.all([
      // Revenu récurrent : abonnements actifs ou en délai de grâce ayant déjà payé au moins une
      // facture (un essai expiré jamais payé n'est pas du revenu).
      db.saasSubscription.findMany({
        where: { status: { in: ['ACTIVE', 'PAST_DUE'] }, invoices: { some: { status: 'PAID' } } },
        select: { unitPrice: true, cycle: true, cancelAtPeriodEnd: true, plan: { select: { code: true, name: true } } },
      }),
      db.$queryRaw<{ month: string; total: bigint; count: bigint }[]>`
        SELECT to_char(date_trunc('month', paid_at AT TIME ZONE 'UTC'), 'YYYY-MM') AS month,
               SUM(amount)::bigint AS total, COUNT(*)::bigint AS count
          FROM saas_payments
         WHERE status = 'SUCCEEDED' AND paid_at >= ${monthStart(-11)}
         GROUP BY 1`,
      db.saasPayment.groupBy({
        by: ['method'],
        where: { status: 'SUCCEEDED', paidAt: { gte: monthStart(-11) } },
        _sum: { amount: true },
        _count: { _all: true },
      }),
      db.saasInvoice.aggregate({ where: { status: 'OPEN' }, _sum: { total: true }, _count: { _all: true } }),
      db.saasInvoice.aggregate({ where: { status: 'OPEN', dueAt: { lt: now } }, _sum: { total: true }, _count: { _all: true } }),
      db.saasPayment.aggregate({ where: { status: 'SUCCEEDED', paidAt: { gte: monthStart(0) } }, _sum: { amount: true } }),
      db.saasPayment.aggregate({ where: { status: 'SUCCEEDED', paidAt: { gte: monthStart(-1), lt: monthStart(0) } }, _sum: { amount: true } }),
    ]);

    const byPlan = new Map<string, { code: string; name: string; subscriptions: number; mrr: bigint }>();
    let mrr = 0n;
    let mrrAtRisk = 0n; // résiliations programmées
    for (const sub of subs) {
      const monthlyValue = monthlyEquivalent({ priceMonthly: sub.unitPrice, priceYearly: sub.unitPrice }, sub.cycle);
      mrr += monthlyValue;
      if (sub.cancelAtPeriodEnd) mrrAtRisk += monthlyValue;
      const entry = byPlan.get(sub.plan.code) ?? { code: sub.plan.code, name: sub.plan.name, subscriptions: 0, mrr: 0n };
      entry.subscriptions += 1;
      entry.mrr += monthlyValue;
      byPlan.set(sub.plan.code, entry);
    }
    const perMonth = new Map(monthly.map((row) => [row.month, row]));
    return {
      currency: 'XOF',
      mrr,
      arr: mrr * 12n,
      mrrAtRisk,
      payingTenants: subs.length,
      arpa: subs.length > 0 ? mrr / BigInt(subs.length) : 0n,
      collectedThisMonth: thisMonth._sum.amount ?? 0n,
      collectedLastMonth: lastMonth._sum.amount ?? 0n,
      outstanding: { count: open._count._all, total: open._sum.total ?? 0n },
      overdue: { count: overdue._count._all, total: overdue._sum.total ?? 0n },
      monthly: months.map((month) => ({ month, total: perMonth.get(month)?.total ?? 0n, payments: Number(perMonth.get(month)?.count ?? 0n) })),
      byPlan: [...byPlan.values()].sort((a, b) => Number(b.mrr - a.mrr)),
      byMethod: byMethod.map((row) => ({ method: row.method, total: row._sum.amount ?? 0n, count: row._count._all })),
    };
  }

  async statistics() {
    const db = this.platform.client;
    const now = new Date();
    const since30 = new Date(now.getTime() - 30 * DAY_MS);
    const months = lastMonths();
    const [byStatus, byPlan, signups, trialsEnded, converted, cancelled30, suspended30, users, activeUsers30, newUsers30, salons, appointments30, sales30, openTickets] =
      await Promise.all([
        db.tenant.groupBy({ by: ['status'], _count: { _all: true } }),
        db.tenant.groupBy({ by: ['planId'], _count: { _all: true } }),
        db.$queryRaw<{ month: string; count: bigint }[]>`
          SELECT to_char(date_trunc('month', created_at AT TIME ZONE 'UTC'), 'YYYY-MM') AS month, COUNT(*)::bigint AS count
            FROM tenants WHERE created_at >= ${monthStart(-11)} GROUP BY 1`,
        db.tenant.count({ where: { trialEndsAt: { lt: now } } }),
        db.tenant.count({ where: { saasInvoices: { some: { status: 'PAID' } } } }),
        db.tenant.count({ where: { cancelledAt: { gte: since30 } } }),
        db.tenant.count({ where: { suspendedAt: { gte: since30 } } }),
        db.user.count({ where: { anonymizedAt: null } }),
        db.user.count({ where: { lastLoginAt: { gte: since30 } } }),
        db.user.count({ where: { createdAt: { gte: since30 } } }),
        db.salon.count({ where: { deletedAt: null } }),
        db.appointment.count({ where: { startsAt: { gte: since30, lt: now } } }),
        db.sale.count({ where: { status: 'PAID', createdAt: { gte: since30 } } }),
        db.supportTicket.count({ where: { status: { in: ['OPEN', 'PENDING'] } } }),
      ]);
    const plans = await db.plan.findMany({ select: { id: true, code: true, name: true } });
    const planById = new Map(plans.map((p) => [p.id, p]));
    const perMonth = new Map(signups.map((row) => [row.month, Number(row.count)]));
    const tenantsTotal = byStatus.reduce((sum, row) => sum + row._count._all, 0);
    return {
      tenants: {
        total: tenantsTotal,
        byStatus: Object.fromEntries(byStatus.map((row) => [row.status, row._count._all])),
        byPlan: byPlan.map((row) => ({ ...planById.get(row.planId), count: row._count._all })),
        signupsMonthly: months.map((month) => ({ month, count: perMonth.get(month) ?? 0 })),
        /** Part des essais terminés qui ont payé au moins une facture. */
        trialConversionRate: trialsEnded > 0 ? Math.min(1, converted / trialsEnded) : null,
        cancelledLast30d: cancelled30,
        suspendedLast30d: suspended30,
      },
      users: { total: users, activeLast30d: activeUsers30, newLast30d: newUsers30 },
      usage: { salons, appointmentsLast30d: appointments30, salesLast30d: sales30 },
      support: { openTickets },
    };
  }

  /** Tableau de bord d'accueil du super administrateur. */
  async home() {
    const db = this.platform.client;
    const [revenue, stats, pendingManualPayments, recentTenants, urgentTickets] = await Promise.all([
      this.revenue(),
      this.statistics(),
      db.saasPayment.count({ where: { status: 'PENDING', method: 'MOBILE_MONEY_MANUAL' } }),
      db.tenant.findMany({ orderBy: { createdAt: 'desc' }, take: 6, select: { id: true, displayName: true, status: true, createdAt: true, plan: { select: { name: true } } } }),
      db.supportTicket.findMany({
        where: { status: 'OPEN' },
        orderBy: [{ priority: 'desc' }, { lastMessageAt: 'asc' }],
        take: 6,
        select: { id: true, number: true, subject: true, priority: true, lastMessageAt: true, tenant: { select: { displayName: true } } },
      }),
    ]);
    return {
      mrr: revenue.mrr,
      arr: revenue.arr,
      collectedThisMonth: revenue.collectedThisMonth,
      overdue: revenue.overdue,
      monthly: revenue.monthly,
      tenants: stats.tenants,
      users: stats.users,
      pendingManualPayments,
      openTickets: stats.support.openTickets,
      recentTenants,
      urgentTickets,
    };
  }
}
