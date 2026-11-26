import { CanActivate, ExecutionContext, ForbiddenException, Injectable, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { hasAnyPermission } from '@dread-royal/shared';
import { PrismaService } from '../prisma/prisma.service';
import { IS_PUBLIC, PERMISSIONS_KEY } from './decorators';
import { AuthUser } from './auth-user';

/**
 * Garde globale : vérifie le JWT d'accès, que la session n'est pas révoquée,
 * que le compte est actif, puis charge les permissions À JOUR depuis la base
 * (une désactivation ou un changement de rôle prend effet immédiatement).
 */
@Injectable()
export class AuthGuard implements CanActivate {
  constructor(private reflector: Reflector, private jwt: JwtService, private prisma: PrismaService) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC, [ctx.getHandler(), ctx.getClass()]);
    if (isPublic) return true;
    const req = ctx.switchToHttp().getRequest();
    const header: string | undefined = req.headers.authorization;
    let token = header?.startsWith('Bearer ') ? header.slice(7) : undefined;
    // Téléchargements (PDF/Excel) ouverts dans un nouvel onglet : jeton en paramètre
    if (!token && req.method === 'GET' && typeof req.query?.access_token === 'string') token = req.query.access_token;
    if (!token) throw new UnauthorizedException('Authentification requise');
    let payload: { sub: string; sid: string };
    try {
      payload = await this.jwt.verifyAsync(token);
    } catch {
      throw new UnauthorizedException('Session expirée');
    }
    const session = await this.prisma.session.findUnique({
      where: { id: payload.sid },
      include: { user: { include: { role: true } } },
    });
    if (!session || session.revokedAt || session.expiresAt < new Date() || session.userId !== payload.sub) {
      throw new UnauthorizedException('Session invalide');
    }
    const u = session.user;
    if (!u.active) throw new UnauthorizedException('Compte désactivé');
    const user: AuthUser = {
      id: u.id,
      username: u.username,
      fullName: u.fullName,
      roleCode: u.role.code,
      roleName: u.role.name,
      permissions: u.role.permissions,
      staffId: u.staffId,
      sessionId: session.id,
    };
    req.user = user;
    return true;
  }
}

@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(private reflector: Reflector) {}
  canActivate(ctx: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<string[]>(PERMISSIONS_KEY, [ctx.getHandler(), ctx.getClass()]);
    if (!required || required.length === 0) return true;
    const user: AuthUser | undefined = ctx.switchToHttp().getRequest().user;
    if (!user) return true; // route publique
    if (!hasAnyPermission(user.permissions, required)) {
      throw new ForbiddenException("Vous n'avez pas l'autorisation d'effectuer cette action");
    }
    return true;
  }
}
