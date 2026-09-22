import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { DriverStatus, Prisma, SecretKind, User, UserStatus } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { createHash, randomBytes } from 'crypto';
import { ALL_PERMISSIONS_WILDCARD, ROLE } from '../../common/permissions';
import { normalizeBurkinaPhone } from '../../common/utils/phone';
import { passwordPolicyError, pinPolicyError } from '../../common/utils/secret-policy';
import { PrismaService } from '../../prisma/prisma.service';
import { SettingsService } from '../settings/settings.service';
import { ChangeSecretDto, LoginDto, RegisterDto } from './dto/auth.dto';

export const BCRYPT_COST = 12;

export interface RequestContext {
  ip?: string;
  userAgent?: string;
}

export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export function requirePhone(input: string): string {
  const phone = normalizeBurkinaPhone(input);
  if (!phone) throw new BadRequestException('Numéro de téléphone invalide (8 chiffres, ex. 70 12 34 56).');
  return phone;
}

/** Vérifie le code secret selon le type de compte ; lève une erreur lisible sinon. */
export function assertSecretPolicy(kind: SecretKind, secret: string) {
  const error = kind === SecretKind.PIN ? pinPolicyError(secret) : passwordPolicyError(secret);
  if (error) throw new BadRequestException(error);
}

const userWithAccess = {
  roles: { include: { role: { include: { permissions: { include: { permission: true } } } } } },
  driverProfile: { select: { status: true, cityId: true, vehicleType: true, employmentType: true } },
} satisfies Prisma.UserInclude;

type UserWithAccess = Prisma.UserGetPayload<{ include: typeof userWithAccess }>;

@Injectable()
export class AuthService {
  private readonly dummyHash = bcrypt.hash(randomBytes(16).toString('hex'), BCRYPT_COST);

  constructor(
    private prisma: PrismaService,
    private jwt: JwtService,
    private config: ConfigService,
    private settings: SettingsService,
  ) {}

  // ------------------------------------------------------------------ inscription

  async register(dto: RegisterDto, ctx: RequestContext) {
    const phone = requirePhone(dto.phone);
    assertSecretPolicy(SecretKind.PIN, dto.pin);

    if (dto.accountType === 'DRIVER') {
      if (!dto.driver) throw new BadRequestException('Les informations du livreur (ville, véhicule) sont obligatoires.');
      const city = await this.prisma.city.findFirst({ where: { id: dto.driver.cityId, isActive: true } });
      if (!city) throw new BadRequestException("Cette ville n'est pas desservie.");
    }

    const existing = await this.prisma.user.findUnique({ where: { phone } });
    if (existing) throw new ConflictException('Un compte existe déjà avec ce numéro. Connectez-vous.');

    const roleCode = dto.accountType === 'DRIVER' ? ROLE.DRIVER : ROLE.CLIENT;
    const role = await this.prisma.role.findUnique({ where: { code: roleCode } });
    if (!role) throw new Error(`Rôle ${roleCode} introuvable : le seed a-t-il été exécuté ?`);

    const user = await this.prisma.user.create({
      data: {
        phone,
        firstName: dto.firstName.trim(),
        lastName: dto.lastName.trim(),
        secretHash: await bcrypt.hash(dto.pin, BCRYPT_COST),
        secretKind: SecretKind.PIN,
        roles: { create: { roleId: role.id } },
        driverProfile:
          dto.accountType === 'DRIVER' && dto.driver
            ? {
                create: {
                  cityId: dto.driver.cityId,
                  vehicleType: dto.driver.vehicleType,
                  plateNumber: dto.driver.plateNumber?.trim().toUpperCase(),
                  status: DriverStatus.PENDING,
                },
              }
            : undefined,
      },
      include: userWithAccess,
    });

    return this.startSession(user, dto.deviceLabel, ctx);
  }

  // ------------------------------------------------------------------ connexion

  async login(dto: LoginDto, ctx: RequestContext) {
    const phone = normalizeBurkinaPhone(dto.phone);
    const invalid = new UnauthorizedException('Numéro ou code secret incorrect.');
    if (!phone) throw invalid;

    const user = await this.prisma.user.findUnique({ where: { phone }, include: userWithAccess });
    if (!user) {
      // Comparaison factice : même temps de réponse que pour un compte existant.
      await bcrypt.compare(dto.secret, await this.dummyHash);
      throw invalid;
    }
    if (user.status !== UserStatus.ACTIVE) {
      throw new ForbiddenException('Ce compte est suspendu. Contactez le service client Allô-Coursier.');
    }
    if (user.lockedUntil && user.lockedUntil > new Date()) {
      const minutes = Math.ceil((user.lockedUntil.getTime() - Date.now()) / 60_000);
      throw new ForbiddenException(`Trop d'essais incorrects. Réessayez dans ${minutes} minute(s).`);
    }

    const valid = await bcrypt.compare(dto.secret, user.secretHash);
    if (!valid) {
      await this.registerFailedAttempt(user);
      throw invalid;
    }

    await this.prisma.user.update({
      where: { id: user.id },
      data: { failedLoginAttempts: 0, lockedUntil: null, lastLoginAt: new Date() },
    });
    return this.startSession(user, dto.deviceLabel, ctx);
  }

  private async registerFailedAttempt(user: User) {
    const maxAttempts = await this.settings.get('auth.maxFailedAttempts');
    const attempts = user.failedLoginAttempts + 1;
    const lock = attempts >= maxAttempts;
    const lockMinutes = await this.settings.get('auth.lockMinutes');
    await this.prisma.user.update({
      where: { id: user.id },
      data: {
        failedLoginAttempts: lock ? 0 : attempts,
        lockedUntil: lock ? new Date(Date.now() + lockMinutes * 60_000) : undefined,
      },
    });
  }

