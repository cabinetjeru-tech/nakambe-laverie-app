"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth/session";
import { courseAccess } from "@/lib/access";
import { submitQuizAttempt, type QuestionFeedback } from "@/lib/learning/quiz";
import { storeBuffer, readFileBuffer } from "@/lib/storage";
import { validateUpload } from "@/lib/uploads";
import { getTechnicalSettings } from "@/lib/settings";
import { aiStatus } from "@/lib/ai/llm";
import { reviewAssignment } from "@/lib/ai/grading";
import { checkQuota } from "@/lib/ai/quota";
import { notify } from "@/lib/notify";
import { rateLimit } from "@/lib/rate-limit";

export type QuizResult =
  | { ok: true; percent: number; passed: boolean; status: string; score: number; maxScore: number; feedback: QuestionFeedback[] }
  | { ok: false; error: string };

export async function submitQuizAction(quizId: string, answers: Record<string, unknown>): Promise<QuizResult> {
  const user = await requireUser();
  if (!rateLimit(`quiz:${user.id}`, 10, 60_000).ok) return { ok: false, error: "Trop de soumissions rapprochées." };
  const safe = z.record(z.union([z.string().max(6000), z.array(z.string().max(50)).max(20)])).safeParse(answers);
  if (!safe.success) return { ok: false, error: "Réponses invalides." };
  try {
    const a = await submitQuizAttempt(user, quizId, safe.data);
    revalidatePath("/espace", "layout");
    return { ok: true, percent: a.percent, passed: a.passed, status: a.status, score: a.score, maxScore: a.maxScore, feedback: a.feedback as QuestionFeedback[] };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}

export type SubmissionResult = { ok: true; message: string } | { ok: false; error: string };

export async function submitAssignmentAction(_: SubmissionResult | null, fd: FormData): Promise<SubmissionResult> {
  const user = await requireUser();
  if (!rateLimit(`assign:${user.id}`, 5, 60_000).ok) return { ok: false, error: "Trop de soumissions rapprochées." };
  const assignmentId = String(fd.get("assignmentId") ?? "");
  const text = String(fd.get("text") ?? "").trim().slice(0, 20000);
  const assignment = await prisma.assignment.findUnique({ where: { id: assignmentId }, include: { course: { select: { trainerId: true, title: true } } } });
  if (!assignment) return { ok: false, error: "Devoir introuvable." };
  if ((await courseAccess(user, assignment.courseId)) === "none") return { ok: false, error: "Accès refusé." };

  const tech = await getTechnicalSettings();
  const files = fd.getAll("files").filter((f): f is File => typeof f !== "string" && f.size > 0).slice(0, 6);
  if (!text && files.length === 0) return { ok: false, error: "Ajoutez un texte ou au moins un fichier." };
  if (files.length && !assignment.allowFiles) return { ok: false, error: "Ce devoir n'accepte pas de fichiers." };

  const stored: { id: string; mime: string }[] = [];
  for (const f of files) {
    const buf = Buffer.from(await f.arrayBuffer());
    const v = validateUpload(buf, f.name, "document", tech.maxUploadMb * 1024 * 1024);
    if (!v.ok) return { ok: false, error: `${f.name} : ${v.error}` };
    const sf = await storeBuffer({ buffer: buf, originalName: f.name, mimeType: v.mime, ownerId: user.id, visibility: "PRIVATE", folder: "submissions" });
    stored.push({ id: sf.id, mime: v.mime });
  }

  const submission = await prisma.submission.create({
    data: { assignmentId, userId: user.id, text: text || null, files: { create: stored.map((s) => ({ fileId: s.id })) } },
  });

  // Pré-correction IA (feedback immédiat) si un fournisseur est configuré et le quota le permet.
  let aiDone = false;
  const ai = await aiStatus();
  if (ai.chat && (await checkQuota(user, "TUTOR")).ok) {
    try {
      const images: { mediaType: "image/png"; data: string }[] = [];
      const pdfs: string[] = [];
      for (const s of stored) {
        const file = await prisma.storedFile.findUniqueOrThrow({ where: { id: s.id } });
        if (file.size > 5 * 1024 * 1024) continue;
        const b64 = (await readFileBuffer(file)).toString("base64");
        if (s.mime.startsWith("image/")) images.push({ mediaType: s.mime as "image/png", data: b64 });
        else if (s.mime === "application/pdf") pdfs.push(b64);
      }
      const review = await reviewAssignment({
        title: assignment.title,
        instructions: assignment.instructions,
        rubric: assignment.rubric as { criterion: string; points: number; description?: string }[],
        maxScore: assignment.maxScore,
        text: text || null,
        images,
        pdfs,
        userId: user.id,
      });
      const final = !assignment.requiresHumanValidation;
      await prisma.submission.update({
        where: { id: submission.id },
        data: {
          aiScore: review.total,
          aiFeedback: review as object,
          status: final ? "GRADED" : "AI_REVIEWED",
          ...(final ? { finalScore: review.total, passed: review.total >= assignment.passingScore, gradedAt: new Date() } : {}),
        },
      });
      if (review.improvements.length) {
        await prisma.learningGap.createMany({
          data: review.improvements.slice(0, 3).map((i) => ({ userId: user.id, courseId: assignment.courseId, lessonId: assignment.lessonId, topic: i.slice(0, 180), detail: `Devoir « ${assignment.title} »`, source: "ASSIGNMENT" })),
        });
      }
      aiDone = true;
    } catch (e) {
      console.error("[devoir] pré-correction IA impossible :", (e as Error).message);
    }
  }
  if (assignment.requiresHumanValidation || !aiDone) {
    await notify(assignment.course.trainerId, { type: "GRADING", title: "Nouveau devoir à corriger", body: `${user.name} a rendu « ${assignment.title} » (${assignment.course.title}).`, link: "/formateur/corrections" });
  }
  revalidatePath("/espace", "layout");
  return {
    ok: true,
    message: aiDone
      ? assignment.requiresHumanValidation
        ? "Travail envoyé. Un premier retour de l'IA est disponible ci-dessous ; la note définitive sera attribuée par votre formateur."
        : "Travail envoyé et évalué. Consultez le retour détaillé ci-dessous."
      : "Travail envoyé. Votre formateur le corrigera prochainement.",
  };
}
