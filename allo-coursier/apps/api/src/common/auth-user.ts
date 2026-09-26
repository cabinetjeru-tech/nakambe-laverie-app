import { ForbiddenException } from '@nestjs/common';

/** Utilisateur authentifié, tel que porté par le jeton d'accès. */
export interface AuthUser {
  id: string;
  roles: string[];
  permissions: string[];
  /** Villes auxquelles l'accès de l'équipe est limité ; null = toutes les villes. */
  cityIds?: string[] | null;
}

/** Vérifie qu'un membre de l'équipe limité à certaines villes peut agir sur cette ville. */
export function assertCityAccess(user: AuthUser, cityId: string | null | undefined) {
  if (!user.cityIds || !cityId) return;
  if (!user.cityIds.includes(cityId)) throw new ForbiddenException('Cet élément concerne une ville hors de votre périmètre.');
}

/**
 * Filtre de ville à appliquer à une liste : la ville demandée si elle est autorisée,
 * sinon les villes du périmètre de l'utilisateur.
 */
export function cityFilter(user: AuthUser, requested?: string): string | { in: string[] } | undefined {
  if (!user.cityIds) return requested;
  if (requested) {
    assertCityAccess(user, requested);
    return requested;
  }
  return { in: user.cityIds };
}
