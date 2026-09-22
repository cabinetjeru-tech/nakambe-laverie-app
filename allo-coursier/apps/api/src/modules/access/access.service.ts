import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, SecretKind, UserStatus } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { AuditService } from '../../audit/audit.service';
import { AuthUser } from '../../common/auth-user';
import { paginate } from '../../common/dto/pagination.dto';
import { hasPermissions } from '../../common/guards/permissions.guard';
import { ALL_PERMISSIONS_WILDCARD, PERMISSIONS, PUBLIC_ROLE_CODES, ROLE } from '../../common/permissions';
import { generateTemporaryPassword, generateTemporaryPin } from '../../common/utils/secret-policy';
import { PrismaService } from '../../prisma/prisma.service';
import { assertSecretPolicy, BCRYPT_COST, requirePhone } from '../auth/auth.service';
import {
  CreateRoleDto,
  CreateStaffDto,
  RoleAssignmentDto,
  SetUserStatusDto,
  UpdateRoleDto,
  UserQueryDto,
} from './dto/access.dto';

const publicUserSelect = {
  id: true,
  phone: true,
  firstName: true,
  lastName: true,
  email: true,
  status: true,
  secretKind: true,
  lastLoginAt: true,
  lockedUntil: true,
  createdAt: true,
  roles: { select: { cityId: true, role: { select: { id: true, code: true, name: true } } } },
  driverProfile: { select: { status: true, cityId: true, vehicleType: true, employmentType: true } },
} satisfies Prisma.UserSelect;

@Injectable()
export class AccessService {
  constructor(
    private prisma: PrismaService,
    private audit: AuditService,
  ) {}

  // ------------------------------------------------------------------ permissions et rôles

  async listPermissions() {
    const permissions = await this.prisma.permission.findMany({ orderBy: [{ group: 'asc' }, { code: 'asc' }] });
    const groups = new Map<string, typeof permissions>();
    for (const p of permissions) groups.set(p.group, [...(groups.get(p.group) ?? []), p]);
    return [...groups.entries()].map(([group, items]) => ({ group, permissions: items }));
  }

  async listRoles() {
    const roles = await this.prisma.role.findMany({
      orderBy: { name: 'asc' },
      include: { permissions: { include: { permission: true } }, _count: { select: { users: true } } },
    });
    return roles.map((r) => ({
      id: r.id,
      code: r.code,
      name: r.name,
      description: r.description,
      isSystem: r.isSystem,
      isPublic: PUBLIC_ROLE_CODES.includes(r.code),
      permissionCodes: r.code === ROLE.SUPER_ADMIN ? [ALL_PERMISSIONS_WILDCARD] : r.permissions.map((rp) => rp.permission.code),
      userCount: r._count.users,
    }));
  }

