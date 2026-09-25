import { notFound, redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth/session";

/** Reprise automatique : redirige vers la dernière leçon consultée, sinon la première. */
export default async function ResumeCourse({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const user = await requireUser();
  const course = await prisma.course.findUnique({
    where: { slug },
    select: { id: true, modules: { orderBy: { position: "asc" }, select: { lessons: { orderBy: { position: "asc" }, select: { id: true }, take: 1 } } } },
  });
  if (!course) notFound();
  const enrollment = await prisma.enrollment.findUnique({ where: { userId_courseId: { userId: user.id, courseId: course.id } } });
  const first = course.modules.find((m) => m.lessons.length)?.lessons[0]?.id;
  const target = enrollment?.lastLessonId ?? first;
  if (!target) redirect(`/formations/${slug}`);
  redirect(`/espace/apprendre/${slug}/${target}`);
}
