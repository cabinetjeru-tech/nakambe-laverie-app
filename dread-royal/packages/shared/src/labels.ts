export const GENDER_LABELS: Record<string, string> = {
  MALE: 'Homme',
  FEMALE: 'Femme',
  CHILD_MALE: 'Enfant (garçon)',
  CHILD_FEMALE: 'Enfant (fille)',
};

export const APPOINTMENT_STATUS_LABELS: Record<string, string> = {
  PENDING: 'En attente',
  CONFIRMED: 'Confirmé',
  IN_PROGRESS: 'En cours',
  DONE: 'Terminé',
  CANCELLED: 'Annulé',
  NO_SHOW: 'Client absent',
};

export const PAYMENT_METHOD_LABELS: Record<string, string> = {
  CASH: 'Espèces',
  ORANGE_MONEY: 'Orange Money',
  MOOV_MONEY: 'Moov Money',
  BANK_TRANSFER: 'Virement bancaire',
  OTHER: 'Autre',
};

export const PAYMENT_STATUS_LABELS: Record<string, string> = {
  UNPAID: 'Non payée',
  PARTIAL: 'Partiellement payée',
  PAID: 'Payée',
};

export const PAYMENT_KIND_LABELS: Record<string, string> = {
  PAYMENT: 'Paiement',
  DEPOSIT: 'Acompte',
  REFUND: 'Remboursement',
};

export const CONTRACT_LABELS: Record<string, string> = {
  CDI: 'CDI',
  CDD: 'CDD',
  STAGE: 'Stage / apprentissage',
  PRESTATAIRE: 'Prestataire',
  JOURNALIER: 'Journalier',
};

export const STAFF_STATUS_LABELS: Record<string, string> = { ACTIVE: 'Actif', ON_LEAVE: 'En congé', INACTIVE: 'Inactif' };

export const COMMISSION_MODE_LABELS: Record<string, string> = {
  SERVICE_DEFAULT: 'Selon la prestation',
  PERCENT: 'Pourcentage individuel',
  FIXED: 'Montant fixe individuel',
  NONE: 'Aucune commission',
};

export const COMMISSION_STATUS_LABELS: Record<string, string> = {
  PENDING: 'En attente de paiement client',
  DUE: 'Due',
  PAID: 'Réglée',
  CANCELLED: 'Annulée',
};

export const STOCK_MOVEMENT_LABELS: Record<string, string> = {
  PURCHASE: 'Achat fournisseur',
  IN: 'Entrée',
  SALE: 'Vente',
  SALE_CANCEL: 'Retour (vente annulée)',
  USAGE: 'Consommation salon',
  OUT: 'Sortie (perte/casse)',
  ADJUSTMENT: 'Ajustement',
  INVENTORY: 'Inventaire',
};

export const CASH_SOURCE_LABELS: Record<string, string> = {
  SALE_PAYMENT: 'Encaissement vente',
  REFUND: 'Remboursement',
  EXPENSE: 'Dépense',
  OTHER_INCOME: 'Autre recette',
  SUPPLIER_PAYMENT: 'Règlement fournisseur',
  COMMISSION_PAYOUT: 'Règlement commission',
  MANUAL: 'Mouvement manuel',
};

export const EXPENSE_STATUS_LABELS: Record<string, string> = {
  PAID: 'Payée',
  PARTIAL: 'Partiellement payée',
  UNPAID: 'Non payée (dette)',
  CANCELLED: 'Annulée',
};
