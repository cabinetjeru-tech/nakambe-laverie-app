import "server-only";
/**
 * Initialisation de la plateforme : super-administrateur et données de DÉMONSTRATION.
 * Utilisé par `npm run db:seed` (prisma/seed.ts) et par la page /installation.
 * Idempotent : peut être relancé sans créer de doublons.
 * Les données de démonstration sont marquées `isDemo = true` ; aucun avis ni témoignage n'est inventé.
 */
import type { Prisma } from "@prisma/client";
import bcrypt from "bcryptjs";
import { randomBytes } from "node:crypto";
import { prisma } from "../db";
import { indexLesson } from "../rag/ingest";
import { categories, courses, faqs, trainers } from "./demo-content";

export async function ensureSuperAdmin(opts: { email: string; name?: string; password?: string }) {
  const email = opts.email.trim().toLowerCase();
  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) return { created: false as const, email };
  const password = opts.password || randomBytes(9).toString("base64url") + "7a";
  await prisma.user.create({
    data: { email, name: opts.name || "Super Administrateur", role: "SUPERADMIN", passwordHash: await bcrypt.hash(password, 12), privacyConsentAt: new Date() },
  });
  return { created: true as const, email, password };
}

export async function seedDemo(demoPassword = "Demo2026!") {
  const log: string[] = [];
  const console = { log: (m: string) => log.push(m) };
  for (const [i, c] of categories.entries()) {
    await prisma.category.upsert({ where: { slug: c.slug }, create: { ...c, position: i }, update: { name: c.name, description: c.description, icon: c.icon, position: i } });
  }

  const demoHash = await bcrypt.hash(demoPassword, 12);
  const trainerIds: string[] = [];
  for (const t of trainers) {
    const u = await prisma.user.upsert({
      where: { email: t.email },
      create: { ...t, role: "TRAINER", passwordHash: demoHash, isDemo: true, privacyConsentAt: new Date() },
      update: { name: t.name, headline: t.headline, bio: t.bio, expertise: t.expertise },
    });
    trainerIds.push(u.id);
  }
  const learner = await prisma.user.upsert({
    where: { email: "apprenant@demo.nourou-academy.local" },
    create: { email: "apprenant@demo.nourou-academy.local", name: "Apprenant Démo", role: "LEARNER", passwordHash: demoHash, isDemo: true, privacyConsentAt: new Date() },
    update: {},
  });
  await prisma.user.upsert({
    where: { email: "assistant@demo.nourou-academy.local" },
    create: { email: "assistant@demo.nourou-academy.local", name: "Assistant Démo", role: "ASSISTANT", passwordHash: demoHash, isDemo: true, privacyConsentAt: new Date() },
    update: {},
  });

  const catBySlug = Object.fromEntries((await prisma.category.findMany()).map((c) => [c.slug, c.id]));

  for (const sc of courses) {
    const exists = await prisma.course.findUnique({ where: { slug: sc.slug } });
    if (exists) {
      console.log(`• Formation existante : ${sc.title}`);
      continue;
    }
    const totalMinutes = sc.modules.reduce((s, m) => s + m.lessons.reduce((a, l) => a + l.minutes, 0), 0);
    const course = await prisma.course.create({
      data: {
        slug: sc.slug,
        title: sc.title,
        subtitle: sc.subtitle,
        description: sc.description,
        categoryId: catBySlug[sc.category],
        trainerId: trainerIds[sc.trainer]!,
        level: sc.level,
        durationMinutes: totalMinutes,
        objectives: sc.objectives,
        prerequisites: sc.prerequisites,
        targetAudience: sc.audience,
        priceXof: sc.price,
        isFree: !!sc.isFree,
        featured: !!sc.featured,
        status: "PUBLISHED",
        publishedAt: new Date(),
        isDemo: true,
        certRequireProjects: !!sc.certRequireProjects,
      },
    });
    for (const [mi, m] of sc.modules.entries()) {
      const mod = await prisma.module.create({ data: { courseId: course.id, title: m.title, position: mi } });
      for (const [li, l] of m.lessons.entries()) {
        const lesson = await prisma.lesson.create({
          data: {
            moduleId: mod.id,
            title: l.title,
            type: l.type,
            content: l.content ?? null,
            durationMinutes: l.minutes,
            position: li,
            isPreview: !!l.preview,
          },
        });
        if (l.type === "QUIZ" && sc.quiz && sc.quiz.moduleIndex === mi) {
          await prisma.quiz.create({
            data: {
              courseId: course.id,
              lessonId: lesson.id,
              title: sc.quiz.title,
              isFinalExam: !!sc.quiz.final,
              passingScore: 70,
              questions: {
                create: sc.quiz.questions.map((q, qi) => {
                  const options = (q.options ?? []).map((text, oi) => ({ id: `o${oi}`, text }));
                  const correct = q.type === "SHORT" || q.type === "OPEN" ? (q.expected ?? []) : (q.correct ?? []).map((ci) => `o${ci}`);
                  return {
                    type: q.type,
                    prompt: q.prompt,
                    options: options as Prisma.InputJsonValue,
                    correctAnswers: correct as Prisma.InputJsonValue,
                    rubric: q.rubric,
                    explanation: q.explanation,
                    topic: q.topic,
                    points: q.points ?? 1,
                    position: qi,
                  };
                }),
              },
            },
          });
        }
        if (l.type === "ASSIGNMENT" && sc.assignment && sc.assignment.moduleIndex === mi) {
          const max = sc.assignment.rubric.reduce((s, r) => s + r.points, 0);
          await prisma.assignment.create({
            data: {
              courseId: course.id,
              lessonId: lesson.id,
              title: sc.assignment.title,
              instructions: sc.assignment.instructions,
              rubric: sc.assignment.rubric as Prisma.InputJsonValue,
              maxScore: max,
              passingScore: Math.ceil(max / 2),
              isProject: !!sc.assignment.isProject,
              requiresHumanValidation: true,
            },
          });
        }
        if (l.content) await indexLesson(lesson.id, trainerIds[sc.trainer]!);
      }
    }
    console.log(`✔ Formation de démonstration : ${sc.title}`);
  }

  // Inscription de l'apprenant démo à la formation gratuite (pour tester le lecteur et le tuteur).
  const free = await prisma.course.findUnique({ where: { slug: "ia-generative-pour-les-professionnels" } });
  if (free) {
    await prisma.enrollment.upsert({
      where: { userId_courseId: { userId: learner.id, courseId: free.id } },
      create: { userId: learner.id, courseId: free.id, source: "FREE" },
      update: {},
    });
  }

  const plans = [
    { code: "mensuel", name: "Mensuel", interval: "MONTH" as const, priceXof: 5000, position: 0, features: ["Accès à toutes les formations incluses", "Tuteur IA illimité dans la limite du quota journalier", "Certificats inclus", "Sans engagement"] },
    { code: "trimestriel", name: "Trimestriel", interval: "QUARTER" as const, priceXof: 13500, position: 1, features: ["Tous les avantages du mensuel", "Environ 10 % d'économie", "Accès prioritaire aux classes virtuelles"] },
    { code: "annuel", name: "Annuel", interval: "YEAR" as const, priceXof: 45000, position: 2, features: ["Tous les avantages du trimestriel", "Environ 25 % d'économie", "Idéal pour un parcours de reconversion"] },
  ];
  for (const p of plans) await prisma.plan.upsert({ where: { code: p.code }, create: p, update: {} });

  await prisma.coupon.upsert({
    where: { code: "BIENVENUE10" },
    create: { code: "BIENVENUE10", description: "10 % sur le premier achat (exemple, modifiable)", type: "PERCENT", value: 10, perUserLimit: 1 },
    update: {},
  });

  const marketing = await prisma.course.findUnique({ where: { slug: "marketing-digital-pme-africaines" } });
  const micro = await prisma.course.findUnique({ where: { slug: "creer-gerer-micro-entreprise" } });
  if (marketing && micro && !(await prisma.pack.findUnique({ where: { slug: "pack-entrepreneur" } }))) {
    await prisma.pack.create({
      data: {
        slug: "pack-entrepreneur",
        title: "Pack Entrepreneur",
        description: "Créer son activité et la faire connaître : 2 formations complémentaires à prix réduit.",
        priceXof: 45000,
        courses: { create: [{ courseId: marketing.id }, { courseId: micro.id }] },
      },
    });
  }

  if ((await prisma.faq.count()) === 0) {
    await prisma.faq.createMany({ data: faqs.map((f, i) => ({ ...f, position: i })) });
  }

  if ((await prisma.blogPost.count()) === 0) {
    await prisma.blogPost.createMany({
      data: [
        {
          slug: "5-conseils-apprendre-en-ligne-connexion-faible",
          title: "5 conseils pour apprendre en ligne avec une connexion faible",
          excerpt: "Mode faible consommation, téléchargement des supports, horaires creux : nos astuces pour progresser même quand le réseau est capricieux.",
          content:
            "## 1. Activez le mode faible consommation\nDans votre profil, ce mode évite le chargement automatique des vidéos et masque les images décoratives.\n\n## 2. Téléchargez les supports PDF\nLes documents enregistrés restent consultables hors ligne dans l'application.\n\n## 3. Profitez des heures creuses\nLe réseau est souvent plus rapide tôt le matin ou tard le soir.\n\n## 4. Utilisez le Wi-Fi quand c'est possible\nPour les vidéos, privilégiez un Wi-Fi (bureau, espace de coworking, université).\n\n## 5. Laissez l'application synchroniser\nEn cas de coupure, votre progression est gardée sur le téléphone et envoyée automatiquement au retour du réseau.",
          kind: "ARTICLE",
          published: true,
          publishedAt: new Date(),
          isDemo: true,
        },
        {
          slug: "modele-cahier-de-caisse",
          title: "Ressource gratuite : modèle de cahier de caisse",
          excerpt: "Un modèle simple pour suivre vos entrées et sorties d'argent au quotidien, à recopier dans un cahier ou un tableur.",
          content:
            "## Colonnes du modèle\n| Date | Libellé | Entrée | Sortie | Solde |\n|---|---|---|---|---|\n| 01/03 | Solde de départ | | | 50 000 |\n\n## Mode d'emploi\n- Notez **chaque** mouvement le jour même.\n- Indiquez la référence des paiements Mobile Money.\n- Faites le total chaque soir et comparez avec l'argent réellement en caisse.",
          kind: "RESOURCE",
          published: true,
          publishedAt: new Date(),
          isDemo: true,
        },
      ],
    });
  }

  if (marketing && (await prisma.liveSession.count()) === 0) {
    const start = new Date(Date.now() + 3 * 24 * 3600 * 1000);
    start.setUTCHours(18, 0, 0, 0);
    await prisma.liveSession.create({
      data: {
        courseId: marketing.id,
        trainerId: marketing.trainerId,
        title: "Séance questions-réponses : WhatsApp Business (démonstration)",
        description: "Classe virtuelle de démonstration : questions des apprenants et analyse de profils WhatsApp Business.",
        startsAt: start,
        durationMinutes: 60,
        roomName: `nga-demo-${randomBytes(6).toString("hex")}`,
      },
    });
  }

  return log;
}
