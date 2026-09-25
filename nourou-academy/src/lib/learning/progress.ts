import "server-only";
import { prisma } from "../db";

/** Recalcule la progression d'un apprenant dans une formation (leçons terminées / total). */
export async function recomputeProgress(userId: string, courseId: string) {
  const [total, done] = await Promise.all([
    prisma.lesson.count({ where: { module: { courseId } } }),
    prisma.lessonProgress.count({ where: { userId, completed: true, lesson: { module: { courseId } } } }),
  ]);
  const percent = total > 0 ? Math.round((done / total) * 100) : 0;
  const enrollment = await prisma.enrollment.findUnique({ where: { userId_courseId: { userId, courseId } } });
  if (enrollment) {
    await prisma.enrollment.update({
      where: { id: enrollment.id },
      data: { progressPercent: percent, completedAt: percent >= 100 ? (enrollment.completedAt ?? new Date()) : null },
    });
  }
  return percent;
}

export async function saveLessonProgress(userId: string, lessonId: string, data: { position?: number; completed?: boolean }) {
  const lesson = await prisma.lesson.findUnique({ where: { id: lessonId }, select: { module: { select: { courseId: true } } } });
  if (!lesson) return null;
  const existing = await prisma.lessonProgress.findUnique({ where: { userId_lessonId: { userId, lessonId } } });
  const completed = data.completed ?? existing?.completed ?? false;
  await prisma.lessonProgress.upsert({
    where: { userId_lessonId: { userId, lessonId } },
    create: { userId, lessonId, videoPosition: Math.max(0, Math.floor(data.position ?? 0)), completed, completedAt: completed ? new Date() : null },
    update: {
      ...(data.position !== undefined ? { videoPosition: Math.max(0, Math.floor(data.position)) } : {}),
      completed,
      completedAt: completed ? (existing?.completedAt ?? new Date()) : null,
    },
  });
  const courseId = lesson.module.courseId;
  await prisma.enrollment.updateMany({ where: { userId, courseId }, data: { lastLessonId: lessonId, lastAccessedAt: new Date() } });
  if (data.completed !== undefined) await recomputeProgress(userId, courseId);
  return courseId;
}
