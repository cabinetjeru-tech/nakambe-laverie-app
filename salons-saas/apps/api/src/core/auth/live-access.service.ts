import { ForbiddenException, Injectable, UnauthorizedException } from '@nestjs/common';
import { DbService } from '../db/db.service';
import { AuthUser } from './auth-user';

const READ_ONLY_TENANT_STATUSES = new Set(['SUSPENDED', 'CANCELLED']);
const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

/**
 * Contrôles effectués à chaque requête authentifiée, dans la transaction de la requête :
 * - la session (famille de refresh tokens) n'est pas révoquée : déconnexion, changement
 *   de mot de passe et détection de vol prennent effet immédiatement ;
 * - le compte est actif ;
 * - l'adhésion au tenant est active et ses permissions n'ont pas changé depuis l'émission
 *   du jeton (sinon : 401, le client rafraîchit et obtient les nouveaux droits) ;
 * - un tenant suspendu ou résilié est en lecture seule.
 */
@Injectable()
export class LiveAccessService {
  constructor(private readonly db: DbService) {}

  async assertStillValid(user: AuthUser, method: string): Promise<void> {
    const tx = this.db.tx;

    const activeSession = await tx.userSession.findFirst({
      where: { familyId: user.sessionId, userId: user.userId, revokedAt: null, rotatedAt: null, expiresAt: { gt: new Date() } },
      select: { id: true, user: { select: { status: true } } },
    });
    if (!activeSession || activeSession.user.status === 'DISABLED') {
      throw new UnauthorizedException('Session expirée ou révoquée. Reconnectez-vous.');
    }

    if (!user.tenantId || !user.membershipId) return;

    const membership = await tx.membership.findFirst({
      where: { id: user.membershipId, userId: user.userId },
      select: { status: true, permissionsVersion: true, tenant: { select: { status: true } } },
    });
    if (!membership || membership.status !== 'ACTIVE' || membership.permissionsVersion !== user.permissionsVersion) {
      throw new UnauthorizedException('Vos accès ont changé. Reconnectez-vous ou rafraîchissez la session.');
    }
    if (READ_ONLY_TENANT_STATUSES.has(membership.tenant.status) && !SAFE_METHODS.has(method.toUpperCase())) {
      throw new ForbiddenException("L'abonnement de cette entreprise est suspendu : consultation uniquement.");
    }
  }
}
