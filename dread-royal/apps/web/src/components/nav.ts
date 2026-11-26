import { BarChart3, Boxes, CalendarDays, ClipboardList, Crown, FileText, Gauge, HandCoins, History, Landmark, Package, Receipt, RefreshCw, Scissors, Settings, ShieldCheck, ShoppingCart, Truck, UserCog, Users, Wallet, Wrench } from 'lucide-react';

export interface NavItem { href: string; label: string; icon: React.ComponentType<{ className?: string }>; perms: string[] }
export interface NavGroup { label: string; items: NavItem[] }

/** Menu : chaque entrée n'apparaît que si l'utilisateur a l'une des permissions (le serveur revérifie toujours). */
export const NAV: NavGroup[] = [
  { label: 'Pilotage', items: [
    { href: '/', label: 'Tableau de bord', icon: Gauge, perms: ['dashboard.view'] },
    { href: '/rendez-vous/', label: 'Rendez-vous', icon: CalendarDays, perms: ['appointments.view_all', 'appointments.view_own'] },
  ] },
  { label: 'Ventes', items: [
    { href: '/vente/', label: 'Nouvelle vente', icon: ShoppingCart, perms: ['sales.create'] },
    { href: '/ventes/', label: 'Ventes & factures', icon: Receipt, perms: ['sales.view'] },
    { href: '/caisse/', label: 'Caisse', icon: Wallet, perms: ['cash.manage', 'finance.view'] },
  ] },
  { label: 'Salon', items: [
    { href: '/clients/', label: 'Clients', icon: Users, perms: ['clients.view', 'clients.view_own'] },
    { href: '/prestations/', label: 'Prestations & tarifs', icon: Scissors, perms: ['services.view'] },
    { href: '/personnel/', label: 'Personnel', icon: UserCog, perms: ['staff.view'] },
    { href: '/commissions/', label: 'Commissions', icon: HandCoins, perms: ['commissions.view_all', 'commissions.view_own'] },
    { href: '/fidelite/', label: 'Fidélité & forfaits', icon: Crown, perms: ['loyalty.view'] },
  ] },
  { label: 'Gestion', items: [
    { href: '/depenses/', label: 'Dépenses & recettes', icon: ClipboardList, perms: ['expenses.view'] },
    { href: '/finances/', label: 'Comptabilité', icon: Landmark, perms: ['finance.view'] },
    { href: '/stock/', label: 'Stock & produits', icon: Boxes, perms: ['stock.view'] },
    { href: '/achats/', label: 'Fournisseurs & achats', icon: Truck, perms: ['suppliers.manage'] },
    { href: '/rapports/', label: 'Rapports & exports', icon: BarChart3, perms: ['reports.view'] },
  ] },
  { label: 'Administration', items: [
    { href: '/utilisateurs/', label: 'Utilisateurs & rôles', icon: ShieldCheck, perms: ['users.manage'] },
    { href: '/journal/', label: 'Historique des actions', icon: History, perms: ['audit.view'] },
    { href: '/parametres/', label: 'Paramètres', icon: Settings, perms: ['settings.manage', 'backup.manage'] },
    { href: '/synchronisation/', label: 'Synchronisation', icon: RefreshCw, perms: [] },
  ] },
];

export const ICONS = { Package, FileText, Wrench };
