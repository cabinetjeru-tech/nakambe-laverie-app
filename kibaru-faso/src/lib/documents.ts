/** Découpage d'une production en documents imprimables séparés (sujet / corrigé). */

export type DocPart = { key: string; title: string; markdown: string };

/** Un sujet est distribué aux élèves : il est exporté sans mention MON PROF.IA. */
export function isStudentCopy(title: string): boolean {
  return /\bsujet\b/i.test(title) && !/corrig/i.test(title);
}

/** Rubriques du tableau de bord (configuration V2, section 11). */
export const CATEGORIES = {
  cours: "Mes cours",
  devoir: "Mes devoirs",
  corrige: "Mes corrigés",
  evaluation: "Mes évaluations",
  progression: "Mes progressions",
  remediation: "Remédiation",
  activite: "Activités",
  autre: "Autres",
} as const;
export type Category = keyof typeof CATEGORIES;

/** Classe une préparation d'après la première demande (quand elle ne vient pas d'une action rapide). */
export function classify(text: string): Category {
  const t = text.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  if (/progression|repartition annuelle|repartition trimestrielle/.test(t)) return "progression";
  if (/remedia|ne comprennent pas|difficultes? (a|en|de|pour)/.test(t)) return "remediation";
  if (/devoir/.test(t)) return "devoir";
  if (/evaluation|interrogation|controle|composition|examen blanc/.test(t)) return "evaluation";
  if (/corrig|bareme/.test(t)) return "corrige";
  if (/lecon|cours|seance|fiche|sequence|enseigner/.test(t)) return "cours";
  if (/activite|situation.probleme|exercice|revision/.test(t)) return "activite";
  return "autre";
}

const HEADING = /^#{1,4}\s*\**\s*DOCUMENT\s+(\d{1,2})\s*[—–:-]+\s*(.+?)\**\s*$/gim;

export function splitDocuments(markdown: string): DocPart[] {
  const matches = [...markdown.matchAll(HEADING)];
  if (matches.length < 2) return [];
  const parts: DocPart[] = [];
  matches.forEach((m, i) => {
    const start = m.index! + m[0].length;
    // Un document s'arrête au titre de niveau 1 ou 2 suivant (autre document, « Statut des informations »…).
    const rest = markdown.slice(start);
    const next = rest.search(/^#{1,2}\s/m);
    const end = next >= 0 ? start + next : markdown.length;
    const label = m[2]!.replace(/\*+/g, "").trim();
    const name = label.charAt(0).toUpperCase() + label.slice(1).toLowerCase();
    parts.push({ key: `doc${i + 1}`, title: name, markdown: markdown.slice(start, end).trim() });
  });
  return parts;
}

/** Titre de conversation à partir de la première demande. */
export function conversationTitle(text: string): string {
  const t = text.replace(/\s+/g, " ").trim();
  return t.length > 70 ? `${t.slice(0, 67)}…` : t || "Nouvelle préparation";
}
