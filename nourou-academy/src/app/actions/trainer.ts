"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import type { GeneratedKind, Prisma } from "@prisma/client";
import { randomBytes } from "node:crypto";
import { prisma } from "@/lib/db";
import { requirePermission, requireUser, type SessionUser } from "@/lib/auth/session";
import { canManageCourse } from "@/lib/access";
import { can } from "@/lib/permissions";
import { slugify } from "@/lib/format";
import { audit } from "@/lib/audit";
import { notify } from "@/lib/notify";
import { indexLesson, ingestDocument } from "@/lib/rag/ingest";
import { deleteStoredFile } from "@/lib/storage";
import { evaluateCertificate } from "@/lib/certificates/issue";
import { saveLessonProgress } from "@/lib/learning/progress";
import { generateContent, generatorKinds, type GeneratedProgram, type GeneratedQuiz } from "@/lib/ai/generator";
import { checkQuota } from "@/lib/ai/quota";
import { AiUnavailableError } from "@/lib/ai/llm";
import { formBool, formInt, formLines, formString, zodErrors, type ActionState } from "@/lib/validation";

/** Utilisateur connecté ; l'autorisation fine est vérifiée par formation (canManageCourse). */
async function trainer(): Promise<SessionUser> {
  return requireUser();
}

async function assertCourse(user: SessionUser, courseId: string) {
  if (!(await canManageCourse(user, courseId))) throw new Error("Action non autorisée sur cette formation.");
}

async function courseIdOfLesson(lessonId: string) {
  const l = await prisma.lesson.findUnique({ where: { id: lessonId }, select: { module: { select: { courseId: true } } } });
  if (!l) throw new Error("Leçon introuvable.");
  return l.module.courseId;
}

function refresh(courseId: string) {
  revalidatePath(`/formateur/formations/${courseId}`, "layout");
}

async function uniqueSlug(title: string, excludeId?: string) {
  const base = slugify(title) || "formation";
  let slug = base;
  for (let i = 2; await prisma.course.findFirst({ where: { slug, ...(excludeId ? { id: { not: excludeId } } : {}) } }); i++) slug = `${base}-${i}`;
  return slug;
}

// ───────────────────────────── Formation : informations ─────────────────────────────

const courseSchema = z.object({
  title: z.string().trim().min(5, "Titre trop court.").max(150),
  subtitle: z.string().trim().max(250).optional(),
  description: z.string().trim().min(30, "Description trop courte (30 caractères minimum).").max(10000),
  categoryId: z.string().optional(),
  level: z.enum(["BEGINNER", "INTERMEDIATE", "ADVANCED"]),
  priceXof: z.number().int().min(0).max(10_000_000),
  isFree: z.boolean(),
  includedInSubscription: z.boolean(),
  modality: z.string().trim().max(200),
  objectives: z.array(z.string().max(300)),
  prerequisites: z.array(z.string().max(300)),
  targetAudience: z.array(z.string().max(300)),
});

function readCourse(fd: FormData) {
  return courseSchema.safeParse({
    title: formString(fd, "title"),
    subtitle: formString(fd, "subtitle") || undefined,
    description: formString(fd, "description"),
    categoryId: formString(fd, "categoryId") || undefined,
    level: formString(fd, "level") || "BEGINNER",
    priceXof: formInt(fd, "priceXof"),
    isFree: formBool(fd, "isFree"),
    includedInSubscription: formBool(fd, "includedInSubscription"),
    modality: formString(fd, "modality") || "100 % en ligne, à votre rythme",
    objectives: formLines(fd, "objectives"),
    prerequisites: formLines(fd, "prerequisites"),
    targetAudience: formLines(fd, "targetAudience"),
  });
}

export async function createCourseAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const user = await trainer();
  if (!can(user.role, "trainer.access")) return { error: "Action réservée aux formateurs." };
  const parsed = readCourse(fd);
  if (!parsed.success) return zodErrors(parsed.error);
  const course = await prisma.course.create({
    data: { ...parsed.data, priceXof: parsed.data.isFree ? 0 : parsed.data.priceXof, slug: await uniqueSlug(parsed.data.title), trainerId: user.id, status: "DRAFT" },
  });
  await audit(user.id, "course.create", "Course", course.id);
  redirect(`/formateur/formations/${course.id}?onglet=programme`);
}

