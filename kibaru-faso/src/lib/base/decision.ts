import type { TeacherContext } from "../conversation";
import { classify, type Category } from "../documents";
import type { ArchivedDoc, DocInfo, Excerpt, RefDocument } from "../search";
import { canonicalClasse, normalize } from "../search";
import type { PendingDoc } from "./load";
import { CLASS_INFO, STATUT_LABELS, typeLabel } from "./structure";

/**
 * Moteur de décision documentaire (registre maître, section 7).
 * Avant chaque réponse : 1. identifier la demande ; 2. recenser les ressources correspondantes ;
 * 3. filtrer ; 4. comparer les versions ; 5. rechercher un remplacement ; 6. évaluer la confiance ;
 * 7. transmettre au modèle la consigne de réponse qui en découle. Fonctions pures.
 */

export type RequestProfile = {
  pays: string;
  niveau?: string;
  classe?: string;
  matiere?: string;
  theme?: string;
  typeDemande: Category;
  /** D'où viennent la classe et la matière retenues. */
  origineClasse?: "message" | "contexte";
  origineMatiere?: "message" | "contexte";
};

const CLASS_WORDS: [RegExp, string][] = [
  [/^(6e|6eme|sixieme)$/, "6e"],
  [/^(5e|5eme|cinquieme)$/, "5e"],
  [/^(4e|4eme|quatrieme)$/, "4e"],
  [/^(3e|3eme|troisieme)$/, "3e"],
  [/^(2nde|2de|seconde)$/, "2nde"],
  [/^(1ere|1re|premiere)$/, "1ère"],
  [/^(tle|terminale)$/, "Terminale"],
];

/** Classe citée dans la demande (« en 6e », « de 4ème », « classe de Terminale »…), sans confondre « 3e trimestre ». */
export function classeInMessage(message: string): string | undefined {
  const n = normalize(message);
  const m = n.match(/\b(?:en|de|des|classe(?:s)? de|niveau|eleves de)\s+(6e|6eme|sixieme|5e|5eme|cinquieme|4e|4eme|quatrieme|3e|3eme|troisieme|2nde|2de|seconde|1ere|1re|premiere|tle|terminale)\b(?!\s*(trimestre|partie|exercice|question|etape|semaine|heure|seance))/);
  if (!m) return undefined;
  return CLASS_WORDS.find(([re]) => re.test(m[1]!))?.[1];
}

const SUBJECT_WORDS: [RegExp, string][] = [
  [/\bhistoire[- ]geo(graphie)?\b/, "Histoire-Géographie"],
  [/\bmath(ematiques?|s)?\b/, "Mathématiques"],
  [/\bfrancais\b/, "Français"],
  [/\bsvt\b|\bsciences de la vie\b/, "SVT"],
  [/\bphysique[- ]chimie\b|\bsciences physiques\b|\bpc\b/, "Physique-Chimie"],
  [/\b(en|d'|de l')\s?histoire\b/, "Histoire"],
  [/\b(en|de|la)\s+geographie\b/, "Géographie"],
  [/\banglais\b/, "Anglais"],
  [/\ballemand\b/, "Allemand"],
  [/\bespagnol\b/, "Espagnol"],
  [/\bphilosophie\b/, "Philosophie"],
  [/\beps\b|\beducation physique\b/, "EPS"],
];

export function matiereInMessage(message: string): string | undefined {
  const n = normalize(message);
  return SUBJECT_WORDS.find(([re]) => re.test(n))?.[1];
}

/** Étape 1 : pays, niveau, classe, matière, thème et type de demande. La demande écrite l'emporte sur le contexte. */
export function identifyRequest(message: string, ctx: TeacherContext): RequestProfile {
  const cm = classeInMessage(message);
  const mm = matiereInMessage(message);
  const classe = cm ?? (ctx.classe?.trim() ? canonicalClasse(ctx.classe) : undefined);
  const info = CLASS_INFO.find((c) => c.classe === classe);
  return {
    pays: "Burkina Faso",
    niveau: info?.niveau,
    classe,
    matiere: mm ?? (ctx.discipline?.trim() || undefined),
    theme: ctx.theme?.trim() || undefined,
    typeDemande: classify(message),
    origineClasse: cm ? "message" : classe ? "contexte" : undefined,
    origineMatiere: mm ? "message" : ctx.discipline?.trim() ? "contexte" : undefined,
  };
}

