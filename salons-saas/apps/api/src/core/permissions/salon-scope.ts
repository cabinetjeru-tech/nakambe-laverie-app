import { NotFoundException } from '@nestjs/common';
import type { AuthUser } from '../auth/auth-user';

/**
 * Périmètre « salon » (docs/01-ARCHITECTURE.md §5.1) : un membre limité à certains salons
 * ne voit ni ne modifie rien en dehors. Une ressource hors périmètre répond 404, comme une
 * ressource inexistante (pas d'indice sur ce qui existe ailleurs).
 */
export function canAccessSalon(user: AuthUser, salonId: string): boolean {
  return user.allSalons || user.salonIds.includes(salonId);
}

export function assertSalonAccess(user: AuthUser, salonId: string | null | undefined): void {
  if (!salonId) return;
  if (!canAccessSalon(user, salonId)) throw new NotFoundException('Ressource introuvable.');
}

/** Filtre Prisma à appliquer à la colonne salonId (ou id pour la table salons). */
export function salonIdFilter(user: AuthUser): { in: string[] } | undefined {
  return user.allSalons ? undefined : { in: user.salonIds };
}
