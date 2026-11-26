import { BadRequestException, Body, Controller, ForbiddenException, Get, HttpCode, Injectable, Module, Post, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Throttle } from '@nestjs/throttler';
import { IsString, MaxLength, MinLength } from 'class-validator';
import * as bcrypt from 'bcryptjs';
import { createHash, randomBytes } from 'crypto';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../../common/audit.service';
import { ClientIp, CurrentUser, Public } from '../../common/decorators';
import { AuthUser } from '../../common/auth-user';

export const BCRYPT_COST = 12;
const MAX_FAILED = 5;
const LOCK_MINUTES = 15;
const DUMMY_HASH = bcrypt.hashSync('dread-royal-dummy', 10);

export function sha256(s: string) {
  return createHash('sha256').update(s).digest('hex');
}

/** Règle de robustesse : 8 caractères minimum, au moins une lettre et un chiffre. */
export function assertStrongPassword(pwd: string) {
  if (pwd.length < 8 || !/[A-Za-z]/.test(pwd) || !/\d/.test(pwd)) {
    throw new BadRequestException('Le mot de passe doit contenir au moins 8 caractères, dont des lettres et des chiffres');
  }
}

export function hashPassword(pwd: string) {
  return bcrypt.hash(pwd, BCRYPT_COST);
}

class LoginDto {
  @IsString() @MinLength(2) @MaxLength(50) username: string;
  @IsString() @MinLength(1) @MaxLength(100) password: string;
}
class RefreshDto {
  @IsString() @MinLength(20) refreshToken: string;
}
class ChangePasswordDto {
  @IsString() currentPassword: string;
  @IsString() @MinLength(8) @MaxLength(100) newPassword: string;
}

@Injectable()
export class AuthService {
  constructor(private prisma: PrismaService, private jwt: JwtService, private config: ConfigService, private audit: AuditService) {}

  private async issue(userId: string, ip?: string, userAgent?: string) {
    const refreshToken = randomBytes(48).toString('base64url');
    const days = Number(this.config.get('REFRESH_TTL_DAYS') ?? 30);
    const session = await this.prisma.session.create({
      data: { userId, tokenHash: sha256(refreshToken), ip, userAgent, expiresAt: new Date(Date.now() + days * 86_400_000) },
    });
    const accessToken = await this.jwt.signAsync({ sub: userId, sid: session.id });
    return { accessToken, refreshToken };
  }

  async login(username: string, password: string, ip?: string, ua?: string) {
    const user = await this.prisma.user.findUnique({ where: { username: username.trim().toLowerCase() }, include: { role: true } });
    const generic = new UnauthorizedException('Identifiant ou mot de passe incorrect');
    if (!user) {
      await bcrypt.compare(password, DUMMY_HASH); // temps de réponse constant
      throw generic;
    }
    if (!user.active) throw new UnauthorizedException('Ce compte est désactivé. Contactez le propriétaire.');
    if (user.lockedUntil && user.lockedUntil > new Date()) {
      throw new UnauthorizedException(`Compte temporairement verrouillé après plusieurs échecs. Réessayez plus tard.`);
    }
    const ok = await bcrypt.compare(password, user.passwordHash);
    if (!ok) {
      const failed = user.failedLogins + 1;
      await this.prisma.user.update({
        where: { id: user.id },
        data: { failedLogins: failed, lockedUntil: failed >= MAX_FAILED ? new Date(Date.now() + LOCK_MINUTES * 60_000) : null },
      });
      await this.audit.log({ userId: user.id, action: 'LOGIN_FAILED', entity: 'User', entityId: user.id, ip });
      throw generic;
    }
    await this.prisma.user.update({ where: { id: user.id }, data: { failedLogins: 0, lockedUntil: null, lastLoginAt: new Date() } });
    await this.audit.log({ userId: user.id, action: 'LOGIN', entity: 'User', entityId: user.id, ip });
    const tokens = await this.issue(user.id, ip, ua);
    return { ...tokens, user: await this.profile(user.id) };
  }

