import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { AuditService } from '../../core/audit/audit.service';
import { AuthUser } from '../../core/auth/auth-user';
import { DbService } from '../../core/db/db.service';
import { AccessPolicyService } from './access-policy.service';
import { UpdateMemberAccessDto } from './dto/access.dto';

@Injectable()
export class MembersService {
  constructor(
    private readonly db: DbService,
    private readonly policy: AccessPolicyService,
    private readonly audit: AuditService,
  ) {}

  /** Membres visibles : tous pour un accès « tous salons », sinon ceux de son périmètre. */
  async list(user: AuthUser) {
    const members = await this.db.tx.membership.findMany({
      where: user.allSalons
        ? {}
        : { allSalons: false, salons: { some: { salonId: { in: user.salonIds } } } },
      select: {
        id: true,
        status: true,
        allSalons: true,
        joinedAt: true,
        user: { select: { fullName: true, phone: true, email: true } },
        roles: { select: { role: { select: { id: true, code: true, name: true } } } },
        salons: { select: { salonId: true } },
        staffMember: { select: { id: true, displayName: true } },
      },
      orderBy: { joinedAt: 'asc' },
    });
    return members.map((m) => ({
      id: m.id,
      status: m.status,
      fullName: m.user.fullName,
      phone: m.user.phone,
      email: m.user.email,
      joinedAt: m.joinedAt,
      roles: m.roles.map((r) => r.role),
      salons: m.allSalons ? '*' : m.salons.map((s) => s.salonId),
      staffMemberId: m.staffMember?.id ?? null,
    }));
  }

  async updateAccess(user: AuthUser, membershipId: string, dto: UpdateMemberAccessDto) {
    const actor = await this.policy.actor(user);
    const member = await this.policy.loadManageableMember(actor, membershipId);

    if (dto.roleIds.length === 0) throw new BadRequestException('Attribuez au moins un rôle.');
    const roles = await this.db.tx.role.findMany({
      where: { id: { in: dto.roleIds } },
      select: { id: true, code: true, isSystem: true, permissions: { select: { permissionCode: true } } },
    });
    if (roles.length !== dto.roleIds.length) throw new BadRequestException('Rôle inconnu.');

    // Retirer des droits suppose de les détenir, comme les accorder.
    this.policy.assertCanAssignRoles(actor, [...member.roles.map((r) => r.role), ...roles]);
    const salonIds = dto.allSalons ? [] : [...new Set(dto.salonIds)];
    if (!dto.allSalons && salonIds.length === 0) throw new BadRequestException('Choisissez au moins un salon.');
    this.policy.assertCanGrantSalonScope(actor, dto.allSalons, salonIds);
    await this.policy.assertSalonsExist(salonIds);

    const staysOwner = roles.some((r) => this.policy.isOwnerRole(r));
    if (member.isOwner && !staysOwner) await this.policy.assertAnotherActiveOwner(member.id);

    const tx = this.db.tx;
    await tx.membershipRole.deleteMany({ where: { membershipId } });
    await tx.membershipRole.createMany({ data: roles.map((r) => ({ tenantId: actor.tenantId, membershipId, roleId: r.id })) });
    await tx.membershipSalon.deleteMany({ where: { membershipId } });
    if (salonIds.length > 0) {
      await tx.membershipSalon.createMany({ data: salonIds.map((salonId) => ({ tenantId: actor.tenantId, membershipId, salonId })) });
    }
    await tx.membership.update({
      where: { id: membershipId },
      data: { allSalons: dto.allSalons, permissionsVersion: { increment: 1 } },
    });
    await this.audit.log({
      action: 'member.access_update',
      entityType: 'membership',
      entityId: membershipId,
      before: { roles: member.roles.map((r) => r.role.code), allSalons: member.allSalons, salons: member.salons.map((s) => s.salonId) },
      after: { roles: roles.map((r) => r.code), allSalons: dto.allSalons, salons: salonIds },
    });
    return (await this.list(user)).find((m) => m.id === membershipId);
  }

  async setSuspended(user: AuthUser, membershipId: string, suspended: boolean) {
    const actor = await this.policy.actor(user);
    const member = await this.policy.loadManageableMember(actor, membershipId);
    if (suspended && member.status !== 'ACTIVE') throw new BadRequestException("Ce membre n'est pas actif.");
    if (!suspended && member.status !== 'SUSPENDED') throw new BadRequestException("Ce membre n'est pas suspendu.");
    if (suspended && member.isOwner) await this.policy.assertAnotherActiveOwner(member.id);

    await this.db.tx.membership.update({
      where: { id: membershipId },
      data: { status: suspended ? 'SUSPENDED' : 'ACTIVE', permissionsVersion: { increment: 1 } },
    });
    await this.audit.log({ action: suspended ? 'member.suspend' : 'member.reactivate', entityType: 'membership', entityId: membershipId });
    const updated = (await this.list(user)).find((m) => m.id === membershipId);
    if (!updated) throw new NotFoundException('Membre introuvable.');
    return updated;
  }
}