export async function updateCourseAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const user = await trainer();
  const courseId = formString(fd, "courseId");
  await assertCourse(user, courseId);
  const parsed = readCourse(fd);
  if (!parsed.success) return zodErrors(parsed.error);
  const before = await prisma.course.findUniqueOrThrow({ where: { id: courseId } });
  await prisma.course.update({
    where: { id: courseId },
    data: {
      ...parsed.data,
      priceXof: parsed.data.isFree ? 0 : parsed.data.priceXof,
      slug: before.status === "PUBLISHED" ? before.slug : await uniqueSlug(parsed.data.title, courseId),
    },
  });
  if (before.priceXof !== parsed.data.priceXof || before.isFree !== parsed.data.isFree) {
    await audit(user.id, "course.price", "Course", courseId, { from: before.priceXof, to: parsed.data.priceXof, isFree: parsed.data.isFree });
  }
  refresh(courseId);
  return { ok: true, message: "Formation enregistrée." };
}

export async function updateCertificateCriteriaAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const user = await trainer();
  const courseId = formString(fd, "courseId");
  await assertCourse(user, courseId);
  const pct = (k: string, d: number) => Math.min(100, Math.max(0, formInt(fd, k, d)));
  await prisma.course.update({
    where: { id: courseId },
    data: {
      hasCertificate: formBool(fd, "hasCertificate"),
      certMinProgress: pct("certMinProgress", 100),
      certMinExamScore: pct("certMinExamScore", 70),
      certRequireProjects: formBool(fd, "certRequireProjects"),
      certMinAttendance: pct("certMinAttendance", 0),
      certRequireHumanApproval: formBool(fd, "certRequireHumanApproval"),
    },
  });
  refresh(courseId);
  return { ok: true, message: "Critères du certificat enregistrés." };
}

/** Workflow : brouillon → soumission → validation par l'administration → publication → archivage. */
export async function submitCourseForReviewAction(courseId: string) {
  const user = await trainer();
  await assertCourse(user, courseId);
  const course = await prisma.course.findUniqueOrThrow({ where: { id: courseId }, include: { _count: { select: { modules: true } } } });
  const lessons = await prisma.lesson.count({ where: { module: { courseId } } });
  if (lessons === 0) return;
  if (course.status !== "DRAFT" && course.status !== "REJECTED") return;
  await prisma.course.update({ where: { id: courseId }, data: { status: "SUBMITTED", submittedAt: new Date(), reviewNote: null } });
  const admins = await prisma.user.findMany({ where: { role: { in: ["SUPERADMIN", "ADMIN"] }, status: "ACTIVE" }, select: { id: true } });
  for (const a of admins) await notify(a.id, { type: "REVIEW", title: "Formation à valider", body: `« ${course.title} » a été soumise par ${user.name}.`, link: "/admin/formations?statut=SUBMITTED" });
  await audit(user.id, "course.submit", "Course", courseId);
  refresh(courseId);
}

export async function withdrawCourseAction(courseId: string) {
  const user = await trainer();
  await assertCourse(user, courseId);
  await prisma.course.updateMany({ where: { id: courseId, status: "SUBMITTED" }, data: { status: "DRAFT" } });
  refresh(courseId);
}

export async function archiveCourseAction(courseId: string) {
  const user = await trainer();
  await assertCourse(user, courseId);
  await prisma.course.update({ where: { id: courseId }, data: { status: "ARCHIVED" } });
  await audit(user.id, "course.archive", "Course", courseId);
  refresh(courseId);
}

// ───────────────────────────── Programme : modules et leçons ─────────────────────────────

export async function addModuleAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const user = await trainer();
  const courseId = formString(fd, "courseId");
  await assertCourse(user, courseId);
  const title = formString(fd, "title").trim();
  if (title.length < 2) return { error: "Titre du module requis." };
  const count = await prisma.module.count({ where: { courseId } });
  await prisma.module.create({ data: { courseId, title: title.slice(0, 200), position: count } });
  refresh(courseId);
  return { ok: true };
}

export async function renameModuleAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const user = await trainer();
  const moduleId = formString(fd, "moduleId");
  const mod = await prisma.module.findUniqueOrThrow({ where: { id: moduleId } });
  await assertCourse(user, mod.courseId);
  await prisma.module.update({ where: { id: moduleId }, data: { title: formString(fd, "title").trim().slice(0, 200) || mod.title } });
  refresh(mod.courseId);
  return { ok: true };
}

export async function deleteModuleAction(moduleId: string) {
  const user = await trainer();
  const mod = await prisma.module.findUniqueOrThrow({ where: { id: moduleId } });
  await assertCourse(user, mod.courseId);
  await prisma.module.delete({ where: { id: moduleId } });
  refresh(mod.courseId);
}

