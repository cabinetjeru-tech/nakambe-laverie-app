"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth/session";
import { courseAccess, hasActiveSubscription, lessonAccess } from "@/lib/access";
import { saveLessonProgress } from "@/lib/learning/progress";
import { evaluateCertificate } from "@/lib/certificates/issue";
import { formString, zodErrors, type ActionState } from "@/lib/validation";

/** Inscription à une formation gratuite, ou incluse dans l'abonnement actif. */
export async function enrollAction(courseId: string) {
  const user = await requireUser();
  const course = await prisma.course.findFirst({ where: { id: courseId, status: "PUBLISHED" } });
  if (!course) redirect("/formations");
  const free = course.isFree || course.priceXof === 0;
  const viaSub = !free && course.includedInSubscription && (await hasActiveSubscription(user.id));
  if (!free && !viaSub) redirect(`/paiement/commande?type=COURSE&id=${course.id}`);
  await prisma.enrollment.upsert({
    where: { userId_courseId: { userId: user.id, courseId } },
    create: { userId: user.id, courseId, source: free ? "FREE" : "SUBSCRIPTION" },
    update: { status: "ACTIVE" },
  });
  redirect(`/espace/apprendre/${course.slug}`);
}

export async function toggleFavoriteAction(courseId: string) {
  const user = await requireUser();
  const existing = await prisma.favorite.findUnique({ where: { userId_courseId: { userId: user.id, courseId } } });
  if (existing) await prisma.favorite.delete({ where: { userId_courseId: { userId: user.id, courseId } } });
  else await prisma.favorite.create({ data: { userId: user.id, courseId } });
  revalidatePath("/espace/favoris");
  revalidatePath("/formations/[slug]", "page");
}

const reviewSchema = z.object({
  courseId: z.string().min(1),
  rating: z.coerce.number().int().min(1, "Choisissez une note.").max(5),
  comment: z.string().trim().min(10, "Votre avis doit contenir au moins 10 caractères.").max(1500),
});

export async function submitReviewAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const user = await requireUser();
  const parsed = reviewSchema.safeParse({ courseId: formString(fd, "courseId"), rating: formString(fd, "rating"), comment: formString(fd, "comment") });
  if (!parsed.success) return zodErrors(parsed.error);
  const enrollment = await prisma.enrollment.findUnique({ where: { userId_courseId: { userId: user.id, courseId: parsed.data.courseId } } });
  if (!enrollment) return { error: "Seuls les apprenants inscrits peuvent laisser un avis." };
  await prisma.review.upsert({
    where: { courseId_userId: { courseId: parsed.data.courseId, userId: user.id } },
    create: { ...parsed.data, userId: user.id, verified: true, status: "PENDING" },
    update: { rating: parsed.data.rating, comment: parsed.data.comment, status: "PENDING" },
  });
  return { ok: true, message: "Merci ! Votre avis sera publié après modération." };
}

export async function markLessonAction(lessonId: string, completed: boolean) {
  const user = await requireUser();
  const acc = await lessonAccess(user, lessonId);
  if (!acc.allowed) return { error: "Accès refusé." };
  const courseId = await saveLessonProgress(user.id, lessonId, { completed });
  if (courseId && completed) await evaluateCertificate(user.id, courseId);
  revalidatePath("/espace", "layout");
  return { ok: true };
}

const noteSchema = z.object({ lessonId: z.string().min(1), content: z.string().trim().min(1, "Note vide.").max(5000) });

export async function saveNoteAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const user = await requireUser();
  const parsed = noteSchema.safeParse({ lessonId: formString(fd, "lessonId"), content: formString(fd, "content") });
  if (!parsed.success) return zodErrors(parsed.error);
  const acc = await lessonAccess(user, parsed.data.lessonId);
  if (!acc.allowed) return { error: "Accès refusé." };
  await prisma.note.create({ data: { userId: user.id, lessonId: parsed.data.lessonId, content: parsed.data.content } });
  revalidatePath("/espace/notes");
  return { ok: true, message: "Note enregistrée." };
}

export async function deleteNoteAction(noteId: string) {
  const user = await requireUser();
  await prisma.note.deleteMany({ where: { id: noteId, userId: user.id } });
  revalidatePath("/espace", "layout");
}

export async function checkCertificateAction(courseId: string) {
  const user = await requireUser();
  if ((await courseAccess(user, courseId)) === "none") return;
  await evaluateCertificate(user.id, courseId);
  revalidatePath("/espace/certificats");
}
