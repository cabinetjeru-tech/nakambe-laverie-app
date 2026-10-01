import { canonicalClasse, CLASSES, CYCLES } from "../search";
import { CONSULTED, subjectCodes, type Statut } from "./structure";

/**
 * Couverture de la base documentaire : pour chaque classe et chaque matière, y a-t-il un guide et un programme consultables ?
 * Sert au tableau de l'espace admin pour repérer d'un coup d'œil ce qui manque. Module pur.
 */

type Col = { code: string; label: string };
const TOUT: Col = { code: "TOUT", label: "Toutes" };
const COLLEGE_LYCEE: Col[] = [
  TOUT,
  { code: "FR", label: "Français" },
  { code: "MATH", label: "Maths" },
  { code: "ANG", label: "Anglais" },
  { code: "HIST", label: "Histoire" },
  { code: "GEO", label: "Géo." },
  { code: "SVT", label: "SVT" },
  { code: "PHYS", label: "PC" },
  { code: "EPS", label: "EPS" },
  { code: "ALL", label: "Allemand" },
  { code: "ESP", label: "Espagnol" },
  { code: "PHILO", label: "Philo" },
];
const PRIMAIRE: Col[] = [
  TOUT,
  { code: "FR", label: "Français" },
  { code: "MATH", label: "Maths" },
  { code: "SCI", label: "Sc. d'obs." },
  { code: "HIST", label: "Histoire" },
  { code: "GEO", label: "Géo." },
  { code: "ECM", label: "ECM" },
  { code: "EPS", label: "EPS/APE" },
  { code: "APA", label: "Act. prat." },
];

/** Colonnes du tableau pour chaque cycle. « Toutes » : document couvrant toutes les matières de la classe (curricula du primaire, préscolaire). */
export const MATIERES_PAR_CYCLE: Record<string, Col[]> = {
  PRESCOLAIRE: [TOUT],
  PRIMAIRE,
  PRIMAIRE_BILINGUE: [TOUT, { code: "LN", label: "Langue nat." }, ...PRIMAIRE.slice(1)],
  POST_PRIMAIRE: COLLEGE_LYCEE,
  SECONDAIRE: COLLEGE_LYCEE,
};

export const CYCLES_COUVERTURE = CYCLES.map((c) => ({ code: c.code, label: c.label, classes: [...c.classes] as string[], matieres: MATIERES_PAR_CYCLE[c.code]! }));

export type EntreeCouverture = { classes: string[]; disciplines: string[]; type?: string | null; statut?: Statut | null };
export type CaseCouverture = { guide: boolean; programme: boolean; attendu: boolean };
export type Couverture = Record<string, Record<string, CaseCouverture>>;

const TYPES_PROGRAMME = new Set(["PROGRAMME", "CURRICULUM", "REFERENTIEL"]);

const CONNUES = new Set<string>(CLASSES);

/** « 6e-5e », « 4e et 3e », « CP1, CP2 » → classes officielles. */
function classesDe(classes: string[]): string[] {
  return classes
    .flatMap((c) => c.split(/\s*[,;\/]\s*/))
    .flatMap((c) => (/bilingue|blg/i.test(c) ? [c] : c.split(/\s*(?:-|–|\bet\b)\s*/i)))
    .map((c) => canonicalClasse(c))
    .filter((c) => CONNUES.has(c));
}

/**
 * `docs` : documents consultables (déposés ou fichiers) ; `attendus` : ressources du registre encore à déposer.
 * Un document sans classe précise (texte général) ne remplit aucune case ; un document sans matière remplit la colonne « Toutes ».
 */
export function couverture(docs: EntreeCouverture[], attendus: EntreeCouverture[] = []): Couverture {
  const out: Couverture = {};
  for (const cy of CYCLES_COUVERTURE)
    for (const c of cy.classes) {
      out[c] = {};
      for (const m of cy.matieres) out[c][m.code] = { guide: false, programme: false, attendu: false };
    }
  const marquer = (e: EntreeCouverture, f: (k: CaseCouverture) => void) => {
    const codes = e.disciplines.length ? new Set(e.disciplines.flatMap((d) => [...subjectCodes(d)])) : new Set(["TOUT"]);
    for (const c of classesDe(e.classes)) for (const code of codes) if (out[c]?.[code]) f(out[c][code]);
  };
  for (const d of docs) {
    if (d.statut && !CONSULTED.includes(d.statut)) continue;
    const t = (d.type ?? "").toUpperCase();
    if (t === "GUIDE_PEDAGOGIQUE") marquer(d, (k) => (k.guide = true));
    else if (TYPES_PROGRAMME.has(t)) marquer(d, (k) => (k.programme = true));
  }
  for (const a of attendus) marquer(a, (k) => (k.attendu = true));
  return out;
}

/** Nombre de cases (classe × matière) ayant au moins un guide ou un programme. */
export function casesCouvertes(c: Couverture): { couvertes: number; total: number } {
  const cases = Object.values(c).flatMap((l) => Object.values(l));
  return { couvertes: cases.filter((k) => k.guide || k.programme).length, total: cases.length };
}
