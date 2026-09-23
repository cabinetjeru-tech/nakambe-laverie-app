import { BadRequestException, ForbiddenException, Injectable, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { AuthUser } from '../../core/auth/auth-user';
import { TenantAccess, TenantAccessService } from '../../core/auth/tenant-access.service';
import { DbService } from '../../core/db/db.service';
import { ALL_PERMISSION_CODES, OWNER_ROLE_CODE } from '../../core/permissions/catalog';

export interface RoleSummary {
  id: string;
  code: string;
  isSystem: boolean;
  permissions: { permissionCode: string }[];
}

/**
 * Règles anti-escalade de privilèges, appliquées à toute attribution de droits :
 * 1. On ne donne jamais une permission qu'on ne possède pas soi-même.
 * 2. Seul un propriétaire attribue ou retire le rôle Propriétaire ; le dernier propriétaire
 *    actif ne peut être ni rétrogradé ni suspendu.
 * 3. Un membre limité à certains salons ne peut accorder que ces salons, et ne gère que les
 *    membres entièrement compris dans son périmètre.
 * 4. On ne modifie pas ses propres accès.
 */
@Injectable()
export class AccessPolicyService {
  constructor(
    private readonly db: DbService,
    private readonly tenantAccess: TenantAccessService,
  ) {}

  /** Droits actuels de l'auteur de la requête (relus en base, pas seulement le jeton). */
  async actor(user: AuthUser): Promise<TenantAccess> {
    const access = await this.tenantAccess.build(user.userId, user.tenantId!);
    if (!access) throw new UnauthorizedException('Vos accès ont changé. Reconnectez-vous.');
    return access;
  }

  isOwnerRole(role: Pick<RoleSummary, 'code' | 'isSystem'>): boolean {
    return role.isSystem && role.code === OWNER_ROLE_CODE;
  }

  rolePermissionCodes(role: RoleSummary): string[] {
    return this.isOwnerRole(role) ? [...ALL_PERMISSION_CODES] : role.permissions.map((p) => p.permissionCode);
  }

  assertCanGrantPermissions(actor: TenantAccess, codes: Iterable<string>): void {
    if (actor.isOwner) return;
    const own = new Set(actor.permissions);
    const beyond = [...codes].filter((code) => !own.has(code));
    if (beyond.length > 0) {
      throw new ForbiddenException(`Vous ne pouvez pas accorder des droits que vous n'avez pas : ${beyond.join(', ')}.`);
    }
  }

  assertCanAssignRoles(actor: TenantAccess, roles: RoleSummary[]): void {
    for (const role of roles) {
      if (this.isOwnerRole(role) && !actor.isOwner) {
        throw new ForbiddenException('Seul un propriétaire peut attribuer le rôle Propriétaire.');
      }
      this.assertCanGrantPermissions(actor, this.rolePermissionCodes(role));
    }
  }

  assertCanGrantSalonScope(actor: TenantAccess, allSalons: boolean, salonIds: string[]): void {
    if (actor.allSalons) return;
    if (allSalons || salonIds.length === 0) {
      throw new ForbiddenException("Vous ne pouvez pas donner accès à tous les salons de l'entreprise.");
    }
    const own = new Set(actor.salonIds);
    if (salonIds.some((id) => !own.has(id))) {
      throw new ForbiddenException('Vous ne pouvez accorder que les salons de votre périmètre.');
    }
  }

  /** Vérifie que l'auteur peut agir sur ce membre ; renvoie les informations utiles. */
  async loadManageableMember(actor: TenantAccess, membershipId: string) {
    const member = await this.db.tx.membership.findFirst({
      where: { id: membershipId },
      select: {
        id: true,
        userId: true,
        status: true,
        allSalons: true,
        salons: { select: { salonId: true } },
        roles: { select: { role: { select: { id: true, code: true, isSystem: true, permissions: { select: { permissionCode: true } } } } } },
      },
    });
    if (!member) throw new NotFoundException('Membre introuvable.');
    if (!actor.allSalons) {
      const own = new Set(actor.salonIds);
      const inScope = !member.allSalons && member.salons.every((s) => own.has(s.salonId));
      if (!inScope) throw new NotFoundException('Membre introuvable.');
    }
    if (member.id === actor.membershipId) {
      throw new ForbiddenException('Vous ne pouvez pas modifier vos propres accès.');
    }
    const isOwner = member.roles.some((r) => this.isOwnerRole(r.role));
    if (isOwner && !actor.isOwner) {
      throw new ForbiddenException("Seul un propriétaire peut modifier les accès d'un autre propriétaire.");
    }
    return { ...member, isOwner };
  }

  async assertAnotherActiveOwner(excludedMembershipId: string): Promise<void> {
    const owners = await this.db.tx.membership.count({
      where: {
        id: { not: excludedMembershipId },
        status: 'ACTIVE',
        roles: { some: { role: { code: OWNER_ROLE_CODE, isSystem: true } } },
      },
    });
    if (owners === 0) {
      throw new BadRequestException("L'entreprise doit conserver au moins un propriétaire actif.");
    }
  }

  /** Vérifie que les salons existent dans le tenant (et ne sont pas supprimés). */
  async assertSalonsExist(salonIds: string[]): Promise<void> {
    if (salonIds.length === 0) return;
    const unique = [...new Set(salonIds)];
    const found = await this.db.tx.salon.count({ where: { id: { in: unique }, deletedAt: null } });
    if (found !== unique.length) throw new BadRequestException('Salon inconnu.');
  }

  /** Invalide immédiatement les jetons des membres concernés. */
  async bumpPermissionsVersion(where: { id?: string | { in: string[] }; roles?: { some: { roleId: string } } }) {
    await this.db.tx.membership.updateMany({ where, data: { permissionsVersion: { increment: 1 } } });
  }
}
