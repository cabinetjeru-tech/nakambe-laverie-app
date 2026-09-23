import { Inject, Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { APP_CONFIG, AppConfig } from '../../config/env';
import { AccessTokenPayload, AuthUser, toAuthUser } from './auth-user';

const ISSUER = 'salons-saas';
const AUDIENCE = 'salons-saas-api';

@Injectable()
export class AccessTokenService {
  constructor(
    private readonly jwt: JwtService,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}

  get ttlSeconds(): number {
    return this.config.JWT_ACCESS_TTL_SECONDS;
  }

  sign(payload: AccessTokenPayload): string {
    return this.jwt.sign(payload, {
      secret: this.config.JWT_ACCESS_SECRET,
      expiresIn: this.config.JWT_ACCESS_TTL_SECONDS,
      algorithm: 'HS256',
      issuer: ISSUER,
      audience: AUDIENCE,
    });
  }

  /** Renvoie null si le jeton est absent, expiré, mal signé ou d'un autre émetteur. */
  verify(token: string): AuthUser | null {
    try {
      const payload = this.jwt.verify<AccessTokenPayload>(token, {
        secret: this.config.JWT_ACCESS_SECRET,
        algorithms: ['HS256'],
        issuer: ISSUER,
        audience: AUDIENCE,
      });
      if (typeof payload.sub !== 'string' || typeof payload.sid !== 'string') return null;
      return toAuthUser(payload);
    } catch {
      return null;
    }
  }
}