const REQUEST_TYPES: Record<Category, string> = {
  cours: "préparation de cours",
  devoir: "devoir",
  corrige: "corrigé",
  evaluation: "évaluation",
  progression: "progression",
  remediation: "remédiation",
  activite: "activité pédagogique",
  autre: "autre demande",
};

export type Confidence = "ELEVEE" | "MOYENNE" | "FAIBLE" | "AUCUNE";
export const CONFIDENCE_LABELS: Record<Confidence, string> = { ELEVEE: "ÉLEVÉE", MOYENNE: "MOYENNE", FAIBLE: "FAIBLE", AUCUNE: "AUCUNE" };

export type Decision = {
  profile: RequestProfile;
  confidence: Confidence;
  explanation: string;
  /** Ressources de la base (hors documents de l'enseignant) consultables dans le périmètre. */
  consultable: DocInfo[];
  /** Ressources dont des extraits ont été retrouvés pour cette demande. */
  used: DocInfo[];
  pending: PendingDoc[];
  history: ArchivedDoc[];
  /** Plusieurs ressources consultables du même type pour le même périmètre : versions à comparer. */
  versionGroups: DocInfo[][];
};

/** Étapes 2 à 6. `catalogue`, `history` et `pending` sont déjà filtrés sur le périmètre (classe, matière). */
export function decide(profile: RequestProfile, catalogue: RefDocument[], excerpts: Excerpt[], history: ArchivedDoc[], pending: PendingDoc[]): Decision {
  const consultable = catalogue.filter((d) => d.origin === "bibliotheque");
  const usedIds = new Set(excerpts.map((e) => e.doc.id));
  const used = consultable.filter((d) => usedIds.has(d.id));
  const teacherUsed = excerpts.some((e) => e.doc.origin === "enseignant");

  const byType = new Map<string, DocInfo[]>();
  for (const d of consultable) byType.set(d.type, [...(byType.get(d.type) ?? []), d]);
  const versionGroups = [...byType.values()].filter((g) => g.length > 1);

  let confidence: Confidence;
  let explanation: string;
  const official = used.filter((d) => d.statut === "ACTIF" && (d.sourceLevel ?? 5) <= 2);
  const active = used.filter((d) => d.statut === "ACTIF");
  const provisional = used.filter((d) => d.statut === "PROVISOIRE");
  if (official.length) {
    confidence = "ELEVEE";
    explanation = `ressource(s) ACTIVE(S) officielle(s) retrouvée(s) : ${official.map((d) => d.documentId ?? d.title).join(", ")}`;
  } else if (active.length || provisional.length) {
    confidence = "MOYENNE";
    explanation = `ressource(s) ${active.length ? "ACTIVE(S) non officielle(s) ou de niveau non précisé" : "PROVISOIRE(S)"} : ${[...active, ...provisional].map((d) => d.documentId ?? d.title).join(", ")}`;
  } else if (used.length || teacherUsed) {
    confidence = "FAIBLE";
    explanation = used.length
      ? `seules des ressources À VÉRIFIER répondent (${used.map((d) => d.documentId ?? d.title).join(", ")}) : aucune source ACTIVE ne confirme leur actualité`
      : "seuls des documents personnels de l'enseignant répondent : aucune ressource validée de la base";
  } else {
    confidence = "AUCUNE";
    explanation = consultable.length
      ? "aucun extrait pertinent dans les ressources consultables du périmètre"
      : "aucune ressource intégrée et consultable pour ce périmètre";
  }
  if (pending.length) explanation += ` ; ${pending.length} ressource(s) du registre NON ENCORE INTÉGRÉE(S) pour ce périmètre`;
  return { profile, confidence, explanation, consultable, used, pending, history, versionGroups };
}