async function swapPositions<T extends { id: string; position: number }>(items: T[], id: string, dir: -1 | 1, update: (id: string, position: number) => Promise<unknown>) {
  const sorted = [...items].sort((a, b) => a.position - b.position);
  const i = sorted.findIndex((x) => x.id === id);
  const j = i + dir;
  if (i < 0 || j < 0 || j >= sorted.length) return;
  [sorted[i], sorted[j]] = [sorted[j]!, sorted[i]!];
  await Promise.all(sorted.map((x, idx) => update(x.id, idx)));
}

export async function moveModuleAction(moduleId: string, dir: -1 | 1) {
  const user = await trainer();
  const mod = await prisma.module.findUniqueOrThrow({ where: { id: moduleId } });
  await assertCourse(user, mod.courseId);
  const all = await prisma.module.findMany({ where: { courseId: mod.courseId }, select: { id: true, position: true } });
  await swapPositions(all, moduleId, dir, (id, position) => prisma.module.update({ where: { id }, data: { position } }));
  refresh(mod.courseId);
}

const lessonTypes = ["VIDEO", "TEXT", "DOCUMENT", "QUIZ", "ASSIGNMENT", "LIVE"] as const;

export async function addLessonAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const user = await trainer();
  const moduleId = formString(fd, "moduleId");
  const mod = await prisma.module.findUniqueOrThrow({ where: { id: moduleId } });
  await assertCourse(user, mod.courseId);
  const title = formString(fd, "title").trim();
  const type = z.enum(lessonTypes).safeParse(formString(fd, "type"));
  if (title.length < 2 || !type.success) return { error: "Titre et type de leçon requis." };
  const count = await prisma.lesson.count({ where: { moduleId } });
  const lesson = await prisma.lesson.create({ data: { moduleId, title: title.slice(0, 200), type: type.data, position: count } });
  if (type.data === "QUIZ") await prisma.quiz.create({ data: { courseId: mod.courseId, lessonId: lesson.id, title } });
  if (type.data === "ASSIGNMENT") await prisma.assignment.create({ data: { courseId: mod.courseId, lessonId: lesson.id, title, instructions: "Consignes à rédiger." } });
  refresh(mod.courseId);
  return { ok: true };
}

export async function moveLessonAction(lessonId: string, dir: -1 | 1) {
  const user = await trainer();
  const lesson = await prisma.lesson.findUniqueOrThrow({ where: { id: lessonId }, include: { module: true } });
  await assertCourse(user, lesson.module.courseId);
  const all = await prisma.lesson.findMany({ where: { moduleId: lesson.moduleId }, select: { id: true, position: true } });
  await swapPositions(all, lessonId, dir, (id, position) => prisma.lesson.update({ where: { id }, data: { position } }));
  refresh(lesson.module.courseId);
}

export async function deleteLessonAction(lessonId: string) {
  const user = await trainer();
  const courseId = await courseIdOfLesson(lessonId);
  await assertCourse(user, courseId);
  await prisma.lesson.delete({ where: { id: lessonId } });
  refresh(courseId);
  redirect(`/formateur/formations/${courseId}?onglet=programme`);
}

const lessonSchema = z.object({
  title: z.string().trim().min(2).max(200),
  content: z.string().max(100_000).optional(),
  videoUrl: z.string().trim().url("URL de vidéo invalide.").max(500).optional().or(z.literal("")),
  durationMinutes: z.number().int().min(0).max(1000),
  isPreview: z.boolean(),
});

export async function updateLessonAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const user = await trainer();
  const lessonId = formString(fd, "lessonId");
  const courseId = await courseIdOfLesson(lessonId);
  await assertCourse(user, courseId);
  const parsed = lessonSchema.safeParse({
    title: formString(fd, "title"),
    content: formString(fd, "content"),
    videoUrl: formString(fd, "videoUrl"),
    durationMinutes: formInt(fd, "durationMinutes"),
    isPreview: formBool(fd, "isPreview"),
  });
  if (!parsed.success) return zodErrors(parsed.error);
  await prisma.lesson.update({ where: { id: lessonId }, data: { ...parsed.data, videoUrl: parsed.data.videoUrl || null, content: parsed.data.content || null } });
  const total = await prisma.lesson.aggregate({ where: { module: { courseId } }, _sum: { durationMinutes: true } });
  await prisma.course.update({ where: { id: courseId }, data: { durationMinutes: total._sum.durationMinutes ?? 0 } });
  // Le texte de la leçon alimente la base de connaissances du tuteur IA.
  await indexLesson(lessonId, user.id);
  refresh(courseId);
  return { ok: true, message: "Leçon enregistrée et indexée pour le tuteur IA." };
}

