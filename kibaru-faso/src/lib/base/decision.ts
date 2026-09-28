import type { TeacherContext } from "../conversation";
import { classify, type Category } from "../documents";
import { identifyNeeds, isSpecialized, NEEDS, subjectFromTheme, type Need } from "./needs";
import type { ArchivedDoc, DocInfo, Excerpt, RefDocument } from "../search";
import { canonicalClasse, normalize } from "../search";
import type { PendingDoc } from "./load";
import { CLASS_INFO, STATUT_LABELS, subjectCodes, SUBJECTS, typeLabel } from "./structure";

/**
 * Moteur de décision pédagogique de MON PROF.IA (V1), qui intègre le moteur de décision documentaire.
 *
 * Chaîne de traitement : demande → identification du besoin → identification du contexte → recherche dans la
 * base → sélection des sources (score A à G) → vérification du statut → niveau de confiance → [modèle :
 * raisonnement pédagogique → génération] → contrôle final (automatique, voir final-check.ts) → réponse.
 *
 * L'application effectue ici tout ce qui peut l'être de façon déterministe, avant d'appeler le modèle.
 * Fonctions pures.
 */

export type RequestProfile = {
  pays: string;
  niveau?: string;
  classe?: string;
  matiere?: string;
  theme?: string;
  duree?: string;
  typeDemande: Category;
  /** Besoins identifiés (section 3), éventuellement combinés. */
  needs: Need[];
  /** D'où viennent la classe et la matière retenues. */
  origineClasse?: "message" | "contexte";
  origineMatiere?: "message" | "contexte" | "theme";
  /** Contexte minimal manquant, indispensable pour une réponse spécialisée : on le demande. */
  missing: ("classe" | "matiere")[];
  /** Contexte pédagogique absent : le modèle fait une hypothèse raisonnable et l'annonce. */
  assumptions: string[];
  /** Question unique à poser à l'enseignant quand le contexte minimal manque. */
  question?: string;
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
  const m = n.match(/(?:\b(?:en|de|des|classe(?:s)? de|niveau|eleves de)\s+|\bclasse\s*:\s*|^\s*)(6e|6eme|sixieme|5e|5eme|cinquieme|4e|4eme|quatrieme|3e|3eme|troisieme|2nde|2de|seconde|1ere|1re|premiere|tle|terminale)\b(?!\s*(trimestre|partie|exercice|question|etape|semaine|heure|seance))/);
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

const DURATION = /\b\d+\s?(min|minutes|h|heures?)\b|\b(une|deux|trois) heures?\b/;

/** Identification du besoin et du contexte. La demande écrite l'emporte sur le contexte de la classe. */
export function identifyRequest(message: string, ctx: TeacherContext, needsFrom: string = message): RequestProfile {
  const cm = classeInMessage(message);
  const mm = matiereInMessage(message);
  const classe = cm ?? (ctx.classe?.trim() ? canonicalClasse(ctx.classe) : undefined);
  const info = CLASS_INFO.find((c) => c.classe === classe);
  const needs = identifyNeeds(needsFrom);
  const fromTheme = !mm && !ctx.discipline?.trim() ? subjectFromTheme(message, ctx.theme) : undefined;
  const matiere = mm ?? (ctx.discipline?.trim() || undefined) ?? fromTheme;
  const duree = ctx.duree?.trim() || normalize(message).match(DURATION)?.[0];

  const missing: RequestProfile["missing"] = [];
  const assumptions: string[] = [];
  if (isSpecialized(needs)) {
    if (!classe) missing.push("classe");
    if (!matiere) missing.push("matiere");
    const timed = needs.some((n) => ["preparation_cours", "fiche_pedagogique", "seance", "devoir", "interrogation", "evaluation", "revision"].includes(n));
    if (timed && !duree) assumptions.push("durée non précisée : retiens une durée usuelle et indique-la");
    if (needs.includes("preparation_cours") && !/revision|nouvelle notion|introduction|decouverte/.test(normalize(message)))
      assumptions.push("type de séance non précisé (nouvelle notion ou révision) : considère qu'il s'agit d'une nouvelle notion et indique-le");
    if (fromTheme) assumptions.push(`matière déduite du thème (${fromTheme}) : à confirmer par l'enseignant`);
  }
  const besoin = NEEDS[needs[0]!];
  let question: string | undefined;
  if (missing.includes("classe") && missing.includes("matiere"))
    question = `Pour quelle classe (6e, 5e, 4e, 3e, 2nde, 1ère ou Terminale) et quelle matière souhaitez-vous cette ${besoin} ?`;
  else if (missing.includes("classe")) question = `Pour quelle classe souhaitez-vous cette ${besoin} : 6e, 5e, 4e, 3e, 2nde, 1ère ou Terminale ?`;
  else if (missing.includes("matiere")) question = `Pour quelle matière souhaitez-vous cette ${besoin} ?`;

  return {
    pays: "Burkina Faso",
    niveau: info?.niveau,
    classe,
    matiere,
    theme: ctx.theme?.trim() || undefined,
    duree,
    typeDemande: classify(needsFrom),
    needs,
    origineClasse: cm ? "message" : classe ? "contexte" : undefined,
    origineMatiere: mm ? "message" : ctx.discipline?.trim() ? "contexte" : fromTheme ? "theme" : undefined,
    missing,
    assumptions,
    question,
  };
}

/**
 * Identification sur la conversation : une réponse courte (« Classe : 6e. ») complète la demande précédente.
 * Les messages les plus récents l'emportent ; le besoin vient du dernier message s'il en exprime un.
 */
export function identifyConversation(userMessages: string[], ctx: TeacherContext): RequestProfile {
  const recent = userMessages.slice(-4).reverse();
  const last = recent[0] ?? "";
  const combined = recent.join("\n");
  const own = identifyNeeds(last);
  const needsFrom = own.length === 1 && own[0] === "autre" ? combined : last;
  return identifyRequest(combined, ctx, needsFrom);
}

/** Préfixe d'ID ciblé par la recherche (section 6), ex. « BF-6E-MATH ». */
export function targetPrefix(p: Pick<RequestProfile, "classe" | "matiere">): string | undefined {
  const cls = CLASS_INFO.find((c) => c.classe === p.classe);
  const codes = p.matiere ? [...subjectCodes(p.matiere)] : [];
  const subj = SUBJECTS.find((s) => codes.includes(s.code));
  if (!cls) return undefined;
  return subj ? `BF-${cls.code}-${subj.code}` : `BF-${cls.code}`;
}

// ---- Sélection des sources : score de pertinence documentaire (section 7) et priorité (section 8) ----

export const TIERS = [
  "source officielle active et spécifique",
  "source officielle active mais plus générale",
  "source officielle à vérifier",
  "source institutionnelle complémentaire",
  "source pédagogique fiable",
  "connaissance générale",
] as const;

export type SourceCard = {
  doc: DocInfo;
  /** Rang dans l'ordre de priorité de la section 8 (0 = le plus prioritaire). */
  tier: number;
  retrieved: boolean;
  autorite: string;
  pertinence: string;
  actualite: string;
  statut: string;
  version: string;
  perimetre: string;
  coherence: string;
};

const LEVEL_LABELS: Record<number, string> = {
  1: "niveau 1 — source officielle",
  2: "niveau 2 — document curriculaire officiel",
  3: "niveau 3 — ressource institutionnelle complémentaire",
  4: "niveau 4 — ressource pédagogique fiable, non officielle",
  5: "niveau 5 — connaissance générale",
};

function isSpecific(d: DocInfo, p: RequestProfile): boolean {
  return d.classes.length > 0 && d.disciplines.length > 0 && !!p.classe && !!p.matiere;
}

export function scoreSource(d: DocInfo, p: RequestProfile, retrieved: boolean, rivals: DocInfo[]): SourceCard {
  const level = d.sourceLevel;
  const official = !!level && level <= 2;
  const specific = isSpecific(d, p);
  let tier: number;
  if (d.origin === "enseignant") tier = 4;
  else if (official && d.statut === "ACTIF") tier = specific ? 0 : 1;
  else if (official) tier = 2;
  else if (level === 3) tier = 3;
  else tier = 4;
  return {
    doc: d,
    tier,
    retrieved,
    autorite: d.origin === "enseignant" ? "document personnel de l'enseignant (non validé)" : level ? LEVEL_LABELS[level]! : "niveau de source non renseigné",
    pertinence: specific ? `spécifique (${d.classes.join("-")}, ${d.disciplines.join(", ")})` : `générale (${d.classes.join("-") || "toutes classes"}, ${d.disciplines.join(", ") || "toutes matières"})`,
    actualite:
      d.statut === "ACTIF"
        ? d.verifiedAt
          ? `confirmée (vérifiée le ${d.verifiedAt})`
          : "confirmée par le statut ACTIF (date de vérification non renseignée)"
        : `non confirmée${d.year ? ` (document de ${d.year})` : " (année non renseignée)"}`,
    statut: d.statut ? STATUT_LABELS[d.statut] : "sans statut (bibliothèque personnelle)",
    version: d.note ? d.note : `${d.version ? `version ${d.version}` : "version non renseignée"} ; aucune version plus récente déclarée`,
    perimetre: d.perimeter ?? "non précisé",
    coherence: rivals.length ? `à comparer avec ${rivals.map((r) => r.documentId ?? r.title).join(", ")} (même type, même périmètre)` : "aucune ressource concurrente dans le périmètre",
  };
}

export type Confidence = "ELEVEE" | "MOYENNE" | "FAIBLE" | "NON_CONFIRMEE";
export const CONFIDENCE_LABELS: Record<Confidence, string> = { ELEVEE: "ÉLEVÉE", MOYENNE: "MOYENNE", FAIBLE: "FAIBLE", NON_CONFIRMEE: "NON CONFIRMÉE" };

export type Decision = {
  profile: RequestProfile;
  confidence: Confidence;
  explanation: string;
  /** Ressources de la base (hors documents de l'enseignant) consultables dans le périmètre. */
  consultable: DocInfo[];
  /** Ressources dont des extraits ont été retrouvés pour cette demande. */
  used: DocInfo[];
  /** Fiches de sélection, triées par priorité (section 8). */
  cards: SourceCard[];
  pending: PendingDoc[];
  history: ArchivedDoc[];
  /** Plusieurs ressources consultables du même type pour le même périmètre : versions à comparer. */
  versionGroups: DocInfo[][];
};

/** Recherche, sélection, vérification du statut et niveau de confiance. Entrées déjà filtrées sur le périmètre. */
export function decide(profile: RequestProfile, catalogue: RefDocument[], excerpts: Excerpt[], history: ArchivedDoc[], pending: PendingDoc[]): Decision {
  const consultable = catalogue.filter((d) => d.origin === "bibliotheque");
  const usedIds = new Set(excerpts.map((e) => e.doc.id));
  const used = consultable.filter((d) => usedIds.has(d.id));
  const teacherUsed = catalogue.filter((d) => d.origin === "enseignant" && usedIds.has(d.id));

  const byType = new Map<string, DocInfo[]>();
  for (const d of consultable) byType.set(d.type, [...(byType.get(d.type) ?? []), d]);
  const versionGroups = [...byType.values()].filter((g) => g.length > 1);

  const cards = [...consultable, ...teacherUsed]
    .map((d) => scoreSource(d, profile, usedIds.has(d.id), (byType.get(d.type) ?? []).filter((x) => x !== d)))
    .sort((a, b) => a.tier - b.tier || Number(b.retrieved) - Number(a.retrieved));

  // Niveau de confiance (section 9), à partir des sources dont un extrait répond à la demande.
  const retrieved = cards.filter((c) => c.retrieved && c.doc.origin === "bibliotheque");
  const ids = (list: SourceCard[]) => list.map((c) => c.doc.documentId ?? c.doc.title).join(", ");
  let confidence: Confidence;
  let explanation: string;
  const high = retrieved.filter((c) => c.tier <= 1);
  const medium = retrieved.filter((c) => c.tier === 2 || c.tier === 3);
  if (high.length) {
    confidence = "ELEVEE";
    explanation = `information confirmée par une source officielle active et pertinente : ${ids(high)}`;
  } else if (medium.length) {
    confidence = "MOYENNE";
    explanation = `source officielle ou institutionnelle pertinente, mais dont certains éléments nécessitent vérification : ${medium.map((c) => `${c.doc.documentId ?? c.doc.title} (${c.statut})`).join(", ")}`;
  } else if (retrieved.length || teacherUsed.length) {
    confidence = "FAIBLE";
    explanation = retrieved.length
      ? `seules des ressources complémentaires répondent : ${ids(retrieved)}`
      : "seuls des documents personnels de l'enseignant répondent : aucune ressource de la base";
  } else {
    confidence = "NON_CONFIRMEE";
    explanation = consultable.length ? "aucun extrait pertinent dans les ressources consultables du périmètre" : "aucune ressource intégrée et consultable pour ce périmètre";
  }
  if (pending.length) explanation += ` ; ${pending.length} ressource(s) du registre NON ENCORE INTÉGRÉE(S) pour ce périmètre`;
  return { profile, confidence, explanation, consultable, used, cards, pending, history, versionGroups };
}

const INSTRUCTIONS: Record<Confidence, string> = {
  ELEVEE: "Tu peux présenter comme documentées les informations tirées des sources officielles actives citées (SOURCE MON PROF.IA, avec leur renvoi [Rn]). Signale les points que les extraits ne couvrent pas.",
  MOYENNE: "Signale la réserve appropriée : la source est officielle ou institutionnelle, mais son actualité ou certains éléments ne sont pas confirmés. Cite-la (« Selon le guide disponible dans la base MON PROF.IA… »), précise son statut, et classe en À VÉRIFIER toute affirmation sur le programme actuellement applicable.",
  FAIBLE: "Les informations proviennent principalement de ressources complémentaires ou de connaissances générales : évite de présenter quoi que ce soit comme une exigence officielle.",
  NON_CONFIRMEE: "La base ne permet pas de présenter d'information comme officielle : pour tout élément de programme, de compétence, d'objectif ou d'orientation officielle, écris « Cette information n'est pas confirmée dans la base documentaire MON PROF.IA disponible. », puis propose une solution pédagogique générale clairement identifiée comme PROPOSITION MON PROF.IA.",
};

const id = (d: { documentId?: string; title: string }) => d.documentId ?? d.title;

/** Bloc <decision_pedagogique> transmis au modèle avec la demande. */
export function formatDecisionBlock(d: Decision): string {
  const p = d.profile;
  const src = (o?: string) => (o ? ` (${o === "message" ? "d'après la demande" : o === "theme" ? "déduite du thème, à confirmer" : "d'après le contexte de la classe"})` : "");
  const target = targetPrefix(p);
  const lines = [
    "<decision_pedagogique>",
    `1. Besoin identifié : ${p.needs.map((n) => NEEDS[n]).join(" + ")}.`,
    `2. Contexte minimal : pays = ${p.pays} ; niveau = ${p.niveau ?? "non précisé"} ; classe = ${p.classe ?? "NON PRÉCISÉE"}${src(p.origineClasse)} ; matière = ${p.matiere ?? "NON PRÉCISÉE"}${src(p.origineMatiere)}. Contexte pédagogique : thème = ${p.theme ?? "non précisé"} ; durée = ${p.duree ?? "non précisée"}.${p.assumptions.length ? ` Hypothèses à annoncer : ${p.assumptions.join(" ; ")}.` : ""}`,
    `3. Recherche dans la base : cible ${target ?? "non déterminable (classe inconnue)"} ; ordre de priorité : programme/curriculum, guide pédagogique, référentiel, progression, ressources institutionnelles, ressources pédagogiques, connaissances générales. Résultat : ${d.consultable.length} ressource(s) consultable(s), ${d.pending.length} NON ENCORE INTÉGRÉE(S)${d.pending.length ? ` [${d.pending.map((x) => `${id(x)} — ${x.title}`).join(" ; ")}]` : ""}, ${d.history.length} dans l'historique.`,
    `4. Sélection des sources (autorité, pertinence, actualité, statut, version, périmètre, cohérence) :${
      d.cards.length
        ? "\n" + d.cards.map((c) => `   - ${id(c.doc)}${c.retrieved ? " [extrait retrouvé]" : " [aucun extrait pour cette demande]"} — priorité : ${TIERS[c.tier]} ; autorité : ${c.autorite} ; pertinence : ${c.pertinence} ; actualité : ${c.actualite} ; statut : ${c.statut} ; version : ${c.version} ; périmètre : ${c.perimetre} ; cohérence : ${c.coherence}.`).join("\n")
        : " aucune source documentaire ; seules les connaissances générales sont disponibles (jamais présentées comme officielles)."
    }`,
    `5. Vérification du statut et des remplacements : ${[...d.history.map((h) => `${id(h.doc)} : ${h.reason}`), ...d.consultable.filter((x) => x.note).map((x) => `${id(x)} : ${x.note}`)].join(" ; ") || "aucun remplacement déclaré dans le périmètre"}.${d.versionGroups.length ? ` Versions concurrentes : ${d.versionGroups.map((g) => `${typeLabel(g[0]!.type)} — ${g.map((x) => `${id(x)}${x.version ? ` v${x.version}` : ""}${x.year ? ` (${x.year})` : ""} ${STATUT_LABELS[x.statut ?? "A_VERIFIER"]}`).join(" / ")}`).join(" ; ")} : compare dates, versions, statuts et producteurs ; ne tranche pas arbitrairement.` : ""}`,
    `6. Niveau de confiance : ${CONFIDENCE_LABELS[d.confidence]} (${d.explanation}).`,
    `7. Consigne : ${
      p.question
        ? `le contexte minimal manque (${p.missing.join(" et ")}). Ne produis pas encore la préparation : pose uniquement cette question, en une phrase : « ${p.question} » Tu peux ajouter une phrase indiquant ce que tu feras ensuite.`
        : INSTRUCTIONS[d.confidence]
    }`,
    "Il te reste : raisonnement pédagogique, génération, puis contrôle final avant d'envoyer.",
    "</decision_pedagogique>",
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
    matiereDeduite: d.profile.origineMatiere === "theme",
    besoins: d.profile.needs.map((n) => NEEDS[n]),
    missing: d.profile.missing,
    actives: d.consultable.filter((x) => x.statut === "ACTIF").length,
    consultables: d.consultable.length,
    sources: d.cards.filter((c) => c.retrieved).map((c) => ({ id: id(c.doc), priorite: TIERS[c.tier], statut: c.statut })),
    pending: d.pending.map((x) => x.documentId ?? x.title),
  };
}
export type DecisionSummary = ReturnType<typeof decisionSummary>;
