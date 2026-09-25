import { notFound, redirect } from "next/navigation";
import { prisma } from "@/lib/db";

export default async function LessonShortcut({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const lesson = await prisma.lesson.findUnique({ where: { id }, select: { module: { select: { course: { select: { slug: true } } } } } });
  if (!lesson) notFound();
  redirect(`/espace/apprendre/${lesson.module.course.slug}/${id}`);
}
