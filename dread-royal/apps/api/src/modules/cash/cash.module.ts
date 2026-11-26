import { BadRequestException, Body, Controller, Get, Injectable, Module, NotFoundException, Param, ParseUUIDPipe, Post, Query } from '@nestjs/common';
import { CashMovementType } from '@prisma/client';
import { IsEnum, IsInt, IsOptional, IsString, MaxLength, Min, MinLength } from 'class-validator';
import { formatFCFA } from '@dread-royal/shared';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../../common/audit.service';
import { ClientIp, CurrentUser, RequirePermissions } from '../../common/decorators';
import { AuthUser } from '../../common/auth-user';
import { nextNumber } from '../../common/numbering';
import { CashEngine } from '../core/engines';

class OpenDto {
  @IsInt() @Min(0) openingAmount: number;
  @IsOptional() @IsString() @MaxLength(500) notes?: string;
}
class MovementDto {
  @IsEnum(CashMovementType) type: CashMovementType;
  @IsInt() @Min(1) amount: number;
  @IsString() @MinLength(3) @MaxLength(200) label: string;
}
class CloseDto {
  @IsInt() @Min(0) countedAmount: number;
  @IsOptional() @IsString() @MaxLength(500) differenceReason?: string;
  @IsOptional() @IsString() @MaxLength(500) notes?: string;
}

@Injectable()
export class CashService {
  constructor(private prisma: PrismaService, private audit: AuditService, private engine: CashEngine) {}

  private async enrich(sessionId: string) {
    const s = await this.prisma.cashSession.findUnique({ where: { id: sessionId }, include: { movements: { orderBy: { createdAt: 'asc' } } } });
    if (!s) throw new NotFoundException('Session de caisse introuvable');
    const totalIn = s.movements.filter((m) => m.type === 'IN').reduce((a, m) => a + m.amount, 0);
    const totalOut = s.movements.filter((m) => m.type === 'OUT').reduce((a, m) => a + m.amount, 0);
    const users = await this.prisma.user.findMany({ where: { id: { in: [s.openedById, s.closedById ?? '', ...s.movements.map((m) => m.userId)] } }, select: { id: true, fullName: true } });
    const name = (id?: string | null) => users.find((u) => u.id === id)?.fullName ?? '';
    // Ventilation des encaissements de la session par moyen (pour information : seules les espèces sont en caisse)
    const byMethod = await this.prisma.payment.groupBy({ by: ['method', 'kind'], where: { paidAt: { gte: s.openedAt, ...(s.closedAt ? { lte: s.closedAt } : {}) } }, _sum: { amount: true } });
    return {
      ...s, openedByName: name(s.openedById), closedByName: name(s.closedById),
      movements: s.movements.map((m) => ({ ...m, userName: name(m.userId) })),
      totalIn, totalOut, theoretical: s.openingAmount + totalIn - totalOut,
      paymentsByMethod: byMethod.map((b) => ({ method: b.method, kind: b.kind, amount: b._sum.amount ?? 0 })),
    };
  }

  async current() {
    const s = await this.prisma.cashSession.findFirst({ where: { status: 'OPEN' } });
    return s ? this.enrich(s.id) : null;
  }

  list() {
    return this.prisma.cashSession.findMany({ orderBy: { openedAt: 'desc' }, take: 200 });
  }

  get(id: string) {
    return this.enrich(id);
  }

  async open(dto: OpenDto, user: AuthUser, ip?: string) {
    return this.prisma.tx(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('cash-session'))`;
      if (await tx.cashSession.findFirst({ where: { status: 'OPEN' } })) throw new BadRequestException('Une session de caisse est déjà ouverte');
      const last = await tx.cashSession.findFirst({ where: { status: 'CLOSED' }, orderBy: { closedAt: 'desc' } });
      const number = await nextNumber(tx, 'CAI', 4);
      const s = await tx.cashSession.create({ data: { number, openingAmount: dto.openingAmount, openedById: user.id, notes: dto.notes } });
      const gap = last?.countedAmount != null && last.countedAmount !== dto.openingAmount ? ` (attention : clôture précédente ${formatFCFA(last.countedAmount)})` : '';
      await this.audit.log({ userId: user.id, action: 'CASH_OPEN', entity: 'CashSession', entityId: s.id, summary: `Ouverture caisse ${number} avec ${formatFCFA(dto.openingAmount)}${gap}`, after: s, ip }, tx);
      return s;
    });
  }

  async movement(dto: MovementDto, user: AuthUser, ip?: string) {
    return this.prisma.tx(async (tx) => {
      const m = await this.engine.record(tx, { type: dto.type, source: 'MANUAL', amount: dto.amount, label: dto.label, userId: user.id });
      await this.audit.log({ userId: user.id, action: 'CASH_MOVEMENT', entity: 'CashSession', entityId: m.sessionId, summary: `${dto.type === 'IN' ? 'Entrée' : 'Sortie'} manuelle ${formatFCFA(dto.amount)} — ${dto.label}`, after: m, ip }, tx);
      return m;
    });
  }

  async close(dto: CloseDto, user: AuthUser, ip?: string) {
    return this.prisma.tx(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('cash-session'))`;
      const s = await tx.cashSession.findFirst({ where: { status: 'OPEN' } });
      if (!s) throw new BadRequestException('Aucune session de caisse ouverte');
      const expected = await this.engine.expected(tx, s.id, s.openingAmount);
      const difference = dto.countedAmount - expected;
      if (difference !== 0 && !dto.differenceReason?.trim()) {
        throw new BadRequestException(`Écart de caisse de ${formatFCFA(difference)} : la justification est obligatoire`);
      }
      const closed = await tx.cashSession.update({
        where: { id: s.id },
        data: { status: 'CLOSED', closedAt: new Date(), closedById: user.id, expectedAmount: expected, countedAmount: dto.countedAmount, difference, differenceReason: dto.differenceReason, notes: dto.notes ?? s.notes },
      });
      await this.audit.log({ userId: user.id, action: 'CASH_CLOSE', entity: 'CashSession', entityId: s.id, summary: `Clôture ${s.number} : théorique ${formatFCFA(expected)}, réel ${formatFCFA(dto.countedAmount)}, écart ${formatFCFA(difference)}`, after: closed, ip }, tx);
      return closed;
    });
  }
}

@Controller('cash')
@RequirePermissions('cash.manage', 'finance.view')
export class CashController {
  constructor(private s: CashService) {}
  @Get('current') current() { return this.s.current(); }
  @Get('sessions') list() { return this.s.list(); }
  @Get('sessions/:id') get(@Param('id', ParseUUIDPipe) id: string) { return this.s.get(id); }
  @Post('open') @RequirePermissions('cash.manage') open(@Body() dto: OpenDto, @CurrentUser() u: AuthUser, @ClientIp() ip: string) { return this.s.open(dto, u, ip); }
  @Post('movements') @RequirePermissions('cash.manage') movement(@Body() dto: MovementDto, @CurrentUser() u: AuthUser, @ClientIp() ip: string) { return this.s.movement(dto, u, ip); }
  @Post('close') @RequirePermissions('cash.manage') close(@Body() dto: CloseDto, @CurrentUser() u: AuthUser, @ClientIp() ip: string) { return this.s.close(dto, u, ip); }
}

@Module({ controllers: [CashController], providers: [CashService] })
export class CashModule {}
