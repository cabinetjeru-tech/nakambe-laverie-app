import type { TeacherContext } from "./conversation";
import type { Category } from "./documents";

/**
 * Actions rapides : chaque modèle pré-remplit la zone de saisie, que l'enseignant complète avant l'envoi.
 * Les éléments entre crochets sont à préciser par l'enseignant.
 * `main` : les sept choix du message de démarrage (configuration V2, section 30).
 */

export type Template = { id: string; label: string; hint: string; icon?: string; main?: boolean; category: Category; build: (c: TeacherContext) => string };

const v = (value: string | undefined, placeholder: string) => (value?.trim() ? value.trim() : `[${placeholder}]`);
const classe = (c: TeacherContext) => v(c.classe, "classe");
const disc = (c: TeacherContext) => v(c.discipline, "discipline");
const theme = (c: TeacherContext) => v(c.theme, "thème ou chapitre");
const duree = (c: TeacherContext, d: string) => (c.duree?.trim() ? c.duree.trim() : d);

export const TEMPLATES: Template[] = [
  {
    id: "lecon",
    label: "Un cours",
    hint: "Préparation complète, du déroulement au corrigé",
    icon: "📚",
    main: true,
    category: "cours",
    build: (c) => `Prépare-moi un cours de ${disc(c)} en ${classe(c)} sur « ${theme(c)} », pour une séance de ${duree(c, "55 minutes")}.`,
  },
  {
    id: "devoir",
    label: "Un devoir",
    hint: "Sujet, corrigé et barème séparés",
    icon: "📝",
    main: true,
    category: "devoir",
    build: (c) => `Crée-moi un devoir surveillé de ${disc(c)} en ${classe(c)} sur « ${theme(c)} », durée ${duree(c, "1 heure")}, noté sur 20. Donne le sujet, puis séparément le corrigé et le barème.${c.etablissement ? ` Établissement : ${c.etablissement}.` : ""}`,
  },
  {
    id: "evaluation",
    label: "Une évaluation",
    hint: "Diagnostique, formative ou sommative",
    icon: "📊",
    main: true,
    category: "evaluation",
    build: (c) => `Construis une évaluation [diagnostique / formative / sommative] en ${disc(c)} (${classe(c)}) sur « ${theme(c)} », qui varie les types de tâches, avec sujet, corrigé et barème séparés.`,
  },
  {
    id: "corrige",
    label: "Un corrigé",
    hint: "Corrigé détaillé et barème d'un sujet existant",
    icon: "✅",
    main: true,
    category: "corrige",
    build: (c) => `Rédige le corrigé détaillé et le barème du sujet suivant (${disc(c)}, ${classe(c)}) :\n\n[collez ici le texte du sujet]`,
  },
  {
    id: "progression",
    label: "Une progression",
    hint: "Répartition annuelle ou trimestrielle",
    icon: "📅",
    main: true,
    category: "progression",
    build: (c) => `Aide-moi à construire une progression de ${disc(c)} en ${classe(c)} pour [le trimestre / l'année], avec le nombre de séances par chapitre. Indique clairement ce qui provient de la base documentaire MON PROF.IA et ce qui est une proposition.`,
  },
  {
    id: "remediation",
    label: "Une activité de remédiation",
    hint: "Diagnostic, prérequis, activités, nouvelle vérification",
    icon: "🔄",
    main: true,
    category: "remediation",
    build: (c) => `Mes élèves de ${classe(c)} n'ont pas compris [la notion] en ${disc(c)} : [décrivez les erreurs observées]. Propose une remédiation complète : diagnostic, prérequis, activité de remédiation, exercices progressifs, correction, nouvelle vérification et consolidation.`,
  },
  {
    id: "activite",
    label: "Une activité pédagogique",
    hint: "Situation-problème, travail de groupe, jeu…",
    icon: "💡",
    main: true,
    category: "activite",
    build: (c) => `Propose une activité pédagogique pour introduire « ${theme(c)} » en ${disc(c)}, classe de ${classe(c)}, ancrée dans la vie quotidienne au Burkina Faso, avec les consignes et les réponses attendues.`,
  },
  {
    id: "accompagnement",
    label: "Construire pas à pas",
    hint: "MON PROF.IA vous pose les bonnes questions",
    category: "cours",
    build: (c) => `Je dois enseigner « ${theme(c)} » [demain]. Aide-moi à construire la séance pas à pas : pose-moi d'abord les questions nécessaires.`,
  },
  {
    id: "fiche",
    label: "Fiche pédagogique",
    hint: "Tableau enseignant / élèves, prête à imprimer",
    category: "cours",
    build: (c) => `Élabore une fiche pédagogique de ${disc(c)} en ${classe(c)} sur « ${theme(c)} » (${duree(c, "55 minutes")}) : identification, compétence ou objectif documenté, prérequis, matériel, situation de départ, activités de l'enseignant et des apprenants (en tableau), synthèse, évaluation, remédiation, devoir éventuel.`,
  },
  {
    id: "exercices",
    label: "Exercices progressifs",
    hint: "Du niveau 1 (application) au niveau 4 (problème)",
    category: "activite",
    build: (c) => `Crée une série de 8 exercices progressifs de ${disc(c)} en ${classe(c)} sur « ${theme(c)} », de l'application directe au problème complexe, avec le corrigé de chaque exercice.`,
  },
  {
    id: "versions",
    label: "Versions A, B et C",
    hint: "Trois sujets équivalents, avec corrigés",
    category: "devoir",
    build: (c) => `Crée trois versions (A, B et C) d'un devoir de ${disc(c)} en ${classe(c)} sur « ${theme(c)} », durée ${duree(c, "1 heure")}, qui évaluent les mêmes compétences sans être identiques, avec le corrigé de chaque version.`,
  },
  {
    id: "interrogation",
    label: "Interrogation écrite",
    hint: "Contrôle court de 15 à 20 minutes",
    category: "evaluation",
    build: (c) => `Prépare une interrogation écrite de 15 minutes en ${disc(c)}, classe de ${classe(c)}, sur « ${theme(c)} », notée sur 10, avec sujet et corrigé séparés.`,
  },
  {
    id: "sujet-blanc",
    label: "Sujet blanc",
    hint: "Épreuve d'entraînement, corrigé et barème",
    category: "evaluation",
    build: (c) => `Prépare un sujet blanc de ${disc(c)} pour la classe de ${classe(c)}, durée ${duree(c, "2 heures")}, avec corrigé détaillé et barème. Indique si des orientations officielles d'évaluation figurent dans la base MON PROF.IA.`,
  },
  {
    id: "grille",
    label: "Grille critériée",
    hint: "Critères, indicateurs et barème",
    category: "evaluation",
    build: (c) => `Construis une grille d'évaluation critériée pour [la production ou l'épreuve] en ${disc(c)} (${classe(c)}) : critères, indicateurs, barème.`,
  },
  {
    id: "differenciation",
    label: "Différencier",
    hint: "Consolidation, niveau attendu, approfondissement",
    category: "cours",
    build: (c) => `Propose une activité différenciée sur « ${theme(c)} » (${disc(c)}, ${classe(c)}) en trois niveaux — consolidation, niveau attendu, approfondissement — avec le même objectif principal et des consignes non stigmatisantes.`,
  },
  {
    id: "revision",
    label: "Séance de révision",
    hint: "Rappels, erreurs fréquentes, exercices types",
    category: "activite",
    build: (c) => `Prépare une séance de révision de ${duree(c, "55 minutes")} en ${disc(c)} (${classe(c)}) sur « ${theme(c)} » : rappels essentiels, erreurs fréquentes, exercices types corrigés.`,
  },
];

/** Modifications d'une production (configuration V2, section 19). */
export const MODIFICATIONS: { label: string; prompt: string }[] = [
  { label: "Simplifier", prompt: "Simplifie cette production." },
  { label: "Développer", prompt: "Développe cette production." },
  { label: "Ajouter des exemples", prompt: "Ajoute des exemples concrets." },
  { label: "Ajouter des exercices", prompt: "Ajoute des exercices, avec leur corrigé." },
  { label: "Réduire la durée", prompt: "Réduis la durée de la séance : [nouvelle durée]." },
  { label: "Classe faible", prompt: "Adapte cette production à une classe faible." },
  { label: "Classe avancée", prompt: "Adapte cette production à une classe avancée." },
  { label: "Situation-problème", prompt: "Ajoute une situation-problème." },
  { label: "Créer le corrigé", prompt: "Crée le corrigé détaillé." },
  { label: "Créer le barème", prompt: "Crée le barème détaillé." },
  { label: "Transformer en devoir", prompt: "Transforme cette production en devoir, avec sujet, corrigé et barème séparés." },
  { label: "Transformer en fiche", prompt: "Transforme cette production en fiche pédagogique." },
  { label: "Résumer", prompt: "Résume cette production." },
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