export async function deleteAssetAction(assetId: string) {
  const user = await trainer();
  const asset = await prisma.lessonAsset.findUniqueOrThrow({ where: { id: assetId }, include: { lesson: { select: { module: { select: { courseId: true } } } } } });
  await assertCourse(user, asset.lesson.module.courseId);
  await prisma.knowledgeDocument.deleteMany({ where: { fileId: asset.fileId } });
  await deleteStoredFile(asset.fileId);
  refresh(asset.lesson.module.courseId);
}

// ───────────────────────────── Quiz ─────────────────────────────

export async function updateQuizSettingsAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const user = await trainer();
  const quiz = await prisma.quiz.findUniqueOrThrow({ where: { id: formString(fd, "quizId") } });
  await assertCourse(user, quiz.courseId);
  await prisma.quiz.update({
    where: { id: quiz.id },
    data: {
      title: formString(fd, "title").trim().slice(0, 200) || quiz.title,
      passingScore: Math.min(100, Math.max(0, formInt(fd, "passingScore", 70))),
      maxAttempts: Math.max(0, formInt(fd, "maxAttempts", 0)),
      isFinalExam: formBool(fd, "isFinalExam"),
      requiresHumanValidation: formBool(fd, "requiresHumanValidation"),
    },
  });
  refresh(quiz.courseId);
  return { ok: true, message: "Paramètres du quiz enregistrés." };
}

export async function addQuestionAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const user = await trainer();
  const quiz = await prisma.quiz.findUniqueOrThrow({ where: { id: formString(fd, "quizId") }, include: { _count: { select: { questions: true } } } });
  await assertCourse(user, quiz.courseId);
  const type = z.enum(["SINGLE", "MULTIPLE", "TRUE_FALSE", "SHORT", "OPEN"]).safeParse(formString(fd, "type"));
  const prompt = formString(fd, "prompt").trim();
  if (!type.success || prompt.length < 3) return { error: "Type et énoncé requis." };
  let options: { id: string; text: string }[] = [];
  let correct: string[] = [];
  if (type.data === "TRUE_FALSE") {
    options = [{ id: "o0", text: "Vrai" }, { id: "o1", text: "Faux" }];
    correct = [formString(fd, "tf") === "false" ? "o1" : "o0"];
  } else if (type.data === "SINGLE" || type.data === "MULTIPLE") {
    const lines = formLines(fd, "options");
    if (lines.length < 2) return { error: "Au moins deux options. Préfixez les bonnes réponses par *" };
    options = lines.map((l, i) => ({ id: `o${i}`, text: l.replace(/^\*\s*/, "") }));
    correct = lines.map((l, i) => (l.startsWith("*") ? `o${i}` : null)).filter((x): x is string => !!x);
    if (correct.length === 0) return { error: "Indiquez la ou les bonnes réponses en les préfixant par *" };
    if (type.data === "SINGLE" && correct.length > 1) return { error: "Une seule bonne réponse pour un choix unique." };
  } else {
    correct = formLines(fd, "expected");
    if (type.data === "SHORT" && correct.length === 0) return { error: "Indiquez au moins une réponse acceptée." };
  }
  await prisma.question.create({
    data: {
      quizId: quiz.id,
      type: type.data,
      prompt: prompt.slice(0, 3000),
      options: options as Prisma.InputJsonValue,
      correctAnswers: correct as Prisma.InputJsonValue,
      rubric: formString(fd, "rubric").slice(0, 3000) || null,
      explanation: formString(fd, "explanation").slice(0, 3000) || null,
      topic: formString(fd, "topic").slice(0, 150) || null,
      points: Math.min(100, Math.max(1, formInt(fd, "points", 1))),
      position: quiz._count.questions,
    },
  });
  refresh(quiz.courseId);
  return { ok: true, message: "Question ajoutée." };
}

export async function deleteQuestionAction(questionId: string) {
  const user = await trainer();
  const q = await prisma.question.findUniqueOrThrow({ where: { id: questionId }, include: { quiz: true } });
  await assertCourse(user, q.quiz.courseId);
  await prisma.question.delete({ where: { id: questionId } });
  refresh(q.quiz.courseId);
}

// ───────────────────────────── Devoirs ─────────────────────────────

