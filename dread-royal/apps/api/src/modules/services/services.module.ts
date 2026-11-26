import { BadRequestException, Body, ConflictException, Controller, Get, Injectable, Module, NotFoundException, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { CommissionType } from '@prisma/client';
import { IsBoolean, IsEnum, IsInt, IsNumber, IsOptional, IsString, IsUUID, Matches, Max, MaxLength, Min, MinLength } from 'class-validator';
import { PartialType } from '@nestjs/swagger';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../../common/audit.service';
import { ClientIp, CurrentUser, RequirePermissions } from '../../common/decorators';
import { AuthUser } from '../../common/auth-user';

class CreateServiceDto {
  @IsString() @Matches(/^[A-Z0-9-]{2,12}$/, { message: 'Code : majuscules et chiffres (ex : DRH01)' }) code: string;
  @IsString() @MinLength(2) @MaxLength(100) name: string;
  @IsOptional() @IsString() @MaxLength(500) description?: string;
  @IsUUID() categoryId: string;
  @IsInt() @Min(0) @Max(10_000_000) price: number;
  @IsOptional() @IsInt() @Min(0) priceMax?: number | null;
  @IsInt() @Min(5) @Max(24 * 60) durationMin: number;
  @IsOptional() @IsEnum(CommissionType) commissionType?: CommissionType;
  @IsOptional() @IsNumber() @Min(0) commissionValue?: number;
  @IsOptional() @IsBoolean() active?: boolean;
}
class UpdateServiceDto extends PartialType(CreateServiceDto) {}

@Injectable()
export class ServicesService {
  constructor(private prisma: PrismaService, private audit: AuditService) {}

  categories() {
    return this.prisma.serviceCategory.findMany({ orderBy: { sortOrder: 'asc' }, include: { _count: { select: { services: true } } } });
  }

  list(q: { categoryId?: string; includeInactive?: string; search?: string }) {
    return this.prisma.service.findMany({
      where: {
        ...(q.includeInactive === 'true' ? {} : { active: true }),
        ...(q.categoryId ? { categoryId: q.categoryId } : {}),
        ...(q.search ? { OR: [{ name: { contains: q.search, mode: 'insensitive' } }, { code: { contains: q.search, mode: 'insensitive' } }] } : {}),
      },
      include: { category: true },
      orderBy: [{ category: { sortOrder: 'asc' } }, { code: 'asc' }],
    });
  }

  private validate(dto: Partial<CreateServiceDto>, current?: { price: number; commissionType: CommissionType; commissionValue: number }) {
    const price = dto.price ?? current?.price ?? 0;
    if (dto.priceMax != null && dto.priceMax < price) throw new BadRequestException('Le prix maximum doit être supérieur au prix de base');
    const type = dto.commissionType ?? current?.commissionType;
    const value = dto.commissionValue ?? current?.commissionValue ?? 0;
    if (type === 'PERCENT' && value > 100) throw new BadRequestException('Commission en pourcentage : 100 % maximum');
    if (type === 'FIXED' && value > price) throw new BadRequestException('La commission fixe dépasse le prix de la prestation');
  }

  async create(dto: CreateServiceDto, user: AuthUser, ip?: string) {
    this.validate(dto);
    if (await this.prisma.service.findUnique({ where: { code: dto.code } })) throw new ConflictException('Ce code existe déjà');
    const s = await this.prisma.service.create({ data: dto, include: { category: true } });
    await this.audit.log({ userId: user.id, action: 'CREATE', entity: 'Service', entityId: s.id, summary: `Prestation ${s.code} ${s.name} — ${s.price} FCFA`, after: s, ip });
    return s;
  }

  async update(id: string, dto: UpdateServiceDto, user: AuthUser, ip?: string) {
    const before = await this.prisma.service.findUnique({ where: { id } });
    if (!before) throw new NotFoundException('Prestation introuvable');
    this.validate(dto, before);
    const s = await this.prisma.service.update({ where: { id }, data: dto, include: { category: true } });
    const summary = before.price !== s.price ? `Tarif ${s.code} : ${before.price} → ${s.price} FCFA` : `Prestation ${s.code} modifiée`;
    await this.audit.log({ userId: user.id, action: 'UPDATE', entity: 'Service', entityId: id, summary, before, after: s, ip });
    return s;
  }
}

@Controller('services')
@RequirePermissions('services.view', 'sales.create', 'appointments.manage')
export class ServicesController {
  constructor(private s: ServicesService) {}
  @Get('categories') categories() { return this.s.categories(); }
  @Get() list(@Query() q: { categoryId?: string; includeInactive?: string; search?: string }) { return this.s.list(q); }
  @Post() @RequirePermissions('services.manage')
  create(@Body() dto: CreateServiceDto, @CurrentUser() u: AuthUser, @ClientIp() ip: string) { return this.s.create(dto, u, ip); }
  @Patch(':id') @RequirePermissions('services.manage')
  update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateServiceDto, @CurrentUser() u: AuthUser, @ClientIp() ip: string) { return this.s.update(id, dto, u, ip); }
}

@Module({ controllers: [ServicesController], providers: [ServicesService] })
export class ServicesModule {}
