import { requireUser } from "@/lib/auth/session";
import { can } from "@/lib/permissions";
import { DashboardShell } from "@/components/layout/dashboard-shell";
import type { NavItem } from "@/components/layout/side-nav";
import { TutorLauncher } from "@/components/tutor/tutor-launcher";

export default async function LearnerLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser("/espace");
  const nav: NavItem[] = [
    { href: "/espace", label: "Tableau de bord", icon: "LayoutDashboard" },
    { href: "/espace/formations", label: "Mes formations", icon: "BookOpen" },
    { href: "/espace/tuteur", label: "Tuteur IA", icon: "Sparkles" },
    { href: "/espace/planning", label: "Planning & classes", icon: "CalendarDays" },
    { href: "/espace/resultats", label: "Notes et résultats", icon: "ClipboardCheck" },
    { href: "/espace/certificats", label: "Certificats", icon: "Award" },
    { href: "/espace/favoris", label: "Favoris", icon: "Heart" },
    { href: "/espace/notes", label: "Mes notes", icon: "NotebookPen" },
    { href: "/espace/messages", label: "Messagerie", icon: "MessageSquare" },
    { href: "/espace/notifications", label: "Notifications", icon: "Bell" },
    { href: "/espace/paiements", label: "Paiements & factures", icon: "Receipt" },
    { href: "/espace/profil", label: "Profil & données", icon: "User" },
  ];
  if (can(user.role, "trainer.access")) nav.push({ href: "/formateur", label: "Espace formateur", icon: "GraduationCap", section: "Autres espaces" });
  if (can(user.role, "admin.access")) nav.push({ href: "/admin", label: "Administration", icon: "ShieldCheck", section: "Autres espaces" });
  return (
    <DashboardShell user={user} nav={nav} title="Espace apprenant">
      {children}
      <TutorLauncher />
    </DashboardShell>
  );
}
