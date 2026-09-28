import type { TeacherContext } from "./conversation";

/**
 * Actions rapides : chaque modèle pré-remplit la zone de saisie, que l'enseignant complète avant l'envoi.
 * Les éléments entre crochets sont à préciser par l'enseignant.
 */

export type Template = { id: string; label: string; hint: string; build: (c: TeacherContext) => string };

const v = (value: string | undefined, placeholder: string) => (value?.trim() ? value.trim() : `[${placeholder}]`);
const classe = (c: TeacherContext) => v(c.classe, "classe");
const disc = (c: TeacherContext) => v(c.discipline, "discipline");
const theme = (c: TeacherContext) => v(c.theme, "thème ou chapitre");
const duree = (c: TeacherContext, d: string) => (c.duree?.trim() ? c.duree.trim() : d);

export const TEMPLATES: Template[] = [
  {
    id: "lecon",
    label: "Préparer une leçon",
    hint: "Fiche complète, du déroulement au corrigé",
    build: (c) => `Prépare-moi une leçon de ${disc(c)} en ${classe(c)} sur « ${theme(c)} », pour une séance de ${duree(c, "55 minutes")}.`,
  },
  {
    id: "fiche",
    label: "Fiche pédagogique",
    hint: "Tableau enseignant / élèves, prête à imprimer",
    build: (c) => `Élabore une fiche pédagogique de ${disc(c)} en ${classe(c)} sur « ${theme(c)} » (${duree(c, "55 minutes")}), présentée sous forme de tableau : étapes, durée, activités de l'enseignant, activités des élèves, trace écrite.`,
  },
  {
    id: "exercices",
    label: "Exercices progressifs",
    hint: "Du niveau 1 (application) au niveau 4 (problème)",
    build: (c) => `Crée une série de 8 exercices progressifs de ${disc(c)} en ${classe(c)} sur « ${theme(c)} », répartis du niveau 1 (application directe) au niveau 4 (problème complexe), avec le corrigé de chaque exercice.`,
  },
  {
    id: "devoir",
    label: "Devoir + corrigé",
    hint: "Sujet et corrigé séparés, barème sur 20",
    build: (c) => `Prépare un devoir surveillé de ${disc(c)} en ${classe(c)} sur « ${theme(c)} », durée ${duree(c, "2 heures")}, noté sur 20 avec barème. Donne le sujet et le corrigé détaillé séparément.${c.etablissement ? ` Établissement : ${c.etablissement}.` : ""}`,
  },
  {
    id: "interrogation",
    label: "Interrogation écrite",
    hint: "Contrôle court de 15 à 20 minutes",
    build: (c) => `Prépare une interrogation écrite de 15 minutes en ${disc(c)}, classe de ${classe(c)}, sur « ${theme(c)} », notée sur 10, avec sujet et corrigé séparés.`,
  },
  {
    id: "evaluation",
    label: "Évaluation",
    hint: "Connaissance, application, raisonnement, production",
    build: (c) => `Construis une évaluation de fin de chapitre en ${disc(c)} (${classe(c)}) sur « ${theme(c)} » qui varie les types de tâches (connaissance, compréhension, application, raisonnement, production), avec sujet, corrigé et barème séparés.`,
  },
  {
    id: "situation",
    label: "Situation-problème",
    hint: "Ancrée dans le quotidien des élèves",
    build: (c) => `Propose une situation-problème de départ pour introduire « ${theme(c)} » en ${disc(c)}, classe de ${classe(c)}, tirée de la vie quotidienne au Burkina Faso, avec les consignes et les réponses attendues.`,
  },
  {
    id: "progression",
    label: "Progression",
    hint: "Répartition des leçons sur une période",
    build: (c) => `Aide-moi à construire une progression de ${disc(c)} en ${classe(c)} pour [le trimestre / l'année], avec le nombre de séances par chapitre. Indique clairement ce qui provient des documents de référence et ce qui est une proposition.`,
  },
  {
    id: "remediation",
    label: "Remédiation",
    hint: "Diagnostic, activités et nouvelle évaluation",
    build: (c) => `Mes élèves de ${classe(c)} ont des difficultés en ${disc(c)} : [décrivez la difficulté observée, par exemple les erreurs fréquentes]. Propose une démarche de remédiation complète.`,
  },
  {
    id: "differenciation",
    label: "Différencier",
    hint: "Version classe faible / élèves avancés",
    build: (c) => `Adapte la leçon sur « ${theme(c)} » (${disc(c)}, ${classe(c)}) en deux versions : une pour les élèves en difficulté (plus guidée) et une pour les élèves avancés (plus exigeante), en gardant le même apprentissage essentiel.`,
  },
  {
    id: "revision",
    label: "Séance de révision",
    hint: "Rappels, exercices types, préparation d'examen",
    build: (c) => `Prépare une séance de révision de ${duree(c, "55 minutes")} en ${disc(c)} (${classe(c)}) sur « ${theme(c)} » : rappels essentiels, erreurs fréquentes, exercices types corrigés.`,
  },
  {
    id: "simplifier",
    label: "Simplifier une notion",
    hint: "Explication claire avec exemples concrets",
    build: (c) => `Explique simplement la notion de « ${theme(c)} » pour des élèves de ${classe(c)} en ${disc(c)}, avec des exemples concrets et une courte vérification de compréhension.`,
  },
];

/** Suggestions de disciplines (saisie libre possible). */
export const DISCIPLINES = [
  "Mathématiques",
  "Physique-Chimie",
  "Sciences de la Vie et de la Terre",
  "Français",
  "Anglais",
  "Allemand",
  "Espagnol",
  "Arabe",
  "Histoire-Géographie",
  "Philosophie",
  "Éducation civique et morale",
  "Éducation physique et sportive",
  "Informatique",
  "Économie",
];