export async function updateAssignmentAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const user = await trainer();
  const a = await prisma.assignment.findUniqueOrThrow({ where: { id: formString(fd, "assignmentId") } });
  await assertCourse(user, a.courseId);
  // Barème : une ligne par critère, au format « Critère | points | description »
  const rubric = formLines(fd, "rubric").map((l) => {
    const [criterion, points, description] = l.split("|").map((x) => x.trim());
    return { criterion: criterion ?? "", points: Math.max(0, Number(points) || 0), description: description ?? "" };
  }).filter((r) => r.criterion);
  const maxScore = rubric.reduce((s, r) => s + r.points, 0) || Math.max(1, formInt(fd, "maxScore", 20));
  await prisma.assignment.update({
    where: { id: a.id },
    data: {
      title: formString(fd, "title").trim().slice(0, 200) || a.title,
      instructions: formString(fd, "instructions").slice(0, 10000),
      rubric: rubric as Prisma.InputJsonValue,
      maxScore,
      passingScore: Math.min(maxScore, Math.max(0, formInt(fd, "passingScore", Math.ceil(maxScore / 2)))),
      allowFiles: formBool(fd, "allowFiles"),
      isProject: formBool(fd, "isProject"),
      requiresHumanValidation: formBool(fd, "requiresHumanValidation"),
    },
  });
  refresh(a.courseId);
  return { ok: true, message: "Devoir enregistré." };
}

// ───────────────────────────── Corrections ─────────────────────────────

export async function gradeSubmissionAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const user = await requirePermission("grading.access");
  const sub = await prisma.submission.findUniqueOrThrow({ where: { id: formString(fd, "submissionId") }, include: { assignment: true } });
  if (!(await canManageCourse(user, sub.assignment.courseId)) && !["ASSISTANT"].includes(user.role)) return { error: "Action non autorisée." };
  const score = Number(formString(fd, "score").replace(",", "."));
  if (!Number.isFinite(score) || score < 0 || score > sub.assignment.maxScore) return { error: `Note entre 0 et ${sub.assignment.maxScore}.` };
  const returned = formString(fd, "decision") === "return";
  await prisma.submission.update({
    where: { id: sub.id },
    data: {
      finalScore: returned ? null : score,
      passed: returned ? false : score >= sub.assignment.passingScore,
      status: returned ? "RETURNED" : "GRADED",
      trainerFeedback: formString(fd, "feedback").slice(0, 5000) || null,
      gradedById: user.id,
      gradedAt: new Date(),
    },
  });
  if (!returned && score >= sub.assignment.passingScore && sub.assignment.lessonId) await saveLessonProgress(sub.userId, sub.assignment.lessonId, { completed: true });
  await notify(sub.userId, {
    type: "GRADING",
    title: returned ? "Travail à reprendre" : "Votre devoir a été noté",
    body: returned ? `Votre formateur vous demande de reprendre « ${sub.assignment.title} ».` : `« ${sub.assignment.title} » : ${score} / ${sub.assignment.maxScore}.`,
    link: "/espace/resultats",
    email: true,
  });
  await evaluateCertificate(sub.userId, sub.assignment.courseId);
  await audit(user.id, "submission.grade", "Submission", sub.id, { score, returned });
  revalidatePath("/formateur/corrections");
  return { ok: true, message: "Correction enregistrée." };
}

export async function validateAttemptAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const user = await requirePermission("grading.access");
  const attempt = await prisma.quizAttempt.findUniqueOrThrow({ where: { id: formString(fd, "attemptId") }, include: { quiz: { include: { questions: true } } } });
  if (!(await canManageCourse(user, attempt.quiz.courseId)) && user.role !== "ASSISTANT") return { error: "Action non autorisée." };
  const feedback = (attempt.feedback as { questionId: string; score: number; max: number; correct: boolean | null; feedback?: string; pendingHuman?: boolean }[]).map((f) => {
    const raw = fd.get(`score_${f.questionId}`);
    if (raw === null) return f;
    const s = Math.max(0, Math.min(f.max, Number(String(raw).replace(",", ".")) || 0));
    const comment = formString(fd, `comment_${f.questionId}`);
    return { ...f, score: s, correct: s >= f.max * 0.5, pendingHuman: false, feedback: comment || f.feedback };
  });
  const score = feedback.reduce((s, f) => s + f.score, 0);
  const max = feedback.reduce((s, f) => s + f.max, 0);
  const percent = max ? Math.round((score / max) * 100) : 0;
  const passed = percent >= attempt.quiz.passingScore;
  await prisma.quizAttempt.update({
    where: { id: attempt.id },
    data: { feedback: feedback as Prisma.InputJsonValue, score, maxScore: max, percent, passed, status: "VALIDATED", gradedById: user.id, reviewedAt: new Date(), reviewNote: formString(fd, "reviewNote").slice(0, 2000) || null },
  });
  if (passed && attempt.quiz.lessonId) await saveLessonProgress(attempt.userId, attempt.quiz.lessonId, { completed: true });
  await notify(attempt.userId, { type: "GRADING", title: "Évaluation validée", body: `« ${attempt.quiz.title} » : ${percent} % (${passed ? "réussie" : "non réussie"}).`, link: "/espace/resultats", email: true });
  await evaluateCertificate(attempt.userId, attempt.quiz.courseId);
  await audit(user.id, "attempt.validate", "QuizAttempt", attempt.id, { percent });
  revalidatePath("/formateur/corrections");
  return { ok: true, message: "Copie validée." };
}

