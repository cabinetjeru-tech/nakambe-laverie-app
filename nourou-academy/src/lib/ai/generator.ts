import "server-only";
import type { GeneratedKind } from "@prisma/client";
import { generateJson, generateText } from "./llm";

/**
 * Générateur pédagogique pour les formateurs. Tout contenu généré est un BROUILLON :
 * le formateur le relit, le modifie, le valide puis le publie explicitement.
 */

export const generatorKinds: Record<GeneratedKind, { label: string; hint: string; format: "markdown" | "program" | "quiz" }> = {
  COURSE_PLAN: { label: "Plan de cours complet", hint: "Modules et leçons ordonnés, avec objectifs et durées", format: "program" },
  PROGRAM: { label: "Programme de formation", hint: "Programme détaillé prêt à importer dans une formation", format: "program" },
  LESSON: { label: "Leçon structurée", hint: "Leçon rédigée : objectifs, contenu, exemples, synthèse", format: "markdown" },
  QUIZ: { label: "Quiz avec corrigé", hint: "Questions QCM, vrai/faux et ouvertes avec corrigés", format: "quiz" },
  EXERCISES: { label: "Exercices pratiques", hint: "Série d'exercices progressifs avec corrigés", format: "markdown" },
  CASE_STUDY: { label: "Étude de cas", hint: "Cas réaliste d'entreprise africaine avec questions", format: "markdown" },
  REVISION_SHEET: { label: "Fiche de révision", hint: "Synthèse des notions clés à retenir", format: "markdown" },
  SUPPORT: { label: "Support pédagogique", hint: "Support de cours imprimable / diaporama rédigé", format: "markdown" },
  RUBRIC: { label: "Évaluation et grille de notation", hint: "Sujet d'évaluation + barème détaillé par critère", format: "markdown" },
};

const SYSTEM = `Tu es un ingénieur pédagogique senior qui conçoit des formations professionnelles en ligne pour l'Afrique francophone (Burkina Faso, Bénin, Côte d'Ivoire, Sénégal…).
Public : étudiants, entrepreneurs, commerçants, infographistes, photographes, artisans, salariés, personnes en reconversion.
Tes contenus sont en français clair, concrets, orientés compétences et mise en pratique, avec des exemples locaux réalistes (FCFA, Mobile Money, PME locales, marchés, administrations).
Tu appliques les bonnes pratiques d'ingénierie pédagogique : objectifs opérationnels (verbes d'action), progression du simple au complexe, activités pratiques, évaluation alignée sur les objectifs.
N'invente pas de références légales ou de statistiques précises : si nécessaire, indique « [à vérifier par le formateur] ».`;

export type GeneratedProgram = {
  modules: { title: string; description: string; lessons: { title: string; summary: string; durationMinutes: number; type: "VIDEO" | "TEXT" | "QUIZ" | "ASSIGNMENT" }[] }[];
  objectives: string[];
  prerequisites: string[];
};

export type GeneratedQuiz = {
  title: string;
  questions: {
    type: "SINGLE" | "MULTIPLE" | "TRUE_FALSE" | "OPEN";
    prompt: string;
    options: string[];
    correct: number[];
    explanation: string;
    rubric: string;
    points: number;
  }[];
};

export async function generateContent(opts: {
  kind: GeneratedKind;
  brief: string;
  courseContext: string;
  level: string;
  userId: string;
}): Promise<string> {
  const def = generatorKinds[opts.kind];
  const base = `Type de contenu : ${def.label} (${def.hint})
Niveau des apprenants : ${opts.level}
Contexte de la formation :
${opts.courseContext || "(aucun)"}

Demande du formateur :
${opts.brief}`;

  if (def.format === "program") {
    const res = await generateJson<GeneratedProgram>({
      feature: "GENERATOR",
      userId: opts.userId,
      schemaName: "program",
      system: SYSTEM,
      maxTokens: 12000,
      schema: {
        type: "object",
        additionalProperties: false,
        required: ["modules", "objectives", "prerequisites"],
        properties: {
          objectives: { type: "array", items: { type: "string" } },
          prerequisites: { type: "array", items: { type: "string" } },
          modules: {
            type: "array",
            items: {
              type: "object",
              additionalProperties: false,
              required: ["title", "description", "lessons"],
              properties: {
                title: { type: "string" },
                description: { type: "string" },
                lessons: {
                  type: "array",
                  items: {
                    type: "object",
                    additionalProperties: false,
                    required: ["title", "summary", "durationMinutes", "type"],
                    properties: {
                      title: { type: "string" },
                      summary: { type: "string" },
                      durationMinutes: { type: "integer" },
                      type: { type: "string", enum: ["VIDEO", "TEXT", "QUIZ", "ASSIGNMENT"] },
                    },
                  },
                },
              },
            },
          },
        },
      },
      messages: [{ role: "user", content: base }],
    });
    return JSON.stringify(res, null, 2);
  }

  if (def.format === "quiz") {
    const res = await generateJson<GeneratedQuiz>({
      feature: "GENERATOR",
      userId: opts.userId,
      schemaName: "quiz",
      system: SYSTEM,
      maxTokens: 10000,
      schema: {
        type: "object",
        additionalProperties: false,
        required: ["title", "questions"],
        properties: {
          title: { type: "string" },
          questions: {
            type: "array",
            items: {
              type: "object",
              additionalProperties: false,
              required: ["type", "prompt", "options", "correct", "explanation", "rubric", "points"],
              properties: {
                type: { type: "string", enum: ["SINGLE", "MULTIPLE", "TRUE_FALSE", "OPEN"] },
                prompt: { type: "string" },
                options: { type: "array", items: { type: "string" }, description: "Vide pour OPEN ; ['Vrai','Faux'] pour TRUE_FALSE" },
                correct: { type: "array", items: { type: "integer" }, description: "Index (0-based) des bonnes options ; vide pour OPEN" },
                explanation: { type: "string" },
                rubric: { type: "string", description: "Barème et réponse modèle pour les questions ouvertes" },
                points: { type: "integer" },
              },
            },
          },
        },
      },
      messages: [{ role: "user", content: base }],
    });
    return JSON.stringify(res, null, 2);
  }

  return generateText({
    feature: "GENERATOR",
    userId: opts.userId,
    system: SYSTEM + "\nRéponds uniquement avec le contenu demandé, en Markdown (titres ##, listes, tableaux si utile), sans préambule.",
    maxTokens: 12000,
    messages: [{ role: "user", content: base }],
  });
}
