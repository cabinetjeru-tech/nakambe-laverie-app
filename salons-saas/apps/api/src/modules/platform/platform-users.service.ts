import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { PlatformRole, Prisma, UserStatus } from '@prisma/client';
import { normalizePhone } from '../../core/http/phone';
import { PlatformDbService } from '../../core/platform/platform-db.service';
import { platformAudit } from './platform-audit';

/**
 * Super administrateur — Utilisateurs (comptes globaux) et équipe plateforme.
 * Jamais d'accès au mot de passe ni aux jetons ; les actions possibles sont celles du
 * support : déverrouiller, désactiver (avec déconnexion immédiate), réactiver, déconnecter.
 */
@Injectable()
export class PlatformUsersService {
  constructor(private readonly platform: PlatformDbService) {}

  async list(filter: { search?: string; status?: UserStatus; staffOnly?: boolean }) {
    const where: Prisma.UserWhereInput = { anonymizedAt: null };
    if (filter.status) where.status = filter.status;
    if (filter.staffOnly) where.platformStaff = { isNot: null };
    if (filter.search) {
      const q = filter.search.trim();
      where.OR = [
        { fullName: { contains: q, mode: 'insensitive' } },
        { email: { contains: q, mode: 'insensitive' } },
        { phone: { contains: q.replace(/\s/g, '') } },
      ];
    }
    const users = await this.platform.client.user.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: 300,
      select: {
        id: true,
        fullName: true,
        phone: true,
        email: true,
        status: true,
        lockedUntil: true,
        lastLoginAt: true,
        createdAt: true,
        mfaEnabledAt: true,
        platformStaff: { select: { role: true, isActive: true } },
        memberships: {
          where: { status: 'ACTIVE' },
          select: { tenant: { select: { id: true, displayName: true } }, roles: { select: { role: { select: { name: true } } } } },
        },
      },
    });
    return users.map(({ memberships, platformStaff, ...user }) => ({
      ...user,
      platformRole: platformStaff?.isActive ? platformStaff.role : null,
      tenants: memberships.map((m) => ({ ...m.tenant, roles: m.roles.map((r) => r.role.name) })),
    }));
  }

  async detail(userId: string) {
    const db = this.platform.client;
    const user = await db.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        fullName: true,
        phone: true,
        phoneVerifiedAt: true,
        email: true,
        status: true,
        failedLogins: true,
        lockedUntil: true,
        lastLoginAt: true,
        createdAt: true,
        mfaEnabledAt: true,
        platformStaff: { select: { role: true, isActive: true, createdAt: true } },
        memberships: {
          select: {
            status: true,
            joinedAt: true,
            tenant: { select: { id: true, displayName: true, status: true } },
            roles: { select: { role: { select: { name: true } } } },
          },
        },
      },
    });
    if (!user) throw new NotFoundException('Utilisateur introuvable.');
    const activeSessions = await db.userSession.count({ where: { userId, revokedAt: null, rotatedAt: null, expiresAt: { gt: new Date() } } });
    return {
      ...user,
      activeSessions,
      memberships: user.memberships.map((m) => ({ ...m, roles: m.roles.map((r) => r.role.name) })),
    };
  }

  /** Désactivation : connexion impossible et toutes les sessions révoquées immédiatement. */
  async setStatus(actorUserId: string, userId: string, status: 'ACTIVE' | 'DISABLED', reason: string) {
    if (userId === actorUserId) throw new BadRequestException('Vous ne pouvez pas modifier votre propre compte ici.');
    await this.platform.transaction(async (tx) => {
      const user = await tx.user.findUnique({ where: { id: userId }, select: { status: true } });
      if (!user) throw new NotFoundException('Utilisateur introuvable.');
      await tx.user.update({
        where: { id: userId },
        data: status === 'ACTIVE' ? { status, failedLogins: 0, lockedUntil: null } : { status },
      });
      if (status === 'DISABLED') await this.revokeSessions(tx, userId);
      await platformAudit(tx, { tenantId: null, actorUserId, action: status === 'ACTIVE' ? 'platform.user_enabled' : 'platform.user_disabled', entityType: 'user', entityId: userId, after: { reason } });
    });
  }

  /** Compte verrouillé après trop d'échecs : le support le déverrouille après vérification d'identité. */
  async unlock(actorUserId: string, userId: string) {
    await this.platform.transaction(async (tx) => {
      const user = await tx.user.findUnique({ where: { id: userId }, select: { status: true } });
      if (!user) throw new NotFoundException('Utilisateur introuvable.');
      if (user.status === 'DISABLED') throw new ConflictException('Compte désactivé : utilisez « Réactiver ».');
      await tx.user.update({ where: { id: userId }, data: { status: 'ACTIVE', failedLogins: 0, lockedUntil: null } });
      await platformAudit(tx, { tenantId: null, actorUserId, action: 'platform.user_unlocked', entityType: 'user', entityId: userId });
    });
  }

  async logoutEverywhere(actorUserId: string, userId: string) {
    await this.platform.transaction(async (tx) => {
      const count = await this.revokeSessions(tx, userId);
      await platformAudit(tx, { tenantId: null, actorUserId, action: 'platform.user_sessions_revoked', entityType: 'user', entityId: userId, after: { count } });
    });
  }

  // ================================================================== Équipe plateforme

  staff() {
    return this.platform.client.platformStaff.findMany({
      orderBy: { createdAt: 'asc' },
      select: { role: true, isActive: true, createdAt: true, user: { select: { id: true, fullName: true, phone: true, email: true, lastLoginAt: true } } },
    });
  }

  /** Ajout d'un membre de l'équipe : le compte doit déjà exister (inscription par téléphone). */
  async grantStaff(actorUserId: string, phone: string, role: PlatformRole) {
    const normalized = normalizePhone(phone);
    if (!normalized) throw new BadRequestException('Numéro de téléphone invalide.');
    return this.platform.transaction(async (tx) => {
      const user = await tx.user.findUnique({ where: { phone: normalized }, select: { id: true, fullName: true } });
      if (!user) throw new NotFoundException('Aucun compte avec ce numéro : la personne doit d’abord créer son compte.');
      await tx.platformStaff.upsert({ where: { userId: user.id }, create: { userId: user.id, role }, update: { role, isActive: true } });
      await platformAudit(tx, { tenantId: null, actorUserId, action: 'platform.staff_granted', entityType: 'user', entityId: user.id, after: { role } });
      return { userId: user.id, fullName: user.fullName, role };
    });
  }

  async revokeStaff(actorUserId: string, userId: string) {
    if (userId === actorUserId) throw new BadRequestException('Vous ne pouvez pas retirer votre propre accès.');
    await this.platform.transaction(async (tx) => {
      const staff = await tx.platformStaff.findUnique({ where: { userId } });
      if (!staff?.isActive) throw new NotFoundException('Ce compte ne fait pas partie de l’équipe.');
      if (staff.role === 'PLATFORM_OWNER') {
        const owners = await tx.platformStaff.count({ where: { role: 'PLATFORM_OWNER', isActive: true } });
        if (owners <= 1) throw new ConflictException('Il doit rester au moins un super administrateur.');
      }
      await tx.platformStaff.update({ where: { userId }, data: { isActive: false } });
      await platformAudit(tx, { tenantId: null, actorUserId, action: 'platform.staff_revoked', entityType: 'user', entityId: userId });
    });
  }

  private async revokeSessions(tx: Prisma.TransactionClient, userId: string) {
    const result = await tx.userSession.updateMany({ where: { userId, revokedAt: null }, data: { revokedAt: new Date() } });
    return result.count;
  }
}
