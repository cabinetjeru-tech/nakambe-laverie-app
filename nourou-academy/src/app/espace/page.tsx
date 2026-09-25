import Link from "next/link";
import { Award, BookOpen, CalendarDays, CheckCircle2, PlayCircle, Radio, Sparkles, Target } from "lucide-react";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth/session";
import { getBrand } from "@/lib/settings";
import { formatDateTime } from "@/lib/format";
import { courseCardSelect, withRatings } from "@/lib/catalog";
import { CourseCard, CourseCover } from "@/components/course/course-card";
import { Card, CardBody, EmptyState, ProgressBar, Stat, buttonClass } from "@/components/ui";

export const metadata = { title: "Tableau de bord" };

export default async function LearnerDashboard() {
  const user = await requireUser();
  const brand = await getBrand();
  const [enrollments, certCount, attempts, lives, gaps, notifications] = await Promise.all([
    prisma.enrollment.findMany({
      where: { userId: user.id, status: "ACTIVE" },
      orderBy: [{ lastAccessedAt: { sort: "desc", nulls: "last" } }, { createdAt: "desc" }],
      include: { course: { select: { id: true, slug: true, title: true, imageUrl: true, imageFileId: true, category: { select: { name: true } } } } },
    }),
    prisma.certificate.count({ where: { userId: user.id, status: "VALID" } }),
    prisma.quizAttempt.aggregate({ where: { userId: user.id, status: { in: ["GRADED", "VALIDATED"] } }, _avg: { percent: true }, _count: true }),
    prisma.liveSession.findMany({
      where: {
        startsAt: { gte: new Date(Date.now() - 2 * 3600_000) },
        status: { in: ["SCHEDULED", "LIVE"] },
        OR: [{ registrations: { some: { userId: user.id } } }, { course: { enrollments: { some: { userId: user.id, status: "ACTIVE" } } } }],
      },
      orderBy: { startsAt: "asc" },
      take: 3,
      include: { course: { select: { title: true } } },
    }),
    prisma.learningGap.findMany({ where: { userId: user.id, resolved: false }, orderBy: { createdAt: "desc" }, take: 4, include: { course: { select: { title: true } } } }),
    prisma.notification.findMany({ where: { userId: user.id }, orderBy: { createdAt: "desc" }, take: 4 }),
  ]);
  const inProgress = enrollments.filter((e) => !e.completedAt);
  const completed = enrollments.filter((e) => e.completedAt);
  const resume = inProgress[0];
  const resumeLesson = resume?.lastLessonId ? await prisma.lesson.findUnique({ where: { id: resume.lastLessonId }, select: { id: true, title: true } }) : null;
  const recommended = enrollments.length < 3
    ? await withRatings(await prisma.course.findMany({ where: { status: "PUBLISHED", id: { notIn: enrollments.map((e) => e.courseId) } }, orderBy: [{ featured: "desc" }, { publishedAt: "desc" }], take: 3, select: courseCardSelect }))
    : [];
  const firstName = user.name.split(" ")[0];

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-navy">Bonjour {firstName} 👋</h1>
        <p className="text-sm text-muted">{brand.slogan}</p>
      </div>

      {resume ? (
        <Card className="overflow-hidden">
          <div className="grid md:grid-cols-[280px_1fr]">
            <CourseCover title={resume.course.title} image={resume.course.imageUrl} className="aspect-[16/9] md:aspect-auto md:h-full" />
            <CardBody className="flex flex-col justify-center">
              <div className="text-xs font-semibold uppercase tracking-wide text-sky">Reprendre où vous en étiez</div>
              <div className="mt-1 text-lg font-bold text-navy">{resume.course.title}</div>
              {resumeLesson && <div className="text-sm text-muted">Dernière leçon : {resumeLesson.title}</div>}
              <div className="mt-3 flex items-center gap-3"><ProgressBar value={resume.progressPercent} className="max-w-xs" /><span className="text-sm font-semibold text-navy">{resume.progressPercent} %</span></div>
              <div className="mt-4 flex flex-wrap gap-2">
                <Link href={`/espace/apprendre/${resume.course.slug}${resumeLesson ? `/${resumeLesson.id}` : ""}`} className={buttonClass("primary")}><PlayCircle className="h-4 w-4" aria-hidden /> Continuer</Link>
                <Link href="/espace/tuteur" className={buttonClass("outline")}><Sparkles className="h-4 w-4 text-accent" aria-hidden /> Réviser avec {brand.tutorName}</Link>
              </div>
            </CardBody>
          </div>
        </Card>
      ) : (
        <EmptyState icon={<BookOpen className="h-6 w-6" />} title="Vous n'avez pas encore commencé de formation" text="Parcourez le catalogue : plusieurs formations sont gratuites." action={<Link href="/formations" className={buttonClass("accent")}>Explorer les formations</Link>} />
      )}

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Stat label="En cours" value={inProgress.length} icon={<BookOpen className="h-5 w-5" />} />
        <Stat label="Terminées" value={completed.length} icon={<CheckCircle2 className="h-5 w-5" />} />
        <Stat label="Certificats" value={certCount} icon={<Award className="h-5 w-5" />} />
        <Stat label="Moyenne aux quiz" value={attempts._count ? `${Math.round(attempts._avg.percent ?? 0)} %` : "—"} hint={`${attempts._count} évaluation(s)`} icon={<Target className="h-5 w-5" />} />
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          <div className="flex items-center justify-between"><h2 className="text-lg font-bold text-navy">Mes formations en cours</h2><Link href="/espace/formations" className="text-sm font-medium text-sky">Tout voir</Link></div>
          {inProgress.length === 0 ? (
            <p className="text-sm text-muted">Aucune formation en cours.</p>
          ) : (
            <ul className="space-y-3">
              {inProgress.slice(0, 5).map((e) => (
                <li key={e.id}>
                  <Link href={`/espace/apprendre/${e.course.slug}`} className="flex items-center gap-4 rounded-2xl border border-line bg-white p-4 hover:border-sky-200">
                    <div className="min-w-0 flex-1">
                      <div className="truncate font-semibold text-navy">{e.course.title}</div>
                      <div className="mt-2 flex items-center gap-3"><ProgressBar value={e.progressPercent} /><span className="w-10 text-right text-xs font-semibold text-navy">{e.progressPercent} %</span></div>
                    </div>
                    <PlayCircle className="h-6 w-6 shrink-0 text-sky" aria-hidden />
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
        <div className="space-y-6">
          <Card>
            <CardBody>
              <h2 className="flex items-center gap-2 font-semibold text-navy"><CalendarDays className="h-4 w-4 text-sky" aria-hidden /> Prochaines classes</h2>
              {lives.length === 0 ? <p className="mt-2 text-sm text-muted">Aucune classe programmée.</p> : (
                <ul className="mt-3 space-y-3">
                  {lives.map((l) => (
                    <li key={l.id} className="text-sm">
                      <div className="flex items-center gap-1.5 font-medium text-navy"><Radio className="h-3.5 w-3.5 text-red-500" aria-hidden />{l.title}</div>
                      <div className="text-xs text-muted">{formatDateTime(l.startsAt)}{l.course ? ` · ${l.course.title}` : ""}</div>
                    </li>
                  ))}
                </ul>
              )}
              <Link href="/espace/planning" className="mt-3 inline-block text-sm font-medium text-sky">Voir le planning</Link>
            </CardBody>
          </Card>
          {gaps.length > 0 && (
            <Card>
              <CardBody>
                <h2 className="flex items-center gap-2 font-semibold text-navy"><Target className="h-4 w-4 text-accent" aria-hidden /> Points à retravailler</h2>
                <ul className="mt-2 space-y-1.5 text-sm">
                  {gaps.map((g) => <li key={g.id} className="text-ink">• {g.topic} <span className="text-xs text-muted">({g.course.title})</span></li>)}
                </ul>
                <Link href="/espace/tuteur" className={buttonClass("outline", "sm", "mt-3")}>Travailler avec {brand.tutorName}</Link>
              </CardBody>
            </Card>
          )}
          <Card>
            <CardBody>
              <h2 className="font-semibold text-navy">Notifications récentes</h2>
              {notifications.length === 0 ? <p className="mt-2 text-sm text-muted">Rien de nouveau.</p> : (
                <ul className="mt-2 space-y-2 text-sm">
                  {notifications.map((n) => <li key={n.id}><div className={n.readAt ? "text-ink" : "font-semibold text-navy"}>{n.title}</div><div className="line-clamp-2 text-xs text-muted">{n.body}</div></li>)}
                </ul>
              )}
            </CardBody>
          </Card>
        </div>
      </div>

      {recommended.length > 0 && (
        <section>
          <h2 className="mb-4 text-lg font-bold text-navy">Recommandé pour vous</h2>
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">{recommended.map((c) => <CourseCard key={c.id} course={c} />)}</div>
        </section>
      )}
    </div>
  );
}
