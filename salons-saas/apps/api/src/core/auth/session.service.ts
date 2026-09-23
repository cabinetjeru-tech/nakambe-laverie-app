import { randomUUID } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import { APP_CONFIG, AppConfig } from '../../config/env';
import { DbService } from '../db/db.service';
import { CryptoService } from '../security/crypto.service';
import { AccessTokenService } from './access-token.service';
import { TenantAccess, TenantAccessService } from './tenant-access.service';

/** Délai pendant lequel un refresh token tout juste renouvelé n'est pas considéré comme volé
 *  (deux onglets qui rafraîchissent en même temps). */
const CONCURRENT_REFRESH_GRACE_MS = 20_000;

export interface IssuedSession {
  accessToken: string;
  accessTokenExpiresIn: number;
  refreshToken: string;
  refreshTokenExpiresAt: Date;
  access: TenantAccess | null;
}

export type RotationResult =
  | { status: 'ok'; session: IssuedSession; userId: string }
  | { status: 'invalid' }
  | { status: 'reused'; familyId: string; userId: string }
  | { status: 'concurrent' };

/**
 * Sessions : jeton d'accès JWT court (15 min) + refresh token opaque (30 j) stocké haché.
 * Chaque refresh token ne sert qu'une fois (rotation) ; présenter un jeton déjà utilisé
 * signale un vol probable → toute la famille de sessions est révoquée.
 */
@Injectable()
export class SessionService {
  constructor(
    private readonly db: DbService,
    private readonly crypto: CryptoService,
    private readonly tokens: AccessTokenService,
    private readonly tenantAccess: TenantAccessService,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}

  /** Ouvre une nouvelle session (connexion, inscription). */
  async open(userId: string, tenantId: string | null): Promise<IssuedSession> {
    const familyId = randomUUID();
    const access = tenantId ? await this.tenantAccess.build(userId, tenantId) : null;
    const refresh = await this.storeRefreshToken(userId, familyId, access?.tenantId ?? null);
    return { ...refresh, ...this.accessToken(userId, familyId, access), access };
  }

  /** Échange un refresh token contre une nouvelle paire (dans une transaction de contexte). */
  async rotate(refreshToken: string): Promise<RotationResult> {
    const tx = this.db.tx;
    const row = await tx.userSession.findUnique({
      where: { refreshTokenHash: this.crypto.fingerprint(refreshToken) },
      select: { id: true, userId: true, familyId: true, activeTenantId: true, expiresAt: true, rotatedAt: true, revokedAt: true, user: { select: { status: true } } },
    });
    if (!row || row.revokedAt || row.expiresAt <= new Date() || row.user.status === 'DISABLED') {
      return { status: 'invalid' };
    }
    if (row.rotatedAt) {
      if (Date.now() - row.rotatedAt.getTime() < CONCURRENT_REFRESH_GRACE_MS) return { status: 'concurrent' };
      return { status: 'reused', familyId: row.familyId, userId: row.userId };
    }

    // Marquage atomique : si deux requêtes arrivent en même temps, une seule gagne.
    const claimed = await tx.userSession.updateMany({
      where: { id: row.id, rotatedAt: null },
      data: { rotatedAt: new Date() },
    });
    if (claimed.count !== 1) return { status: 'concurrent' };

    await this.db.setContext({ userId: row.userId });
    let access: TenantAccess | null = null;
    if (row.activeTenantId) {
      access = await this.tenantAccess.build(row.userId, row.activeTenantId);
      if (!access) await this.db.setContext({ tenantId: null });
    }
    const refresh = await this.storeRefreshToken(row.userId, row.familyId, access?.tenantId ?? null, row.expiresAt);
    return {
      status: 'ok',
      userId: row.userId,
      session: { ...refresh, ...this.accessToken(row.userId, row.familyId, access), access },
    };
  }

  /** Change le tenant actif de la session courante et renvoie un nouveau jeton d'accès. */
  async switchTenant(userId: string, familyId: string, tenantId: string | null) {
    const access = tenantId ? await this.tenantAccess.build(userId, tenantId) : null;
    if (tenantId && !access) return null;
    await this.db.tx.userSession.updateMany({
      where: { familyId, userId, revokedAt: null, rotatedAt: null },
      data: { activeTenantId: access?.tenantId ?? null },
    });
    return { ...this.accessToken(userId, familyId, access), access };
  }

  /** Nouveau jeton d'accès pour la session courante (ex. après modification de ses propres droits). */
  async reissue(userId: string, familyId: string, tenantId: string | null) {
    return this.switchTenant(userId, familyId, tenantId);
  }

  async revokeFamily(familyId: string): Promise<void> {
    await this.db.tx.userSession.updateMany({ where: { familyId, revokedAt: null }, data: { revokedAt: new Date() } });
  }

  async revokeAllForUser(userId: string, exceptFamilyId?: string): Promise<void> {
    await this.db.tx.userSession.updateMany({
      where: { userId, revokedAt: null, ...(exceptFamilyId ? { familyId: { not: exceptFamilyId } } : {}) },
      data: { revokedAt: new Date() },
    });
  }

  async revokeByRefreshToken(refreshToken: string): Promise<void> {
    const row = await this.db.tx.userSession.findUnique({
      where: { refreshTokenHash: this.crypto.fingerprint(refreshToken) },
      select: { familyId: true },
    });
    if (row) await this.revokeFamily(row.familyId);
  }

  private accessToken(userId: string, familyId: string, access: TenantAccess | null) {
    const accessToken = this.tokens.sign({
      sub: userId,
      sid: familyId,
      tid: access?.tenantId ?? null,
      mid: access?.membershipId ?? null,
      perms: access?.permissions ?? [],
      sal: access ? (access.allSalons ? '*' : access.salonIds) : [],
      pv: access?.permissionsVersion ?? 0,
    });
    return { accessToken, accessTokenExpiresIn: this.tokens.ttlSeconds };
  }

  private async storeRefreshToken(userId: string, familyId: string, activeTenantId: string | null, familyExpiresAt?: Date) {
    const refreshToken = this.crypto.randomToken();
    // La famille garde son échéance d'origine : la rotation ne prolonge pas une session indéfiniment.
    const refreshTokenExpiresAt =
      familyExpiresAt ?? new Date(Date.now() + this.config.REFRESH_TOKEN_TTL_DAYS * 24 * 3600 * 1000);
    const meta = this.db.meta;
    await this.db.tx.userSession.create({
      data: {
        userId,
        familyId,
        refreshTokenHash: this.crypto.fingerprint(refreshToken),
        activeTenantId,
        expiresAt: refreshTokenExpiresAt,
        ipAddress: meta.ipAddress ?? null,
        userAgent: meta.userAgent ?? null,
      },
    });
    return { refreshToken, refreshTokenExpiresAt };
  }
}
