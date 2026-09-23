import { randomBytes } from 'node:crypto';
import { ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { AuditService } from '../../core/audit/audit.service';
import { AuthUser } from '../../core/auth/auth-user';
import { DbService } from '../../core/db/db.service';
import { slugify } from '../../core/http/slug';
import { FEATURES, filterByFeatures, PERMISSION_DEFINITIONS } from '../../core/permissions/catalog';
import { AccessPolicyService } from './access-policy.service';
import { CreateRoleDto, UpdateRoleDto } from './dto/access.dto';

const roleSelect = {
  id: true,
  code: true,
  name: true,
  description: true,
  isSystem: true,
  permissions: { select: { permissionCode: true } },
  _count: { select: { membershipRoles: true } },
} as const;

@Injectable()
export class RolesService {
  constructor(
    private readonly db: DbService,
    private readonly policy: AccessPolicyService,
    private readonly audit: AuditService,
  ) {}

  /** Catalogue des permissions, avec leur disponibilité dans l'offre du tenant. */
  async catalog(user: AuthUser) {
    const actor = await this.policy.actor(user);
    const available = new Set(filterByFeatures(PERMISSION_DEFINITIONS.map((p) => p.code), actor.features));
    return PERMISSION_DEFINITIONS.map((p) => ({
      code: p.code,
      group: p.group,
      description: p.description,
      availableInPlan: available.has(p.code),
    }));
  }

  async list() {
    const roles = await this.db.tx.role.findMany({ select: roleSelect, orderBy: [{ isSystem: 'desc' }, { name: 'asc' }] });
    return roles.map((role) => this.present(role));
  }

  async create(user: AuthUser, dto: CreateRoleDto) {
    const actor = await this.policy.actor(user);
    if (!actor.features.has(FEATURES.CUSTOM_ROLES)) {
      throw new ForbiddenException("Les rôles personnalisés ne sont pas inclus dans votre offre. Vous pouvez adapter les rôles existants.");
    }
    this.policy.assertCanGrantPermissions(actor, dto.permissions);
    const role = await this.db.tx.role.create({
      data: {
        tenantId: actor.tenantId,
        code: await this.uniqueCode(dto.name),
        name: dto.name,
        description: dto.description ?? null,
        isSystem: false,
        permissions: { create: dto.permissions.map((permissionCode) => ({ permissionCode })) },
      },
      select: roleSelect,
    });
    await this.audit.log({ action: 'role.create', entityType: 'role', entityId: role.id, after: { name: role.name, permissions: dto.permissions } });
    return this.present(role);
  }

  async update(user: AuthUser, roleId: string, dto: UpdateRoleDto) {
    const actor = await this.policy.actor(user);
    const role = await this.db.tx.role.findFirst({ where: { id: roleId }, select: roleSelect });
    if (!role) throw new NotFoundException('Rôle introuvable.');
    if (this.policy.isOwnerRole(role)) {
      throw new ForbiddenException('Le rôle Propriétaire ne peut pas être modifié.');
    }
    // Pour modifier un rôle, il faut déjà posséder tous ses droits actuels ET futurs.
    this.policy.assertCanGrantPermissions(actor, this.policy.rolePermissionCodes(role));
    if (dto.permissions) this.policy.assertCanGrantPermissions(actor, dto.permissions);

    await this.db.tx.role.update({
      where: { id: roleId },
      data: { name: dto.name ?? undefined, description: dto.description ?? undefined },
    });
    if (dto.permissions) {
      await this.db.tx.rolePermission.deleteMany({ where: { roleId } });
      await this.db.tx.rolePermission.createMany({
        data: dto.permissions.map((permissionCode) => ({ tenantId: actor.tenantId, roleId, permissionCode })),
      });
      await this.policy.bumpPermissionsVersion({ roles: { some: { roleId } } });
    }
    await this.audit.log({
      action: 'role.update',
      entityType: 'role',
      entityId: roleId,
      before: { name: role.name, permissions: role.permissions.map((p) => p.permissionCode) },
      after: { name: dto.name ?? role.name, permissions: dto.permissions ?? role.permissions.map((p) => p.permissionCode) },
    });
    const updated = await this.db.tx.role.findFirstOrThrow({ where: { id: roleId }, select: roleSelect });
    return this.present(updated);
  }

  async remove(user: AuthUser, roleId: string) {
    const actor = await this.policy.actor(user);
    const role = await this.db.tx.role.findFirst({ where: { id: roleId }, select: roleSelect });
    if (!role) throw new NotFoundException('Rôle introuvable.');
    if (role.isSystem) throw new ForbiddenException('Les rôles par défaut ne peuvent pas être supprimés.');
    this.policy.assertCanGrantPermissions(actor, this.policy.rolePermissionCodes(role));
    if (role._count.membershipRoles > 0) {
      throw new ConflictException('Ce rôle est attribué à des membres : retirez-le-leur avant de le supprimer.');
    }
    await this.db.tx.role.delete({ where: { id: roleId } });
    await this.audit.log({ action: 'role.delete', entityType: 'role', entityId: roleId, before: { name: role.name } });
  }

  private present(role: {
    id: string;
    code: string;
    name: string;
    description: string | null;
    isSystem: boolean;
    permissions: { permissionCode: string }[];
    _count: { membershipRoles: number };
  }) {
    return {
      id: role.id,
      code: role.code,
      name: role.name,
      description: role.description,
      isSystem: role.isSystem,
      editable: !this.policy.isOwnerRole(role),
      permissions: this.policy.rolePermissionCodes(role).sort(),
      memberCount: role._count.membershipRoles,
    };
  }

  private async uniqueCode(name: string): Promise<string> {
    const base = `CUSTOM_${slugify(name, 30).replace(/-/g, '_').toUpperCase()}`;
    const exists = await this.db.tx.role.findFirst({ where: { code: base }, select: { id: true } });
    return exists ? `${base}_${randomBytes(3).toString('hex').toUpperCase()}` : base;
  }
}
