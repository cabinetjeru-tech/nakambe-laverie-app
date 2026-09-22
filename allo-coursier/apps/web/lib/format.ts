export const fcfa = (amount: number | null | undefined) =>
  `${Math.round(amount ?? 0).toLocaleString('fr-FR').replace(/ | /g, ' ')} FCFA`;

export const dateTime = (value: string | Date | null | undefined) =>
  value
    ? new Date(value).toLocaleString('fr-FR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', timeZone: 'Africa/Ouagadougou' })
    : '—';

export const dateOnly = (value: string | Date | null | undefined) =>
  value ? new Date(value).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'Africa/Ouagadougou' }) : '—';

export const timeOnly = (value: string | Date | null | undefined) =>
  value ? new Date(value).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit', timeZone: 'Africa/Ouagadougou' }) : '—';

export const phoneDisplay = (phone: string | null | undefined) => {
  if (!phone) return '—';
  const local = phone.replace(/^\+226/, '');
  return local.length === 8 ? `+226 ${local.replace(/(\d{2})(?=\d)/g, '$1 ')}` : phone;
};

export const SERVICE_LABELS: Record<string, string> = {
  PARCEL: 'Colis & documents',
  PICKUP_DROP: 'Retrait & dépôt',
  ERRAND: 'Petites courses',
  PURCHASE: 'Achat par le livreur',
  FOOD: 'Repas',
  B2B: 'Entreprise',
};

export const VEHICLE_LABELS: Record<string, string> = { MOTO: 'Moto', TRICYCLE: 'Tricycle' };
export const SPEED_LABELS: Record<string, string> = { STANDARD: 'Standard', EXPRESS: 'Express' };
export const PAYMENT_LABELS: Record<string, string> = {
  CASH: 'Espèces',
  WALLET: 'Portefeuille',
  MANUAL_MOBILE_MONEY: 'Mobile Money',
  ORANGE_MONEY: 'Orange Money',
  MOOV_MONEY: 'Moov Money',
  MOCK: 'Test',
};
export const PAYMENT_STATUS_LABELS: Record<string, string> = {
  PENDING: 'En attente',
  SUCCEEDED: 'Payé',
  FAILED: 'Refusé',
  CANCELLED: 'Annulé',
  EXPIRED: 'Expiré',
  REFUNDED: 'Remboursé',
};

export const STATUS_LABELS: Record<string, string> = {
  PENDING_PAYMENT: 'Paiement à vérifier',
  SCHEDULED: 'Programmée',
  SEARCHING_DRIVER: 'Recherche d’un livreur',
  DRIVER_ASSIGNED: 'Livreur en route',
  DRIVER_AT_PICKUP: 'Livreur au ramassage',
  PURCHASING: 'Achats en cours',
  PICKED_UP: 'Colis récupéré',
  IN_TRANSIT: 'En route',
  ARRIVED_AT_DROPOFF: 'Livreur arrivé',
  DELIVERED: 'Livrée',
  COMPLETED: 'Terminée',
  CANCELLED: 'Annulée',
  FAILED: 'Échec',
  RETURNED: 'Retournée',
};

export type Tone = 'blue' | 'green' | 'amber' | 'red' | 'gray';
export function statusTone(status: string): Tone {
  if (['DELIVERED', 'COMPLETED', 'SUCCEEDED', 'APPROVED', 'RESOLVED', 'PAID'].includes(status)) return 'green';
  if (['CANCELLED', 'FAILED', 'RETURNED', 'REJECTED', 'SUSPENDED', 'EXPIRED'].includes(status)) return 'red';
  if (['PENDING_PAYMENT', 'SEARCHING_DRIVER', 'PENDING', 'OPEN', 'SCHEDULED'].includes(status)) return 'amber';
  if (['REFUNDED'].includes(status)) return 'gray';
  return 'blue';
}

export const COMPLAINT_STATUS: Record<string, string> = { OPEN: 'Ouverte', IN_PROGRESS: 'En cours', RESOLVED: 'Résolue', REJECTED: 'Refusée' };
export const COMPLAINT_CATEGORIES: Record<string, string> = {
  RETARD: 'Retard',
  COLIS_ENDOMMAGE: 'Colis endommagé',
  COLIS_PERDU: 'Colis perdu',
  PAIEMENT: 'Paiement',
  COMPORTEMENT: 'Comportement du livreur',
  AUTRE: 'Autre',
};

