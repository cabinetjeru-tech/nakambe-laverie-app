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
};

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

  return out;
}
