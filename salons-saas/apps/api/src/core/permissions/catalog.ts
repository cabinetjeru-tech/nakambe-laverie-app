/**
 * Catalogue des permissions et rôles par défaut (docs/01-ARCHITECTURE.md §5).
 *
 * - Le code applicatif ne teste JAMAIS un nom de rôle, uniquement des permissions.
 * - `feature` : fonctionnalité d'offre requise ; sans elle, la permission est retirée du jeton.
 * - Le seed synchronise ce catalogue avec la table `permissions`.
 */

export const FEATURES = {
  ONLINE_BOOKING: 'online_booking',
  STOCK: 'stock',
  COMMISSIONS: 'commissions',
  INVOICING: 'invoicing',
  LOYALTY: 'loyalty',
  MARKETING: 'marketing',
  MULTI_SALON: 'multi_salon',
  CUSTOM_ROLES: 'custom_roles',
  API_ACCESS: 'api_access',
} as const;

export type FeatureCode = (typeof FEATURES)[keyof typeof FEATURES];

interface PermissionDefinition {
  code: string;
  group: string;
  description: string;
  feature?: FeatureCode;
}

const F = FEATURES;

export const PERMISSION_DEFINITIONS = [
  // Salons et paramètres
  { code: 'salons.read', group: 'Salons', description: 'Consulter les salons et leurs horaires' },
  { code: 'salons.manage', group: 'Salons', description: 'Créer et modifier les salons' },
  { code: 'settings.manage', group: 'Salons', description: "Modifier les paramètres de l'entreprise" },
  { code: 'integrations.manage', group: 'Salons', description: 'Gérer les intégrations, clés API et webhooks', feature: F.API_ACCESS },
  // Équipe
  { code: 'staff.read', group: 'Équipe', description: "Consulter l'équipe" },
  { code: 'staff.manage', group: 'Équipe', description: 'Inviter, suspendre et réactiver les membres' },
  { code: 'staff.schedule.manage', group: 'Équipe', description: 'Gérer les plannings et absences' },
  { code: 'roles.manage', group: 'Équipe', description: 'Gérer les rôles et les accès des membres' },
  { code: 'timeclock.use', group: 'Équipe', description: 'Pointer son arrivée et son départ' },
  { code: 'timeclock.manage', group: 'Équipe', description: 'Corriger les pointages' },
  // Catalogue
  { code: 'services.read', group: 'Catalogue', description: 'Consulter les prestations' },
  { code: 'services.manage', group: 'Catalogue', description: 'Créer et modifier les prestations' },
  { code: 'prices.manage', group: 'Catalogue', description: 'Modifier les prix' },
  // Agenda
  { code: 'appointments.read.own', group: 'Agenda', description: 'Consulter son propre agenda' },
  { code: 'appointments.read', group: 'Agenda', description: "Consulter l'agenda du salon" },
  { code: 'appointments.create', group: 'Agenda', description: 'Créer des rendez-vous' },
  { code: 'appointments.manage', group: 'Agenda', description: 'Modifier et déplacer les rendez-vous' },
  { code: 'appointments.cancel', group: 'Agenda', description: 'Annuler des rendez-vous, marquer une absence' },
  { code: 'waitlist.manage', group: 'Agenda', description: "Gérer la file d'attente" },
  // Clients
  { code: 'clients.read.basic', group: 'Clients', description: 'Voir le nom et le téléphone des clients' },
  { code: 'clients.read', group: 'Clients', description: 'Consulter les fiches clients complètes' },
  { code: 'clients.manage', group: 'Clients', description: 'Créer et modifier les fiches clients' },
  { code: 'clients.technical.read', group: 'Clients', description: 'Consulter les fiches techniques (allergies, formules)' },
  { code: 'clients.technical.manage', group: 'Clients', description: 'Modifier les fiches techniques' },
  { code: 'clients.photos.manage', group: 'Clients', description: 'Gérer les photos avant/après' },
  { code: 'clients.export', group: 'Clients', description: 'Exporter le fichier clients' },
  { code: 'clients.delete', group: 'Clients', description: 'Supprimer ou anonymiser un client' },
  // Caisse et ventes
  { code: 'sales.create', group: 'Caisse', description: 'Encaisser une vente' },
  { code: 'sales.discount', group: 'Caisse', description: 'Accorder une remise (dans la limite fixée)' },
  { code: 'sales.void', group: 'Caisse', description: 'Annuler une vente' },
  { code: 'payments.record', group: 'Caisse', description: 'Enregistrer un paiement' },
  { code: 'payments.validate', group: 'Caisse', description: 'Valider un paiement Mobile Money manuel' },
  { code: 'refunds.create', group: 'Caisse', description: 'Rembourser' },
  { code: 'cash.read', group: 'Caisse', description: 'Consulter les sessions de caisse' },
  { code: 'cash.session.open_close', group: 'Caisse', description: 'Ouvrir et clôturer la caisse' },
  { code: 'cash.movements.manage', group: 'Caisse', description: "Enregistrer des entrées et sorties d'espèces" },
  // Facturation
  { code: 'invoices.read', group: 'Facturation', description: 'Consulter les factures', feature: F.INVOICING },
  { code: 'invoices.issue', group: 'Facturation', description: 'Émettre des factures', feature: F.INVOICING },
  { code: 'invoices.credit_note', group: 'Facturation', description: 'Émettre des avoirs', feature: F.INVOICING },
  // Stock
  { code: 'stock.read', group: 'Stock', description: 'Consulter le stock', feature: F.STOCK },
  { code: 'stock.consume', group: 'Stock', description: 'Déclarer une consommation de produit', feature: F.STOCK },
  { code: 'stock.adjust', group: 'Stock', description: 'Ajuster le stock (inventaire, casse)', feature: F.STOCK },
  { code: 'stock.transfer', group: 'Stock', description: 'Transférer du stock entre salons', feature: F.STOCK },
  { code: 'purchases.manage', group: 'Stock', description: 'Gérer fournisseurs et commandes', feature: F.STOCK },
  // Commissions et paie
  { code: 'commissions.read.own', group: 'Commissions', description: 'Consulter ses propres commissions', feature: F.COMMISSIONS },
  { code: 'commissions.read', group: 'Commissions', description: 'Consulter les commissions de tous', feature: F.COMMISSIONS },
  { code: 'commissions.rules.manage', group: 'Commissions', description: 'Définir les règles de commission', feature: F.COMMISSIONS },
  { code: 'payroll.manage', group: 'Commissions', description: 'Préparer et valider la paie', feature: F.COMMISSIONS },
  // Marketing et fidélité
  { code: 'loyalty.manage', group: 'Fidélité', description: 'Gérer le programme de fidélité', feature: F.LOYALTY },
  { code: 'giftcards.manage', group: 'Fidélité', description: 'Gérer les cartes cadeaux et carnets', feature: F.LOYALTY },
  { code: 'promotions.manage', group: 'Marketing', description: 'Gérer les promotions', feature: F.MARKETING },
  { code: 'campaigns.send', group: 'Marketing', description: 'Envoyer des campagnes', feature: F.MARKETING },
  // Qualité
  { code: 'reviews.reply', group: 'Qualité', description: 'Répondre aux avis' },
  { code: 'complaints.manage', group: 'Qualité', description: 'Traiter les réclamations' },
  // Pilotage
  { code: 'reports.read.own', group: 'Pilotage', description: 'Consulter ses propres statistiques' },
  { code: 'reports.read', group: 'Pilotage', description: 'Consulter les statistiques du salon' },
  { code: 'reports.finance.read', group: 'Pilotage', description: 'Consulter les rapports financiers' },
  { code: 'expenses.create', group: 'Pilotage', description: 'Saisir une dépense' },
  { code: 'expenses.manage', group: 'Pilotage', description: 'Gérer toutes les dépenses' },
  { code: 'audit.read', group: 'Pilotage', description: "Consulter le journal d'audit" },
  // Compte SaaS
  { code: 'billing.manage', group: 'Compte', description: "Gérer l'abonnement à la plateforme" },
  { code: 'data.export', group: 'Compte', description: "Exporter toutes les données de l'entreprise" },
  { code: 'support.grant', group: 'Compte', description: "Autoriser l'accès du support" },
] as const satisfies readonly PermissionDefinition[];

