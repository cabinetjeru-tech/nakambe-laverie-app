import { CanActivate, ExecutionContext, ForbiddenException, Injectable, createParamDecorator } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PlatformRole } from '@prisma/client';
import type { Request } from 'express';
import { PlatformDbService } from '../../core/platform/platform-db.service';
import { PLATFORM_ROLES_KEY, PlatformActor } from './platform-roles';

type PlatformRequest = Request & { platformActor?: PlatformActor };

/**
 * Console super administrateur : réservée aux comptes inscrits (et actifs) dans
 * platform_staff, avec le rôle exigé par la route. S'exécute après le garde global
 * (l'utilisateur est déjà authentifié). Le rôle est lu en base à chaque requête : un
 * retrait prend effet immédiatement, sans attendre l'expiration du jeton.
 */
@Injectable()
export class PlatformStaffGuard implements CanActivate {
  constructor(
    private readonly platform: PlatformDbService,
    private readonly reflector: Reflector,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<PlatformRequest>();
    const userId = request.user?.userId;
    const staff = userId
      ? await this.platform.client.platformStaff.findUnique({
          where: { userId },
          select: { isActive: true, role: true, user: { select: { status: true } } },
        })
      : null;
    if (!staff?.isActive || staff.user.status !== 'ACTIVE') throw new ForbiddenException('Réservé à l’équipe de la plateforme.');
    const allowed = this.reflector.getAllAndOverride<PlatformRole[] | undefined>(PLATFORM_ROLES_KEY, [context.getHandler(), context.getClass()]);
    if (allowed && staff.role !== 'PLATFORM_OWNER' && !allowed.includes(staff.role)) {
      throw new ForbiddenException('Votre rôle dans l’équipe plateforme ne permet pas cette action.');
    }
    request.platformActor = { userId: userId!, role: staff.role };
    return true;
  }
}

export const CurrentPlatformActor = createParamDecorator((_data: unknown, ctx: ExecutionContext): PlatformActor => {
  const actor = ctx.switchToHttp().getRequest<PlatformRequest>().platformActor;
  if (!actor) throw new ForbiddenException('Réservé à l’équipe de la plateforme.');
  return actor;
});