const INSTRUCTIONS: Record<Confidence, string> = {
  ELEVEE: "Appuie-toi en priorité sur les ressources ACTIVES citées (SOURCE KIBARU). Signale tout de même les points que les extraits ne couvrent pas.",
  MOYENNE: "Les ressources disponibles ne sont pas des références officielles ACTIVES de niveau 1 ou 2 : cite-les en précisant leur statut et leur portée ; aucune affirmation sur le programme en vigueur ne doit être présentée comme confirmée.",
  FAIBLE: "Aucune ressource ACTIVE ne confirme l'information : tout élément de programme ou d'orientation officielle reste À VÉRIFIER. Une ressource officielle ancienne ou à vérifier peut être citée comme source officielle historique, jamais comme le programme actuellement en vigueur.",
  AUCUNE: "La base ne fournit aucune ressource utilisable : pour toute information de programme, d'objectif ou d'orientation officielle, emploie la formulation de non-confirmation, puis seulement ensuite une proposition clairement identifiée.",
};

const id = (d: { documentId?: string; title: string }) => d.documentId ?? d.title;

/** Bloc <decision_documentaire> transmis au modèle avec la demande. */
export function formatDecisionBlock(d: Decision): string {
  const p = d.profile;
  const src = (o?: string) => (o ? ` (${o === "message" ? "d'après la demande" : "d'après le contexte de la classe"})` : "");
  const lines = [
    "<decision_documentaire>",
    `Étape 1 — Identification : pays = ${p.pays} ; niveau = ${p.niveau ?? "non précisé"} ; classe = ${p.classe ?? "non précisée"}${src(p.origineClasse)} ; matière = ${p.matiere ?? "non précisée"}${src(p.origineMatiere)} ; thème = ${p.theme ?? "non précisé"} ; type de demande = ${REQUEST_TYPES[p.typeDemande]}.`,
    `Étape 2 — Ressources de la base pour ce périmètre : ${d.consultable.length} consultable(s)${d.consultable.length ? ` [${d.consultable.map((x) => `${id(x)} ${STATUT_LABELS[x.statut ?? "A_VERIFIER"]}`).join(" ; ")}]` : ""} ; ${d.pending.length} NON ENCORE INTÉGRÉE(S)${d.pending.length ? ` [${d.pending.map((x) => `${id(x)} — ${x.title}`).join(" ; ")}]` : ""} ; ${d.history.length} dans l'historique.`,
    `Étape 3 — Filtrage : ressources ACTIVES pertinentes = ${d.used.filter((x) => x.statut === "ACTIF").map(id).join(", ") || "aucune"} ; autres ressources retrouvées = ${d.used.filter((x) => x.statut !== "ACTIF").map((x) => `${id(x)} (${STATUT_LABELS[x.statut ?? "A_VERIFIER"]})`).join(", ") || "aucune"}.`,
    `Étape 4 — Versions : ${d.versionGroups.length ? d.versionGroups.map((g) => `${typeLabel(g[0]!.type)} : ${g.map((x) => `${id(x)}${x.version ? ` v${x.version}` : ""}${x.year ? ` (${x.year})` : ""} ${STATUT_LABELS[x.statut ?? "A_VERIFIER"]}`).join(" / ")}`).join(" ; ") + " — plusieurs ressources du même type : compare leurs dates, versions, statuts et producteurs ; ne tranche pas arbitrairement." : "aucune version concurrente dans le périmètre."}`,
    `Étape 5 — Remplacements : ${[...d.history.map((h) => `${id(h.doc)} : ${h.reason}`), ...d.consultable.filter((x) => x.note).map((x) => `${id(x)} : ${x.note}`)].join(" ; ") || "aucun remplacement déclaré dans le périmètre."}`,
    `Étape 6 — Confiance documentaire : ${CONFIDENCE_LABELS[d.confidence]} (${d.explanation}).`,
    `Étape 7 — Consigne : ${INSTRUCTIONS[d.confidence]}`,
    "</decision_documentaire>",
  ];
  return lines.join("\n");
}

/** Résumé affiché à l'enseignant au-dessus de la réponse. */
export function decisionSummary(d: Decision) {
  return {
    confidence: d.confidence,
    label: CONFIDENCE_LABELS[d.confidence],
    explanation: d.explanation,
    classe: d.profile.classe ?? null,
    matiere: d.profile.matiere ?? null,
    actives: d.consultable.filter((x) => x.statut === "ACTIF").length,
    consultables: d.consultable.length,
    pending: d.pending.map((x) => x.documentId ?? x.title),
  };
}
export type DecisionSummary = ReturnType<typeof decisionSummary>;
