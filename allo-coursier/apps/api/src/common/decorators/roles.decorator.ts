import { SetMetadata } from '@nestjs/common';

export const ROLES_KEY = 'requiredRoles';
/** Réserve une route à l'un des rôles listés (ex. espace client, application livreur). */
export const RequireRoles = (...roles: string[]) => SetMetadata(ROLES_KEY, roles);
