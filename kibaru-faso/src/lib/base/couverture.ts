import { CLASS_INFO, CONSULTED, subjectCodes, type Statut } from "./structure";

/**
 * Couverture de la base documentaire : pour chaque classe et chaque matière, y a-t-il un guide et un programme consultables ?
 * Sert au tableau de l'espace admin pour repérer d'un coup d'œil ce qui manque. Module pur.
 */

/** Matières suivies dans le tableau, dans l'ordre d'affichage. */
export const MATIERES_COUVERTURE = [
  { code: "FR", label: "Français" },
  { code: "MATH", label: "Maths" },
  { code: "ANG", label: "Anglais" },
  { code: "HIST", label: "Histoire" },
  { code: "GEO", label: "Géographie" },
  { code: "SVT", label: "SVT" },
  { code: "PHYS", label: "PC" },
  { code: "EPS", label: "EPS" },
  { code: "ALL", label: "Allemand" },
  { code: "ESP", label: "Espagnol" },
  { code: "PHILO", label: "Philo" },
] as const;

export const CLASSES_COUVERTURE = CLASS_INFO.map((c) => c.classe);

export type EntreeCouverture = { classes: string[]; disciplines: string[]; type?: string | null; statut?: Statut | null };
export type CaseCouverture = { guide: boolean; programme: boolean; attendu: boolean };
export type Couverture = Record<string, Record<string, CaseCouverture>>;

const TYPES_PROGRAMME = new Set(["PROGRAMME", "CURRICULUM", "REFERENTIEL"]);

function classeNormalisee(c: string): string | undefined {
  const n = c.trim().toLowerCase().replace(/è/g, "e");
  if (/^(tle|term|terminale)/.test(n)) return "Terminale";
  if (/^(1ere|1re|premiere)$/.test(n)) return "1ère";
  if (/^(2nde|2de|seconde)$/.test(n)) return "2nde";
  return CLASSES_COUVERTURE.find((x) => x === n);
}

/** « 6e-5e », « 4e et 3e » → ["6e", "5e"] / ["4e", "3e"]. */
function classesDe(classes: string[]): string[] {
  return classes.flatMap((c) => c.split(/\s*(?:-|–|,|\/|\bet\b)\s*/i)).map(classeNormalisee).filter((c): c is string => !!c);
}

/**
 * `docs` : documents consultables (déposés ou fichiers) ; `attendus` : ressources du registre encore à déposer.
 * Un document sans classe ni matière précise (texte général) ne remplit aucune case.
 */
export function couverture(docs: EntreeCouverture[], attendus: EntreeCouverture[] = []): Couverture {
  const out: Couverture = {};
  for (const c of CLASSES_COUVERTURE) {
    out[c] = {};
    for (const m of MATIERES_COUVERTURE) out[c][m.code] = { guide: false, programme: false, attendu: false };
  }
  const marquer = (e: EntreeCouverture, f: (k: CaseCouverture) => void) => {
    const codes = new Set(e.disciplines.flatMap((d) => [...subjectCodes(d)]));
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
