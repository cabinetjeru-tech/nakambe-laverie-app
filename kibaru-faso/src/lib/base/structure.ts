/**
 * Structure documentaire officielle de MON PROF.IA.
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
  { code: "01_PROGRAMMES_ET_CURRICULA", label: "Programmes et curricula", defaultType: "PROGRAMME" },
  { code: "02_GUIDES_PEDAGOGIQUES", label: "Guides pédagogiques", defaultType: "GUIDE_PEDAGOGIQUE" },
  { code: "03_MANUELS_ET_RESSOURCES", label: "Manuels et ressources", defaultType: "MANUEL" },
  { code: "04_PROGRESSIONS", label: "Progressions", defaultType: "PROGRESSION" },
  { code: "05_EVALUATIONS", label: "Évaluations", defaultType: "EVALUATION" },
  { code: "06_REMEDIATION", label: "Remédiation", defaultType: "RESSOURCE_COMPLEMENTAIRE" },
  { code: "07_REFERENTIELS_ET_TEXTES_OFFICIELS", label: "Référentiels et textes officiels", defaultType: "REFERENTIEL" },
  { code: "08_RESSOURCES_COMPLEMENTAIRES", label: "Ressources complémentaires", defaultType: "RESSOURCE_COMPLEMENTAIRE" },
  { code: "09_ARCHIVES", label: "Archives", defaultType: "" },
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
  if (cat.defaultType) info.type = cat.defaultType;
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
  for (const seg of rest) {
    const n = norm(seg);
    if (/^(19|20)\d{2}$/.test(n)) info.annee = n;
    else if (/^(V|VERSION_?)\d+([._]\d+)*$/.test(n)) info.version = n.replace(/^(VERSION_?|V)/, "").replace(/_/g, ".");
    else info.type = parseDocType(seg) ?? info.type;
  }
  if (!info.type) delete info.type;
  return info;
}

/** Types de documents officiels du registre. */
export const DOC_TYPES = {
  PROGRAMME: "Programme",
  CURRICULUM: "Curriculum",
  GUIDE_PEDAGOGIQUE: "Guide pédagogique",
  MANUEL: "Manuel",
  REFERENTIEL: "Référentiel",
  PROGRESSION: "Progression",
  FICHE_PEDAGOGIQUE: "Fiche pédagogique",
  EVALUATION: "Évaluation",
  EXAMEN: "Examen",
  TEXTE_OFFICIEL: "Texte officiel",
  NOTE_DE_SERVICE: "Note de service",
  CIRCULAIRE: "Circulaire",
  RESSOURCE_COMPLEMENTAIRE: "Ressource complémentaire",
} as const;
export type DocType = keyof typeof DOC_TYPES;

/** « Guide », « guide pédagogique », « GUIDE_PEDAGOGIQUE » → GUIDE_PEDAGOGIQUE. undefined si non reconnu. */
export function parseDocType(v: string | undefined): DocType | undefined {
  if (!v) return undefined;
  const n = norm(v);
  if (n in DOC_TYPES) return n as DocType;
  const rules: [RegExp, DocType][] = [
    [/^PROGRAMMES?$/, "PROGRAMME"],
    [/^CURRICUL/, "CURRICULUM"],
    [/^GUIDE/, "GUIDE_PEDAGOGIQUE"],
    [/^MANUEL/, "MANUEL"],
    [/^REFERENTIEL/, "REFERENTIEL"],
    [/^PROGRESSION/, "PROGRESSION"],
    [/^FICHE/, "FICHE_PEDAGOGIQUE"],
    [/^(EVALUATION|SUJET|GRILLE|BAREME)/, "EVALUATION"],
    [/^EXAMEN/, "EXAMEN"],
    [/^(TEXTE|ARRETE|DECRET|LOI)/, "TEXTE_OFFICIEL"],
    [/^NOTE/, "NOTE_DE_SERVICE"],
    [/^CIRCULAIRE/, "CIRCULAIRE"],
    [/^RESSOURCE/, "RESSOURCE_COMPLEMENTAIRE"],
  ];
  return rules.find(([re]) => re.test(n))?.[1];
}

export function typeLabel(t: string | undefined): string {
  return t && t in DOC_TYPES ? DOC_TYPES[t as DocType] : t || "Document";
}

