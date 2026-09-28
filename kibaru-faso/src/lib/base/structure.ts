/**
 * Structure documentaire officielle de KIBARU FASO.
 *
 *   base-documentaire/
 *   ├── 01_PROGRAMMES_ET_CURRICULA
 *   ├── 02_GUIDES_PEDAGOGIQUES
 *   ├── …
 *   └── 09_ARCHIVES
 *
 * Dans chaque catégorie : PAYS / NIVEAU / CLASSE / MATIÈRE / TYPE DE DOCUMENT / ANNÉE / VERSION / fichier.
 * Les niveaux de dossiers après la matière sont facultatifs. Le chemin fournit des métadonnées par défaut ;
 * la fiche descriptive du document reste prioritaire.
 *
 * Module pur : aucun accès disque.
 */

export const CATEGORIES = [
  { code: "01_PROGRAMMES_ET_CURRICULA", label: "Programmes et curricula", defaultType: "programme" },
  { code: "02_GUIDES_PEDAGOGIQUES", label: "Guides pédagogiques", defaultType: "guide pédagogique" },
  { code: "03_MANUELS_ET_RESSOURCES", label: "Manuels et ressources", defaultType: "manuel" },
  { code: "04_PROGRESSIONS", label: "Progressions", defaultType: "progression" },
  { code: "05_EVALUATIONS", label: "Évaluations", defaultType: "évaluation" },
  { code: "06_REMEDIATION", label: "Remédiation", defaultType: "ressource de remédiation" },
  { code: "07_REFERENTIELS_ET_TEXTES_OFFICIELS", label: "Référentiels et textes officiels", defaultType: "référentiel" },
  { code: "08_RESSOURCES_COMPLEMENTAIRES", label: "Ressources complémentaires", defaultType: "ressource complémentaire" },
  { code: "09_ARCHIVES", label: "Archives", defaultType: "document archivé" },
] as const;
export type CategoryCode = (typeof CATEGORIES)[number]["code"];
export const ARCHIVES_CATEGORY: CategoryCode = "09_ARCHIVES";

export function categoryLabel(code: string | undefined): string {
  return CATEGORIES.find((c) => c.code === code)?.label ?? "Hors structure";
}

/** Statuts officiels d'une ressource. */
export const STATUTS = ["ACTIF", "PROVISOIRE", "A_VERIFIER", "REMPLACE", "ARCHIVE"] as const;
export type Statut = (typeof STATUTS)[number];

export const STATUT_LABELS: Record<Statut, string> = {
  ACTIF: "ACTIF",
  PROVISOIRE: "PROVISOIRE",
  A_VERIFIER: "À VÉRIFIER",
  REMPLACE: "REMPLACÉ",
  ARCHIVE: "ARCHIVE",
};

/** Statuts dont le contenu est consulté pour répondre (les autres ne sont conservés que pour l'historique). */
export const CONSULTED: readonly Statut[] = ["ACTIF", "PROVISOIRE", "A_VERIFIER"];

/** À pertinence égale, une source ACTIVE passe devant une source provisoire ou à vérifier. */
export const STATUT_WEIGHT: Record<Statut, number> = { ACTIF: 1, PROVISOIRE: 0.85, A_VERIFIER: 0.7, REMPLACE: 0, ARCHIVE: 0 };

function norm(s: string): string {
  return s
    .toUpperCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[\s-]+/g, "_")
    .trim();
}

/** Lit un statut, y compris les écritures de la configuration V2 (actif, archive, remplace, declasse). */
export function parseStatut(v: string | undefined): Statut | undefined {
  if (!v) return undefined;
  const n = norm(v);
  if (/^(ACTIF|ACTIVE|EN_VIGUEUR|VALIDE)$/.test(n)) return "ACTIF";
  if (/^PROVISOIRE$/.test(n)) return "PROVISOIRE";
  if (/^A_VERIFIER$/.test(n)) return "A_VERIFIER";
  if (/^REMPLACE(E|S)?$/.test(n)) return "REMPLACE";
  if (/^(ARCHIVE(E|S)?|DECLASSE(E)?)$/.test(n)) return "ARCHIVE";
  return undefined;
}

const CLASSES: Record<string, string> = {
  "6E": "6e",
  "5E": "5e",
  "4E": "4e",
  "3E": "3e",
  "2NDE": "2nde",
  "2DE": "2nde",
  SECONDE: "2nde",
  "1ERE": "1ère",
  "1RE": "1ère",
  PREMIERE: "1ère",
  TLE: "Terminale",
  TERMINALE: "Terminale",
};
const ALL_CLASSES = /^(TOUTES?_(LES_)?CLASSES|TOUS_NIVEAUX|TOUTES)$/;

