export function formatXof(amount: number): string {
  return `${new Intl.NumberFormat("fr-FR").format(amount).replace(/ | /g, " ")} FCFA`;
}

export function formatDate(d: Date | string | null | undefined, opts: Intl.DateTimeFormatOptions = { dateStyle: "long" }): string {
  if (!d) return "—";
  return new Intl.DateTimeFormat("fr-FR", { timeZone: "Africa/Ouagadougou", ...opts }).format(new Date(d));
}

export function formatDateTime(d: Date | string | null | undefined): string {
  return formatDate(d, { dateStyle: "medium", timeStyle: "short" });
}

export function formatDuration(minutes: number): string {
  if (!minutes) return "—";
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h === 0) return `${m} min`;
  return m ? `${h} h ${m.toString().padStart(2, "0")}` : `${h} h`;
}

export const levelLabels: Record<string, string> = {
  BEGINNER: "Débutant",
  INTERMEDIATE: "Intermédiaire",
  ADVANCED: "Avancé",
};

export const roleLabels: Record<string, string> = {
  SUPERADMIN: "Super-administrateur",
  ADMIN: "Administrateur",
  TRAINER: "Formateur",
  ASSISTANT: "Assistant",
  LEARNER: "Apprenant",
};

export function slugify(input: string): string {
  return input
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

export function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]!.toUpperCase())
    .join("");
}
