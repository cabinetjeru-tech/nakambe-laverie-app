import "server-only";
import type { Prisma } from "@prisma/client";
import { prisma } from "./db";
import { publicFileUrl } from "./storage";

export const courseCardSelect = {
  id: true,
  slug: true,
  title: true,
  subtitle: true,
  level: true,
  priceXof: true,
  isFree: true,
  durationMinutes: true,
  imageFileId: true,
  imageUrl: true,
  hasCertificate: true,
  category: { select: { name: true, slug: true } },
  trainer: { select: { id: true, name: true } },
  _count: { select: { modules: true, enrollments: true } },
} satisfies Prisma.CourseSelect;

export type CourseCardData = Prisma.CourseGetPayload<{ select: typeof courseCardSelect }> & { rating: { avg: number; count: number } | null; image: string | null };

export async function withRatings<T extends { id: string; imageFileId: string | null; imageUrl: string | null }>(courses: T[]) {
  if (courses.length === 0) return [] as (T & { rating: { avg: number; count: number } | null; image: string | null })[];
  const agg = await prisma.review.groupBy({
    by: ["courseId"],
    where: { courseId: { in: courses.map((c) => c.id) }, status: "APPROVED" },
    _avg: { rating: true },
    _count: { _all: true },
  });
  const map = new Map(agg.map((a) => [a.courseId, { avg: a._avg.rating ?? 0, count: a._count._all }]));
  return courses.map((c) => ({ ...c, rating: map.get(c.id) ?? null, image: c.imageUrl || publicFileUrl(c.imageFileId) }));
}

export async function lessonCount(courseId: string) {
  return prisma.lesson.count({ where: { module: { courseId } } });
}
