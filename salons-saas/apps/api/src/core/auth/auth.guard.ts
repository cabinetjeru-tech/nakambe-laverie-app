import { CanActivate, ExecutionContext, ForbiddenException, Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { AccessTokenService } from './access-token.service';
import { ACCESS_POLICY_KEY, AccessPolicy } from './decorators';

/**
 * Garde global : authentifie le jeton et vérifie les permissions requises.
 * Une route sans politique déclarée est refusée (défaut sûr) : oublier un décorateur ne
 * peut jamais ouvrir une route par accident.
 *
 * La validité « en direct » (session non révoquée, adhésion active, permissions à jour)
 * est contrôlée ensuite par DbContextInterceptor, dans la transaction de la requête.
 */
@Injectable()
export class AuthGuard implements CanActivate {
  private readonly logger = new Logger(AuthGuard.name);

  constructor(
    private readonly reflector: Reflector,
    private readonly tokens: AccessTokenService,
  ) {}

  canActivate(context: ExecutionContext): boolean {
    if (context.getType() !== 'http') return true;
    const policy = this.reflector.getAllAndOverride<AccessPolicy | undefined>(ACCESS_POLICY_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    const request = context.switchToHttp().getRequest<Request>();

    if (!policy) {
      this.logger.error(`Route sans politique d'accès refusée : ${request.method} ${request.path}`);
      throw new ForbiddenException('Accès refusé.');
    }

    const token = this.extractBearer(request);
    const user = token ? this.tokens.verify(token) : null;

    if (policy.kind === 'public') {
      // Un jeton éventuellement présent est ignoré : une route publique ne dépend jamais de
      // l'utilisateur, et un jeton périmé (droits modifiés) ne doit pas faire échouer
      // /auth/refresh, précisément la route qui sert à en obtenir un nouveau.
      return true;
    }

    if (!user) throw new UnauthorizedException('Session expirée ou invalide. Reconnectez-vous.');
    request.user = user;

    if (policy.kind === 'permissions' || policy.kind === 'anyPermission') {
      if (!user.tenantId || !user.membershipId) {
        throw new ForbiddenException('Sélectionnez une entreprise pour accéder à cette fonction.');
      }
      const granted =
        policy.kind === 'permissions'
          ? policy.permissions.every((code) => user.permissions.includes(code))
          : policy.permissions.some((code) => user.permissions.includes(code));
      if (!granted) {
        throw new ForbiddenException("Vous n'avez pas la permission d'effectuer cette action.");
      }
    }
    return true;
  }

  private extractBearer(request: Request): string | null {
    const header = request.headers.authorization;
    if (!header) return null;
    const [scheme, value] = header.split(' ');
    return scheme?.toLowerCase() === 'bearer' && value ? value : null;
  }
}
