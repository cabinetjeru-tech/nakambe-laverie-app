import { requirePermission } from "@/lib/auth/session";
import { can, type Permission } from "@/lib/permissions";
import { DashboardShell } from "@/components/layout/dashboard-shell";
import type { NavItem } from "@/components/layout/side-nav";

const items: (NavItem & { perm: Permission })[] = [
  { href: "/admin", label: "Tableau de bord", icon: "Gauge", perm: "admin.access" },
  { href: "/admin/utilisateurs", label: "Utilisateurs & rôles", icon: "Users", perm: "users.view", section: "Communauté" },
  { href: "/admin/avis", label: "Avis", icon: "Star", perm: "reviews.moderate", section: "Communauté" },
  { href: "/admin/tickets", label: "Assistance", icon: "LifeBuoy", perm: "tickets.manage", section: "Communauté" },
  { href: "/admin/moderation", label: "Signalements", icon: "Flag", perm: "reviews.moderate", section: "Communauté" },
  { href: "/admin/notifications", label: "Notifications", icon: "Bell", perm: "notifications.broadcast", section: "Communauté" },
  { href: "/admin/formations", label: "Formations", icon: "BookOpen", perm: "courses.review", section: "Pédagogie" },
  { href: "/admin/categories", label: "Catégories", icon: "FolderTree", perm: "categories.manage", section: "Pédagogie" },
  { href: "/admin/classes", label: "Classes virtuelles", icon: "Radio", perm: "live.manage_all", section: "Pédagogie" },
  { href: "/admin/certificats", label: "Certificats", icon: "Award", perm: "certificates.manage", section: "Pédagogie" },
  { href: "/admin/contenus", label: "Blog & FAQ", icon: "Newspaper", perm: "content.manage", section: "Pédagogie" },
  { href: "/admin/transactions", label: "Transactions", icon: "CreditCard", perm: "finance.view", section: "Commerce" },
  { href: "/admin/offres", label: "Abonnements & packs", icon: "Package", perm: "finance.manage", section: "Commerce" },
  { href: "/admin/coupons", label: "Codes promo", icon: "Tag", perm: "coupons.manage", section: "Commerce" },
  { href: "/admin/rapports", label: "Rapports", icon: "TrendingUp", perm: "reports.view", section: "Pilotage" },
  { href: "/admin/journal", label: "Journal d'audit", icon: "ScrollText", perm: "audit.view", section: "Pilotage" },
  { href: "/admin/parametres", label: "Paramètres", icon: "Settings", perm: "settings.manage", section: "Pilotage" },
];

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const user = await requirePermission("admin.access");
  const nav: NavItem[] = items.filter((i) => can(user.role, i.perm)).map(({ perm: _p, ...rest }) => rest);
  nav.push({ href: "/espace", label: "Espace apprenant", icon: "GraduationCap", section: "Autres espaces" });
  if (can(user.role, "trainer.access")) nav.push({ href: "/formateur", label: "Espace formateur", icon: "Briefcase", section: "Autres espaces" });
  return <DashboardShell user={user} nav={nav} title="Administration">{children}</DashboardShell>;
}
