/** Libellés et types partagés : abonnement du salon et console super administrateur. */

export type Tone = 'gray' | 'blue' | 'violet' | 'amber' | 'green' | 'red';

export const TENANT_STATUS: Record<string, { label: string; tone: Tone }> = {
  TRIAL: { label: 'Essai', tone: 'blue' },
  ACTIVE: { label: 'Actif', tone: 'green' },
  PAST_DUE: { label: 'Impayé', tone: 'amber' },
  SUSPENDED: { label: 'Suspendu', tone: 'red' },
  CANCELLED: { label: 'Résilié', tone: 'gray' },
};

export const SUBSCRIPTION_STATUS: Record<string, { label: string; tone: Tone }> = {
  TRIALING: { label: 'Essai', tone: 'blue' },
  ACTIVE: { label: 'Actif', tone: 'green' },
  PAST_DUE: { label: 'Impayé', tone: 'amber' },
  CANCELLED: { label: 'Résilié', tone: 'gray' },
  EXPIRED: { label: 'Expiré', tone: 'gray' },
};

export const INVOICE_STATUS: Record<string, { label: string; tone: Tone }> = {
  DRAFT: { label: 'Brouillon', tone: 'gray' },
  OPEN: { label: 'À régler', tone: 'amber' },
  PAID: { label: 'Payée', tone: 'green' },
  VOID: { label: 'Annulée', tone: 'gray' },
};

export const SAAS_PAYMENT_STATUS: Record<string, { label: string; tone: Tone }> = {
  PENDING: { label: 'En attente', tone: 'amber' },
  SUCCEEDED: { label: 'Reçu', tone: 'green' },
  FAILED: { label: 'Échoué', tone: 'red' },
  CANCELLED: { label: 'Annulé', tone: 'gray' },
};

export const SAAS_PAYMENT_METHOD: Record<string, string> = {
  MOBILE_MONEY_MANUAL: 'Mobile Money',
  CINETPAY: 'Paiement en ligne (CinetPay)',
  CARD: 'Paiement en ligne',
};

export const CYCLE: Record<string, string> = { MONTHLY: 'Mensuel', YEARLY: 'Annuel' };

export const FEATURE_LABELS: Record<string, string> = {
  online_booking: 'Réservation en ligne',
  stock: 'Gestion du stock',
  commissions: 'Commissions des employés',
  invoicing: 'Factures clients',
  loyalty: 'Fidélité et cartes cadeaux',
  marketing: 'Campagnes SMS / WhatsApp',
  multi_salon: 'Plusieurs salons',
  custom_roles: 'Rôles personnalisés',
  api_access: 'Accès API et webhooks',
};

export const TICKET_STATUS: Record<string, { label: string; tone: Tone }> = {
  OPEN: { label: 'En attente du support', tone: 'amber' },
  PENDING: { label: 'Réponse reçue', tone: 'blue' },
  RESOLVED: { label: 'Résolue', tone: 'green' },
  CLOSED: { label: 'Clôturée', tone: 'gray' },
};

/** Côté plateforme, le point de vue est inversé : « OPEN » = à traiter. */
export const TICKET_STATUS_PLATFORM: Record<string, { label: string; tone: Tone }> = {
  OPEN: { label: 'À traiter', tone: 'amber' },
  PENDING: { label: 'En attente du salon', tone: 'blue' },
  RESOLVED: { label: 'Résolue', tone: 'green' },
  CLOSED: { label: 'Clôturée', tone: 'gray' },
};

export const TICKET_PRIORITY: Record<string, { label: string; tone: Tone }> = {
  LOW: { label: 'Basse', tone: 'gray' },
  NORMAL: { label: 'Normale', tone: 'blue' },
  HIGH: { label: 'Haute', tone: 'amber' },
  URGENT: { label: 'Urgente', tone: 'red' },
};

export const TICKET_CATEGORY: Record<string, string> = {
  billing: 'Abonnement et facturation',
  bug: 'Problème technique',
  question: 'Question d’utilisation',
  account: 'Compte et accès',
  other: 'Autre',
};

export const PLATFORM_ROLE: Record<string, string> = {
  PLATFORM_OWNER: 'Super administrateur',
  PLATFORM_BILLING: 'Facturation',
  PLATFORM_SUPPORT: 'Support',
};

export const USER_STATUS: Record<string, { label: string; tone: Tone }> = {
  ACTIVE: { label: 'Actif', tone: 'green' },
  LOCKED: { label: 'Verrouillé', tone: 'amber' },
  DISABLED: { label: 'Désactivé', tone: 'red' },
};

export interface BillingStatus {
  tenantStatus: string;
  subscriptionStatus: string | null;
  plan: { code: string; name: string } | null;
  pendingPlan: { code: string; name: string } | null;
  pendingCycle: string | null;
  cycle: string | null;
  currentPeriodEnd: string | null;
  cancelAtPeriodEnd: boolean;
  trialEndsAt: string | null;
  graceEndsAt: string | null;
  suspendedAt: string | null;
  suspensionReason: string | null;
  readOnly: boolean;
  daysLeft: number | null;
  openInvoice: { id: string; number: string; total: number; currency: string; dueAt: string; kind: string } | null;
  canManage: boolean;
}

/** « AAAA-MM » → « sept. 26 » */
export function shortMonth(key: string): string {
  const [year, month] = key.split('-').map(Number);
  return new Intl.DateTimeFormat('fr-FR', { month: 'short', year: '2-digit', timeZone: 'UTC' }).format(new Date(Date.UTC(year, month - 1, 1)));
}
