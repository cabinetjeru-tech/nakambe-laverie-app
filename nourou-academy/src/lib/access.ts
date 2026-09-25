import "server-only";
import type { Role } from "@prisma/client";
import { prisma } from "./db";

/**
 * Règles d'accès aux contenus pédagogiques — appliquées côté serveur partout
 * (pages de leçons, fichiers, tuteur IA / RAG, quiz, devoirs).
 *
 * Un utilisateur a accès au contenu complet d'une formation si :
 *  - il en est le formateur, ou il a un rôle d'administration ;
 *  - la formation est gratuite et publiée ;
 *  - il possède une inscription ACTIVE (achat, pack, gratuit, attribution admin) ;
 *  - il a un abonnement actif et la formation est incluse dans l'abonnement.
 * Les leçons marquées "aperçu" sont accessibles à tous pour une formation publiée.
 */

export type AccessReason = "staff" | "trainer" | "free" | "enrollment" | "subscription" | "none";

export function decideCourseAccess(input: {
  role: Role | null;
  userId: string | null;
  course: { trainerId: string; isFree: boolean; status: string; includedInSubscription: boolean };
  hasActiveEnrollment: boolean;
  hasActiveSubscription: boolean;
}): AccessReason {
  const { role, userId, course } = input;
  if (role === "SUPERADMIN" || role === "ADMIN" || role === "ASSISTANT") return "staff";
  if (userId && course.trainerId === userId) return "trainer";
  if (course.status !== "PUBLISHED") return "none";
  if (input.hasActiveEnrollment) return "enrollment";
  if (course.isFree) return userId ? "free" : "none";
  if (input.hasActiveSubscription && course.includedInSubscription) return "subscription";
  return "none";
}

export async function hasActiveSubscription(userId: string): Promise<boolean> {
  const sub = await prisma.subscription.findFirst({
    where: { userId, status: "ACTIVE", startsAt: { lte: new Date() }, endsAt: { gt: new Date() } },
    select: { id: true },
  });
  return !!sub;
}

export async function courseAccess(user: { id: string; role: Role } | null, courseId: string): Promise<AccessReason> {
  const course = await prisma.course.findUnique({
    where: { id: courseId },
    select: { trainerId: true, isFree: true, status: true, includedInSubscription: true },
  });
  if (!course) return "none";
  if (!user) return "none";
  const [enrollment, sub] = await Promise.all([
    prisma.enrollment.findUnique({ where: { userId_courseId: { userId: user.id, courseId } }, select: { status: true } }),
    hasActiveSubscription(user.id),
  ]);
  return decideCourseAccess({
    role: user.role,
    userId: user.id,
    course,
    hasActiveEnrollment: enrollment?.status === "ACTIVE",
    hasActiveSubscription: sub,
  });
}

/** Liste des formations dont le contenu complet est accessible (utilisé par le RAG). */
export async function accessibleCourseIds(user: { id: string; role: Role }): Promise<string[] | "all"> {
  if (user.role === "SUPERADMIN" || user.role === "ADMIN" || user.role === "ASSISTANT") return "all";
  const [enrollments, taught, sub, free] = await Promise.all([
    prisma.enrollment.findMany({
      where: { userId: user.id, status: "ACTIVE", course: { status: "PUBLISHED" } },
      select: { courseId: true },
    }),
    prisma.course.findMany({ where: { trainerId: user.id }, select: { id: true } }),
    hasActiveSubscription(user.id),
    prisma.course.findMany({ where: { status: "PUBLISHED", isFree: true }, select: { id: true } }),
  ]);
  const ids = new Set<string>([...enrollments.map((e) => e.courseId), ...taught.map((c) => c.id), ...free.map((c) => c.id)]);
  if (sub) {
    const inc = await prisma.course.findMany({ where: { status: "PUBLISHED", includedInSubscription: true }, select: { id: true } });
    inc.forEach((c) => ids.add(c.id));
  }
  return [...ids];
}

/** Accès à une leçon précise : contenu complet, ou aperçu gratuit. */
export async function lessonAccess(user: { id: string; role: Role } | null, lessonId: string) {
  const lesson = await prisma.lesson.findUnique({
    where: { id: lessonId },
    select: { id: true, isPreview: true, module: { select: { courseId: true, course: { select: { status: true } } } } },
  });
  if (!lesson) return { allowed: false as const, courseId: null };
  const courseId = lesson.module.courseId;
  const reason = await courseAccess(user, courseId);
  if (reason !== "none") return { allowed: true as const, courseId, reason };
  if (lesson.isPreview && lesson.module.course.status === "PUBLISHED") return { allowed: true as const, courseId, reason: "preview" as const };
  return { allowed: false as const, courseId };
}

/** Le formateur ne peut gérer que ses propres formations ; l'administration peut tout gérer. */
export async function canManageCourse(user: { id: string; role: Role }, courseId: string): Promise<boolean> {
  if (user.role === "SUPERADMIN" || user.role === "ADMIN") return true;
  const c = await prisma.course.findUnique({ where: { id: courseId }, select: { trainerId: true } });
  return !!c && c.trainerId === user.id;
}