  async createRole(dto: CreateRoleDto, actor: AuthUser) {
    const permissionIds = await this.resolvePermissions(dto.permissionCodes ?? [], actor);
    try {
      const role = await this.prisma.role.create({
        data: {
          code: dto.code,
          name: dto.name,
          description: dto.description,
          permissions: { create: permissionIds.map((permissionId) => ({ permissionId })) },
        },
      });
      await this.audit.log({ actorId: actor.id, action: 'role.create', entityType: 'Role', entityId: role.id, after: { ...role, permissionCodes: dto.permissionCodes } });
      return role;
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
        throw new ConflictException('Un rôle avec ce code existe déjà.');
      }
      throw e;
    }
  }

  async updateRole(id: string, dto: UpdateRoleDto, actor: AuthUser) {
    const before = await this.getRole(id);
    const role = await this.prisma.role.update({ where: { id }, data: dto });
    await this.audit.log({ actorId: actor.id, action: 'role.update', entityType: 'Role', entityId: id, before, after: role });
    return role;
  }

  async setRolePermissions(id: string, codes: string[], actor: AuthUser) {
    const role = await this.getRole(id);
    if (role.code === ROLE.SUPER_ADMIN) throw new BadRequestException('Le rôle super-administrateur a toujours tous les droits.');
    if (PUBLIC_ROLE_CODES.includes(role.code) && codes.length > 0) {
      throw new BadRequestException(
        "Les rôles attribués à l'inscription (client, livreur, commerçant) ne peuvent pas recevoir de droits d'administration.",
      );
    }
    const permissionIds = await this.resolvePermissions(codes, actor);
    const before = role.permissions.map((rp) => rp.permission.code);
    await this.prisma.$transaction([
      this.prisma.rolePermission.deleteMany({ where: { roleId: id } }),
      this.prisma.rolePermission.createMany({ data: permissionIds.map((permissionId) => ({ roleId: id, permissionId })) }),
    ]);
    await this.audit.log({ actorId: actor.id, action: 'role.set_permissions', entityType: 'Role', entityId: id, before: { permissionCodes: before }, after: { permissionCodes: codes } });
    return { id, permissionCodes: codes, notice: 'Les droits sont appliqués à la prochaine connexion ou dans 15 minutes au plus.' };
  }

  async deleteRole(id: string, actor: AuthUser) {
    const role = await this.getRole(id);
    if (role.isSystem) throw new BadRequestException('Un rôle système ne peut pas être supprimé.');
    const inUse = await this.prisma.userRole.count({ where: { roleId: id } });
    if (inUse > 0) throw new BadRequestException(`Ce rôle est attribué à ${inUse} utilisateur(s) : retirez-le d'abord.`);
    await this.prisma.role.delete({ where: { id } });
    await this.audit.log({ actorId: actor.id, action: 'role.delete', entityType: 'Role', entityId: id, before: role });
    return { success: true };
  }

  private async getRole(id: string) {
    const role = await this.prisma.role.findUnique({ where: { id }, include: { permissions: { include: { permission: true } } } });
    if (!role) throw new NotFoundException('Rôle introuvable.');
    return role;
  }

  /** Vérifie que les codes existent et que l'acteur les détient lui-même (pas d'élévation de droits). */
  private async resolvePermissions(codes: string[], actor: AuthUser): Promise<string[]> {
    const unique = [...new Set(codes)];
    const permissions = await this.prisma.permission.findMany({ where: { code: { in: unique } } });
    const unknown = unique.filter((c) => !permissions.some((p) => p.code === c));
    if (unknown.length) throw new BadRequestException(`Permissions inconnues : ${unknown.join(', ')}`);
    if (!hasPermissions(actor, unique)) {
      throw new ForbiddenException('Vous ne pouvez pas accorder des droits que vous ne possédez pas.');
    }
    return permissions.map((p) => p.id);
  }

  // ------------------------------------------------------------------ utilisateurs

  async listUsers(query: UserQueryDto) {
    const search = query.search?.trim();
    const digits = search?.replace(/\D/g, '');
    const where: Prisma.UserWhereInput = {
      status: query.status,
      roles: query.roleCode ? { some: { role: { code: query.roleCode } } } : undefined,
      OR: search
        ? [
            { firstName: { contains: search, mode: 'insensitive' } },
            { lastName: { contains: search, mode: 'insensitive' } },
            ...(digits && digits.length >= 2 ? [{ phone: { contains: digits } }] : []),
          ]
        : undefined,
    };
    const [items, total] = await this.prisma.$transaction([
      this.prisma.user.findMany({ where, select: publicUserSelect, orderBy: { createdAt: 'desc' }, ...paginate(query) }),
      this.prisma.user.count({ where }),
    ]);
    return { items, total, page: query.page, pageSize: query.pageSize };
  }

  async getUser(id: string) {
    const user = await this.prisma.user.findUnique({
      where: { id },
      select: { ...publicUserSelect, addresses: true, _count: { select: { clientOrders: true, driverOrders: true } } },
    });
    if (!user) throw new NotFoundException('Utilisateur introuvable.');
    return user;
  }

  async setUserStatus(id: string, dto: SetUserStatusDto, actor: AuthUser) {
    if (id === actor.id) throw new BadRequestException('Vous ne pouvez pas modifier le statut de votre propre compte.');
    const user = await this.getUser(id);
    await this.assertCanManage(user, actor);
    if (dto.status === UserStatus.SUSPENDED && user.roles.some((r) => r.role.code === ROLE.SUPER_ADMIN)) {
      await this.assertNotLastSuperAdmin(id);
    }
    await this.prisma.$transaction([
      this.prisma.user.update({ where: { id }, data: { status: dto.status, lockedUntil: null, failedLoginAttempts: 0 } }),
      ...(dto.status === UserStatus.SUSPENDED
        ? [this.prisma.session.updateMany({ where: { userId: id, revokedAt: null }, data: { revokedAt: new Date() } })]
        : []),
    ]);
    await this.audit.log({ actorId: actor.id, action: 'user.set_status', entityType: 'User', entityId: id, before: { status: user.status }, after: { status: dto.status, reason: dto.reason } });
    return { id, status: dto.status };
  }

  /** Génère un code secret temporaire, communiqué une seule fois à l'utilisateur. */
  async resetSecret(id: string, actor: AuthUser) {
    if (id === actor.id) throw new BadRequestException('Utilisez « Changer mon code secret » pour votre propre compte.');
    const user = await this.getUser(id);
    await this.assertCanManage(user, actor);
    const temporary = user.secretKind === SecretKind.PIN ? generateTemporaryPin() : generateTemporaryPassword();
    await this.prisma.$transaction([
      this.prisma.user.update({
        where: { id },
        data: { secretHash: await bcrypt.hash(temporary, BCRYPT_COST), lockedUntil: null, failedLoginAttempts: 0 },
      }),
      this.prisma.session.updateMany({ where: { userId: id, revokedAt: null }, data: { revokedAt: new Date() } }),
    ]);
    await this.audit.log({ actorId: actor.id, action: 'user.reset_secret', entityType: 'User', entityId: id });
    return { temporarySecret: temporary, secretKind: user.secretKind };
  }

  // ------------------------------------------------------------------ équipe

  async createStaff(dto: CreateStaffDto, actor: AuthUser) {
    const phone = requirePhone(dto.phone);
    if (dto.roles.length === 0) throw new BadRequestException("Attribuez au moins un rôle au membre de l'équipe.");
    if (await this.prisma.user.findUnique({ where: { phone } })) {
      throw new ConflictException('Un compte existe déjà avec ce numéro.');
    }
    const assignments = await this.resolveAssignments(dto.roles, actor, { staffOnly: true });
    const password = dto.password ?? generateTemporaryPassword();
    assertSecretPolicy(SecretKind.PASSWORD, password);
    const user = await this.prisma.user.create({
      data: {
        phone,
        firstName: dto.firstName.trim(),
        lastName: dto.lastName.trim(),
        secretKind: SecretKind.PASSWORD,
        secretHash: await bcrypt.hash(password, BCRYPT_COST),
        roles: { create: assignments },
      },
      select: publicUserSelect,
    });
    await this.audit.log({ actorId: actor.id, action: 'staff.create', entityType: 'User', entityId: user.id, after: user });
    return { user, temporaryPassword: dto.password ? undefined : password };
  }

  /** Remplace les rôles d'équipe d'un utilisateur ; ses rôles publics (client, livreur...) sont conservés. */
  async setUserRoles(id: string, roles: RoleAssignmentDto[], actor: AuthUser) {
    const user = await this.getUser(id);
    const assignments = await this.resolveAssignments(roles, actor, { staffOnly: true });
    if (assignments.length > 0 && user.secretKind !== SecretKind.PASSWORD) {
      throw new BadRequestException(
        "Ce compte utilise un code à chiffres : créez un compte d'équipe dédié (avec mot de passe) pour cette personne.",
      );
    }
    const currentStaff = user.roles.filter((r) => !PUBLIC_ROLE_CODES.includes(r.role.code));
    // Retirer un rôle est aussi une action sensible : l'acteur doit pouvoir gérer chacun des rôles retirés.
    await this.resolveAssignments(
      currentStaff.map((r) => ({ roleCode: r.role.code, cityId: r.cityId })),
      actor,
      { staffOnly: true },
    );
    const losesSuperAdmin =
      currentStaff.some((r) => r.role.code === ROLE.SUPER_ADMIN) &&
      !roles.some((r) => r.roleCode === ROLE.SUPER_ADMIN);
    if (losesSuperAdmin) await this.assertNotLastSuperAdmin(id);

    const staffRoleIds = currentStaff.map((r) => r.role.id);
    await this.prisma.$transaction([
      this.prisma.userRole.deleteMany({ where: { userId: id, roleId: { in: staffRoleIds } } }),
      this.prisma.userRole.createMany({ data: assignments.map((a) => ({ ...a, userId: id })) }),
    ]);
    await this.audit.log({
      actorId: actor.id,
      action: 'user.set_roles',
      entityType: 'User',
      entityId: id,
      before: currentStaff.map((r) => ({ roleCode: r.role.code, cityId: r.cityId })),
      after: roles,
    });
    return this.getUser(id);
  }

  private async resolveAssignments(
    roles: RoleAssignmentDto[],
    actor: AuthUser,
    opts: { staffOnly: boolean },
  ): Promise<{ roleId: string; cityId: string | null }[]> {
    const result: { roleId: string; cityId: string | null }[] = [];
    const seen = new Set<string>();
    for (const a of roles) {
      const key = `${a.roleCode}:${a.cityId ?? ''}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const role = await this.prisma.role.findUnique({
        where: { code: a.roleCode },
        include: { permissions: { include: { permission: true } } },
      });
      if (!role) throw new BadRequestException(`Rôle inconnu : ${a.roleCode}`);
      if (opts.staffOnly && PUBLIC_ROLE_CODES.includes(role.code)) {
        throw new BadRequestException(`Le rôle ${role.name} ne s'attribue pas manuellement.`);
      }
      if (role.code === ROLE.SUPER_ADMIN && !actor.permissions.includes(ALL_PERMISSIONS_WILDCARD)) {
        throw new ForbiddenException('Seul un super-administrateur peut gérer ce rôle.');
      }
      if (!hasPermissions(actor, role.permissions.map((rp) => rp.permission.code))) {
        throw new ForbiddenException(`Vous ne pouvez pas gérer le rôle ${role.name} : il donne des droits que vous n'avez pas.`);
      }
      if (a.cityId && !(await this.prisma.city.findUnique({ where: { id: a.cityId } }))) {
        throw new BadRequestException('Ville introuvable.');
      }
      if (role.code === ROLE.SUPER_ADMIN && a.cityId) {
        throw new BadRequestException('Le rôle super-administrateur ne peut pas être limité à une ville.');
      }
      result.push({ roleId: role.id, cityId: a.cityId ?? null });
    }
    return result;
  }

  /** Gérer un membre de l'équipe (statut, code secret) exige le droit de gérer l'équipe et chacun de ses rôles. */
  private async assertCanManage(user: Awaited<ReturnType<AccessService['getUser']>>, actor: AuthUser) {
    const staffRoles = user.roles.filter((r) => !PUBLIC_ROLE_CODES.includes(r.role.code));
    if (staffRoles.length === 0) return;
    if (!hasPermissions(actor, [PERMISSIONS.STAFF_MANAGE.code])) {
      throw new ForbiddenException("Seul un gestionnaire de l'équipe peut modifier ce compte.");
    }
    await this.resolveAssignments(
      staffRoles.map((r) => ({ roleCode: r.role.code, cityId: r.cityId })),
      actor,
      { staffOnly: true },
    );
  }

  private async assertNotLastSuperAdmin(userId: string) {
    const others = await this.prisma.userRole.count({
      where: { role: { code: ROLE.SUPER_ADMIN }, userId: { not: userId }, user: { status: UserStatus.ACTIVE } },
    });
    if (others === 0) throw new BadRequestException('Impossible : ce compte est le dernier super-administrateur actif.');
  }
}
