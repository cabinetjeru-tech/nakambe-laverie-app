import { BadRequestException, Body, ConflictException, Controller, Get, Injectable, Module, NotFoundException, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { IsArray, IsBoolean, IsInt, IsOptional, IsString, IsUUID, Matches, MaxLength, Min, MinLength } from 'class-validator';
import { PartialType } from '@nestjs/swagger';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../../common/audit.service';
import { ClientIp, CurrentUser, RequirePermissions } from '../../common/decorators';
import { AuthUser } from '../../common/auth-user';
import { LoyaltyEngine } from '../core/engines';

class AdjustDto {
  @IsUUID() clientId: string;
  @IsInt() points: number;
  @IsString() @MinLength(3) @MaxLength(300) reason: string;
}
class PackageDto {
  @IsString() @Matches(/^[A-Z0-9-]{2,12}$/) code: string;
  @IsString() @MinLength(2) @MaxLength(100) name: string;
  @IsOptional() @IsString() @MaxLength(500) description?: string;
  @IsInt() @Min(0) price: number;
  @IsInt() @Min(1) durationDays: number;
  @IsInt() @Min(1) visits: number;
  @IsArray() @IsUUID('all', { each: true }) serviceIds: string[];
  @IsOptional() @IsBoolean() active?: boolean;
}
class UpdatePackageDto extends PartialType(PackageDto) {}
class UseDto {
  @IsOptional() @IsUUID() serviceId?: string;
  @IsOptional() @IsUUID() staffId?: string;
  @IsOptional() @IsString() @MaxLength(300) notes?: string;
}

@Injectable()
export class LoyaltyService {
  constructor(private prisma: PrismaService, private audit: AuditService, private engine: LoyaltyEngine) {}

  async overview() {
    const [rules, top, recent, totals] = await Promise.all([
      this.engine.rules(),
      this.prisma.client.findMany({ where: { active: true, loyaltyPoints: { gt: 0 } }, orderBy: { loyaltyPoints: 'desc' }, take: 20, select: { id: true, code: true, firstName: true, lastName: true, phone: true, loyaltyPoints: true } }),
      this.prisma.loyaltyTransaction.findMany({ orderBy: { createdAt: 'desc' }, take: 50, include: { client: { select: { firstName: true, lastName: true, code: true } } } }),
      this.prisma.loyaltyTransaction.groupBy({ by: ['type'], _sum: { points: true } }),
    ]);
    const outstanding = await this.prisma.client.aggregate({ _sum: { loyaltyPoints: true } });
    return { rules, top, recent, totals: totals.map((t) => ({ type: t.type, points: t._sum.points ?? 0 })), outstandingPoints: outstanding._sum.loyaltyPoints ?? 0, outstandingValue: (outstanding._sum.loyaltyPoints ?? 0) * rules.pointValue };
  }

  async adjust(dto: AdjustDto, user: AuthUser, ip?: string) {
    if (dto.points === 0) throw new BadRequestException('Nombre de points nul');
    return this.prisma.tx(async (tx) => {
      await this.engine.add(tx, dto.clientId, 'ADJUST', dto.points, dto.reason, undefined, user.id);
      await this.audit.log({ userId: user.id, action: 'LOYALTY_ADJUST', entity: 'Client', entityId: dto.clientId, summary: `Ajustement fidélité ${dto.points > 0 ? '+' : ''}${dto.points} pts — ${dto.reason}`, ip }, tx);
      return tx.client.findUniqueOrThrow({ where: { id: dto.clientId }, select: { id: true, loyaltyPoints: true } });
    });
  }

  packages(all?: boolean) {
    return this.prisma.loyaltyPackage.findMany({ where: all ? {} : { active: true }, orderBy: { price: 'asc' }, include: { _count: { select: { subscriptions: true } } } });
  }
  async createPackage(dto: PackageDto, user: AuthUser, ip?: string) {
    if (await this.prisma.loyaltyPackage.findUnique({ where: { code: dto.code } })) throw new ConflictException('Code déjà utilisé');
    const p = await this.prisma.loyaltyPackage.create({ data: dto });
    await this.audit.log({ userId: user.id, action: 'CREATE', entity: 'LoyaltyPackage', entityId: p.id, summary: `Forfait ${p.name}`, after: p, ip });
    return p;
  }
  async updatePackage(id: string, dto: UpdatePackageDto, user: AuthUser, ip?: string) {
    const before = await this.prisma.loyaltyPackage.findUnique({ where: { id } });
    if (!before) throw new NotFoundException('Forfait introuvable');
    const p = await this.prisma.loyaltyPackage.update({ where: { id }, data: dto });
    await this.audit.log({ userId: user.id, action: 'UPDATE', entity: 'LoyaltyPackage', entityId: id, summary: `Forfait ${p.name}`, before, after: p, ip });
    return p;
  }

  async subscriptions(q: { clientId?: string; status?: string }) {
    // Expiration automatique à la lecture
    await this.prisma.clientSubscription.updateMany({ where: { status: 'ACTIVE', endDate: { lt: new Date(new Date().toISOString().slice(0, 10)) } }, data: { status: 'EXPIRED' } });
    return this.prisma.clientSubscription.findMany({
      where: { ...(q.clientId ? { clientId: q.clientId } : {}), ...(q.status ? { status: q.status } : {}) },
      orderBy: { createdAt: 'desc' }, take: 500,
      include: { client: { select: { id: true, code: true, firstName: true, lastName: true, phone: true } }, package: true, usages: { orderBy: { usedAt: 'desc' } } },
    });
  }

  async use(id: string, dto: UseDto, user: AuthUser, ip?: string) {
    return this.prisma.tx(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "ClientSubscription" WHERE id = ${id} FOR UPDATE`;
      const s = await tx.clientSubscription.findUnique({ where: { id }, include: { package: true } });
      if (!s) throw new NotFoundException('Abonnement introuvable');
      if (s.status !== 'ACTIVE') throw new BadRequestException('Abonnement inactif ou expiré');
      if (s.endDate < new Date(new Date().toISOString().slice(0, 10))) throw new BadRequestException('Abonnement expiré');
      if (s.visitsUsed >= s.visitsTotal) throw new BadRequestException('Tous les passages ont été utilisés');
      if (dto.serviceId && s.package.serviceIds.length && !s.package.serviceIds.includes(dto.serviceId)) throw new BadRequestException("Cette prestation n'est pas couverte par le forfait");
      await tx.subscriptionUsage.create({ data: { subscriptionId: id, serviceId: dto.serviceId, staffId: dto.staffId, notes: dto.notes, userId: user.id } });
      const updated = await tx.clientSubscription.update({ where: { id }, data: { visitsUsed: { increment: 1 } } });
      await this.audit.log({ userId: user.id, action: 'SUBSCRIPTION_USE', entity: 'ClientSubscription', entityId: id, summary: `Passage forfait ${s.package.name} (${updated.visitsUsed}/${s.visitsTotal})`, ip }, tx);
      return updated;
    });
  }
}

@Controller('loyalty')
export class LoyaltyController {
  constructor(private s: LoyaltyService) {}
  @Get() @RequirePermissions('loyalty.view') overview() { return this.s.overview(); }
  @Post('adjust') @RequirePermissions('loyalty.manage') adjust(@Body() dto: AdjustDto, @CurrentUser() u: AuthUser, @ClientIp() ip: string) { return this.s.adjust(dto, u, ip); }
  @Get('packages') @RequirePermissions('loyalty.view', 'sales.create') packages(@Query('all') all?: string) { return this.s.packages(all === 'true'); }
  @Post('packages') @RequirePermissions('loyalty.manage') createPackage(@Body() dto: PackageDto, @CurrentUser() u: AuthUser, @ClientIp() ip: string) { return this.s.createPackage(dto, u, ip); }
  @Patch('packages/:id') @RequirePermissions('loyalty.manage') updatePackage(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdatePackageDto, @CurrentUser() u: AuthUser, @ClientIp() ip: string) { return this.s.updatePackage(id, dto, u, ip); }
  @Get('subscriptions') @RequirePermissions('loyalty.view') subscriptions(@Query() q: { clientId?: string; status?: string }) { return this.s.subscriptions(q); }
  @Post('subscriptions/:id/use') @RequirePermissions('loyalty.manage', 'sales.create') use(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UseDto, @CurrentUser() u: AuthUser, @ClientIp() ip: string) { return this.s.use(id, dto, u, ip); }
}

@Module({ controllers: [LoyaltyController], providers: [LoyaltyService] })
export class LoyaltyModule {}
