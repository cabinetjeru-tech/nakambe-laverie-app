/**
 * Catalogue des permissions de la plateforme et rôles par défaut.
 * Le seed synchronise ce catalogue avec la base ; les rôles restent ensuite
 * modifiables depuis l'administration (sauf SUPER_ADMIN).
 */
export const PERMISSIONS = {
  // Utilisateurs et accès
  USERS_READ: { code: 'users.read', group: 'Utilisateurs', description: 'Consulter les comptes clients et utilisateurs' },
  USERS_MANAGE: { code: 'users.manage', group: 'Utilisateurs', description: 'Suspendre, réactiver, réinitialiser le code secret' },
  STAFF_MANAGE: { code: 'staff.manage', group: 'Utilisateurs', description: "Créer les comptes de l'équipe et attribuer les rôles" },
  ROLES_MANAGE: { code: 'roles.manage', group: 'Utilisateurs', description: 'Gérer les rôles et leurs permissions' },
  // Livreurs
  DRIVERS_READ: { code: 'drivers.read', group: 'Livreurs', description: 'Consulter les livreurs' },
  DRIVERS_VALIDATE: { code: 'drivers.validate', group: 'Livreurs', description: 'Valider ou refuser les inscriptions et documents' },
  DRIVERS_MANAGE: { code: 'drivers.manage', group: 'Livreurs', description: 'Suspendre, changer le statut salarié/indépendant, le plafond' },
  // Géographie et tarifs
  CITIES_MANAGE: { code: 'cities.manage', group: 'Villes et zones', description: 'Gérer les villes et dessiner les zones' },
  PRICING_READ: { code: 'pricing.read', group: 'Tarifs', description: 'Consulter les règles de tarif et le simulateur' },
  PRICING_MANAGE: { code: 'pricing.manage', group: 'Tarifs', description: 'Créer et modifier les règles de tarif' },
  // Exploitation
  ORDERS_READ: { code: 'orders.read', group: 'Commandes', description: 'Consulter les commandes' },
  ORDERS_MANAGE: { code: 'orders.manage', group: 'Commandes', description: 'Modifier ou annuler une commande' },
  ORDERS_ASSIGN: { code: 'orders.assign', group: 'Commandes', description: 'Affecter ou réaffecter un livreur' },
  MERCHANTS_MANAGE: { code: 'merchants.manage', group: 'Commerçants', description: 'Gérer les commerçants et restaurants' },
  // Argent
  PAYMENTS_READ: { code: 'payments.read', group: 'Finances', description: 'Consulter les paiements' },
  PAYMENTS_VALIDATE: { code: 'payments.validate', group: 'Finances', description: 'Valider les paiements Mobile Money manuels, rembourser' },
  WALLETS_MANAGE: { code: 'wallets.manage', group: 'Finances', description: 'Portefeuilles, versements espèces, retraits' },
  PROMOTIONS_MANAGE: { code: 'promotions.manage', group: 'Marketing', description: 'Gérer les codes promo' },
  NOTIFICATIONS_SEND: { code: 'notifications.send', group: 'Marketing', description: 'Envoyer des notifications ciblées' },
  // Qualité et pilotage
  COMPLAINTS_MANAGE: { code: 'complaints.manage', group: 'Qualité', description: 'Traiter les réclamations' },
  STATS_READ: { code: 'stats.read', group: 'Pilotage', description: 'Consulter le tableau de bord et les statistiques' },
  SETTINGS_MANAGE: { code: 'settings.manage', group: 'Pilotage', description: 'Modifier les paramètres de la plateforme' },
  AUDIT_READ: { code: 'audit.read', group: 'Pilotage', description: "Consulter le journal d'audit" },
} as const;

export type PermissionCode = (typeof PERMISSIONS)[keyof typeof PERMISSIONS]['code'];

export const ALL_PERMISSION_CODES: PermissionCode[] = Object.values(PERMISSIONS).map((p) => p.code);

/** Codes des rôles utilisés par le code applicatif. */
export const ROLE = {
  SUPER_ADMIN: 'SUPER_ADMIN',
  CITY_MANAGER: 'CITY_MANAGER',
  DISPATCHER: 'DISPATCHER',
  SUPPORT: 'SUPPORT',
  FINANCE: 'FINANCE',
  CLIENT: 'CLIENT',
  DRIVER: 'DRIVER',
  MERCHANT: 'MERCHANT',
} as const;

/** Permission spéciale portée par le jeton du super-administrateur. */
export const ALL_PERMISSIONS_WILDCARD = '*';

const P = PERMISSIONS;

export const DEFAULT_ROLES: {
  code: string;
  name: string;
  description: string;
  permissions: PermissionCode[] | typeof ALL_PERMISSIONS_WILDCARD;
}[] = [
  {
    code: ROLE.SUPER_ADMIN,
    name: 'Super-administrateur',
    description: 'Accès complet à toute la plateforme',
    permissions: ALL_PERMISSIONS_WILDCARD,
  },
  {
    code: ROLE.CITY_MANAGER,
    name: 'Responsable de ville',
    description: "Pilote l'activité d'une ville",
    permissions: [
      P.USERS_READ.code, P.USERS_MANAGE.code, P.DRIVERS_READ.code, P.DRIVERS_VALIDATE.code, P.DRIVERS_MANAGE.code,
      P.CITIES_MANAGE.code, P.PRICING_READ.code, P.PRICING_MANAGE.code, P.ORDERS_READ.code, P.ORDERS_MANAGE.code,
      P.ORDERS_ASSIGN.code, P.MERCHANTS_MANAGE.code, P.PAYMENTS_READ.code, P.PAYMENTS_VALIDATE.code,
      P.WALLETS_MANAGE.code, P.PROMOTIONS_MANAGE.code, P.NOTIFICATIONS_SEND.code, P.COMPLAINTS_MANAGE.code,
      P.STATS_READ.code,
    ],
  },
  {
    code: ROLE.DISPATCHER,
    name: 'Dispatcheur',
    description: 'Suit les commandes et affecte les livreurs',
    permissions: [P.ORDERS_READ.code, P.ORDERS_MANAGE.code, P.ORDERS_ASSIGN.code, P.DRIVERS_READ.code, P.USERS_READ.code, P.PRICING_READ.code],
  },
  {
    code: ROLE.SUPPORT,
    name: 'Service client',
    description: 'Répond aux clients et traite les réclamations',
    permissions: [P.ORDERS_READ.code, P.USERS_READ.code, P.DRIVERS_READ.code, P.COMPLAINTS_MANAGE.code, P.PRICING_READ.code],
  },
  {
    code: ROLE.FINANCE,
    name: 'Finances',
    description: 'Paiements, portefeuilles et versements',
    permissions: [P.PAYMENTS_READ.code, P.PAYMENTS_VALIDATE.code, P.WALLETS_MANAGE.code, P.ORDERS_READ.code, P.STATS_READ.code, P.DRIVERS_READ.code],
  },
  { code: ROLE.CLIENT, name: 'Client', description: 'Commande des livraisons et des courses', permissions: [] },
  { code: ROLE.DRIVER, name: 'Livreur', description: 'Effectue les livraisons', permissions: [] },
  { code: ROLE.MERCHANT, name: 'Commerçant', description: 'Gère un commerce partenaire', permissions: [] },
];

/** Rôles attribués automatiquement à l'inscription : ils ne donnent aucun accès à l'administration. */
export const PUBLIC_ROLE_CODES: string[] = [ROLE.CLIENT, ROLE.DRIVER, ROLE.MERCHANT];
