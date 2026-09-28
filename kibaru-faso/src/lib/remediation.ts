import type { TeacherContext } from "./conversation";
import { arithmeticErrors } from "./evaluation";
import { normalize } from "./search";

/**
 * Module 03 — Générateur de remédiation.
 * Paramètres d'une demande de remédiation, construction de la demande depuis le formulaire, et contrôles
 * automatiques après génération (démarche complète, causes présentées comme hypothèses, vocabulaire non
 * stigmatisant, critère de réussite, calculs des corrigés). Fonctions pures.
 */

export const PUBLICS = ["un élève", "un petit groupe", "toute la classe"] as const;

export type RemedParams = {
  /** Public concerné : un élève, un petit groupe, toute la classe. */
  public?: string;
  /** Nombre de séances disponibles. */
  seances?: number;
  /** La difficulté est-elle décrite dans la demande (notion, erreurs observées) ? */
  difficulteDecrite: boolean;
};

const NUMBERS: Record<string, number> = { une: 1, un: 1, deux: 2, trois: 3, quatre: 4 };

export function parseRemedParams(text: string): RemedParams {
  const n = normalize(text).replace(/’/g, "'");
  const out: RemedParams = { difficulteDecrite: false };
  if (/\b(un|une|mon|cet|cette) (seul )?(eleve|apprenant|apprenante)\b|\beleve en particulier\b/.test(n)) out.public = "un élève";
  else if (/\b(petit groupe|quelques eleves|certains eleves|groupe d'eleves|plusieurs eleves|\d+ eleves concernes)\b/.test(n)) out.public = "un petit groupe";
  else if (/\b(toute la classe|la classe entiere|l'ensemble de la classe|tous (mes|les) eleves|la plupart (de mes|des) eleves)\b/.test(n)) out.public = "toute la classe";
  const s = n.match(/\b(une|deux|trois|quatre|\d) seances?\b/);
  if (s) out.seances = NUMBERS[s[1]!] ?? parseInt(s[1]!, 10);
  // Difficulté décrite : notion + trouble (« confondent », « se trompent », « ne savent pas », « erreur »…),
  // ou ligne « Difficulté observée : … » du formulaire.
  out.difficulteDecrite =
    /^\s*(difficulte observee|erreurs? observees?|erreurs? typiques?)\s*:/im.test(normalize(text)) ||
    /\b(n'ont pas compris|ne comprennent pas|ne savent pas|n'arrivent pas|ne maitrisent pas|confond\w*|se tromp\w*|oubli\w*|erreurs?|melang\w*|invers\w*|ont du mal|bloqu\w*|difficultes? (a|en|pour|avec|sur|dans))\b/.test(n);
  return out;
}

// ---------------------------------------------------------------- Formulaire

export type RemedForm = {
  classe: string;
  discipline: string;
  notion: string;
  difficulte: string;
  exempleErreur: string;
  public: string;
  concernes: string;
  duree: string;
  materiel: string;
  differenciation: boolean;
  maison: boolean;
};

export function emptyRemed(ctx: TeacherContext): RemedForm {
  return {
    classe: ctx.classe ?? "",
    discipline: ctx.discipline ?? "",
    notion: ctx.sousTheme ?? ctx.theme ?? "",
    difficulte: "",
    exempleErreur: "",
    public: "toute la classe",
    concernes: "",
    duree: "1 séance de 55 minutes",
    materiel: ctx.materiel ?? "",
    differenciation: true,
    maison: true,
  };
}

export function remedMissing(f: RemedForm): string[] {
  return (
    [
      ["classe", f.classe],
      ["discipline", f.discipline],
      ["notion concernée", f.notion],
      ["difficulté observée", f.difficulte],
    ] as const
  )
    .filter(([, v]) => !v.trim())
    .map(([k]) => k);
}

export function buildRemedRequest(f: RemedForm): { message: string; context: Partial<TeacherContext> } {
  const opts = [f.differenciation && "avec une différenciation en trois niveaux", f.maison && "avec un travail de consolidation à la maison"].filter(Boolean);
  const head = `Prépare une remédiation pour ${f.public}${opts.length ? `, ${opts.join(", ")}` : ""}.`;
  const lines: [string, string][] = [
    ["Classe", f.classe],
    ["Matière", f.discipline],
    ["Notion concernée", f.notion],
    ["Difficulté observée", f.difficulte],
    ["Exemple d'erreur d'élève", f.exempleErreur],
    ["Public", f.public],
    ["Nombre d'élèves concernés", f.concernes],
    ["Durée disponible", f.duree],
    ["Matériel disponible", f.materiel],
  ];
  return {
    message: [head, ...lines.filter(([, v]) => v?.trim()).map(([k, v]) => `${k} : ${v.trim()}`)].join("\n"),
    context: { classe: f.classe || undefined, discipline: f.discipline || undefined, sousTheme: f.notion || undefined },
  };
}

// ---------------------------------------------------------------- Contrôles automatiques

const REMED_SECTIONS: [RegExp, string][] = [
  [/difficulte/, "Difficulté identifiée"],
  [/cause|hypothese/, "Causes possibles"],
  [/prerequis/, "Prérequis à vérifier"],
  [/diagnosti/, "Activité diagnostique"],
  [/remediation/, "Activités de remédiation"],
  [/exercice/, "Exercices progressifs"],
  [/corrig|correction/, "Corrigé"],
  [/nouvelle verification|verification|post[- ]?test|nouvelle evaluation/, "Nouvelle vérification"],
  [/consolidation/, "Consolidation"],
];

/** Mots qui étiquettent les élèves de façon dévalorisante (Module 01 § 17 ; moteur § 16). */
const STIGMA = /\b(eleves? faibles|mauvais eleves?|eleves? nuls?|cancres?|les lents|eleves? lents|les nuls|mediocres?|incapables?|les bons et les mauvais|groupe des faibles)\b/;

/** Découpe une réponse Markdown en sections (titre → contenu). */
function sections(markdown: string): { heading: string; body: string }[] {
  const out: { heading: string; body: string }[] = [];
  let cur: { heading: string; body: string } | null = null;
  for (const line of markdown.split(/\r?\n/)) {
    if (/^#{1,4}\s/.test(line)) {
      cur = { heading: normalize(line), body: "" };
      out.push(cur);
    } else if (cur) cur.body += `${line}\n`;
  }
  return out;
}

export function remediationChecks(answer: string): string[] {
  const out: string[] = [];
  const secs = sections(answer);
  const headings = secs.map((s) => s.heading);
  const absent = REMED_SECTIONS.filter(([re]) => !headings.some((h) => re.test(h))).map(([, l]) => l);
  if (absent.length) out.push(`Étape(s) de la remédiation non repérée(s) : ${absent.join(", ")}.`);

  // Causes : toujours des hypothèses, jamais un diagnostic certain.
  const causes = secs.filter((s) => /cause|hypothese/.test(s.heading)).map((s) => normalize(s.body)).join(" ");
  if (causes && !/hypothese|possible|probable|peut(-| )?etre|pourrait|peuvent|il se peut|vraisemblabl|eventuel/.test(causes))
    out.push("Les causes de la difficulté semblent présentées comme certaines : elles doivent rester des hypothèses à vérifier.");

  if (STIGMA.test(normalize(answer))) out.push("Vocabulaire stigmatisant repéré (ex. « élèves faibles », « mauvais élèves ») : préférer « élèves qui ont besoin de plus de guidage ».");

  const verif = secs.filter((s) => /nouvelle verification|verification|post[- ]?test|nouvelle evaluation/.test(s.heading)).map((s) => normalize(s.body)).join(" ");
  if (verif && !/critere|reussi|seuil|\d+\s*\/\s*\d+|\d+\s*%|sur \d+/.test(verif)) out.push("Nouvelle vérification sans critère de réussite (ex. « au moins 4 réponses justes sur 5 »).");

  // Calculs : seulement dans les corrigés (les « erreurs fréquentes » citent volontairement des calculs faux).
  const corr = secs.filter((s) => /corrig|correction|solution/.test(s.heading)).map((s) => s.body).join("\n");
  const errs = arithmeticErrors(corr);
  if (errs.length) out.push(`Calcul(s) à vérifier dans le corrigé : ${errs.join(" ; ")}.`);
  return out;
}
