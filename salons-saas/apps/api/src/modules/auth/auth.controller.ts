import { Body, Controller, Get, HttpCode, HttpStatus, Inject, Post, Req, Res, UnauthorizedException } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type { Request, Response } from 'express';
import { APP_CONFIG, AppConfig } from '../../config/env';
import { AuthUser } from '../../core/auth/auth-user';
import { Authenticated, CurrentUser, ManualTransaction, Public, ReadOnlyExempt } from '../../core/auth/decorators';
import { SessionService } from '../../core/auth/session.service';
import { requestMeta } from '../../core/db/db-context.interceptor';
import { DbService } from '../../core/db/db.service';
import { AuditService } from '../../core/audit/audit.service';
import { AuthService } from './auth.service';
import {
  ChangePasswordDto,
  ForgotPasswordDto,
  LoginDto,
  RegisterDto,
  ResetPasswordDto,
  SignupDto,
  SwitchTenantDto,
} from './dto/auth.dto';
import { PasswordResetService } from './password-reset.service';
import { assertCsrfHeader, clearRefreshCookie, readRefreshCookie, sessionBody, setRefreshCookie } from './refresh-cookie';

const FIFTEEN_MINUTES = 15 * 60_000;

/** Session et compte : utilisables même quand l'entreprise est en lecture seule. */
@ReadOnlyExempt()
@Controller('auth')
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly passwordReset: PasswordResetService,
    private readonly sessions: SessionService,
    private readonly db: DbService,
    private readonly audit: AuditService,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}

  /** Inscription d'un professionnel (entreprise + premier salon). */
  @Public()
  @Throttle({ default: { limit: 5, ttl: 3600_000 } })
  @Post('signup')
  async signup(@Body() dto: SignupDto, @Res({ passthrough: true }) res: Response) {
    const session = await this.auth.signup(dto);
    setRefreshCookie(res, session, this.config);
    return sessionBody(session);
  }

  /** Inscription d'un client final. */
  @Public()
  @Throttle({ default: { limit: 5, ttl: 3600_000 } })
  @Post('register')
  async register(@Body() dto: RegisterDto, @Res({ passthrough: true }) res: Response) {
    const session = await this.auth.register(dto);
    setRefreshCookie(res, session, this.config);
    return sessionBody(session);
  }

  @Public()
  @ManualTransaction()
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @HttpCode(HttpStatus.OK)
  @Post('login')
  async login(@Body() dto: LoginDto, @Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const session = await this.auth.login(dto, { meta: requestMeta(req) });
    setRefreshCookie(res, session, this.config);
    return sessionBody(session);
  }

  /** Nouveau jeton d'accès à partir du cookie de session (rotation du refresh token). */
  @Public()
  @ManualTransaction()
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  @HttpCode(HttpStatus.OK)
  @Post('refresh')
  async refresh(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    assertCsrfHeader(req);
    const token = readRefreshCookie(req);
    if (!token) throw new UnauthorizedException('Session expirée. Reconnectez-vous.');

    const result = await this.db.withContext({ meta: requestMeta(req) }, () => this.sessions.rotate(token));
    switch (result.status) {
      case 'ok':
        setRefreshCookie(res, result.session, this.config);
        return sessionBody(result.session);
      case 'concurrent':
        // Un autre onglet vient de renouveler la session : ne rien effacer, le client réessaie.
        throw new UnauthorizedException('Session en cours de renouvellement. Réessayez.');
      case 'reused':
        // Jeton déjà utilisé : vol probable. Toute la famille de sessions est révoquée.
        await this.db.withContext({ userId: result.userId, meta: requestMeta(req) }, async () => {
          await this.sessions.revokeFamily(result.familyId);
          await this.audit.log({ action: 'auth.refresh_token_reuse', entityType: 'session', entityId: result.familyId });
        });
        clearRefreshCookie(res, this.config);
        throw new UnauthorizedException('Session révoquée par sécurité. Reconnectez-vous.');
      default:
        clearRefreshCookie(res, this.config);
        throw new UnauthorizedException('Session expirée. Reconnectez-vous.');
    }
  }

  /** Déconnexion de l'appareil courant. */
  @Public()
  @HttpCode(HttpStatus.NO_CONTENT)
  @Post('logout')
  async logout(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    assertCsrfHeader(req);
    const token = readRefreshCookie(req);
    if (token) await this.sessions.revokeByRefreshToken(token);
    clearRefreshCookie(res, this.config);
  }

  /** Déconnexion de tous les appareils. */
  @Authenticated()
  @HttpCode(HttpStatus.NO_CONTENT)
  @Post('logout-all')
  async logoutAll(@CurrentUser() user: AuthUser, @Res({ passthrough: true }) res: Response) {
    await this.auth.logoutEverywhere(user);
    clearRefreshCookie(res, this.config);
  }

  @Authenticated()
  @Get('me')
  me(@CurrentUser() user: AuthUser) {
    return this.auth.me(user);
  }

  /** Choix de l'entreprise active (personnel travaillant pour plusieurs entreprises). */
  @Authenticated()
  @HttpCode(HttpStatus.OK)
  @Post('switch-tenant')
  async switchTenant(@CurrentUser() user: AuthUser, @Body() dto: SwitchTenantDto) {
    return sessionBody(await this.auth.switchTenant(user, dto.tenantId));
  }

  @Public()
  @Throttle({ default: { limit: 5, ttl: FIFTEEN_MINUTES } })
  @HttpCode(HttpStatus.ACCEPTED)
  @Post('password/forgot')
  async forgotPassword(@Body() dto: ForgotPasswordDto) {
    await this.passwordReset.request(dto.phone);
    return { message: 'Si ce numéro correspond à un compte, un code de réinitialisation vient d’être envoyé.' };
  }

  @Public()
  @ManualTransaction()
  @Throttle({ default: { limit: 10, ttl: FIFTEEN_MINUTES } })
  @HttpCode(HttpStatus.NO_CONTENT)
  @Post('password/reset')
  async resetPassword(@Body() dto: ResetPasswordDto, @Req() req: Request, @Res({ passthrough: true }) res: Response) {
    await this.passwordReset.reset(dto.phone, dto.code, dto.newPassword, { meta: requestMeta(req) });
    clearRefreshCookie(res, this.config);
  }

  @Authenticated()
  @Throttle({ default: { limit: 10, ttl: FIFTEEN_MINUTES } })
  @HttpCode(HttpStatus.NO_CONTENT)
  @Post('password/change')
  async changePassword(@CurrentUser() user: AuthUser, @Body() dto: ChangePasswordDto) {
    await this.auth.changePassword(user, dto);
  }
}
