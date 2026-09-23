import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { AuditService } from '../../core/audit/audit.service';
import { AuthUser } from '../../core/auth/auth-user';
import { DbService } from '../../core/db/db.service';
import { toMoney } from '../../core/http/money';
import { assertSalonAccess, salonIdFilter } from '../../core/permissions/salon-scope';
import { LedgerLine, LedgerService } from '../../core/tenant/ledger.service';
import { CashMovementDto, CloseSessionDto, OpenSessionDto } from './dto/cash.dto';
import { OpenSessionService } from './open-session.service';

/**
 * Sessions de caisse : ouverture avec fond de caisse, mouvements, clôture avec comptage.
 * Le montant attendu en caisse se lit dans le registre (compte CASH de la session) : ventes,
 * annulations, dépenses et mouvements en espèces y sont tous inscrits, rien n'est recalculé
 * à la main.
 */
@Injectable()
export class CashService {
  constructor(
    private readonly db: DbService,
    private readonly ledger: LedgerService,
    private readonly openSessions: OpenSessionService,
    private readonly audit: AuditService,
  ) {}

  async current(user: AuthUser, salonId: string) {
    assertSalonAccess(user, salonId);
    const session = await this.openSessions.find(salonId);
    return session ? this.summary(session.id) : null;
  }

  async open(user: AuthUser, dto: OpenSessionDto) {
    assertSalonAccess(user, dto.salonId);
    const salon = await this.salon(dto.salonId);
    if (await this.openSessions.find(salon.id)) throw new ConflictException('La caisse de ce salon est déjà ouverte.');
    const register =
      (await this.db.tx.cashRegister.findFirst({ where: { salonId: salon.id, isActive: true }, orderBy: { createdAt: 'asc' } })) ??
      (await this.db.tx.cashRegister.create({ data: { tenantId: this.db.tenantId!, salonId: salon.id, name: 'Caisse principale' } }));
    const session = await this.db.tx.cashSession.create({
      data: { tenantId: this.db.tenantId!, registerId: register.id, openingFloat: toMoney(dto.openingFloat), openedBy: user.userId },
      select: { id: true },
    });
    await this.audit.log({ action: 'cash.open', entityType: 'cash_session', entityId: session.id, salonId: salon.id, after: { openingFloat: dto.openingFloat } });
    return this.summary(session.id);
  }

  async close(user: AuthUser, sessionId: string, dto: CloseSessionDto) {
    const session = await this.findSession(user, sessionId);
    if (session.status !== 'OPEN') throw new ConflictException('Cette caisse est déjà clôturée.');
    const pending = await this.db.tx.payment.count({ where: { status: 'PENDING', sale: { cashSessionId: sessionId } } });
    if (pending > 0) throw new ConflictException('Des paiements sont en attente de validation sur cette caisse.');

    const expected = await this.expectedCash(sessionId, session.openingFloat);
    const counted = toMoney(dto.countedCash);
    const difference = counted - expected;
    if (difference !== 0n && (!dto.differenceReason || dto.differenceReason.trim().length < 3)) {
      throw new BadRequestException(`Écart de ${difference} constaté : indiquez-en la raison.`);
    }
    if (difference !== 0n) {
      const lines: LedgerLine[] =
        difference > 0n
          ? [{ account: 'CASH', debit: difference }, { account: 'CASH_DIFFERENCE', credit: difference }]
          : [{ account: 'CASH_DIFFERENCE', debit: -difference }, { account: 'CASH', credit: -difference }];
      await this.ledger.post(lines, {
        salonId: session.register.salonId,
        currency: session.register.salon.currency,
        cashSessionId: sessionId,
        description: `Écart de caisse : ${dto.differenceReason}`,
      });
    }
    await this.db.tx.cashSession.update({
      where: { id: sessionId },
      data: {
        status: 'CLOSED',
        expectedCash: expected,
        countedCash: counted,
        difference,
        differenceReason: dto.differenceReason ?? null,
        closedBy: user.userId,
        closedAt: new Date(),
        version: { increment: 1 },
      },
    });
    await this.audit.log({
      action: 'cash.close',
      entityType: 'cash_session',
      entityId: sessionId,
      salonId: session.register.salonId,
      after: { expected: Number(expected), counted: Number(counted), difference: Number(difference) },
    });
    return this.summary(sessionId);
  }

