import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, TenantStatus } from '@prisma/client';
import { PlatformDbService } from '../../core/platform/platform-db.service';
import { OWNER_ROLE_CODE } from '../../core/permissions/catalog';
import { BillingEngine } from '../billing/billing-engine.service';
import { platformAudit } from './platform-audit';

const DAY_MS = 86_400_000;

/**
 * Super administrateur — Salons (entreprises clientes de la plateforme).
 * La fiche montre l'identité, l'abonnement et des INDICATEURS d'activité (volumes) : jamais
 * le contenu métier d'un salon (clients, notes, ventes détaillées). Le support qui a besoin
 * d'aller plus loin passe par un accès délégué accordé par le propriétaire du salon.
 */
@Injectable()
export class PlatformTenantsService {
  constructor(
    private readonly platform: PlatformDbService,
    private readonly engine: BillingEngine,
  ) {}

  async list(filter: { search?: string; status?: TenantStatus; plan?: string }) {
    const where: Prisma.TenantWhereInput = {};
    if (filter.status) where.status = filter.status;
    if (filter.plan) where.plan = { code: filter.plan };
    if (filter.search) {
      const q = filter.search.trim();
      where.OR = [
        { displayName: { contains: q, mode: 'insensitive' } },
        { legalName: { contains: q, mode: 'insensitive' } },
        { slug: { contains: q, mode: 'insensitive' } },
        { memberships: { some: { user: { phone: { contains: q.replace(/\s/g, '') } } } } },
      ];
    }
    const tenants = await this.platform.client.tenant.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: 300,
      select: {
        id: true,
        slug: true,
        displayName: true,
        status: true,
        createdAt: true,
        trialEndsAt: true,
        graceEndsAt: true,
        suspendedAt: true,
        plan: { select: { code: true, name: true } },
        subscriptions: { select: { status: true, cycle: true, currentPeriodEnd: true, cancelAtPeriodEnd: true } },
        saasInvoices: { where: { status: 'OPEN' }, select: { total: true } },
        _count: { select: { salons: { where: { deletedAt: null } }, memberships: { where: { status: 'ACTIVE' } } } },
        memberships: {
          where: { status: 'ACTIVE', roles: { some: { role: { code: OWNER_ROLE_CODE, isSystem: true } } } },
          take: 1,
          select: { user: { select: { id: true, fullName: true, phone: true } } },
        },
      },
    });
    return tenants.map(({ subscriptions, memberships, saasInvoices, _count, ...tenant }) => ({
      ...tenant,
      subscription: subscriptions[0] ?? null,
      amountDue: saasInvoices.reduce((sum, invoice) => sum + invoice.total, 0n),
      salonsCount: _count.salons,
      membersCount: _count.memberships,
      owner: memberships[0]?.user ?? null,
    }));
  }

  async detail(tenantId: string) {
    const db = this.platform.client;
    const since = new Date(Date.now() - 30 * DAY_MS);
    const tenant = await db.tenant.findUnique({
      where: { id: tenantId },
      select: {
        id: true,
        slug: true,
        legalName: true,
        displayName: true,
        countryCode: true,
        currency: true,
        timezone: true,
        taxId: true,
        tradeRegister: true,
        status: true,
        createdAt: true,
        trialEndsAt: true,
        graceEndsAt: true,
        suspendedAt: true,
        suspensionReason: true,
        cancelledAt: true,
        plan: { select: { code: true, name: true, maxSalons: true, maxStaff: true } },
        salons: { where: { deletedAt: null }, select: { id: true, name: true, city: true, createdAt: true } },
      },
    });
    if (!tenant) throw new NotFoundException('Salon introuvable.');
    const [subscription, invoices, payments, members, staff, clients, appointments30d, sales30d, lastActivity, audit, tickets] = await Promise.all([
      db.saasSubscription.findUnique({ where: { tenantId }, include: { plan: { select: { code: true, name: true } }, pendingPlan: { select: { code: true, name: true } } } }),
      db.saasInvoice.findMany({
        where: { tenantId },
        orderBy: { createdAt: 'desc' },
        take: 24,
        select: { id: true, number: true, kind: true, description: true, status: true, total: true, currency: true, dueAt: true, paidAt: true },
      }),
      db.saasPayment.findMany({
        where: { tenantId },
        orderBy: { createdAt: 'desc' },
        take: 24,
        select: { id: true, method: true, status: true, amount: true, currency: true, providerReference: true, failureReason: true, paidAt: true, createdAt: true, invoice: { select: { number: true } } },
      }),
      db.membership.findMany({
        where: { tenantId },
        orderBy: { joinedAt: 'asc' },
        select: {
          id: true,
          status: true,
          joinedAt: true,
          user: { select: { id: true, fullName: true, phone: true, email: true, status: true, lastLoginAt: true } },
          roles: { select: { role: { select: { name: true, code: true } } } },
        },
      }),
      db.staffMember.count({ where: { tenantId, isActive: true } }),
      db.clientProfile.count({ where: { tenantId } }),
      db.appointment.count({ where: { tenantId, startsAt: { gte: since } } }),
      db.sale.count({ where: { tenantId, createdAt: { gte: since }, status: 'PAID' } }),
      db.user.aggregate({ where: { memberships: { some: { tenantId } } }, _max: { lastLoginAt: true } }),
      db.auditLog.findMany({
        where: { tenantId, action: { startsWith: 'platform.' } },
        orderBy: { createdAt: 'desc' },
        take: 30,
        select: { id: true, action: true, after: true, createdAt: true, actorUserId: true },
      }),
      db.supportTicket.findMany({
        where: { tenantId },
        orderBy: { lastMessageAt: 'desc' },
        take: 10,
        select: { id: true, number: true, subject: true, status: true, priority: true, lastMessageAt: true },
      }),
    ]);
    return {
      ...tenant,
      subscription,
      invoices,
      payments,
      members: members.map(({ roles, ...member }) => ({ ...member, roles: roles.map((r) => r.role.name) })),
      activity: {
        staff,
        clients,
        appointments30d,
        sales30d,
        lastLoginAt: lastActivity._max.lastLoginAt,
      },
      platformActions: audit,
      tickets,
    };
  }

  async extendTrial(actorUserId: string, tenantId: string, days: number) {
    const end = await this.engine.extendTrial(tenantId, days, new Date());
    await this.log(actorUserId, tenantId, 'platform.trial_extended', { days, until: end.toISOString() });
    return { trialEndsAt: end };
  }

  async suspend(actorUserId: string, tenantId: string, reason: string) {
    await this.engine.suspendManually(tenantId, reason, new Date());
    await this.log(actorUserId, tenantId, 'platform.tenant_suspended', { reason });
  }

  async reactivate(actorUserId: string, tenantId: string) {
    const status = await this.engine.reactivateManually(tenantId, new Date());
    await this.log(actorUserId, tenantId, 'platform.tenant_reactivated', { status });
    return { status };
  }

  private log(actorUserId: string, tenantId: string, action: string, after: Prisma.InputJsonValue) {
    return this.platform.transaction((tx) => platformAudit(tx, { tenantId, actorUserId, action, entityType: 'tenant', entityId: tenantId, after }));
  }
}
