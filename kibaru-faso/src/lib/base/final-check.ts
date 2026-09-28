import { normalize } from "../search";
import type { Need } from "./needs";
import type { Confidence } from "./decision";

/**
 * Contrôle final automatique (moteur de décision pédagogique, section 17).
 * Le modèle effectue son propre contrôle avant de répondre ; cette vérification déterministe, faite après
 * la génération, signale à l'enseignant ce qui mérite une relecture. Elle ne modifie jamais la réponse.
 */

export type CheckInput = {
  answer: string;
  /** Étiquettes d'extraits réellement transmises au modèle (R1, R2…). */
  labels: string[];
  /** ID connus du registre et de la base. */
  knownIds: string[];
  confidence: Confidence;
  needs: Need[];
  /** Une question de contexte était attendue (classe ou matière manquante). */
  questionExpected: boolean;
  /** Module 01 : fiche pédagogique, avec son mode et sa durée annoncée. */
  fiche?: boolean;
  mode?: "standard" | "expert" | "rapide";
  dureeAnnoncee?: string;
};

/** « 55 minutes », « 1 h 30 », « 1h30 », « 2 heures », « 90 mn », « 15' » → minutes. */
export function parseMinutes(text: string | undefined): number | undefined {
  if (!text) return undefined;
  const t = normalize(text).replace(/\s+/g, " ");
  let m = t.match(/(\d+(?:[.,]\d+)?)\s?h(?:eures?)?\s?(\d{1,2})?\s?(?:min|mn|minutes)?/);
  if (m) return Math.round(parseFloat(m[1]!.replace(",", ".")) * 60 + (m[2] ? parseInt(m[2], 10) : 0));
  m = t.match(/(\d+)\s?(?:min|mn|minutes?|')/);
  if (m) return parseInt(m[1]!, 10);
  const words: Record<string, number> = { une: 60, deux: 120, trois: 180 };
  m = t.match(/\b(une|deux|trois) heures?\b/);
  if (m) return words[m[1]!];
  return undefined;
}

/** Durées du tableau de déroulement (colonne « Durée ») et total annoncé sous le tableau. */
export function scheduleDurations(markdown: string): { steps: number[]; total?: number } | undefined {
  const lines = markdown.split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    const header = lines[i]!;
    if (!/^\s*\|/.test(header)) continue;
    const cols = header.split("|").map((c) => normalize(c).trim());
    const d = cols.findIndex((c) => c === "duree" || c.startsWith("duree"));
    const e = cols.findIndex((c) => c.startsWith("etape") || c.startsWith("phase"));
    if (d < 0 || e < 0 || !/^\s*\|?\s*:?-{2,}/.test(lines[i + 1] ?? "")) continue;
    const steps: number[] = [];
    let j = i + 2;
    for (; j < lines.length && /^\s*\|/.test(lines[j]!); j++) {
      const cells = lines[j]!.split("|");
      const label = normalize(cells[e] ?? "");
      if (/^\**\s*total/.test(label)) continue;
      const min = parseMinutes(cells[d]);
      if (min !== undefined) steps.push(min);
    }
    const after = lines.slice(j, j + 4).join(" ");
    const tm = normalize(after).match(/total\s*:?\s*\**\s*([^|\n]*)/);
    const inTable = lines.slice(i + 2, j).find((l) => /^\s*\|\s*\**\s*total/i.test(normalize(l)));
    const total = parseMinutes(tm?.[1]) ?? (inTable ? parseMinutes(inTable.split("|")[d]) : undefined);
    if (steps.length) return { steps, total };
  }
  return undefined;
}

const FICHE_SECTIONS: [RegExp, string][] = [
  [/competence/, "Compétence"],
  [/objectif/, "Objectifs"],
  [/deroulement/, "Déroulement"],
  [/trace ecrite|synthese/, "Trace écrite"],
  [/evaluation/, "Évaluation"],
  [/remediation/, "Remédiation"],
  [/sources? et statut|references? documentaires?/, "Sources et statut"],
];
const RAPIDE_SECTIONS: [RegExp, string][] = [
  [/objectif/, "Objectif"],
  [/deroulement/, "Déroulement"],
  [/evaluation/, "Évaluation"],
  [/devoir/, "Devoir"],
];

function ficheChecks(c: CheckInput, n: string): string[] {
  const out: string[] = [];
  const headings = c.answer.split(/\r?\n/).filter((l) => /^#{1,4}\s/.test(l)).map((l) => normalize(l));
  const expected = c.mode === "rapide" ? RAPIDE_SECTIONS : FICHE_SECTIONS;
  const absent = expected.filter(([re]) => !headings.some((h) => re.test(h))).map(([, label]) => label);
  if (absent.length) out.push(`Rubrique(s) de la fiche non repérée(s) : ${absent.join(", ")}.`);

  // Contrôle du temps : somme des durées = durée totale annoncée.
  const sched = scheduleDurations(c.answer);
  const announced = parseMinutes(c.dureeAnnoncee) ?? parseMinutes(n.match(/duree\s*(?:totale)?\s*:\s*\**\s*([^\n|]*)/)?.[1]);
  if (!sched) out.push("Tableau de déroulement (colonnes Étape et Durée) non repéré : durées non vérifiables.");
  else {
    const sum = sched.steps.reduce((a, b) => a + b, 0);
    if (announced !== undefined && sum !== announced) out.push(`Durées du déroulement : leur somme fait ${sum} min, pour une durée annoncée de ${announced} min.`);
    if (sched.total !== undefined && sched.total !== sum) out.push(`Total indiqué (${sched.total} min) différent de la somme des étapes (${sum} min).`);
  }

  if (c.confidence !== "ELEVEE") {
    const sec = c.answer.split(/^#{1,4}\s.*comp[eé]tence.*$/im)[1]?.split(/^#{1,4}\s/m)[0] ?? "";
    const nsec = normalize(sec);
    if (sec && !/non confirmee|a verifier/.test(nsec) && !/\[R\d+\]/.test(sec))
      out.push("Compétence présentée sans renvoi documentaire ni mention « non confirmée » : à vérifier.");
  }
  return out;
}

const OFFICIAL_CLAIM =
  /(programme|curriculum|referentiel)s? (actuel|officiel actuel|en vigueur|actuellement (en vigueur|applicable))|conformement (au|aux) (programme|instructions? officielles?)|le ministere (exige|impose|prescrit|recommande)|selon les (instructions|directives) officielles/;
const HEDGE = /pas (encore |actuellement )?confirm|a verifier|ne (correspond|constitue) pas necessairement|n'est pas necessairement|non confirm|sous reserve|reste(nt)? a verifier/;

export function finalCheck(c: CheckInput): string[] {
  const out: string[] = [];
  const text = c.answer;
  const n = normalize(text);

  const cited = [...new Set([...text.matchAll(/\[(R\d{1,2})\]/g)].map((m) => m[1]!))];
  const unknownLabels = cited.filter((l) => !c.labels.includes(l));
  if (unknownLabels.length) out.push(`Renvoi(s) ${unknownLabels.map((l) => `[${l}]`).join(", ")} sans extrait correspondant : la source citée n'a pas été consultée.`);

  const known = new Set(c.knownIds.map((x) => x.toUpperCase()));
  const ids = [...new Set([...text.matchAll(/\bBF-[A-Z0-9]+-[A-Z]+-\d{3}\b/g)].map((m) => m[0]))];
  const unknownIds = ids.filter((x) => !known.has(x.toUpperCase()));
  if (unknownIds.length) out.push(`Identifiant(s) absent(s) du registre maître : ${unknownIds.join(", ")}.`);

  if (c.confidence !== "ELEVEE") {
    const sentences = n.split(/(?<=[.!?:\n])\s+/);
    const risky = sentences.filter((s) => OFFICIAL_CLAIM.test(s) && !HEDGE.test(s));
    if (risky.length) out.push("Affirmation possible sur le programme ou les instructions officielles en vigueur, sans source ACTIVE qui la confirme : à relire.");
  }
  if (c.confidence === "NON_CONFIRMEE" && /\*\*source (pédagogue\.ia|pedagogue\.ia|mon prof\.ia|kibaru)\*\*/i.test(text)) out.push("Étiquette SOURCE PÉDAGOGUE.IA employée alors qu'aucune ressource de la base n'a été consultée.");

  const long = text.length > 700 && !c.questionExpected;
  if (long && !/\*\*(source (pedagogue\.ia|mon prof\.ia|kibaru)|proposition( pedagogique)? (pedagogue\.ia|mon prof\.ia|kibaru)|connaissance generale|a verifier)\*\*/i.test(normalize(text)))
    out.push("Aucune étiquette de transparence (SOURCE PÉDAGOGUE.IA, PROPOSITION PÉDAGOGUE.IA, CONNAISSANCE GÉNÉRALE, À VÉRIFIER).");

  const evaluative = c.needs.some((x) => ["devoir", "interrogation", "evaluation", "exercice", "serie_exercices"].includes(x));
  if (evaluative && long && !/corrig|correction|solution/.test(n)) out.push("Aucun corrigé repéré pour cette production d'exercices ou d'évaluation.");
  if (c.needs.includes("bareme") && long && !/bareme|points?\b|\/\s?20|\/\s?10/.test(n)) out.push("Barème demandé mais non repéré.");

  if (/\b(p\.|page)\s?\d+/.test(n) && c.labels.length === 0) out.push("Numéro de page cité alors qu'aucun extrait de la base n'a été consulté.");
  if (/faire participer (les )?(eleves|apprenants)/.test(n)) out.push("Formulation d'activité trop vague (« faire participer les élèves ») : à préciser.");
  if (c.fiche && !c.questionExpected && text.length > 400) out.push(...ficheChecks(c, n));

  return out;
}
