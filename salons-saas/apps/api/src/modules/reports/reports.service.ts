import { Injectable, NotFoundException } from '@nestjs/common';
import { DateTime } from 'luxon';
import { AuthUser } from '../../core/auth/auth-user';
import { DbService } from '../../core/db/db.service';
import { assertSalonAccess, salonIdFilter } from '../../core/permissions/salon-scope';
import { StaffIdentityService } from '../../core/tenant/staff-identity.service';
import { localPeriodBounds, todayIn } from '../../core/time/zoned';
import { DashboardQueryDto, ReportQueryDto } from './reports.dto';

type Money = bigint;
const add = (map: Map<string, Money>, key: string, value: Money) => map.set(key, (map.get(key) ?? 0n) + value);

/**
 * Rapports sur une période (jours locaux inclus). Trois niveaux :
 * - reports.read          : activité du salon (ventes, prestations, équipe, rendez-vous) ;
 * - reports.finance.read  : + dépenses, résultat, écarts de caisse ;
 * - reports.read.own      : uniquement ses propres chiffres (coiffeur).
 */
@Injectable()
export class ReportsService {
  constructor(
    private readonly db: DbService,
    private readonly staffIdentity: StaffIdentityService,
  ) {}

  async summary(user: AuthUser, query: ReportQueryDto) {
    if (query.salonId) assertSalonAccess(user, query.salonId);
    const zone = await this.zone(query.salonId);
    const { start, end } = localPeriodBounds(query.from, query.to, zone);
    const salonFilter = query.salonId ?? salonIdFilter(user);
    const seesSalon = user.permissions.includes('reports.read') || user.permissions.includes('reports.finance.read');
    const seesFinance = user.permissions.includes('reports.finance.read');
    const ownStaffId = seesSalon ? null : await this.staffIdentity.requireOwnStaffId(user);

    const sales = await this.db.tx.sale.findMany({
      where: { salonId: salonFilter, status: 'PAID', closedAt: { gte: start, lt: end } },
      select: {
        id: true,
        total: true,
        discountTotal: true,
        tipTotal: true,
        clientId: true,
        closedAt: true,
        items: { select: { type: true, serviceId: true, productId: true, label: true, quantity: true, lineTotal: true, unitCost: true, staffId: true } },
        payments: { where: { status: 'SUCCEEDED' }, select: { method: true, amount: true } },
        tips: { select: { staffId: true, amount: true } },
      },
    });

    const revenueByDay = new Map<string, Money>();
    const byMethod = new Map<string, Money>();
    const services = new Map<string, { label: string; count: number; revenue: Money }>();
    const products = new Map<string, { label: string; quantity: number; revenue: Money; margin: Money }>();
    const staff = new Map<string, { revenue: Money; services: number; tips: Money; commissions: Money; appointments: number }>();
    const staffEntry = (id: string) => {
      if (!staff.has(id)) staff.set(id, { revenue: 0n, services: 0, tips: 0n, commissions: 0n, appointments: 0 });
      return staff.get(id)!;
    };
    let revenueServices = 0n;
    let revenueProducts = 0n;
    let discounts = 0n;
    let tips = 0n;
    let salesCount = 0;
    const clientsServed = new Set<string>();

    for (const sale of sales) {
      const lines = ownStaffId ? sale.items.filter((i) => i.staffId === ownStaffId) : sale.items;
      const saleTips = ownStaffId ? sale.tips.filter((t) => t.staffId === ownStaffId) : sale.tips;
      if (ownStaffId && lines.length === 0 && saleTips.length === 0) continue;
      salesCount += 1;
      if (sale.clientId) clientsServed.add(sale.clientId);
      if (!ownStaffId) {
        discounts += sale.discountTotal;
        for (const p of sale.payments) add(byMethod, p.method, p.amount);
      }
      const day = DateTime.fromJSDate(sale.closedAt!).setZone(zone).toISODate()!;
      for (const line of lines) {
        add(revenueByDay, day, line.lineTotal);
        if (line.type === 'SERVICE') {
          revenueServices += line.lineTotal;
          const key = line.serviceId ?? line.label;
          const entry = services.get(key) ?? { label: line.label, count: 0, revenue: 0n };
          entry.count += line.quantity;
          entry.revenue += line.lineTotal;
          services.set(key, entry);
        } else if (line.type === 'PRODUCT') {
          revenueProducts += line.lineTotal;
          const key = line.productId ?? line.label;
          const entry = products.get(key) ?? { label: line.label, quantity: 0, revenue: 0n, margin: 0n };
          entry.quantity += line.quantity;
          entry.revenue += line.lineTotal;
          entry.margin += line.lineTotal - (line.unitCost ?? 0n) * BigInt(line.quantity);
          products.set(key, entry);
        }
        if (line.staffId) {
          const s = staffEntry(line.staffId);
          s.revenue += line.lineTotal;
          if (line.type === 'SERVICE') s.services += line.quantity;
        }
      }
      for (const tip of saleTips) {
        tips += tip.amount;
        staffEntry(tip.staffId).tips += tip.amount;
      }
    }

    // Commissions de la période (annulations comprises, en négatif).
    const commissions = await this.db.tx.commissionEntry.findMany({
      where: {
        earnedAt: { gte: start, lt: end },
        saleItem: { sale: { salonId: salonFilter } },
        ...(ownStaffId ? { staffId: ownStaffId } : {}),
      },
      select: { staffId: true, amount: true },
    });
    for (const c of commissions) staffEntry(c.staffId).commissions += c.amount;

    const appointments = await this.db.tx.appointment.findMany({
      where: {
        salonId: salonFilter,
        startsAt: { gte: start, lt: end },
        ...(ownStaffId ? { items: { some: { staffId: ownStaffId } } } : {}),
      },
      select: { status: true, items: { select: { staffId: true } } },
    });
    const byStatus: Record<string, number> = {};
    for (const a of appointments) {
      byStatus[a.status] = (byStatus[a.status] ?? 0) + 1;
      if (a.status === 'COMPLETED') for (const staffId of new Set(a.items.map((i) => i.staffId))) staffEntry(staffId).appointments += 1;
    }
    const expectedToCome = appointments.length - (byStatus.CANCELLED_BY_SALON ?? 0) - (byStatus.CANCELLED_BY_CLIENT ?? 0);
    const noShowRate = expectedToCome > 0 ? Math.round(((byStatus.NO_SHOW ?? 0) / expectedToCome) * 1000) / 10 : 0;

    const staffNames = new Map(
      (await this.db.tx.staffMember.findMany({ where: { id: { in: [...staff.keys()] } }, select: { id: true, displayName: true } })).map((s) => [s.id, s.displayName]),
    );
    const revenue = revenueServices + revenueProducts - (ownStaffId ? 0n : discountsGlobal(sales));

    const report = {
      period: { from: query.from, to: query.to, timezone: zone, salonId: query.salonId ?? null },
      scope: ownStaffId ? 'own' : 'salon',
      sales: {
        count: salesCount,
        revenue,
        revenueServices,
        revenueProducts,
        discounts,
        tips,
        averageBasket: salesCount > 0 ? revenue / BigInt(salesCount) : 0n,
        byPaymentMethod: Object.fromEntries(byMethod),
        byDay: [...revenueByDay.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([date, amount]) => ({ date, amount })),
      },
      topServices: [...services.values()].sort((a, b) => Number(b.revenue - a.revenue)).slice(0, 10),
      topProducts: [...products.values()].sort((a, b) => Number(b.revenue - a.revenue)).slice(0, 10),
      staff: [...staff.entries()]
        .map(([id, s]) => ({ staffId: id, name: staffNames.get(id) ?? '—', ...s }))
        .sort((a, b) => Number(b.revenue - a.revenue)),
      appointments: { total: appointments.length, byStatus, noShowRate },
      clients: {
        served: clientsServed.size,
        ...(ownStaffId ? {} : { new: await this.db.tx.clientProfile.count({ where: { createdAt: { gte: start, lt: end }, deletedAt: null } }) }),
      },
      finance: seesFinance ? await this.finance(salonFilter, query.from, query.to, start, end, revenue) : null,
    };
    return report;
  }

