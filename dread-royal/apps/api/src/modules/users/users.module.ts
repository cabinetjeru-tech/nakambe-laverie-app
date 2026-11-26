import { BadRequestException, Body, ConflictException, Controller, Get, NotFoundException, Param, ParseUUIDPipe, Patch, Post, Query, Injectable, Module } from '@nestjs/common';
import { IsArray, IsBoolean, IsOptional, IsString, IsUUID, Matches, MaxLength, MinLength } from 'class-validator';
import { ALL_PERMISSIONS } from '@dread-royal/shared';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../../common/audit.service';
import { ClientIp, CurrentUser, RequirePermissions } from '../../common/decorators';
import { AuthUser } from '../../common/auth-user';
import { assertStrongPassword, hashPassword } from '../auth/auth.module';
import { PageQuery, paginate } from '../../common/pagination';

class CreateUserDto {
  @IsString() @MinLength(3) @MaxLength(30) @Matches(/^[a-z0-9._-]+$/i, { message: 'Identifiant : lettres, chiffres, point, tiret uniquement' }) username: string;
  @IsString() @MinLength(2) @MaxLength(100) fullName: string;
  @IsOptional() @IsString() @MaxLength(30) phone?: string;
  @IsUUID() roleId: string;
  @IsOptional() @IsUUID() staffId?: string;
  @IsString() @MinLength(8) password: string;
}
class UpdateUserDto {
  @IsOptional() @IsString() @MinLength(2) @MaxLength(100) fullName?: string;
  @IsOptional() @IsString() @MaxLength(30) phone?: string;
  @IsOptional() @IsUUID() roleId?: string;
  @IsOptional() @IsUUID() staffId?: string | null;
  @IsOptional() @IsBoolean() active?: boolean;
}
class ResetPasswordDto {
  @IsString() @MinLength(8) newPassword: string;
}
class RoleDto {
  @IsString() @MinLength(2) @MaxLength(60) name: string;
  @IsOptional() @IsString() @MaxLength(200) description?: string;
  @IsArray() @IsString({ each: true }) permissions: string[];
}
class CreateRoleDto extends RoleDto {
  @IsString() @Matches(/^[A-Z_]{3,30}$/, { message: 'Code en MAJUSCULES (ex : APPRENTI)' }) code: string;
}

const publicUser = { id: true, username: true, fullName: true, phone: true, active: true, mustChangePassword: true, lastLoginAt: true, createdAt: true, staffId: true, role: { select: { id: true, code: true, name: true } }, staff: { select: { id: true, firstName: true, lastName: true, position: true } } } as const;

@Injectable()
export class UsersService {
  constructor(private prisma: PrismaService, private audit: AuditService) {}

  list() {
    return this.prisma.user.findMany({ select: publicUser, orderBy: { fullName: 'asc' } });
  }

  private async assertNotLastOwner(userId: string) {
    const u = await this.prisma.user.findUnique({ where: { id: userId }, include: { role: true } });
    if (u?.role.code !== 'OWNER') return;
    const owners = await this.prisma.user.count({ where: { active: true, role: { code: 'OWNER' } } });
    if (owners <= 1) throw new BadRequestException('Impossible : il doit rester au moins un propriétaire actif');
  }

  async create(dto: CreateUserDto, actor: AuthUser, ip?: string) {
    assertStrongPassword(dto.password);
    const username = dto.username.trim().toLowerCase();
    if (await this.prisma.user.findUnique({ where: { username } })) throw new ConflictException('Cet identifiant existe déjà');
    if (dto.staffId && (await this.prisma.user.findUnique({ where: { staffId: dto.staffId } }))) throw new ConflictException('Cette fiche personnel a déjà un compte');
    const user = await this.prisma.user.create({
      data: { username, fullName: dto.fullName, phone: dto.phone, roleId: dto.roleId, staffId: dto.staffId, passwordHash: await hashPassword(dto.password), mustChangePassword: true },
      select: publicUser,
    });
    await this.audit.log({ userId: actor.id, action: 'CREATE', entity: 'User', entityId: user.id, summary: `Création du compte ${username} (${user.role.name})`, after: user, ip });
    return user;
  }

  async update(id: string, dto: UpdateUserDto, actor: AuthUser, ip?: string) {
    const before = await this.prisma.user.findUnique({ where: { id }, select: publicUser });
    if (!before) throw new NotFoundException('Utilisateur introuvable');
    if ((dto.active === false || (dto.roleId && dto.roleId !== before.role.id))) await this.assertNotLastOwner(id);
    if (dto.active === false && id === actor.id) throw new BadRequestException('Vous ne pouvez pas désactiver votre propre compte');
    const user = await this.prisma.user.update({ where: { id }, data: dto, select: publicUser });
    if (dto.active === false) await this.prisma.session.updateMany({ where: { userId: id, revokedAt: null }, data: { revokedAt: new Date() } });
    await this.audit.log({ userId: actor.id, action: dto.active === false ? 'DEACTIVATE' : 'UPDATE', entity: 'User', entityId: id, summary: `Modification du compte ${user.username}`, before, after: user, ip });
    return user;
  }

