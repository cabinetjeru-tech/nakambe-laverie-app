import { requirePermission } from "@/lib/auth/session";
import { can } from "@/lib/permissions";
import { DashboardShell } from "@/components/layout/dashboard-shell";
import type { NavItem } from "@/components/layout/side-nav";

export default async function TrainerLayout({ children }: { children: React.ReactNode }) {
  const user = await requirePermission("trainer.access");
  const nav: NavItem[] = [
    { href: "/formateur", label: "Tableau de bord", icon: "LayoutDashboard" },
    { href: "/formateur/formations", label: "Mes formations", icon: "BookOpen" },
    { href: "/formateur/corrections", label: "Corrections", icon: "ClipboardCheck" },
    { href: "/formateur/classes", label: "Classes virtuelles", icon: "Radio" },
    { href: "/formateur/assistant-ia", label: "Assistant pédagogique IA", icon: "Sparkles" },
    { href: "/formateur/statistiques", label: "Statistiques", icon: "BarChart3" },
    { href: "/espace/messages", label: "Messagerie", icon: "MessageSquare", section: "Compte" },
    { href: "/espace/profil", label: "Mon profil public", icon: "User", section: "Compte" },
    { href: "/espace", label: "Espace apprenant", icon: "GraduationCap", section: "Autres espaces" },
  ];
  if (can(user.role, "admin.access")) nav.push({ href: "/admin", label: "Administration", icon: "ShieldCheck", section: "Autres espaces" });
  return <DashboardShell user={user} nav={nav} title="Espace formateur">{children}</DashboardShell>;
}