  /** Tableau de bord du jour ; chaque bloc n'apparaît qu'avec la permission correspondante. */
  async dashboard(user: AuthUser, query: DashboardQueryDto) {
    assertSalonAccess(user, query.salonId);
    const salon = await this.db.tx.salon.findFirst({ where: { id: query.salonId, deletedAt: null }, select: { id: true, name: true, timezone: true, currency: true } });
    if (!salon) throw new NotFoundException('Salon introuvable.');
    const today = todayIn(salon.timezone);
    const { start, end } = localPeriodBounds(today, today, salon.timezone);
    const has = (code: string) => user.permissions.includes(code);
    const ownStaffId = has('appointments.read') ? null : has('appointments.read.own') ? await this.staffIdentity.ownStaffId(user) : null;

    const result: Record<string, unknown> = { salon, date: today };

    if (has('appointments.read') || ownStaffId) {
      const appointments = await this.db.tx.appointment.findMany({
        where: { salonId: salon.id, startsAt: { gte: start, lt: end }, ...(ownStaffId ? { items: { some: { staffId: ownStaffId } } } : {}) },
        select: {
          id: true,
          reference: true,
          status: true,
          startsAt: true,
          endsAt: true,
          client: { select: { id: true, fullName: true } },
          items: { select: { serviceName: true, staff: { select: { id: true, displayName: true, calendarColor: true } } }, orderBy: { position: 'asc' } },
        },
        orderBy: { startsAt: 'asc' },
      });
      const byStatus: Record<string, number> = {};
      for (const a of appointments) byStatus[a.status] = (byStatus[a.status] ?? 0) + 1;
      const now = new Date();
      result.appointments = {
        total: appointments.length,
        byStatus,
        upcoming: appointments.filter((a) => a.endsAt > now && ['CONFIRMED', 'CHECKED_IN', 'IN_PROGRESS', 'PENDING'].includes(a.status)).slice(0, 8),
      };
    }

    if (has('reports.read') || has('sales.create') || has('cash.read')) {
      const sales = await this.db.tx.sale.aggregate({
        where: { salonId: salon.id, status: 'PAID', closedAt: { gte: start, lt: end } },
        _sum: { total: true, tipTotal: true },
        _count: true,
      });
      result.sales = { count: sales._count, revenue: sales._sum.total ?? 0n, tips: sales._sum.tipTotal ?? 0n };
    }

    if (has('cash.read') || has('cash.session.open_close') || has('sales.create')) {
      const session = await this.db.tx.cashSession.findFirst({
        where: { status: 'OPEN', register: { salonId: salon.id } },
        select: { id: true, openedAt: true, openingFloat: true },
      });
      let expected: bigint | null = null;
      if (session) {
        const totals = await this.db.tx.ledgerEntry.aggregate({ where: { cashSessionId: session.id, account: 'CASH' }, _sum: { debit: true, credit: true } });
        expected = session.openingFloat + (totals._sum.debit ?? 0n) - (totals._sum.credit ?? 0n);
      }
      result.cash = session ? { status: 'OPEN', sessionId: session.id, openedAt: session.openedAt, expectedCash: expected } : { status: 'CLOSED' };
    }

    if (has('payments.validate')) {
      result.pendingPayments = await this.db.tx.payment.count({ where: { status: 'PENDING', sale: { salonId: salon.id } } });
    }

    if (has('stock.read')) {
      const stocks = await this.db.tx.productStock.findMany({
        where: { salonId: salon.id, alertThreshold: { not: null }, product: { deletedAt: null, isActive: true } },
        select: { quantity: true, alertThreshold: true, product: { select: { id: true, name: true } } },
      });
      const low = stocks.filter((s) => s.quantity.lte(s.alertThreshold!));
      result.lowStock = { count: low.length, items: low.slice(0, 5).map((s) => ({ ...s.product, quantity: s.quantity })) };
    }

    if (has('expenses.manage') || has('reports.finance.read')) {
      const expenses = await this.db.tx.expense.aggregate({
        where: { salonId: salon.id, deletedAt: null, spentAt: new Date(`${today}T00:00:00Z`) },
        _sum: { amount: true },
      });
      result.expensesToday = expenses._sum.amount ?? 0n;
    }

    if (has('commissions.read.own')) {
      const staffId = await this.staffIdentity.ownStaffId(user);
      if (staffId) {
        const monthStart = DateTime.now().setZone(salon.timezone).startOf('month').toJSDate();
        const own = await this.db.tx.commissionEntry.aggregate({ where: { staffId, earnedAt: { gte: monthStart } }, _sum: { amount: true } });
        result.myCommissionsThisMonth = own._sum.amount ?? 0n;
      }
    }
    return result;
  }