const NIVEAUX: Record<string, string> = {
  POST_PRIMAIRE: "Post-primaire",
  SECONDAIRE: "Secondaire",
  PRIMAIRE: "Primaire",
  PRESCOLAIRE: "Préscolaire",
  TOUS_NIVEAUX: "Tous niveaux",
};

const MATIERES: Record<string, string> = {
  MATHEMATIQUES: "Mathématiques",
  MATHS: "Mathématiques",
  FRANCAIS: "Français",
  ANGLAIS: "Anglais",
  ALLEMAND: "Allemand",
  ESPAGNOL: "Espagnol",
  ARABE: "Arabe",
  PHYSIQUE_CHIMIE: "Physique-Chimie",
  PC: "Physique-Chimie",
  SVT: "Sciences de la Vie et de la Terre",
  SCIENCES_DE_LA_VIE_ET_DE_LA_TERRE: "Sciences de la Vie et de la Terre",
  HISTOIRE_GEOGRAPHIE: "Histoire-Géographie",
  PHILOSOPHIE: "Philosophie",
  EDUCATION_CIVIQUE_ET_MORALE: "Éducation civique et morale",
  EPS: "Éducation physique et sportive",
  EDUCATION_PHYSIQUE_ET_SPORTIVE: "Éducation physique et sportive",
  INFORMATIQUE: "Informatique",
  ECONOMIE: "Économie",
};
const ALL_SUBJECTS = /^(TOUTES?_(LES_)?MATIERES|TRANSVERSAL|PLURIDISCIPLINAIRE)$/;

const PAYS: Record<string, string> = { BURKINA_FASO: "Burkina Faso" };

/** « MATHEMATIQUES » → « Mathematiques », faute d'entrée dans les tables ci-dessus. */
function humanize(seg: string): string {
  const s = seg.replace(/_/g, " ").toLowerCase();
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export type PathInfo = {
  category?: CategoryCode;
  pays?: string;
  niveau?: string;
  /** undefined = non précisé ; [] = toutes classes. */
  classes?: string[];
  matieres?: string[];
  type?: string;
  annee?: string;
  version?: string;
  /** Écarts entre le chemin et la structure attendue. */
  problems: string[];
};

/**
 * Déduit les métadonnées d'un chemin relatif à la racine de la base, par exemple :
 * 01_PROGRAMMES_ET_CURRICULA/BURKINA_FASO/POST_PRIMAIRE/6E/MATHEMATIQUES/PROGRAMME/2024/V1/programme.pdf
 */
export function parsePath(rel: string): PathInfo {
  const segs = rel.split("/").filter(Boolean);
  segs.pop(); // nom du fichier
  const info: PathInfo = { problems: [] };
  const first = segs.shift();
  const cat = CATEGORIES.find((c) => c.code === first);
  if (!cat) {
    info.problems.push(`hors des 9 catégories officielles (dossier « ${first ?? "racine"} »)`);
    return info;
  }
  info.category = cat.code;
  info.type = cat.defaultType;
  const [pays, niveau, classe, matiere, ...rest] = segs;
  if (pays) info.pays = PAYS[norm(pays)] ?? humanize(pays);
  if (niveau) info.niveau = NIVEAUX[norm(niveau)] ?? humanize(niveau);
  if (classe) {
    const n = norm(classe);
    if (ALL_CLASSES.test(n)) info.classes = [];
    else if (CLASSES[n]) info.classes = [CLASSES[n]!];
    else info.problems.push(`classe « ${classe} » non reconnue (attendu : 6E, 5E, 4E, 3E, 2NDE, 1ERE, TLE ou TOUTES_CLASSES)`);
  }
  if (matiere) {
    const n = norm(matiere);
    info.matieres = ALL_SUBJECTS.test(n) ? [] : [MATIERES[n] ?? humanize(matiere)];
  }
  const types: string[] = [];
  for (const seg of rest) {
    const n = norm(seg);
    if (/^(19|20)\d{2}$/.test(n)) info.annee = n;
    else if (/^(V|VERSION_?)\d+([._]\d+)*$/.test(n)) info.version = n.replace(/^(VERSION_?|V)/, "").replace(/_/g, ".");
    else types.push(humanize(seg).toLowerCase());
  }
  if (types.length) info.type = types.join(" — ");
  return info;
}