export type PermissionCode = (typeof PERMISSION_DEFINITIONS)[number]['code'];

export const ALL_PERMISSION_CODES: readonly PermissionCode[] = PERMISSION_DEFINITIONS.map((p) => p.code);

const FEATURE_BY_PERMISSION = new Map<string, FeatureCode | undefined>(
  PERMISSION_DEFINITIONS.map((p: PermissionDefinition) => [p.code, p.feature]),
);

export function isKnownPermission(code: string): code is PermissionCode {
  return FEATURE_BY_PERMISSION.has(code);
}

/** Retire les permissions dont la fonctionnalité n'est pas incluse dans l'offre. */
export function filterByFeatures(codes: Iterable<string>, features: ReadonlySet<string>): string[] {
  const result: string[] = [];
  for (const code of codes) {
    if (!FEATURE_BY_PERMISSION.has(code)) continue;
    const feature = FEATURE_BY_PERMISSION.get(code);
    if (!feature || features.has(feature)) result.push(code);
  }
  return result.sort();
}

// ---------------------------------------------------------------------------
// Rôles système créés pour chaque nouveau tenant (modifiables, sauf OWNER)
// ---------------------------------------------------------------------------

export const OWNER_ROLE_CODE = 'OWNER';

export interface DefaultRole {
  code: string;
  name: string;
  description: string;
  /** '*' = toutes les permissions du catalogue, calculées à la volée (jamais stockées). */
  permissions: readonly PermissionCode[] | '*';
}