// ───────────────────────────── Base de connaissances (RAG) ─────────────────────────────

export async function reindexDocumentAction(documentId: string) {
  const user = await trainer();
  const doc = await prisma.knowledgeDocument.findUniqueOrThrow({ where: { id: documentId } });
  await assertCourse(user, doc.courseId);
  await ingestDocument(doc.id);
  refresh(doc.courseId);
}

export async function reindexCourseAction(courseId: string) {
  const user = await trainer();
  await assertCourse(user, courseId);
  const lessons = await prisma.lesson.findMany({ where: { module: { courseId } }, select: { id: true } });
  for (const l of lessons) await indexLesson(l.id, user.id);
  const files = await prisma.knowledgeDocument.findMany({ where: { courseId, sourceType: "FILE" }, select: { id: true } });
  for (const f of files) await ingestDocument(f.id);
  refresh(courseId);
}

export async function deleteDocumentAction(documentId: string) {
  const user = await trainer();
  const doc = await prisma.knowledgeDocument.findUniqueOrThrow({ where: { id: documentId } });
  await assertCourse(user, doc.courseId);
  await prisma.knowledgeDocument.delete({ where: { id: documentId } });
  const stillUsed = doc.fileId ? await prisma.lessonAsset.count({ where: { fileId: doc.fileId } }) : 1;
  if (doc.fileId && stillUsed === 0) await deleteStoredFile(doc.fileId);
  refresh(doc.courseId);
}

// ───────────────────────────── Classes virtuelles ─────────────────────────────

const liveSchema = z.object({
  title: z.string().trim().min(3).max(200),
  description: z.string().trim().max(2000).optional(),
  courseId: z.string().optional(),
  startsAt: z.string().min(10),
  durationMinutes: z.number().int().min(15).max(480),
  provider: z.enum(["jitsi", "external"]),
  externalUrl: z.string().trim().url().max(500).optional().or(z.literal("")),
  capacity: z.number().int().min(0).max(10000),
});

export async function createLiveAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const user = await trainer();
  const parsed = liveSchema.safeParse({
    title: formString(fd, "title"),
    description: formString(fd, "description") || undefined,
    courseId: formString(fd, "courseId") || undefined,
    startsAt: formString(fd, "startsAt"),
    durationMinutes: formInt(fd, "durationMinutes", 60),
    provider: formString(fd, "provider") || "jitsi",
    externalUrl: formString(fd, "externalUrl"),
    capacity: formInt(fd, "capacity", 0),
  });
  if (!parsed.success) return zodErrors(parsed.error);
  if (parsed.data.courseId) await assertCourse(user, parsed.data.courseId);
  else if (!can(user.role, "live.manage_all")) return { error: "Choisissez une de vos formations." };
  // Heure saisie en heure de Ouagadougou (UTC+0).
  const startsAt = new Date(`${parsed.data.startsAt}:00Z`);
  if (Number.isNaN(startsAt.getTime())) return { error: "Date invalide." };
  if (parsed.data.provider === "external" && !parsed.data.externalUrl) return { error: "Lien de visioconférence requis." };
  const s = await prisma.liveSession.create({
    data: {
      title: parsed.data.title,
      description: parsed.data.description,
      courseId: parsed.data.courseId ?? null,
      trainerId: user.id,
      startsAt,
      durationMinutes: parsed.data.durationMinutes,
      provider: parsed.data.provider,
      externalUrl: parsed.data.externalUrl || null,
      capacity: parsed.data.capacity || null,
      roomName: `nga-${slugify(parsed.data.title).slice(0, 30)}-${randomBytes(5).toString("hex")}`,
    },
  });
  if (s.courseId) {
    const learners = await prisma.enrollment.findMany({ where: { courseId: s.courseId, status: "ACTIVE" }, select: { userId: true } });
    for (const l of learners) await notify(l.userId, { type: "LIVE", title: "Nouvelle classe virtuelle", body: `« ${s.title} » est programmée. Inscrivez-vous depuis votre planning.`, link: "/espace/planning" });
  }
  revalidatePath("/formateur/classes");
  return { ok: true, message: "Séance programmée et apprenants notifiés." };
}

async function assertLive(user: SessionUser, id: string) {
  const s = await prisma.liveSession.findUniqueOrThrow({ where: { id } });
  if (s.trainerId !== user.id && !can(user.role, "live.manage_all")) throw new Error("Action non autorisée.");
  return s;
}