  // ------------------------------------------------------------------ sessions

  async refresh(refreshToken: string, ctx: RequestContext) {
    const tokenHash = hashToken(refreshToken);
    const session = await this.prisma.session.findUnique({ where: { refreshTokenHash: tokenHash } });
    const expired = new UnauthorizedException('Session expirée. Veuillez vous reconnecter.');
    if (!session) throw expired;

    if (session.revokedAt) {
      // Un jeton déjà utilisé est présenté à nouveau : possible vol. On ferme toutes les sessions.
      await this.prisma.session.updateMany({
        where: { userId: session.userId, revokedAt: null },
        data: { revokedAt: new Date() },
      });
      throw expired;
    }
    if (session.expiresAt < new Date()) throw expired;

    const user = await this.prisma.user.findUnique({ where: { id: session.userId }, include: userWithAccess });
    if (!user || user.status !== UserStatus.ACTIVE) throw expired;

    // Rotation : l'ancien jeton est invalidé, un nouveau est émis sur la même session logique.
    const newRefreshToken = randomBytes(48).toString('base64url');
    const revoked = await this.prisma.session.updateMany({
      where: { id: session.id, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    if (revoked.count === 0) throw expired; // renouvellement concurrent
    await this.prisma.session.create({
      data: {
        userId: user.id,
        refreshTokenHash: hashToken(newRefreshToken),
        deviceLabel: session.deviceLabel,
        userAgent: ctx.userAgent ?? session.userAgent,
        ip: ctx.ip,
        expiresAt: await this.refreshExpiry(),
      },
    });
    return { ...this.buildAccess(user), refreshToken: newRefreshToken };
  }

  async logout(refreshToken: string) {
    await this.prisma.session.updateMany({
      where: { refreshTokenHash: hashToken(refreshToken), revokedAt: null },
      data: { revokedAt: new Date() },
    });
    return { success: true };
  }

  async changeSecret(userId: string, dto: ChangeSecretDto) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException();
    if (!(await bcrypt.compare(dto.currentSecret, user.secretHash))) {
      throw new BadRequestException('Le code secret actuel est incorrect.');
    }
    assertSecretPolicy(user.secretKind, dto.newSecret);
    await this.prisma.$transaction([
      this.prisma.user.update({
        where: { id: userId },
        data: { secretHash: await bcrypt.hash(dto.newSecret, BCRYPT_COST) },
      }),
      // Déconnecte les autres appareils.
      this.prisma.session.updateMany({ where: { userId, revokedAt: null }, data: { revokedAt: new Date() } }),
    ]);
    return { success: true, message: 'Code secret modifié. Reconnectez-vous sur vos appareils.' };
  }

  async me(userId: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId }, include: userWithAccess });
    if (!user) throw new NotFoundException();
    return this.toPublicUser(user);
  }

  // ------------------------------------------------------------------ utilitaires

  private async refreshExpiry(): Promise<Date> {
    const days = Number(this.config.get('REFRESH_TOKEN_TTL_DAYS') ?? 30);
    return new Date(Date.now() + days * 24 * 3600 * 1000);
  }

  private async startSession(user: UserWithAccess, deviceLabel: string | undefined, ctx: RequestContext) {
    const refreshToken = randomBytes(48).toString('base64url');
    await this.prisma.session.create({
      data: {
        userId: user.id,
        refreshTokenHash: hashToken(refreshToken),
        deviceLabel,
        userAgent: ctx.userAgent,
        ip: ctx.ip,
        expiresAt: await this.refreshExpiry(),
      },
    });
    return { ...this.buildAccess(user), refreshToken, user: this.toPublicUser(user) };
  }

  private buildAccess(user: UserWithAccess) {
    const roles = [...new Set(user.roles.map((ur) => ur.role.code))];
    const perms = roles.includes(ROLE.SUPER_ADMIN)
      ? [ALL_PERMISSIONS_WILDCARD]
      : [...new Set(user.roles.flatMap((ur) => ur.role.permissions.map((rp) => rp.permission.code)))];
    const accessToken = this.jwt.sign(
      { sub: user.id, roles, perms, cities: this.cityScope(user) },
      {
        secret: this.config.getOrThrow<string>('JWT_ACCESS_SECRET'),
        expiresIn: this.config.get<string>('JWT_ACCESS_EXPIRES_IN') ?? '15m',
      },
    );
    return { accessToken };
  }

  /**
   * Périmètre géographique de l'équipe : null si au moins un rôle d'équipe s'applique à toutes les villes,
   * sinon la liste des villes des rôles limités.
   */
  private cityScope(user: UserWithAccess): string[] | null {
    const staffRoles = user.roles.filter((ur) => ur.role.code === ROLE.SUPER_ADMIN || ur.role.permissions.length > 0);
    if (staffRoles.length === 0 || staffRoles.some((ur) => !ur.cityId)) return null;
    return [...new Set(staffRoles.map((ur) => ur.cityId!))];
  }

  toPublicUser(user: UserWithAccess) {
    const roles = [...new Set(user.roles.map((ur) => ur.role.code))];
    return {
      id: user.id,
      phone: user.phone,
      firstName: user.firstName,
      lastName: user.lastName,
      email: user.email,
      avatarUrl: user.avatarUrl,
      roles,
      permissions: roles.includes(ROLE.SUPER_ADMIN)
        ? [ALL_PERMISSIONS_WILDCARD]
        : [...new Set(user.roles.flatMap((ur) => ur.role.permissions.map((rp) => rp.permission.code)))],
      cityScopes: user.roles.filter((ur) => ur.cityId).map((ur) => ({ roleCode: ur.role.code, cityId: ur.cityId })),
      driver: user.driverProfile,
      createdAt: user.createdAt,
    };
  }
}
