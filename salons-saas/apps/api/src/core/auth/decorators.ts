import { createParamDecorator, ExecutionContext, SetMetadata, UnauthorizedException } from '@nestjs/common';
import type { Request } from 'express';
import type { PermissionCode } from '../permissions/catalog';
import type { AuthUser } from './auth-user';

export const ACCESS_POLICY_KEY = 'access-policy';
export const MANUAL_TRANSACTION_KEY = 'manual-transaction';

export type AccessPolicy =
  | { kind: 'public' }
  | { kind: 'authenticated' }
  | { kind: 'permissions'; permissions: PermissionCode[] }
  | { kind: 'anyPermission'; permissions: PermissionCode[] };

/**
 * Chaque route DOIT déclarer une politique d'accès, sinon le garde la refuse (défaut sûr).
 */

/** Route ouverte (inscription, connexion…). */
export const Public = () => SetMetadata(ACCESS_POLICY_KEY, { kind: 'public' } satisfies AccessPolicy);

/** Utilisateur connecté, avec ou sans tenant actif. */
export const Authenticated = () =>
  SetMetadata(ACCESS_POLICY_KEY, { kind: 'authenticated' } satisfies AccessPolicy);

/** Tenant actif obligatoire + TOUTES les permissions listées. */
export const RequirePermissions = (...permissions: PermissionCode[]) =>
  SetMetadata(ACCESS_POLICY_KEY, { kind: 'permissions', permissions } satisfies AccessPolicy);

/** Tenant actif obligatoire + AU MOINS UNE des permissions listées (le service affine ensuite). */
export const RequireAnyPermission = (...permissions: PermissionCode[]) =>
  SetMetadata(ACCESS_POLICY_KEY, { kind: 'anyPermission', permissions } satisfies AccessPolicy);

/**
 * La route gère elle-même ses transactions (DbService.withContext) au lieu d'être
 * enveloppée par l'intercepteur — utile quand une écriture doit être validée alors que
 * la réponse est une erreur (compteur d'échecs de connexion, révocation de session…).
 */
export const ManualTransaction = () => SetMetadata(MANUAL_TRANSACTION_KEY, true);

export const CurrentUser = createParamDecorator((_data: unknown, ctx: ExecutionContext): AuthUser => {
  const request = ctx.switchToHttp().getRequest<Request>();
  if (!request.user) throw new UnauthorizedException();
  return request.user;
});