export async function setLiveStatusAction(id: string, status: "LIVE" | "ENDED" | "CANCELED") {
  const user = await trainer();
  const s = await assertLive(user, id);
  await prisma.liveSession.update({ where: { id }, data: { status } });
  if (status === "CANCELED") {
    const regs = await prisma.liveRegistration.findMany({ where: { sessionId: id }, select: { userId: true } });
    for (const r of regs) await notify(r.userId, { type: "LIVE", title: "Classe annulée", body: `La séance « ${s.title} » est annulée.`, link: "/espace/planning", email: true });
  }
  revalidatePath("/formateur/classes");
}

export async function updateLiveRecordingAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const user = await trainer();
  const s = await assertLive(user, formString(fd, "sessionId"));
  const url = formString(fd, "recordingUrl").trim();
  if (url && !/^https:\/\//.test(url)) return { error: "Le lien du replay doit commencer par https://" };
  await prisma.liveSession.update({ where: { id: s.id }, data: { recordingUrl: url || null } });
  revalidatePath("/formateur/classes");
  return { ok: true, message: "Replay enregistré." };
}

export async function toggleAttendanceAction(sessionId: string, userId: string) {
  const user = await trainer();
  await assertLive(user, sessionId);
  const r = await prisma.liveRegistration.findUnique({ where: { sessionId_userId: { sessionId, userId } } });
  if (r) await prisma.liveRegistration.update({ where: { sessionId_userId: { sessionId, userId } }, data: { attended: !r.attended } });
  revalidatePath(`/formateur/classes/${sessionId}`);
}

// ───────────────────────────── Assistant pédagogique IA ─────────────────────────────

export async function generateContentAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const user = await trainer();
  if (!can(user.role, "trainer.access")) return { error: "Réservé aux formateurs." };
  const kind = formString(fd, "kind") as GeneratedKind;
  if (!(kind in generatorKinds)) return { error: "Type de contenu inconnu." };
  const brief = formString(fd, "brief").trim();
  if (brief.length < 15) return { error: "Décrivez votre besoin en quelques phrases (15 caractères minimum)." };
  const courseId = formString(fd, "courseId") || null;
  let context = "";
  let level = "Débutant";
  if (courseId) {
    await assertCourse(user, courseId);
    const c = await prisma.course.findUniqueOrThrow({ where: { id: courseId }, include: { modules: { orderBy: { position: "asc" }, include: { lessons: { orderBy: { position: "asc" }, select: { title: true, content: true } } } } } });
    level = { BEGINNER: "Débutant", INTERMEDIATE: "Intermédiaire", ADVANCED: "Avancé" }[c.level];
    context = `Titre : ${c.title}\nObjectifs : ${c.objectives.join(" ; ")}\nPublic : ${c.targetAudience.join(", ")}\nProgramme actuel :\n${c.modules.map((m) => `- ${m.title} : ${m.lessons.map((l) => l.title).join(", ")}`).join("\n")}`;
    const lessonTitle = formString(fd, "lessonTitle");
    const ref = c.modules.flatMap((m) => m.lessons).find((l) => l.title === lessonTitle);
    if (ref?.content) context += `\n\nContenu de la leçon de référence « ${ref.title} » :\n${ref.content.slice(0, 6000)}`;
  }
  const quota = await checkQuota(user, "GENERATOR");
  if (!quota.ok) return { error: quota.message };
  let rowId: string;
  try {
    const content = await generateContent({ kind, brief, courseContext: context, level: formString(fd, "level") || level, userId: user.id });
    const row = await prisma.generatedContent.create({
      data: { trainerId: user.id, courseId, kind, title: formString(fd, "title").trim().slice(0, 200) || `${generatorKinds[kind].label} — ${new Date().toLocaleDateString("fr-FR")}`, brief, content },
    });
    rowId = row.id;
  } catch (e) {
    if (e instanceof AiUnavailableError) return { error: e.message };
    console.error("[generateur]", (e as Error).message);
    return { error: "La génération a échoué. Réessayez ou reformulez votre demande." };
  }
  revalidatePath("/formateur/assistant-ia");
  redirect(`/formateur/assistant-ia/${rowId}`);
}

