import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  HttpException,
  HttpStatus,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { AuditService } from '../../core/audit/audit.service';
import { AuthUser } from '../../core/auth/auth-user';
import { IssuedSession, SessionService } from '../../core/auth/session.service';
import { DbContext, DbService } from '../../core/db/db.service';
import { normalizeEmail, normalizePhone } from '../../core/http/phone';
import { PasswordService } from '../../core/security/password.service';
import { ChangePasswordDto, LoginDto, RegisterDto, SignupDto } from './dto/auth.dto';
import { TenantProvisioningService } from './tenant-provisioning.service';

/** Verrouillage : après 5 échecs consécutifs, 15 min ; la durée double à chaque nouvelle série. */
const MAX_FAILED_LOGINS = 5;
const BASE_LOCK_MINUTES = 15;
const MAX_LOCK_MINUTES = 24 * 60;

const INVALID_CREDENTIALS = 'Identifiant ou mot de passe incorrect.';

export class AccountLockedException extends HttpException {
  constructor(until: Date) {
    super(
      {
        statusCode: HttpStatus.TOO_MANY_REQUESTS,
        message: 'Trop de tentatives. Compte temporairement verrouillé : réessayez plus tard ou réinitialisez votre mot de passe.',
        retryAfterSeconds: Math.max(1, Math.ceil((until.getTime() - Date.now()) / 1000)),
      },
      HttpStatus.TOO_MANY_REQUESTS,
    );
  }
}

@Injectable()
export class AuthService {
  constructor(
    private readonly db: DbService,
    private readonly passwords: PasswordService,
    private readonly sessions: SessionService,
    private readonly provisioning: TenantProvisioningService,
    private readonly audit: AuditService,
  ) {}

  /** Inscription d'un professionnel : compte + entreprise + premier salon, connecté d'office. */
  async signup(dto: SignupDto): Promise<IssuedSession> {
    await this.assertIdentityAvailable(dto.phone, dto.email);
    const user = await this.db.tx.user.create({
      data: {
        fullName: dto.fullName,
        phone: dto.phone,
        email: dto.email ?? null,
        passwordHash: await this.passwords.hash(dto.password),
      },
    });
    await this.db.setContext({ userId: user.id });
    const { tenantId, salonId } = await this.provisioning.provision({
      ownerUserId: user.id,
      ownerName: dto.fullName,
      businessName: dto.businessName,
      salonName: dto.salonName,
      city: dto.city,
    });
    await this.audit.log({ action: 'tenant.signup', entityType: 'tenant', entityId: tenantId, salonId });
    return this.sessions.open(user.id, tenantId);
  }

  /** Inscription d'un client final. */
  async register(dto: RegisterDto): Promise<IssuedSession> {
    await this.assertIdentityAvailable(dto.phone, dto.email);
    const user = await this.db.tx.user.create({
      data: {
        fullName: dto.fullName,
        phone: dto.phone,
        email: dto.email ?? null,
        passwordHash: await this.passwords.hash(dto.password),
      },
    });
    await this.db.setContext({ userId: user.id });
    await this.audit.log({ action: 'user.register', entityType: 'user', entityId: user.id });
    return this.sessions.open(user.id, null);
  }

  /**
   * Connexion. S'exécute dans sa propre transaction : le compteur d'échecs doit être
   * enregistré même si la réponse est une erreur.
   */
  async login(dto: LoginDto, context: DbContext): Promise<IssuedSession> {
    const outcome = await this.db.withContext(context, async () => {
      const user = await this.findByIdentifier(dto.identifier);
      if (!user || !user.passwordHash || user.status === 'DISABLED') {
        await this.passwords.verify(null, dto.password); // même durée qu'un vrai essai
        return { ok: false as const, reason: 'invalid' as const };
      }
      await this.db.setContext({ userId: user.id });

      if (user.lockedUntil && user.lockedUntil > new Date()) {
        return { ok: false as const, reason: 'locked' as const, until: user.lockedUntil };
      }

      const valid = await this.passwords.verify(user.passwordHash, dto.password);
      if (!valid) {
        const failed = user.failedLogins + 1;
        const series = Math.floor(failed / MAX_FAILED_LOGINS);
        const lockedUntil =
          failed % MAX_FAILED_LOGINS === 0
            ? new Date(Date.now() + Math.min(BASE_LOCK_MINUTES * 2 ** (series - 1), MAX_LOCK_MINUTES) * 60_000)
            : null;
        await this.db.tx.user.update({
          where: { id: user.id },
          data: { failedLogins: failed, ...(lockedUntil ? { lockedUntil } : {}) },
        });
        await this.audit.log({ action: 'auth.login_failed', entityType: 'user', entityId: user.id, after: { failed } });
        return lockedUntil
          ? { ok: false as const, reason: 'locked' as const, until: lockedUntil }
          : { ok: false as const, reason: 'invalid' as const };
      }

      await this.db.tx.user.update({
        where: { id: user.id },
        data: {
          failedLogins: 0,
          lockedUntil: null,
          lastLoginAt: new Date(),
          ...(this.passwords.needsRehash(user.passwordHash) ? { passwordHash: await this.passwords.hash(dto.password) } : {}),
        },
      });

      // Une seule entreprise active → elle est sélectionnée d'office.
      const memberships = await this.activeMemberships(user.id);
      const tenantId = memberships.length === 1 ? memberships[0].tenantId : null;
      const session = await this.sessions.open(user.id, tenantId);
      await this.audit.log({ action: 'auth.login', entityType: 'user', entityId: user.id });
      return { ok: true as const, session };
    });

    if (outcome.ok) return outcome.session;
    if (outcome.reason === 'locked') throw new AccountLockedException(outcome.until);
    throw new UnauthorizedException(INVALID_CREDENTIALS);
  }

