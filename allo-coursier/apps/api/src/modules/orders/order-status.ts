import { OrderStatus, ServiceType } from '@prisma/client';

const S = OrderStatus;

export const STATUS_LABELS: Record<OrderStatus, string> = {
  CREATED: 'Créée',
  PENDING_PAYMENT: 'En attente de paiement',
  SCHEDULED: 'Programmée',
  MERCHANT_ACCEPTED: 'Acceptée par le commerçant',
  PREPARING: 'En préparation',
  READY: 'Prête',
  SEARCHING_DRIVER: 'Recherche d’un livreur',
  DRIVER_ASSIGNED: 'Livreur en route vers le ramassage',
  DRIVER_AT_PICKUP: 'Livreur au point de ramassage',
  PURCHASING: 'Achats en cours',
  PICKED_UP: 'Colis récupéré',
  IN_TRANSIT: 'En route vers la livraison',
  ARRIVED_AT_DROPOFF: 'Livreur arrivé à destination',
  DELIVERED: 'Livrée',
  COMPLETED: 'Terminée',
  CANCELLED: 'Annulée',
  FAILED: 'Échec de livraison',
  RETURNED: 'Retournée à l’expéditeur',
};

/** Statuts où un livreur est engagé sur la commande. */
export const ACTIVE_DRIVER_STATUSES: OrderStatus[] = [
  S.DRIVER_ASSIGNED,
  S.DRIVER_AT_PICKUP,
  S.PURCHASING,
  S.PICKED_UP,
  S.IN_TRANSIT,
  S.ARRIVED_AT_DROPOFF,
];

export const FINAL_STATUSES: OrderStatus[] = [S.DELIVERED, S.COMPLETED, S.CANCELLED, S.FAILED, S.RETURNED];

/** Le client peut annuler tant que le livreur n'est pas arrivé au ramassage. */
export const CLIENT_CANCELLABLE: OrderStatus[] = [S.CREATED, S.PENDING_PAYMENT, S.SCHEDULED, S.SEARCHING_DRIVER, S.DRIVER_ASSIGNED];

export const PURCHASE_SERVICES: ServiceType[] = [ServiceType.ERRAND, ServiceType.PURCHASE];

/** Actions du livreur et statut atteint. */
export type DriverAction = 'ARRIVED_PICKUP' | 'START_PURCHASE' | 'PICKED_UP' | 'ARRIVED_DROPOFF' | 'DELIVER' | 'FAIL' | 'RETURN';

const DRIVER_ACTIONS: Record<DriverAction, { from: OrderStatus[]; to: OrderStatus }> = {
  ARRIVED_PICKUP: { from: [S.DRIVER_ASSIGNED], to: S.DRIVER_AT_PICKUP },
  START_PURCHASE: { from: [S.DRIVER_AT_PICKUP], to: S.PURCHASING },
  PICKED_UP: { from: [S.DRIVER_AT_PICKUP, S.PURCHASING], to: S.IN_TRANSIT },
  ARRIVED_DROPOFF: { from: [S.IN_TRANSIT, S.PICKED_UP], to: S.ARRIVED_AT_DROPOFF },
  DELIVER: { from: [S.ARRIVED_AT_DROPOFF], to: S.DELIVERED },
  FAIL: { from: [S.DRIVER_AT_PICKUP, S.IN_TRANSIT, S.ARRIVED_AT_DROPOFF], to: S.FAILED },
  RETURN: { from: [S.FAILED], to: S.RETURNED },
};

/**
 * Renvoie le statut atteint par une action du livreur, ou un message d'erreur.
 * Pour les courses/achats, le passage par « achats en cours » (avec montant et ticket) est obligatoire.
 */
export function resolveDriverAction(
  action: DriverAction,
  current: OrderStatus,
  serviceType: ServiceType,
): { to: OrderStatus } | { error: string } {
  const rule = DRIVER_ACTIONS[action];
  if (!rule.from.includes(current)) {
    return { error: `Action impossible : la commande est « ${STATUS_LABELS[current]} ».` };
  }
  const isPurchase = PURCHASE_SERVICES.includes(serviceType);
  if (action === 'START_PURCHASE' && !isPurchase) return { error: 'Cette commande ne comporte pas d’achats.' };
  if (action === 'PICKED_UP' && isPurchase && current !== S.PURCHASING) {
    return { error: 'Indiquez d’abord le montant des achats et la photo du ticket.' };
  }
  return { to: rule.to };
}

/** Changements de statut que l'administration peut imposer. */
export const ADMIN_FORCED_TARGETS: OrderStatus[] = [S.DELIVERED, S.FAILED, S.RETURNED, S.CANCELLED];

export function canAdminForce(current: OrderStatus, target: OrderStatus): boolean {
  if (!ADMIN_FORCED_TARGETS.includes(target)) return false;
  if (FINAL_STATUSES.includes(current) && !(current === S.FAILED && target === S.RETURNED)) return false;
  if (target === S.DELIVERED || target === S.FAILED) return ACTIVE_DRIVER_STATUSES.includes(current);
  if (target === S.RETURNED) return current === S.FAILED;
  return true; // annulation
}