  async resetPassword(id: string, dto: ResetPasswordDto, actor: AuthUser, ip?: string) {
    assertStrongPassword(dto.newPassword);
    const u = await this.prisma.user.findUnique({ where: { id } });
    if (!u) throw new NotFoundException('Utilisateur introuvable');
    await this.prisma.user.update({ where: { id }, data: { passwordHash: await hashPassword(dto.newPassword), mustChangePassword: true, failedLogins: 0, lockedUntil: null } });
    await this.prisma.session.updateMany({ where: { userId: id, revokedAt: null }, data: { revokedAt: new Date() } });
    await this.audit.log({ userId: actor.id, action: 'PASSWORD_RESET', entity: 'User', entityId: id, summary: `Réinitialisation du mot de passe de ${u.username}`, ip });
    return { ok: true };
  }

  roles() {
    return this.prisma.role.findMany({ orderBy: { createdAt: 'asc' }, include: { _count: { select: { users: true } } } });
  }

  private checkPerms(perms: string[]) {
    const bad = perms.filter((p) => p !== '*' && !ALL_PERMISSIONS.includes(p as any));
    if (bad.length) throw new BadRequestException(`Permissions inconnues : ${bad.join(', ')}`);
  }

  async createRole(dto: CreateRoleDto, actor: AuthUser, ip?: string) {
    this.checkPerms(dto.permissions);
    if (dto.permissions.includes('*')) throw new BadRequestException('Seul le rôle Propriétaire possède tous les droits');
    if (await this.prisma.role.findUnique({ where: { code: dto.code } })) throw new ConflictException('Ce code de rôle existe déjà');
    const role = await this.prisma.role.create({ data: dto });
    await this.audit.log({ userId: actor.id, action: 'CREATE', entity: 'Role', entityId: role.id, summary: `Création du rôle ${role.name}`, after: role, ip });
    return role;
  }

  async updateRole(id: string, dto: RoleDto, actor: AuthUser, ip?: string) {
    const before = await this.prisma.role.findUnique({ where: { id } });
    if (!before) throw new NotFoundException('Rôle introuvable');
    if (before.code === 'OWNER') throw new BadRequestException('Les droits du Propriétaire ne sont pas modifiables');
    this.checkPerms(dto.permissions);
    if (dto.permissions.includes('*')) throw new BadRequestException('Seul le rôle Propriétaire possède tous les droits');
    const role = await this.prisma.role.update({ where: { id }, data: dto });
    await this.audit.log({ userId: actor.id, action: 'UPDATE', entity: 'Role', entityId: id, summary: `Permissions du rôle ${role.name}`, before, after: role, ip });
    return role;
  }
}

@Controller('users')
@RequirePermissions('users.manage')
export class UsersController {
  constructor(private s: UsersService) {}
  @Get() list() { return this.s.list(); }
  @Post() create(@Body() dto: CreateUserDto, @CurrentUser() u: AuthUser, @ClientIp() ip: string) { return this.s.create(dto, u, ip); }
  @Patch(':id') update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateUserDto, @CurrentUser() u: AuthUser, @ClientIp() ip: string) { return this.s.update(id, dto, u, ip); }
  @Post(':id/reset-password') reset(@Param('id', ParseUUIDPipe) id: string, @Body() dto: ResetPasswordDto, @CurrentUser() u: AuthUser, @ClientIp() ip: string) { return this.s.resetPassword(id, dto, u, ip); }
}

@Controller('roles')
@RequirePermissions('users.manage')
export class RolesController {
  constructor(private s: UsersService) {}
  @Get() list() { return this.s.roles(); }
  @Post() create(@Body() dto: CreateRoleDto, @CurrentUser() u: AuthUser, @ClientIp() ip: string) { return this.s.createRole(dto, u, ip); }
  @Patch(':id') update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: RoleDto, @CurrentUser() u: AuthUser, @ClientIp() ip: string) { return this.s.updateRole(id, dto, u, ip); }
}

class AuditQuery extends PageQuery {
  @IsOptional() @IsString() entity?: string;
  @IsOptional() @IsString() entityId?: string;
  @IsOptional() @IsString() userId?: string;
  @IsOptional() @IsString() action?: string;
  @IsOptional() @IsString() from?: string;
  @IsOptional() @IsString() to?: string;
}

@Controller('audit')
@RequirePermissions('audit.view')
export class AuditController {
  constructor(private prisma: PrismaService) {}
  @Get()
  async list(@Query() q: AuditQuery) {
    const { skip, take, page, pageSize } = paginate(q);
    const where: any = {};
    if (q.entity) where.entity = q.entity;
    if (q.entityId) where.entityId = q.entityId;
    if (q.userId) where.userId = q.userId;
    if (q.action) where.action = q.action;
    if (q.search) where.summary = { contains: q.search, mode: 'insensitive' };
    if (q.from || q.to) where.createdAt = { ...(q.from && { gte: new Date(q.from) }), ...(q.to && { lt: new Date(new Date(q.to).getTime() + 86_400_000) }) };
    const [items, total] = await Promise.all([
      this.prisma.auditLog.findMany({ where, skip, take, orderBy: { createdAt: 'desc' }, include: { user: { select: { fullName: true, username: true } } } }),
      this.prisma.auditLog.count({ where }),
    ]);
    return { items, total, page, pageSize };
  }
}

@Module({ controllers: [UsersController, RolesController, AuditController], providers: [UsersService] })
export class UsersModule {}
