import { Body, Controller, Get, Injectable, Module, NotFoundException, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { CommissionMode, ContractType, StaffStatus } from '@prisma/client';
import { IsBoolean, IsDateString, IsEnum, IsHexColor, IsInt, IsNumber, IsOptional, IsString, Max, MaxLength, Min, MinLength } from 'class-validator';
import { PartialType } from '@nestjs/swagger';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../../common/audit.service';
import { ClientIp, CurrentUser, RequirePermissions } from '../../common/decorators';
import { AuthUser } from '../../common/auth-user';
import { nextCode } from '../../common/numbering';
import { hasPermission } from '@dread-royal/shared';

class CreateStaffDto {
  @IsString() @MinLength(1) @MaxLength(60) firstName: string;
  @IsString() @MinLength(1) @MaxLength(60) lastName: string;
  @IsOptional() @IsString() @MaxLength(30) phone?: string;
  @IsString() @MinLength(2) @MaxLength(60) position: string;
  @IsOptional() @IsBoolean() isStylist?: boolean;
  @IsDateString() hireDate: string;
  @IsEnum(ContractType) contractType: ContractType;
  @IsOptional() @IsInt() @Min(0) baseSalary?: number;
  @IsOptional() @IsEnum(CommissionMode) commissionMode?: CommissionMode;
  @IsOptional() @IsNumber() @Min(0) @Max(100) commissionRate?: number;
  @IsOptional() @IsInt() @Min(0) commissionFixed?: number;
  @IsOptional() @IsEnum(StaffStatus) status?: StaffStatus;
  @IsOptional() @IsHexColor() color?: string;
  @IsOptional() @IsString() @MaxLength(1000) notes?: string;
}
class UpdateStaffDto extends PartialType(CreateStaffDto) {}

@Injectable()
export class StaffService {
  constructor(private prisma: PrismaService, private audit: AuditService) {}

  list(q: { status?: string; stylists?: string }, user: AuthUser) {
    const full = hasPermission(user.permissions, 'staff.view');
    return this.prisma.staff.findMany({
      where: { ...(q.status ? { status: q.status as StaffStatus } : {}), ...(q.stylists === 'true' ? { isStylist: true, status: 'ACTIVE' } : {}) },
      orderBy: [{ status: 'asc' }, { firstName: 'asc' }],
      // Sans staff.view (ex. caissier pour choisir un coiffeur) : champs non sensibles uniquement
      select: full
        ? { id: true, code: true, firstName: true, lastName: true, phone: true, position: true, isStylist: true, hireDate: true, contractType: true, baseSalary: true, commissionMode: true, commissionRate: true, commissionFixed: true, status: true, color: true, notes: true, user: { select: { id: true, username: true, active: true } } }
        : { id: true, code: true, firstName: true, lastName: true, position: true, isStylist: true, status: true, color: true },
    });
  }

  async get(id: string) {
    const s = await this.prisma.staff.findUnique({ where: { id }, include: { user: { select: { id: true, username: true, active: true, role: { select: { name: true } } } } } });
    if (!s) throw new NotFoundException('Membre du personnel introuvable');
    return s;
  }

  async create(dto: CreateStaffDto, user: AuthUser, ip?: string) {
    return this.prisma.tx(async (tx) => {
      const code = await nextCode(tx, 'EMP', 3);
      const s = await tx.staff.create({ data: { ...dto, code, hireDate: new Date(dto.hireDate) } });
      await this.audit.log({ userId: user.id, action: 'CREATE', entity: 'Staff', entityId: s.id, summary: `Nouveau collaborateur ${s.firstName} ${s.lastName}`, after: s, ip }, tx);
      return s;
    });
  }

  async update(id: string, dto: UpdateStaffDto, user: AuthUser, ip?: string) {
    const before = await this.get(id);
    const s = await this.prisma.staff.update({ where: { id }, data: { ...dto, ...(dto.hireDate && { hireDate: new Date(dto.hireDate) }) } });
    await this.audit.log({ userId: user.id, action: 'UPDATE', entity: 'Staff', entityId: id, summary: `Fiche de ${s.firstName} ${s.lastName}`, before, after: s, ip });
    return s;
  }
}

@Controller('staff')
export class StaffController {
  constructor(private s: StaffService) {}
  @Get() @RequirePermissions('staff.view', 'sales.create', 'appointments.view_all', 'appointments.manage', 'commissions.view_all')
  list(@Query() q: { status?: string; stylists?: string }, @CurrentUser() u: AuthUser) { return this.s.list(q, u); }
  @Get(':id') @RequirePermissions('staff.view')
  get(@Param('id', ParseUUIDPipe) id: string) { return this.s.get(id); }
  @Post() @RequirePermissions('staff.manage')
  create(@Body() dto: CreateStaffDto, @CurrentUser() u: AuthUser, @ClientIp() ip: string) { return this.s.create(dto, u, ip); }
  @Patch(':id') @RequirePermissions('staff.manage')
  update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateStaffDto, @CurrentUser() u: AuthUser, @ClientIp() ip: string) { return this.s.update(id, dto, u, ip); }
}

@Module({ controllers: [StaffController], providers: [StaffService] })
export class StaffModule {}