  async refresh(refreshToken: string, ip?: string) {
    const session = await this.prisma.session.findUnique({ where: { tokenHash: sha256(refreshToken) }, include: { user: true } });
    if (!session || session.expiresAt < new Date() || !session.user.active) throw new UnauthorizedException('Session expirée');
    if (session.revokedAt) {
      // Réutilisation d'un jeton déjà consommé : possible vol → on révoque toutes les sessions de l'utilisateur
      await this.prisma.session.updateMany({ where: { userId: session.userId, revokedAt: null }, data: { revokedAt: new Date() } });
      throw new UnauthorizedException('Session expirée');
    }
    // Rotation : l'ancien jeton est révoqué, un nouveau est émis
    await this.prisma.session.update({ where: { id: session.id }, data: { revokedAt: new Date() } });
    const tokens = await this.issue(session.userId, ip, session.userAgent ?? undefined);
    return { ...tokens, user: await this.profile(session.userId) };
  }

  async logout(sessionId: string) {
    await this.prisma.session.updateMany({ where: { id: sessionId, revokedAt: null }, data: { revokedAt: new Date() } });
  }

  async profile(userId: string) {
    const u = await this.prisma.user.findUniqueOrThrow({ where: { id: userId }, include: { role: true, staff: true } });
    return {
      id: u.id,
      username: u.username,
      fullName: u.fullName,
      phone: u.phone,
      role: { code: u.role.code, name: u.role.name },
      permissions: u.role.permissions,
      staffId: u.staffId,
      staffName: u.staff ? `${u.staff.firstName} ${u.staff.lastName}` : null,
      mustChangePassword: u.mustChangePassword,
      lastLoginAt: u.lastLoginAt,
    };
  }

  async changePassword(user: AuthUser, dto: ChangePasswordDto, ip?: string) {
    const u = await this.prisma.user.findUniqueOrThrow({ where: { id: user.id } });
    if (!(await bcrypt.compare(dto.currentPassword, u.passwordHash))) throw new ForbiddenException('Mot de passe actuel incorrect');
    assertStrongPassword(dto.newPassword);
    if (dto.newPassword === dto.currentPassword) throw new BadRequestException("Le nouveau mot de passe doit être différent de l'ancien");
    await this.prisma.user.update({ where: { id: u.id }, data: { passwordHash: await hashPassword(dto.newPassword), mustChangePassword: false } });
    // Déconnecte les autres appareils
    await this.prisma.session.updateMany({ where: { userId: u.id, revokedAt: null, NOT: { id: user.sessionId } }, data: { revokedAt: new Date() } });
    await this.audit.log({ userId: u.id, action: 'PASSWORD_CHANGE', entity: 'User', entityId: u.id, ip });
    return { ok: true };
  }
}

@Controller('auth')
export class AuthController {
  constructor(private auth: AuthService) {}

  @Public()
  @Throttle({ default: { limit: Number(process.env.LOGIN_THROTTLE_LIMIT ?? 10), ttl: 60_000 } })
  @Post('login')
  @HttpCode(200)
  login(@Body() dto: LoginDto, @ClientIp() ip: string) {
    return this.auth.login(dto.username, dto.password, ip);
  }

  @Public()
  @Post('refresh')
  @HttpCode(200)
  refresh(@Body() dto: RefreshDto, @ClientIp() ip: string) {
    return this.auth.refresh(dto.refreshToken, ip);
  }

  @Post('logout')
  @HttpCode(200)
  async logout(@CurrentUser() user: AuthUser) {
    await this.auth.logout(user.sessionId);
    return { ok: true };
  }

  @Get('me')
  me(@CurrentUser() user: AuthUser) {
    return this.auth.profile(user.id);
  }

  @Post('change-password')
  @HttpCode(200)
  changePassword(@CurrentUser() user: AuthUser, @Body() dto: ChangePasswordDto, @ClientIp() ip: string) {
    return this.auth.changePassword(user, dto, ip);
  }
}

@Module({ controllers: [AuthController], providers: [AuthService], exports: [AuthService] })
export class AuthModule {}
