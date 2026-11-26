import { createParamDecorator, ExecutionContext, SetMetadata } from '@nestjs/common';
import type { Permission } from '@dread-royal/shared';
import { AuthUser } from './auth-user';

export const IS_PUBLIC = 'isPublic';
export const PERMISSIONS_KEY = 'permissions';

/** Route accessible sans authentification. */
export const Public = () => SetMetadata(IS_PUBLIC, true);

/** L'utilisateur doit posséder AU MOINS UNE des permissions listées. */
export const RequirePermissions = (...perms: Permission[]) => SetMetadata(PERMISSIONS_KEY, perms);

export const CurrentUser = createParamDecorator((_: unknown, ctx: ExecutionContext): AuthUser => {
  return ctx.switchToHttp().getRequest().user;
});

export const ClientIp = createParamDecorator((_: unknown, ctx: ExecutionContext): string | undefined => {
  const req = ctx.switchToHttp().getRequest();
  return (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() || req.ip;
});
