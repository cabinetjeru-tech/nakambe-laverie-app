import "server-only";
import type { LessonType } from "@prisma/client";
import { prisma } from "./db";
import { getBrand } from "./settings";

type TemplateLesson = { title: string; type: LessonType; isPreview?: boolean; content?: string; durationMinutes?: number };
type TemplateModule = { key: "presentation" | "introduction" | "body" | "conclusion"; title: string; description: string; lessons: TemplateLesson[] };

/**
 * Structure type d'une formation professionnelle (modèle inspiré des grandes plateformes) :
 * Présentation → Introduction → Modules de contenu → Conclusion et évaluation finale.
 * Les textes sont des trames à personnaliser par le formateur.
 */
async function templateModules(): Promise<TemplateModule[]> {
  const brand = await getBrand();
  return [
    {
      key: "presentation",
      title: "Présentation de la formation",
      description: "Bienvenue, objectifs, déroulé et mode d'emploi de la formation.",
      lessons: [
        {
          title: "Bienvenue et présentation du formateur",
          type: "VIDEO",
          isPreview: true,
          durationMinutes: 3,
          content: "## Bienvenue !\n\n> **À compléter** — Présentez-vous en quelques phrases : votre parcours, votre expérience du sujet et ce qui vous motive à transmettre cette formation.\n\nAjoutez ici une courte vidéo de bienvenue (2 à 3 minutes).",
        },
        {
          title: "Objectifs, programme et modalités",
          type: "TEXT",
          isPreview: true,
          durationMinutes: 5,
          content: "## Ce que vous allez apprendre\n\n- Objectif 1\n- Objectif 2\n- Objectif 3\n\n## Déroulé de la formation\n\n> **À compléter** — Décrivez les grandes étapes (modules) et le temps à prévoir.\n\n## Évaluation et certificat\n\n> **À compléter** — Précisez les quiz, devoirs et l'évaluation finale, ainsi que les conditions d'obtention du certificat.",
        },
        {
          title: `Comment suivre cette formation sur ${brand.shortName}`,
          type: "TEXT",
          isPreview: true,
          durationMinutes: 3,
          content: `## Bien démarrer\n\n- **Avancez à votre rythme** : chaque leçon se consulte en ligne, sur ordinateur ou smartphone. Votre progression est enregistrée automatiquement.\n- **Marquez les leçons comme terminées** pour suivre votre avancement.\n- **Ressources** : les documents mis à votre disposition (fiches, modèles, exercices) se téléchargent depuis le bouton « Ressources ».\n- **${brand.tutorName}**, votre tuteur IA, répond à vos questions sur le cours 24h/24 (bouton en bas de l'écran).\n- **Quiz et devoirs** vous permettent de vérifier vos acquis ; le certificat est délivré quand vous remplissez les critères de la formation.`,
        },
      ],
    },
    {
      key: "introduction",
      title: "Introduction",
      description: "Les enjeux du sujet et les notions de base.",
      lessons: [
        { title: "Introduction : pourquoi ce sujet est important", type: "VIDEO", durationMinutes: 8, content: "> **À compléter** — Présentez le contexte, les enjeux et des exemples concrets tirés du terrain." },
        { title: "Les notions clés à connaître", type: "TEXT", durationMinutes: 10, content: "> **À compléter** — Définissez le vocabulaire et les concepts de base utilisés dans la formation." },
      ],
    },
    {
      key: "body",
      title: "Module 1 — (titre à définir)",
      description: "Premier module de contenu.",
      lessons: [
        { title: "Leçon 1 — (titre à définir)", type: "VIDEO", durationMinutes: 10 },
        { title: "Quiz du module 1", type: "QUIZ", durationMinutes: 5 },
      ],
    },
    {
      key: "conclusion",
      title: "Conclusion et évaluation finale",
      description: "Synthèse, évaluation des acquis et suite du parcours.",
      lessons: [
        { title: "Synthèse de la formation", type: "TEXT", durationMinutes: 5, content: "## À retenir\n\n> **À compléter** — Résumez les points essentiels de la formation en quelques lignes." },
        { title: "Évaluation finale", type: "QUIZ", durationMinutes: 15 },
        { title: "Et après ? Ressources pour aller plus loin", type: "TEXT", durationMinutes: 3, content: "> **À compléter** — Proposez des lectures, outils et prochaines étapes. Ajoutez vos fiches et modèles en ressources téléchargeables." },
      ],
    },
  ];
}

async function createModule(courseId: string, m: TemplateModule, position: number) {
  const mod = await prisma.module.create({ data: { courseId, title: m.title, description: m.description, position } });
  for (const [i, l] of m.lessons.entries()) {
    const lesson = await prisma.lesson.create({
      data: { moduleId: mod.id, title: l.title, type: l.type, position: i, isPreview: l.isPreview ?? false, content: l.content ?? null, durationMinutes: l.durationMinutes ?? 0 },
    });
    // L'évaluation finale n'est pas marquée « examen final » tant qu'elle n'a pas de questions (sinon elle bloquerait le certificat).
    if (l.type === "QUIZ") await prisma.quiz.create({ data: { courseId, lessonId: lesson.id, title: l.title } });
  }
}

async function refreshDuration(courseId: string) {
  const total = await prisma.lesson.aggregate({ where: { module: { courseId } }, _sum: { durationMinutes: true } });
  await prisma.course.update({ where: { id: courseId }, data: { durationMinutes: total._sum.durationMinutes ?? 0 } });
}

/** Nouvelle formation : crée toute la structure type. */
export async function createCourseStructure(courseId: string) {
  const modules = await templateModules();
  for (const [i, m] of modules.entries()) await createModule(courseId, m, i);
  await refreshDuration(courseId);
}

/**
 * Formation existante : ajoute seulement les parties manquantes (Présentation et Introduction au début,
 * Conclusion à la fin), sans toucher aux modules déjà créés. Renvoie la liste des sections ajoutées.
 */
export async function completeCourseStructure(courseId: string) {
  const existing = await prisma.module.findMany({ where: { courseId }, orderBy: { position: "asc" }, select: { id: true, title: true } });
  const has = (re: RegExp) => existing.some((m) => re.test(m.title));
  const tpl = await templateModules();
  const before = tpl.filter((m) => (m.key === "presentation" && !has(/pr[ée]sentation/i)) || (m.key === "introduction" && !has(/introduction/i)));
  const after = tpl.filter((m) => m.key === "conclusion" && !has(/conclusion/i));
  if (before.length === 0 && after.length === 0) return [];
  // Décale les modules existants pour insérer les nouveaux en tête.
  for (const [i, m] of existing.entries()) await prisma.module.update({ where: { id: m.id }, data: { position: i + before.length } });
  for (const [i, m] of before.entries()) await createModule(courseId, m, i);
  for (const m of after) await createModule(courseId, m, existing.length + before.length);
  await refreshDuration(courseId);
  return [...before, ...after].map((m) => m.title);
}
