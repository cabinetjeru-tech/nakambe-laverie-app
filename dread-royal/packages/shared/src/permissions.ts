/** Catalogue des permissions élémentaires (vérifiées côté serveur). */
export const PERMISSIONS = {
  'dashboard.view': 'Voir le tableau de bord',
  'clients.view': 'Voir tous les clients',
  'clients.view_own': 'Voir uniquement ses clients (coiffeur)',
  'clients.manage': 'Créer / modifier les clients',
  'staff.view': 'Voir le personnel',
  'staff.manage': 'Gérer le personnel',
  'services.view': 'Voir les prestations',
  'services.manage': 'Gérer les prestations et tarifs',
  'appointments.view_all': 'Voir le planning général',
  'appointments.view_own': 'Voir son propre planning',
  'appointments.manage': 'Créer / modifier / annuler les rendez-vous',
  'appointments.update_status': 'Changer le statut de ses rendez-vous',
  'sales.view': 'Voir les ventes et factures',
  'sales.create': 'Enregistrer des ventes',
  'sales.discount': 'Accorder des remises',
  'sales.cancel': 'Annuler / rembourser une vente',
  'payments.create': 'Encaisser des paiements',
  'cash.manage': 'Ouvrir / clôturer la caisse, mouvements manuels',
  'expenses.view': 'Voir les dépenses et recettes',
  'expenses.manage': 'Enregistrer dépenses et autres recettes',
  'finance.view': 'Voir la comptabilité et la trésorerie',
  'commissions.view_all': 'Voir toutes les commissions',
  'commissions.view_own': 'Voir ses commissions',
  'commissions.pay': 'Régler les commissions',
  'stock.view': 'Voir le stock',
  'stock.manage': 'Mouvements de stock, inventaires, produits',
  'suppliers.manage': 'Gérer fournisseurs et achats',
  'loyalty.view': 'Voir la fidélité',
  'loyalty.manage': 'Gérer la fidélité et les forfaits',
  'reports.view': 'Rapports et exports',
  'users.manage': 'Gérer les utilisateurs et les rôles',
  'audit.view': "Consulter l'historique des actions",
  'settings.manage': 'Paramètres du salon',
  'backup.manage': 'Sauvegardes',
} as const;

export type Permission = keyof typeof PERMISSIONS;
export const ALL_PERMISSIONS = Object.keys(PERMISSIONS) as Permission[];

export const PERMISSION_GROUPS: { label: string; permissions: Permission[] }[] = [
  { label: 'Général', permissions: ['dashboard.view', 'reports.view'] },
  { label: 'Clients', permissions: ['clients.view', 'clients.view_own', 'clients.manage'] },
  { label: 'Personnel', permissions: ['staff.view', 'staff.manage'] },
  { label: 'Prestations', permissions: ['services.view', 'services.manage'] },
  { label: 'Rendez-vous', permissions: ['appointments.view_all', 'appointments.view_own', 'appointments.manage', 'appointments.update_status'] },
  { label: 'Ventes & caisse', permissions: ['sales.view', 'sales.create', 'sales.discount', 'sales.cancel', 'payments.create', 'cash.manage'] },
  { label: 'Finances', permissions: ['expenses.view', 'expenses.manage', 'finance.view'] },
  { label: 'Commissions', permissions: ['commissions.view_all', 'commissions.view_own', 'commissions.pay'] },
  { label: 'Stock', permissions: ['stock.view', 'stock.manage', 'suppliers.manage'] },
  { label: 'Fidélité', permissions: ['loyalty.view', 'loyalty.manage'] },
  { label: 'Administration', permissions: ['users.manage', 'audit.view', 'settings.manage', 'backup.manage'] },
];

export const ROLE_CODES = ['OWNER', 'MANAGER', 'CASHIER', 'STYLIST', 'STOCK_MANAGER'] as const;
export type RoleCode = (typeof ROLE_CODES)[number];

/** Rôles initiaux. Le propriétaire peut ensuite modifier les permissions de chaque rôle. */
export const DEFAULT_ROLES: { code: RoleCode; name: string; description: string; permissions: (Permission | '*')[] }[] = [
  { code: 'OWNER', name: 'Propriétaire', description: 'Accès complet à toutes les fonctionnalités', permissions: ['*'] },
  {
    code: 'MANAGER',
    name: 'Responsable',
    description: 'Rendez-vous, clients, personnel et activité commerciale',
    permissions: [
      'dashboard.view', 'clients.view', 'clients.manage', 'staff.view', 'staff.manage', 'services.view', 'services.manage',
      'appointments.view_all', 'appointments.manage', 'appointments.update_status', 'sales.view', 'sales.create', 'sales.discount',
      'payments.create', 'expenses.view', 'commissions.view_all', 'stock.view', 'loyalty.view', 'loyalty.manage', 'reports.view',
    ],
  },
  {
    code: 'CASHIER',
    name: 'Caissier',
    description: 'Ventes, encaissements, factures, reçus et caisse',
    permissions: [
      'dashboard.view', 'clients.view', 'clients.manage', 'services.view', 'staff.view', 'appointments.view_all', 'appointments.manage',
      'appointments.update_status', 'sales.view', 'sales.create', 'payments.create', 'cash.manage', 'stock.view', 'loyalty.view',
    ],
  },
  {
    code: 'STYLIST',
    name: 'Coiffeur / Coiffeuse',
    description: 'Planning personnel, ses clients, ses prestations et commissions',
    permissions: ['clients.view_own', 'services.view', 'appointments.view_own', 'appointments.update_status', 'commissions.view_own'],
  },
  {
    code: 'STOCK_MANAGER',
    name: 'Gestionnaire de stock',
    description: 'Produits, fournisseurs, entrées, sorties et inventaires',
    permissions: ['stock.view', 'stock.manage', 'suppliers.manage', 'services.view'],
  },
];

export function hasPermission(userPermissions: string[], required: string): boolean {
  return userPermissions.includes('*') || userPermissions.includes(required);
}

export function hasAnyPermission(userPermissions: string[], required: string[]): boolean {
  return required.some((p) => hasPermission(userPermissions, p));
}
