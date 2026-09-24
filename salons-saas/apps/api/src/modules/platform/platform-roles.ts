import { SetMetadata } from '@nestjs/common';
import { PlatformRole } from '@prisma/client';

export const PLATFORM_ROLES_KEY = 'platform-roles';

/**
 * Rôles plateforme autorisés sur une route de la console super administrateur.
 * Sans ce décorateur : tout membre actif de l'équipe plateforme.
 * - PLATFORM_OWNER   : tout, y compris paramètres, offres et équipe ;
 * - PLATFORM_BILLING : abonnements, paiements, revenus ;
 * - PLATFORM_SUPPORT : salons, utilisateurs, tickets de support.
 */
export const PlatformRoles = (...roles: PlatformRole[]) => SetMetadata(PLATFORM_ROLES_KEY, roles);

export const PLATFORM_ROLE_LABELS: Record<PlatformRole, string> = {
  PLATFORM_OWNER: 'Super administrateur',
  PLATFORM_BILLING: 'Facturation',
  PLATFORM_SUPPORT: 'Support',
};

export interface PlatformActor {
  userId: string;
  role: PlatformRole;
}