  private async finance(salonFilter: string | { in: string[] } | undefined, from: string, to: string, start: Date, end: Date, revenue: bigint) {
    // spent_at est une date (sans heure) : comparaison sur les jours, pas sur les instants.
    const expenses = await this.db.tx.expense.findMany({
      where: { salonId: salonFilter, deletedAt: null, spentAt: { gte: new Date(`${from}T00:00:00Z`), lte: new Date(`${to}T00:00:00Z`) } },
      select: { amount: true, category: { select: { name: true } } },
    });
    const byCategory = new Map<string, Money>();
    let total = 0n;
    for (const e of expenses) {
      total += e.amount;
      add(byCategory, e.category.name, e.amount);
    }
    const differences = await this.db.tx.cashSession.aggregate({
      where: { status: 'CLOSED', closedAt: { gte: start, lt: end }, register: { salonId: salonFilter } },
      _sum: { difference: true },
    });
    return {
      expenses: total,
      expensesByCategory: [...byCategory.entries()].map(([category, amount]) => ({ category, amount })).sort((a, b) => Number(b.amount - a.amount)),
      cashDifferences: differences._sum.difference ?? 0n,
      /** Résultat simplifié : chiffre d'affaires encaissé − dépenses (hors pourboires, hors stock). */
      net: revenue - total,
    };
  }

  private async zone(salonId?: string): Promise<string> {
    if (salonId) {
      const salon = await this.db.tx.salon.findFirst({ where: { id: salonId }, select: { timezone: true } });
      if (!salon) throw new NotFoundException('Salon introuvable.');
      return salon.timezone;
    }
    const tenant = await this.db.tx.tenant.findUniqueOrThrow({ where: { id: this.db.tenantId! }, select: { timezone: true } });
    return tenant.timezone;
  }
}

/** Remises globales (hors remises de ligne, déjà déduites des lignes). */
function discountsGlobal(sales: { total: bigint; items: { lineTotal: bigint }[] }[]): bigint {
  return sales.reduce((sum, s) => sum + (s.items.reduce((t, i) => t + i.lineTotal, 0n) - s.total), 0n);
}

