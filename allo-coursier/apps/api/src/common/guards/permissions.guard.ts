import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AuthUser } from '../auth-user';
import { PERMISSIONS_KEY } from '../decorators/permissions.decorator';
import { ALL_PERMISSIONS_WILDCARD } from '../permissions';

export function hasPermissions(user: AuthUser | undefined, required: string[]): boolean {
  if (!user) return false;
  if (user.permissions.includes(ALL_PERMISSIONS_WILDCARD)) return true;
  return required.every((code) => user.permissions.includes(code));
}

@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<string[]>(PERMISSIONS_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!required || required.length === 0) return true;
    const user: AuthUser | undefined = context.switchToHttp().getRequest().user;
    if (!hasPermissions(user, required)) {
      throw new ForbiddenException("Vous n'avez pas la permission d'effectuer cette action.");
    }
    return true;
  }
}