export async function updateGeneratedAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const user = await trainer();
  const g = await prisma.generatedContent.findFirst({ where: { id: formString(fd, "id"), trainerId: user.id } });
  if (!g) return { error: "Contenu introuvable." };
  const content = formString(fd, "content");
  if (g.kind === "QUIZ" || g.kind === "COURSE_PLAN" || g.kind === "PROGRAM") {
    try {
      JSON.parse(content);
    } catch {
      return { error: "Le contenu doit rester au format JSON valide." };
    }
  }
  const validate = formString(fd, "intent") === "validate";
  await prisma.generatedContent.update({ where: { id: g.id }, data: { content: content.slice(0, 200_000), title: formString(fd, "title").slice(0, 200) || g.title, status: validate ? "VALIDATED" : g.status === "PUBLISHED" ? "PUBLISHED" : "DRAFT" } });
  revalidatePath(`/formateur/assistant-ia/${g.id}`);
  return { ok: true, message: validate ? "Contenu validé : vous pouvez maintenant le publier dans une formation." : "Modifications enregistrées." };
}

/** Publication d'un contenu validé dans une formation (création de leçons, quiz ou modules). */
export async function publishGeneratedAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const user = await trainer();
  const g = await prisma.generatedContent.findFirst({ where: { id: formString(fd, "id"), trainerId: user.id } });
  if (!g) return { error: "Contenu introuvable." };
  if (g.status !== "VALIDATED") return { error: "Relisez puis validez le contenu avant de le publier." };
  const courseId = formString(fd, "courseId");
  await assertCourse(user, courseId);
  const moduleId = formString(fd, "moduleId");

  if (g.kind === "COURSE_PLAN" || g.kind === "PROGRAM") {
    const program = JSON.parse(g.content) as GeneratedProgram;
    const start = await prisma.module.count({ where: { courseId } });
    for (const [mi, m] of program.modules.entries()) {
      const mod = await prisma.module.create({ data: { courseId, title: m.title.slice(0, 200), description: m.description, position: start + mi } });
      for (const [li, l] of m.lessons.entries()) {
        const lesson = await prisma.lesson.create({ data: { moduleId: mod.id, title: l.title.slice(0, 200), type: l.type, content: `## Objectif\n${l.summary}\n\n_(Contenu à rédiger par le formateur.)_`, durationMinutes: l.durationMinutes || 0, position: li } });
        if (l.type === "QUIZ") await prisma.quiz.create({ data: { courseId, lessonId: lesson.id, title: l.title } });
        if (l.type === "ASSIGNMENT") await prisma.assignment.create({ data: { courseId, lessonId: lesson.id, title: l.title, instructions: l.summary } });
      }
    }
    const course = await prisma.course.findUniqueOrThrow({ where: { id: courseId } });
    if (course.objectives.length === 0 && program.objectives.length) await prisma.course.update({ where: { id: courseId }, data: { objectives: program.objectives.slice(0, 12), prerequisites: course.prerequisites.length ? course.prerequisites : program.prerequisites.slice(0, 10) } });
  } else {
    const mod = await prisma.module.findFirst({ where: { id: moduleId, courseId } });
    if (!mod) return { error: "Choisissez le module de destination." };
    const position = await prisma.lesson.count({ where: { moduleId: mod.id } });
    if (g.kind === "QUIZ") {
      const quiz = JSON.parse(g.content) as GeneratedQuiz;
      const lesson = await prisma.lesson.create({ data: { moduleId: mod.id, title: quiz.title || g.title, type: "QUIZ", position } });
      await prisma.quiz.create({
        data: {
          courseId,
          lessonId: lesson.id,
          title: quiz.title || g.title,
          questions: {
            create: quiz.questions.map((q, i) => ({
              type: q.type,
              prompt: q.prompt,
              options: (q.type === "OPEN" ? [] : q.options.map((t, oi) => ({ id: `o${oi}`, text: t }))) as Prisma.InputJsonValue,
              correctAnswers: (q.type === "OPEN" ? [] : q.correct.map((ci) => `o${ci}`)) as Prisma.InputJsonValue,
              explanation: q.explanation || null,
              rubric: q.rubric || null,
              points: Math.max(1, q.points || 1),
              position: i,
            })),
          },
        },
      });
    } else {
      const lesson = await prisma.lesson.create({ data: { moduleId: mod.id, title: g.title.slice(0, 200), type: "TEXT", content: g.content, position } });
      await indexLesson(lesson.id, user.id);
    }
  }
  await prisma.generatedContent.update({ where: { id: g.id }, data: { status: "PUBLISHED", courseId, publishedRef: courseId } });
  await audit(user.id, "generator.publish", "GeneratedContent", g.id, { courseId, kind: g.kind });
  refresh(courseId);
  return { ok: true, message: "Contenu ajouté à la formation. Pensez à le relire dans l'éditeur de leçon." };
}

export async function discardGeneratedAction(id: string) {
  const user = await trainer();
  await prisma.generatedContent.updateMany({ where: { id, trainerId: user.id }, data: { status: "DISCARDED" } });
  revalidatePath("/formateur/assistant-ia");
  redirect("/formateur/assistant-ia");
}