export const DEFAULT_ROLES: readonly DefaultRole[] = [
  {
    code: OWNER_ROLE_CODE,
    name: 'Propriétaire',
    description: "Accès complet, abonnement et données de l'entreprise",
    permissions: '*',
  },
  {
    code: 'MANAGER',
    name: 'Gérant',
    description: "Pilote l'activité des salons qui lui sont confiés",
    permissions: [
      'salons.read', 'staff.read', 'staff.manage', 'staff.schedule.manage', 'timeclock.use', 'timeclock.manage',
      'services.read', 'services.manage', 'prices.manage',
      'appointments.read.own', 'appointments.read', 'appointments.create', 'appointments.manage', 'appointments.cancel', 'waitlist.manage',
      'clients.read.basic', 'clients.read', 'clients.manage', 'clients.technical.read', 'clients.technical.manage', 'clients.photos.manage',
      'sales.create', 'sales.discount', 'sales.void', 'payments.record', 'payments.validate', 'refunds.create',
      'cash.read', 'cash.session.open_close', 'cash.movements.manage',
      'invoices.read', 'invoices.issue', 'invoices.credit_note',
      'stock.read', 'stock.consume', 'stock.adjust', 'stock.transfer', 'purchases.manage',
      'commissions.read.own', 'commissions.read',
      'loyalty.manage', 'giftcards.manage', 'promotions.manage', 'campaigns.send',
      'reviews.reply', 'complaints.manage',
      'reports.read.own', 'reports.read', 'reports.finance.read', 'expenses.create', 'expenses.manage',
    ],
  },
  {
    code: 'RECEPTIONIST',
    name: 'Réceptionniste',
    description: 'Accueil, rendez-vous et caisse',
    permissions: [
      'salons.read', 'staff.read', 'timeclock.use', 'services.read',
      'appointments.read', 'appointments.create', 'appointments.manage', 'appointments.cancel', 'waitlist.manage',
      'clients.read.basic', 'clients.read', 'clients.manage', 'clients.technical.read',
      'sales.create', 'sales.discount', 'payments.record', 'payments.validate', 'cash.read', 'cash.session.open_close',
      'invoices.read', 'invoices.issue', 'stock.read', 'reports.read.own', 'expenses.create',
    ],
  },
  {
    code: 'STYLIST',
    name: 'Coiffeur',
    description: 'Son agenda, ses clients du jour, ses commissions',
    permissions: [
      'salons.read', 'staff.read', 'timeclock.use', 'services.read',
      'appointments.read.own', 'waitlist.manage',
      'clients.read.basic', 'clients.technical.read', 'clients.technical.manage', 'clients.photos.manage',
      'stock.consume', 'commissions.read.own', 'reports.read.own',
    ],
  },
  {
    code: 'ACCOUNTANT',
    name: 'Comptable',
    description: 'Lecture des finances, paie et exports ; aucune donnée santé ni photo',
    permissions: [
      'salons.read', 'services.read', 'cash.read', 'invoices.read', 'stock.read',
      'commissions.read', 'payroll.manage', 'reports.finance.read', 'expenses.manage', 'audit.read',
    ],
  },
];

// ---------------------------------------------------------------------------
// Offres (prix à valider — docs/01-ARCHITECTURE.md §9)
// ---------------------------------------------------------------------------

export interface PlanDefinition {
  code: string;
  name: string;
  priceMonthly: number;
  priceYearly: number;
  maxSalons: number | null;
  maxStaff: number | null;
  smsQuotaMonthly: number;
  features: readonly FeatureCode[];
}

export const PLAN_DEFINITIONS: readonly PlanDefinition[] = [
  {
    code: 'SOLO',
    name: 'Solo',
    priceMonthly: 5_000,
    priceYearly: 50_000,
    maxSalons: 1,
    maxStaff: 3,
    smsQuotaMonthly: 0,
    features: [F.ONLINE_BOOKING],
  },
  {
    code: 'SALON',
    name: 'Salon',
    priceMonthly: 15_000,
    priceYearly: 150_000,
    maxSalons: 1,
    maxStaff: 15,
    smsQuotaMonthly: 200,
    features: [F.ONLINE_BOOKING, F.STOCK, F.COMMISSIONS, F.INVOICING, F.LOYALTY],
  },
  {
    code: 'MULTI',
    name: 'Multi-salons',
    priceMonthly: 35_000,
    priceYearly: 350_000,
    maxSalons: null,
    maxStaff: null,
    smsQuotaMonthly: 1_000,
    features: Object.values(F),
  },
];
