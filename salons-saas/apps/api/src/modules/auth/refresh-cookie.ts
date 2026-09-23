import { ForbiddenException } from '@nestjs/common';
import type { CookieOptions, Request, Response } from 'express';
import type { AppConfig } from '../../config/env';
import type { IssuedSession } from '../../core/auth/session.service';

export const REFRESH_COOKIE = 'salons_rt';
const COOKIE_PATH = '/api/v1/auth';

/**
 * Le refresh token ne circule QUE dans un cookie httpOnly (inaccessible au JavaScript,
 * donc à une faille XSS), limité aux routes /api/v1/auth et envoyé seulement en
 * navigation de même site (SameSite=Strict).
 */
function cookieOptions(config: AppConfig): CookieOptions {
  return { httpOnly: true, secure: config.COOKIE_SECURE, sameSite: 'strict', path: COOKIE_PATH };
}

export function setRefreshCookie(res: Response, session: Pick<IssuedSession, 'refreshToken' | 'refreshTokenExpiresAt'>, config: AppConfig) {
  res.cookie(REFRESH_COOKIE, session.refreshToken, { ...cookieOptions(config), expires: session.refreshTokenExpiresAt });
}

export function clearRefreshCookie(res: Response, config: AppConfig) {
  res.clearCookie(REFRESH_COOKIE, cookieOptions(config));
}

export function readRefreshCookie(req: Request): string | null {
  const value = req.cookies?.[REFRESH_COOKIE];
  return typeof value === 'string' && value.length > 0 ? value : null;
}

/**
 * Protection CSRF des routes authentifiées par cookie : un en-tête personnalisé est exigé.
 * Un site tiers ne peut pas l'ajouter sans requête préliminaire CORS, refusée hors des
 * origines autorisées. S'ajoute à SameSite=Strict.
 */
export function assertCsrfHeader(req: Request) {
  if (!req.get('x-requested-with')) {
    throw new ForbiddenException('En-tête X-Requested-With requis.');
  }
}

/** Corps de réponse d'une session : le refresh token n'y figure jamais. */
export function sessionBody(session: Pick<IssuedSession, 'accessToken' | 'accessTokenExpiresIn' | 'access'>) {
  return {
    accessToken: session.accessToken,
    tokenType: 'Bearer',
    expiresIn: session.accessTokenExpiresIn,
    activeTenant: session.access
      ? {
          tenantId: session.access.tenantId,
          membershipId: session.access.membershipId,
          permissions: session.access.permissions,
          salons: session.access.allSalons ? '*' : session.access.salonIds,
        }
      : null,
  };
}
