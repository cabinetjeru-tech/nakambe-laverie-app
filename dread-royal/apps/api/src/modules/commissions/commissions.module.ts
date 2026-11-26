import { BadRequestException, Body, Controller, ForbiddenException, Get, Injectable, Module, Post, Query } from '@nestjs/common';
import { PaymentMethod, Prisma } from '@prisma/client';
import { IsArray, IsDateString, IsEnum, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';
import { formatFCFA, hasPermission } from '@dread-royal/shared';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../../common/audit.service';
import { ClientIp, CurrentUser, RequirePermissions } from '../../common/decorators';
import { AuthUser } from '../../common/auth-user';
import { nextNumber } from '../../common/numbering';
import { addDays, resolvePeriod, startOfDay } from '../../common/period';
import { FinanceService } from '../finance/finance.service';
import { FinanceModule } from '../finance/finance.module';

class PayoutDto {
  @IsUUID() staffId: string;
  @IsEnum(PaymentMethod) method: PaymentMethod;
  /** Commissions dues gagnées jusqu'à cette date incluse (défaut : toutes) */
  @IsOptional() @IsDateString() upTo?: string;
  @IsOptional() @IsArray() @IsUUID('all', { each: true }) commissionIds?: string[];
  @IsOptional() @IsString() @MaxLength(300) notes?: string;
}

@Injectable()
export class CommissionsService {
  constructor(private prisma: PrismaService, private audit: AuditService, private finance: FinanceService) {}

  private staffScope(user: AuthUser, staffId?: string) {
    if (hasPermission(user.permissions, 'commissions.view_all')) return staffId;
    if (!user.staffId) throw new ForbiddenException("Votre compte n'est lié à aucune fiche personnel");
    return user.staffId;
  }

  async list(q: { staffId?: string; status?: string; from?: string; to?: string }, user: AuthUser) {
    const staffId = this.staffScope(user, q.staffId);
    const where: Prisma.CommissionWhereInput = {};
    if (staffId) where.staffId = staffId;
    if (q.status) where.status = { in: q.status.split(',') as any };
    if (q.from || q.to) where.createdAt = { ...(q.from && { gte: new Date(q.from) }), ...(q.to && { lt: addDays(new Date(q.to), 1) }) };
    return this.prisma.commission.findMany({
      where, orderBy: { createdAt: 'desc' }, take: 1000,
      include: { staff: { select: { firstName: true, lastName: true } }, saleItem: { select: { label: true, total: true, sale: { select: { id: true, number: true, saleDate: true, paymentStatus: true, client: { select: { firstName: true, lastName: true } } } } } } },
    });
  }

  /** Totaux journaliers, hebdomadaires, mensuels (commissions acquises = DUE ou PAID, par date d'acquisition) + solde dû. */
  async summary(user: AuthUser, date?: string) {
    const scoped = hasPermission(user.permissions, 'commissions.view_all') ? undefined : this.staffScope(user);
    const staff = await this.prisma.staff.findMany({ where: { ...(scoped ? { id: scoped } : { isStylist: true }) }, orderBy: { firstName: 'asc' } });
    const periods = { day: resolvePeriod({ period: 'day', date }), week: resolvePeriod({ period: 'week', date }), month: resolvePeriod({ period: 'month', date }) };
    const out = [];
    for (const s of staff) {
      const sumFor = async (from: Date, to: Date) =>
        (await this.prisma.commission.aggregate({ where: { staffId: s.id, status: { in: ['DUE', 'PAID'] }, earnedAt: { gte: from, lt: to } }, _sum: { amount: true } }))._sum.amount ?? 0;
      const [day, week, month, due, pending, services] = await Promise.all([
        sumFor(periods.day.from, periods.day.to), sumFor(periods.week.from, periods.week.to), sumFor(periods.month.from, periods.month.to),
        this.prisma.commission.aggregate({ where: { staffId: s.id, status: 'DUE' }, _sum: { amount: true } }),
        this.prisma.commission.aggregate({ where: { staffId: s.id, status: 'PENDING' }, _sum: { amount: true } }),
        this.prisma.saleItem.count({ where: { staffId: s.id, type: 'SERVICE', sale: { status: 'VALIDATED', saleDate: { gte: periods.month.from, lt: periods.month.to } } } }),
      ]);
      out.push({ staffId: s.id, name: `${s.firstName} ${s.lastName}`, position: s.position, mode: s.commissionMode, day, week, month, due: due._sum.amount ?? 0, pending: pending._sum.amount ?? 0, servicesThisMonth: services });
    }
    return { date: periods.day.from, staff: out };
  }

  payouts(user: AuthUser, staffId?: string) {
    const sid = this.staffScope(user, staffId);
    return this.prisma.commissionPayout.findMany({ where: sid ? { staffId: sid } : {}, orderBy: { createdAt: 'desc' }, take: 300, include: { staff: { select: { firstName: true, lastName: true } }, _count: { select: { commissions: true } } } });
  }

  /** Règlement : marque les commissions dues comme payées et génère la dépense « Commissions ». */
  async payout(dto: PayoutDto, user: AuthUser, ip?: string) {
    return this.prisma.tx(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${'payout:' + dto.staffId}))`;
      const staff = await tx.staff.findUnique({ where: { id: dto.staffId } });
      if (!staff) throw new BadRequestException('Collaborateur inconnu');
      const where: Prisma.CommissionWhereInput = { staffId: dto.staffId, status: 'DUE' };
      if (dto.commissionIds?.length) where.id = { in: dto.commissionIds };
      if (dto.upTo) where.earnedAt = { lt: addDays(startOfDay(new Date(dto.upTo)), 1) };
      const items = await tx.commission.findMany({ where });
      const amount = items.reduce((s, c) => s + c.amount, 0);
      if (items.length === 0 || amount <= 0) throw new BadRequestException('Aucune commission due à régler');
      const cat = await tx.expenseCategory.findUnique({ where: { code: 'COMMISSIONS' } });
      if (!cat) throw new BadRequestException('Catégorie de dépense « Commissions » manquante');
      const number = await nextNumber(tx, 'COM', 4);
      const earned = items.map((c) => c.earnedAt!.getTime());
      const expense = await this.finance.createExpense(
        { categoryId: cat.id, label: `Commissions ${staff.firstName} ${staff.lastName} (${number})`, amount, expenseDate: new Date().toISOString().slice(0, 10), paidAmount: amount, method: dto.method, notes: dto.notes },
        user, ip, tx, 'COMMISSION_PAYOUT',
      );
      const payout = await tx.commissionPayout.create({
        data: { number, staffId: dto.staffId, amount, method: dto.method, periodFrom: new Date(Math.min(...earned)), periodTo: new Date(Math.max(...earned)), expenseId: expense.id, paidById: user.id, notes: dto.notes },
      });
      await tx.commission.updateMany({ where: { id: { in: items.map((c) => c.id) } }, data: { status: 'PAID', payoutId: payout.id } });
      await this.audit.log({ userId: user.id, action: 'COMMISSION_PAYOUT', entity: 'Staff', entityId: dto.staffId, summary: `Règlement ${number} : ${formatFCFA(amount)} à ${staff.firstName} ${staff.lastName} (${items.length} commissions)`, after: payout, ip }, tx);
      return payout;
    });
  }
}

@Controller('commissions')
export class CommissionsController {
  constructor(private s: CommissionsService) {}
  @Get() @RequirePermissions('commissions.view_all', 'commissions.view_own')
  list(@Query() q: { staffId?: string; status?: string; from?: string; to?: string }, @CurrentUser() u: AuthUser) { return this.s.list(q, u); }
  @Get('summary') @RequirePermissions('commissions.view_all', 'commissions.view_own')
  summary(@CurrentUser() u: AuthUser, @Query('date') date?: string) { return this.s.summary(u, date); }
  @Get('payouts') @RequirePermissions('commissions.view_all', 'commissions.view_own')
  payouts(@CurrentUser() u: AuthUser, @Query('staffId') staffId?: string) { return this.s.payouts(u, staffId); }
  @Post('payouts') @RequirePermissions('commissions.pay')
  payout(@Body() dto: PayoutDto, @CurrentUser() u: AuthUser, @ClientIp() ip: string) { return this.s.payout(dto, u, ip); }
}

@Module({ imports: [FinanceModule], controllers: [CommissionsController], providers: [CommissionsService] })
export class CommissionsModule {}
