import { normalize } from "../search";

/**
 * Identification du besoin de l'enseignant (moteur de décision pédagogique, section 3).
 * Une demande peut relever de plusieurs besoins à la fois. Fonctions pures.
 */

export const NEEDS = {
  preparation_cours: "préparation de cours",
  fiche_pedagogique: "fiche pédagogique",
  sequence: "séquence",
  seance: "séance",
  progression: "progression",
  exercice: "exercice",
  serie_exercices: "série d'exercices",
  devoir: "devoir",
  interrogation: "interrogation",
  evaluation: "évaluation",
  correction: "correction",
  bareme: "barème",
  remediation: "remédiation",
  differenciation: "différenciation pédagogique",
  revision: "révision",
  situation_probleme: "situation-problème",
  activite_integration: "activité d'intégration",
  competence: "compétence",
  objectif: "objectif",
  contenu: "contenu",
  methode: "méthode pédagogique",
  gestion_classe: "gestion de classe",
  conseil: "conseil pédagogique",
  autre: "autre",
} as const;
export type Need = keyof typeof NEEDS;

const RULES: [RegExp, Need][] = [
  [/\b(lecon|cours)\b/, "preparation_cours"],
  [/\bfiche(s)? (pedagogique|de preparation)|\bfiche\b/, "fiche_pedagogique"],
  [/\bsequence/, "sequence"],
  [/\bseance/, "seance"],
  [/\bprogression|repartition (annuelle|trimestrielle)/, "progression"],
  [/\bseries? d'?\s?exercices|\bexercices progressifs|\b\d+ exercices/, "serie_exercices"],
  [/\bexercice/, "exercice"],
  [/\bdevoir/, "devoir"],
  [/\binterrogation|\binterro\b/, "interrogation"],
  [/\bevaluation|\bcontrole\b|\bsujet blanc|\bcomposition\b|\bexamen blanc|\bgrille criteriee/, "evaluation"],
  [/\bcorrig|\bcorrection/, "correction"],
  [/\bbareme/, "bareme"],
  [/\bremedia|n'ont pas compris|ne comprennent pas|\bdifficultes? (a|en|de|pour)\b/, "remediation"],
  [/\bdifferenci|\bclasse (faible|avancee)|eleves (en difficulte|avances)|\bniveaux? (1|2|3)\b/, "differenciation"],
  [/\brevision|\breviser/, "revision"],
  [/\bsituation[- ]probleme|situation de depart/, "situation_probleme"],
  [/\b(activite|situation) d'integration/, "activite_integration"],
  [/\bcompetence/, "competence"],
  [/\bobjectifs?\b/, "objectif"],
  [/\bcontenus?\b|\bchapitres?\b|\bnotions? au programme/, "contenu"],
  [/\bmethode|demarche pedagogique|\bapproche pedagogique|\bpedagogie active/, "methode"],
  [/\bgestion de (la )?classe|\bgerer (une|la|sa|ma|mes|les) (grande )?classes?|\bdiscipline en classe|(effectifs?|classes?) plethoriques?|\bbavardage|\bindiscipline/, "gestion_classe"],
  [/\bconseils?\b|comment (faire|enseigner|motiver|expliquer|gerer|captiver|interesser)|\bastuces?\b/, "conseil"],
];

export function identifyNeeds(message: string): Need[] {
  const n = normalize(message).replace(/’/g, "'");
  const found = RULES.filter(([re]) => re.test(n)).map(([, need]) => need);
  const unique = [...new Set(found)];
  // Une série d'exercices n'est pas en plus un « exercice » isolé.
  const out = unique.includes("serie_exercices") ? unique.filter((x) => x !== "exercice") : unique;
  return out.length ? out : ["autre"];
}

/** Besoins de production spécialisée, pour lesquels la classe et la matière sont indispensables. */
const SPECIALIZED: Need[] = [
  "preparation_cours",
  "fiche_pedagogique",
  "sequence",
  "seance",
  "progression",
  "exercice",
  "serie_exercices",
  "devoir",
  "interrogation",
  "evaluation",
  "remediation",
  "differenciation",
  "revision",
  "situation_probleme",
  "activite_integration",
  "competence",
  "objectif",
  "contenu",
];
export function isSpecialized(needs: Need[]): boolean {
  return needs.some((n) => SPECIALIZED.includes(n));
}

/**
 * Matière déduite du thème quand elle n'est pas donnée (« les fractions » → Mathématiques).
 * Toujours présentée comme « déduite, à confirmer ». Liste volontairement courte et sans ambiguïté.
 */
const THEME_SUBJECTS: [RegExp, string][] = [
  [/\bfractions?\b|\bequations?\b|\binequation|\btheoreme de (thales|pythagore)|\bpythagore\b|\bthales\b|\bnombres? (decimaux|relatifs|entiers)|\bproportionnalite|\bpourcentages?\b|\bperimetre|\baire(s)? (du|d'un|des)|\bvolumes? (du|d'un)|\bstatistiques?\b|\bfonctions? (affine|lineaire)|\bvecteurs?\b|\btrigonometrie|\bgeometrie\b|\bpuissances?\b|\bdivisibilite|\bpgcd\b/, "Mathématiques"],
  [/\bconjugaison|\bgrammaire|\borthographe|\bdissertation|\bcommentaire (compose|de texte)|\bresume de texte|\bexpression ecrite|\bproduction ecrite|\bvocabulaire|\bgenre narratif|\bfigures? de style/, "Français"],
  [/\bphotosynthese|\bcellules?\b|\brespiration\b|\bdigestion|\breproduction (humaine|vegetale|animale)|\becosysteme|\bchaine alimentaire|\bsystemes? (nerveux|digestif|respiratoire)|\bgenetique/, "SVT"],
  [/\belectricite|\bcircuits? electriques?|\bmasse volumique|\bmelanges? (homogenes?|heterogenes?)|\batomes?\b|\bmolecules?|\breactions? chimiques?|\boptique|\blentilles?\b|\bforces? et mouvement/, "Physique-Chimie"],
];

export function subjectFromTheme(...texts: (string | undefined)[]): string | undefined {
  const n = normalize(texts.filter(Boolean).join(" "));
  return THEME_SUBJECTS.find(([re]) => re.test(n))?.[1];
}