  async movement(user: AuthUser, dto: CashMovementDto) {
    assertSalonAccess(user, dto.salonId);
    const salon = await this.salon(dto.salonId);
    const session = await this.openSessions.require(salon.id);
    const amount = toMoney(dto.amount);
    if (dto.type !== 'CASH_IN') {
      const available = await this.expectedCash(session.id, session.openingFloat);
      if (amount > available) throw new ConflictException(`Il n'y a que ${available} en caisse.`);
    }
    const movement = await this.db.tx.cashMovement.create({
      data: { tenantId: this.db.tenantId!, cashSessionId: session.id, type: dto.type, amount, reason: dto.reason, createdBy: user.userId },
      select: { id: true },
    });
    const lines: LedgerLine[] =
      dto.type === 'CASH_IN'
        ? [{ account: 'CASH', debit: amount }, { account: 'OWNER_EQUITY', credit: amount }]
        : dto.type === 'CASH_OUT'
          ? [{ account: 'OWNER_EQUITY', debit: amount }, { account: 'CASH', credit: amount }]
          : [{ account: 'BANK', debit: amount }, { account: 'CASH', credit: amount }];
    await this.ledger.post(lines, {
      salonId: salon.id,
      currency: salon.currency,
      cashSessionId: session.id,
      cashMovementId: movement.id,
      description: dto.reason,
    });
    await this.audit.log({ action: 'cash.movement', entityType: 'cash_movement', entityId: movement.id, salonId: salon.id, after: { type: dto.type, amount: dto.amount } });
    return this.summary(session.id);
  }

  async list(user: AuthUser, salonId?: string) {
    if (salonId) assertSalonAccess(user, salonId);
    const sessions = await this.db.tx.cashSession.findMany({
      where: { register: { salonId: salonId ?? salonIdFilter(user) } },
      select: {
        id: true,
        status: true,
        openingFloat: true,
        expectedCash: true,
        countedCash: true,
        difference: true,
        differenceReason: true,
        openedAt: true,
        closedAt: true,
        register: { select: { name: true, salonId: true } },
      },
      orderBy: { openedAt: 'desc' },
      take: 60,
    });
    return sessions;
  }

  async get(user: AuthUser, sessionId: string) {
    await this.findSession(user, sessionId);
    return this.summary(sessionId);
  }

  /** État d'une session : attendu en caisse et encaissements par moyen de paiement. */
  async summary(sessionId: string) {
    const session = await this.db.tx.cashSession.findFirstOrThrow({
      where: { id: sessionId },
      select: {
        id: true,
        status: true,
        openingFloat: true,
        expectedCash: true,
        countedCash: true,
        difference: true,
        differenceReason: true,
        openedAt: true,
        openedBy: true,
        closedAt: true,
        register: { select: { id: true, name: true, salonId: true } },
        movements: { select: { id: true, type: true, amount: true, reason: true, createdAt: true }, orderBy: { createdAt: 'asc' } },
      },
    });
    const sales = await this.db.tx.sale.findMany({
      where: { cashSessionId: sessionId },
      select: { status: true, total: true, tipTotal: true, payments: { select: { method: true, amount: true, status: true } } },
    });
    const byMethod: Record<string, bigint> = {};
    let salesCount = 0;
    let revenue = 0n;
    for (const sale of sales) {
      if (sale.status !== 'PAID') continue;
      salesCount += 1;
      revenue += sale.total;
      for (const p of sale.payments) {
        if (p.status === 'SUCCEEDED') byMethod[p.method] = (byMethod[p.method] ?? 0n) + p.amount;
      }
    }
    const expenses = await this.db.tx.expense.aggregate({ where: { cashSessionId: sessionId, deletedAt: null }, _sum: { amount: true } });
    const expected = session.status === 'OPEN' ? await this.expectedCash(sessionId, session.openingFloat) : session.expectedCash;
    return {
      ...session,
      salonId: session.register.salonId,
      expectedCash: expected,
      salesCount,
      revenue,
      paymentsByMethod: byMethod,
      cashExpenses: expenses._sum.amount ?? 0n,
    };
  }

  private async expectedCash(sessionId: string, openingFloat: bigint): Promise<bigint> {
    const totals = await this.db.tx.ledgerEntry.aggregate({
      where: { cashSessionId: sessionId, account: 'CASH' },
      _sum: { debit: true, credit: true },
    });
    return openingFloat + (totals._sum.debit ?? 0n) - (totals._sum.credit ?? 0n);
  }

  private async findSession(user: AuthUser, sessionId: string) {
    const session = await this.db.tx.cashSession.findFirst({
      where: { id: sessionId },
      select: { id: true, status: true, openingFloat: true, register: { select: { salonId: true, salon: { select: { currency: true } } } } },
    });
    if (!session) throw new NotFoundException('Session de caisse introuvable.');
    assertSalonAccess(user, session.register.salonId);
    return session;
  }

  private async salon(salonId: string) {
    const salon = await this.db.tx.salon.findFirst({ where: { id: salonId, deletedAt: null }, select: { id: true, currency: true } });
    if (!salon) throw new NotFoundException('Salon introuvable.');
    return salon;
  }
}