  /** Profil, entreprises accessibles et droits dans l'entreprise active. */
  async me(user: AuthUser) {
    const profile = await this.db.tx.user.findUniqueOrThrow({
      where: { id: user.userId },
      select: { id: true, fullName: true, phone: true, email: true, phoneVerifiedAt: true, locale: true, createdAt: true },
    });
    const memberships = await this.activeMemberships(user.userId);
    const platformStaff = await this.db.tx.platformStaff.findUnique({ where: { userId: user.userId }, select: { role: true, isActive: true } });
    return {
      user: profile,
      memberships,
      /** Personnel de l'éditeur (console plateforme) ; null pour les salons. */
      platformRole: platformStaff?.isActive ? platformStaff.role : null,
      activeTenant: user.tenantId
        ? {
            tenantId: user.tenantId,
            membershipId: user.membershipId,
            permissions: user.permissions,
            salons: user.allSalons ? '*' : user.salonIds,
          }
        : null,
    };
  }

  async switchTenant(user: AuthUser, tenantId: string | null) {
    const result = await this.sessions.switchTenant(user.userId, user.sessionId, tenantId);
    if (!result) throw new NotFoundException('Entreprise introuvable ou accès retiré.');
    return result;
  }

  async changePassword(user: AuthUser, dto: ChangePasswordDto): Promise<void> {
    const account = await this.db.tx.user.findUniqueOrThrow({ where: { id: user.userId }, select: { passwordHash: true } });
    if (!(await this.passwords.verify(account.passwordHash, dto.currentPassword))) {
      throw new ForbiddenException('Mot de passe actuel incorrect.');
    }
    if (dto.currentPassword === dto.newPassword) {
      throw new BadRequestException("Le nouveau mot de passe doit être différent de l'actuel.");
    }
    await this.db.tx.user.update({
      where: { id: user.userId },
      data: { passwordHash: await this.passwords.hash(dto.newPassword), failedLogins: 0, lockedUntil: null },
    });
    // Les autres appareils sont déconnectés ; la session courante reste ouverte.
    await this.sessions.revokeAllForUser(user.userId, user.sessionId);
    await this.audit.log({ action: 'auth.password_changed', entityType: 'user', entityId: user.userId });
  }

  async logoutEverywhere(user: AuthUser): Promise<void> {
    await this.sessions.revokeAllForUser(user.userId);
    await this.audit.log({ action: 'auth.logout_all', entityType: 'user', entityId: user.userId });
  }

  /** Adhésions actives de l'utilisateur, dans toutes ses entreprises. */
  async activeMemberships(userId: string) {
    const rows = await this.db.asUserAcrossTenants(() =>
      this.db.tx.membership.findMany({
        where: { userId, status: 'ACTIVE' },
        select: { id: true, tenantId: true },
      }),
    );
    if (rows.length === 0) return [];
    const tenants = await this.db.tx.tenant.findMany({
      where: { id: { in: rows.map((r) => r.tenantId) } },
      select: { id: true, slug: true, displayName: true, status: true },
    });
    const byId = new Map(tenants.map((t) => [t.id, t]));
    return rows
      .map((r) => ({ membershipId: r.id, tenantId: r.tenantId, tenant: byId.get(r.tenantId) }))
      .filter((r) => r.tenant && r.tenant.status !== 'CANCELLED')
      .map((r) => ({ membershipId: r.membershipId, tenantId: r.tenantId, slug: r.tenant!.slug, name: r.tenant!.displayName, status: r.tenant!.status }));
  }

  private async findByIdentifier(identifier: string) {
    const select = { id: true, passwordHash: true, status: true, failedLogins: true, lockedUntil: true } as const;
    if (identifier.includes('@')) {
      return this.db.tx.user.findUnique({ where: { email: normalizeEmail(identifier) }, select });
    }
    const phone = normalizePhone(identifier);
    return phone ? this.db.tx.user.findUnique({ where: { phone }, select }) : null;
  }

  private async assertIdentityAvailable(phone: string, email?: string) {
    const existing = await this.db.tx.user.findFirst({
      where: { OR: [{ phone }, ...(email ? [{ email }] : [])] },
      select: { id: true },
    });
    if (existing) {
      throw new ConflictException('Un compte existe déjà avec ce numéro ou cet email. Connectez-vous.');
    }
  }
}
