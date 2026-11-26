import { Body, ConflictException, Controller, ForbiddenException, Get, Injectable, Module, NotFoundException, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { Gender, Prisma } from '@prisma/client';
import { IsBoolean, IsDateString, IsEnum, IsOptional, IsString, Matches, MaxLength, MinLength } from 'class-validator';
import { hasPermission } from '@dread-royal/shared';
import { PrismaService, Tx } from '../../prisma/prisma.service';
import { AuditService } from '../../common/audit.service';
import { ClientIp, CurrentUser, RequirePermissions } from '../../common/decorators';
import { AuthUser } from '../../common/auth-user';
import { nextCode } from '../../common/numbering';
import { PageQuery, paginate } from '../../common/pagination';

const PHONE = /^\+?[0-9 ]{8,16}$/;

export class CreateClientDto {
  @IsString() @MinLength(1) @MaxLength(60) firstName: string;
  @IsString() @MinLength(1) @MaxLength(60) lastName: string;
  @IsOptional() @Matches(PHONE, { message: 'Numéro de téléphone invalide (ex : 70 12 34 56)' }) phone?: string;
  @IsOptional() @Matches(PHONE, { message: 'Numéro de téléphone invalide' }) phone2?: string;
  @IsEnum(Gender) gender: Gender;
  @IsOptional() @IsDateString() birthDate?: string;
  @IsOptional() @IsString() @MaxLength(500) preferences?: string;
  @IsOptional() @IsString() @MaxLength(1000) notes?: string;
}
class UpdateClientDto {
  @IsOptional() @IsString() @MinLength(1) @MaxLength(60) firstName?: string;
  @IsOptional() @IsString() @MinLength(1) @MaxLength(60) lastName?: string;
  @IsOptional() @Matches(PHONE, { message: 'Numéro de téléphone invalide' }) phone?: string;
  @IsOptional() @Matches(PHONE, { message: 'Numéro de téléphone invalide' }) phone2?: string;
  @IsOptional() @IsEnum(Gender) gender?: Gender;
  @IsOptional() @IsDateString() birthDate?: string | null;
  @IsOptional() @IsString() @MaxLength(500) preferences?: string;
  @IsOptional() @IsString() @MaxLength(1000) notes?: string;
  @IsOptional() @IsBoolean() active?: boolean;
}
class ClientQuery extends PageQuery {
  @IsOptional() @IsString() gender?: string;
  @IsOptional() @IsString() includeInactive?: string;
}

/** Normalise un numéro burkinabè : espaces supprimés, +226 retiré. */
export function normalizePhone(p?: string | null) {
  if (!p) return null;
  let s = p.replace(/\s+/g, '');
  if (s.startsWith('+226')) s = s.slice(4);
  else if (s.startsWith('00226')) s = s.slice(5);
  return s;
}

@Injectable()
export class ClientsService {
  constructor(private prisma: PrismaService, private audit: AuditService) {}

  /** Restriction coiffeur : uniquement les clients qu'il a servis ou qui ont RDV avec lui. */
  scope(user: AuthUser): Prisma.ClientWhereInput {
    if (hasPermission(user.permissions, 'clients.view')) return {};
    if (!user.staffId) return { id: '00000000-0000-0000-0000-000000000000' };
    return { OR: [{ appointments: { some: { staffId: user.staffId } } }, { sales: { some: { items: { some: { staffId: user.staffId } } } } }] };
  }

  async list(q: ClientQuery, user: AuthUser) {
    const { skip, take, page, pageSize } = paginate(q);
    const and: Prisma.ClientWhereInput[] = [this.scope(user)];
    if (q.includeInactive !== 'true') and.push({ active: true });
    if (q.gender) and.push({ gender: q.gender as Gender });
    if (q.search?.trim()) {
      const terms = q.search.trim().split(/\s+/);
      const phone = normalizePhone(q.search);
      and.push({
        OR: [
          { phone: { contains: phone ?? '' } },
          { code: { contains: q.search.trim(), mode: 'insensitive' } },
          { AND: terms.map((t) => ({ OR: [{ firstName: { contains: t, mode: 'insensitive' as const } }, { lastName: { contains: t, mode: 'insensitive' as const } }] })) },
        ],
      });
    }
    const where = { AND: and };
    const [items, total] = await Promise.all([
      this.prisma.client.findMany({ where, skip, take, orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }] }),
      this.prisma.client.count({ where }),
    ]);
    return { items, total, page, pageSize };
  }

  async create(dto: CreateClientDto, user: AuthUser, ip?: string, tx?: Tx) {
    const run = async (t: Tx) => {
      const phone = normalizePhone(dto.phone);
      if (phone) {
        const dup = await t.client.findFirst({ where: { phone, active: true } });
        if (dup) throw new ConflictException(`Ce numéro appartient déjà au client ${dup.firstName} ${dup.lastName} (${dup.code})`);
      }
      const code = await nextCode(t, 'CL');
      const client = await t.client.create({
        data: { ...dto, phone, phone2: normalizePhone(dto.phone2), code, firstName: dto.firstName.trim(), lastName: dto.lastName.trim().toUpperCase(), birthDate: dto.birthDate ? new Date(dto.birthDate) : null },
      });
      await this.audit.log({ userId: user.id, action: 'CREATE', entity: 'Client', entityId: client.id, summary: `Nouveau client ${client.code} ${client.firstName} ${client.lastName}`, after: client, ip }, t);
      return client;
    };
    return tx ? run(tx) : this.prisma.tx(run);
  }

  async update(id: string, dto: UpdateClientDto, user: AuthUser, ip?: string) {
    const before = await this.prisma.client.findUnique({ where: { id } });
    if (!before) throw new NotFoundException('Client introuvable');
    const data: Prisma.ClientUpdateInput = { ...dto } as any;
    if (dto.phone !== undefined) {
      const phone = normalizePhone(dto.phone);
      if (phone) {
        const dup = await this.prisma.client.findFirst({ where: { phone, active: true, NOT: { id } } });
        if (dup) throw new ConflictException(`Ce numéro appartient déjà au client ${dup.firstName} ${dup.lastName} (${dup.code})`);
      }
      data.phone = phone;
    }
    if (dto.phone2 !== undefined) data.phone2 = normalizePhone(dto.phone2);
    if (dto.lastName) data.lastName = dto.lastName.trim().toUpperCase();
    if (dto.birthDate !== undefined) data.birthDate = dto.birthDate ? new Date(dto.birthDate) : null;
    const client = await this.prisma.client.update({ where: { id }, data });
    await this.audit.log({ userId: user.id, action: dto.active === false ? 'DEACTIVATE' : 'UPDATE', entity: 'Client', entityId: id, summary: `Fiche client ${client.code}`, before, after: client, ip });
    return client;
  }

  /** Fiche complète : historique RDV, achats, paiements, dettes/avances, fidélité. */
  async detail(id: string, user: AuthUser) {
    const client = await this.prisma.client.findFirst({ where: { AND: [{ id }, this.scope(user)] } });
    if (!client) throw new NotFoundException('Client introuvable');
    const canSeeMoney = hasPermission(user.permissions, 'sales.view');
    const [appointments, sales, loyalty, subscriptions] = await Promise.all([
      this.prisma.appointment.findMany({
        where: { clientId: id, ...(hasPermission(user.permissions, 'appointments.view_all') ? {} : { staffId: user.staffId ?? '-' }) },
        orderBy: { startAt: 'desc' }, take: 100,
        include: { staff: { select: { firstName: true, lastName: true } }, items: { include: { service: { select: { name: true } } } } },
      }),
      canSeeMoney
        ? this.prisma.sale.findMany({ where: { clientId: id }, orderBy: { saleDate: 'desc' }, take: 100, include: { items: true, payments: true } })
        : Promise.resolve([]),
      this.prisma.loyaltyTransaction.findMany({ where: { clientId: id }, orderBy: { createdAt: 'desc' }, take: 50 }),
      this.prisma.clientSubscription.findMany({ where: { clientId: id }, orderBy: { createdAt: 'desc' }, include: { package: true } }),
    ]);
    const valid = sales.filter((s) => s.status === 'VALIDATED');
    const stats = {
      visits: appointments.filter((a) => a.status === 'DONE').length,
      totalSpent: valid.reduce((s, x) => s + x.total, 0),
      totalPaid: valid.reduce((s, x) => s + x.paidAmount - x.refundedAmount, 0),
      debt: valid.reduce((s, x) => s + Math.max(0, x.balance), 0), // reste à payer
      lastVisit: appointments.find((a) => a.status === 'DONE')?.startAt ?? valid[0]?.saleDate ?? null,
    };
    const payments = sales.flatMap((s) => s.payments.map((p) => ({ ...p, saleNumber: s.number }))).sort((a, b) => +b.paidAt - +a.paidAt);
    return { client, stats, appointments, sales, payments, loyalty, subscriptions };
  }
}

@Controller('clients')
export class ClientsController {
  constructor(private s: ClientsService) {}
  @Get() @RequirePermissions('clients.view', 'clients.view_own')
  list(@Query() q: ClientQuery, @CurrentUser() u: AuthUser) { return this.s.list(q, u); }
  @Get(':id') @RequirePermissions('clients.view', 'clients.view_own')
  detail(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() u: AuthUser) { return this.s.detail(id, u); }
  @Post() @RequirePermissions('clients.manage')
  create(@Body() dto: CreateClientDto, @CurrentUser() u: AuthUser, @ClientIp() ip: string) { return this.s.create(dto, u, ip); }
  @Patch(':id') @RequirePermissions('clients.manage')
  update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateClientDto, @CurrentUser() u: AuthUser, @ClientIp() ip: string) { return this.s.update(id, dto, u, ip); }
}

@Module({ controllers: [ClientsController], providers: [ClientsService], exports: [ClientsService] })
export class ClientsModule {}