/** Catégorie de rangement conseillée pour un type de document. */
export function categoryForType(t: string | undefined): CategoryCode {
  switch (t) {
    case "PROGRAMME":
    case "CURRICULUM":
      return "01_PROGRAMMES_ET_CURRICULA";
    case "GUIDE_PEDAGOGIQUE":
      return "02_GUIDES_PEDAGOGIQUES";
    case "MANUEL":
    case "FICHE_PEDAGOGIQUE":
      return "03_MANUELS_ET_RESSOURCES";
    case "PROGRESSION":
      return "04_PROGRESSIONS";
    case "EVALUATION":
    case "EXAMEN":
      return "05_EVALUATIONS";
    case "REFERENTIEL":
    case "TEXTE_OFFICIEL":
    case "NOTE_DE_SERVICE":
    case "CIRCULAIRE":
      return "07_REFERENTIELS_ET_TEXTES_OFFICIELS";
    default:
      return "08_RESSOURCES_COMPLEMENTAIRES";
  }
}

/** Classes dans l'ordre, avec leur code d'identifiant et leur niveau. */
export const CLASS_INFO = [
  { classe: "6e", code: "6E", dossier: "6E", niveau: "Post-primaire", niveauDossier: "POST_PRIMAIRE" },
  { classe: "5e", code: "5E", dossier: "5E", niveau: "Post-primaire", niveauDossier: "POST_PRIMAIRE" },
  { classe: "4e", code: "4E", dossier: "4E", niveau: "Post-primaire", niveauDossier: "POST_PRIMAIRE" },
  { classe: "3e", code: "3E", dossier: "3E", niveau: "Post-primaire", niveauDossier: "POST_PRIMAIRE" },
  { classe: "2nde", code: "2NDE", dossier: "2NDE", niveau: "Secondaire", niveauDossier: "SECONDAIRE" },
  { classe: "1ère", code: "1ERE", dossier: "1ERE", niveau: "Secondaire", niveauDossier: "SECONDAIRE" },
  { classe: "Terminale", code: "TERM", dossier: "TLE", niveau: "Secondaire", niveauDossier: "SECONDAIRE" },
] as const;

/** Codes matière des identifiants, avec les intitulés qu'ils recouvrent. */
export const SUBJECTS = [
  { code: "MATH", label: "Mathématiques", dossier: "MATHEMATIQUES", re: /^(math|maths|mathematique)/ },
  { code: "FR", label: "Français", dossier: "FRANCAIS", re: /^(fr|francais)$|^francais/ },
  { code: "HIST", label: "Histoire", dossier: "HISTOIRE", re: /histoire/ },
  { code: "GEO", label: "Géographie", dossier: "GEOGRAPHIE", re: /^geo$|geographie/ },
  { code: "SVT", label: "Sciences de la Vie et de la Terre", dossier: "SVT", re: /^svt$|sciences? de la vie/ },
  { code: "PHYS", label: "Physique-Chimie", dossier: "PHYSIQUE_CHIMIE", re: /^(sciences? )?physiques?|physique.chimie|^pc$|^phys$/ },
  { code: "ANG", label: "Anglais", dossier: "ANGLAIS", re: /^(ang|anglais|english)/ },
  { code: "ALL", label: "Allemand", dossier: "ALLEMAND", re: /^(all|allemand)$/ },
  { code: "ESP", label: "Espagnol", dossier: "ESPAGNOL", re: /^(esp|espagnol)/ },
  { code: "AR", label: "Arabe", dossier: "ARABE", re: /^(ar|arabe)$/ },
  { code: "PHILO", label: "Philosophie", dossier: "PHILOSOPHIE", re: /^philo/ },
  { code: "EPS", label: "Éducation physique et sportive", dossier: "EPS", re: /^eps$|education physique/ },
  { code: "ECM", label: "Éducation civique et morale", dossier: "EDUCATION_CIVIQUE_ET_MORALE", re: /^ecm$|civique/ },
  { code: "INFO", label: "Informatique", dossier: "INFORMATIQUE", re: /^info/ },
  { code: "ECO", label: "Économie", dossier: "ECONOMIE", re: /^eco(nomie)?$/ },
] as const;

function plain(s: string): string {
  return s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/_/g, " ").trim();
}

/**
 * Codes matière d'un intitulé libre. « Histoire-Géographie » → {HIST, GEO} ; « Sciences physiques » → {PHYS}.
 * Un intitulé inconnu donne sa forme normalisée, pour une comparaison simple.
 */
export function subjectCodes(name: string): Set<string> {
  const out = new Set<string>();
  const parts = plain(name).split(/\s*[-\/,&]\s*|\s+et\s+/).filter(Boolean);
  for (const part of [plain(name), ...parts]) for (const s of SUBJECTS) if (s.re.test(part)) out.add(s.code);
  if (!out.size) out.add(plain(name));
  return out;
}

/** Format recommandé des identifiants : BF-[CLASSE]-[MATIERE]-[NUMERO], ex. BF-6E-MATH-001. */
export const ID_FORMAT = /^BF-(6E|5E|4E|3E|2NDE|1ERE|TERM)-([A-Z]+)-(\d{3})$/;
