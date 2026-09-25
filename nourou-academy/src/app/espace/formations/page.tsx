import Link from "next/link";
import { Award, BookOpen, PlayCircle } from "lucide-react";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth/session";
import { formatDate } from "@/lib/format";
import { publicFileUrl } from "@/lib/storage";
import { CourseCover } from "@/components/course/course-card";
import { Badge, EmptyState, PageHeader, ProgressBar, buttonClass } from "@/components/ui";

export const metadata = { title: "Mes formations" };

const sourceLabel = { PURCHASE: "Achat", SUBSCRIPTION: "Abonnement", FREE: "Gratuite", PACK: "Pack", ADMIN: "Attribuée" };

export default async function MyCourses() {
  const user = await requireUser();
  const enrollments = await prisma.enrollment.findMany({
    where: { userId: user.id, status: "ACTIVE" },
    orderBy: [{ lastAccessedAt: { sort: "desc", nulls: "last" } }, { createdAt: "desc" }],
    include: { course: { select: { slug: true, title: true, imageUrl: true, imageFileId: true, trainer: { select: { name: true } }, certificates: { where: { userId: user.id }, select: { status: true } } } } },
  });
  return (
    <>
      <PageHeader title="Mes formations" subtitle="Formations achetées, gratuites ou incluses dans votre abonnement." actions={<Link href="/formations" className={buttonClass("outline")}>Catalogue</Link>} />
      {enrollments.length === 0 ? (
        <EmptyState icon={<BookOpen className="h-6 w-6" />} title="Aucune formation pour le moment" action={<Link href="/formations" className={buttonClass("accent")}>Trouver une formation</Link>} />
      ) : (
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {enrollments.map((e) => (
            <Link key={e.id} href={`/espace/apprendre/${e.course.slug}`} className="group overflow-hidden rounded-2xl border border-line bg-white shadow-soft hover:border-sky-200">
              <CourseCover title={e.course.title} image={e.course.imageUrl || publicFileUrl(e.course.imageFileId)} />
              <div className="p-4">
                <div className="flex items-center gap-2">
                  <Badge tone="gray">{sourceLabel[e.source]}</Badge>
                  {e.completedAt && <Badge tone="green">Terminée</Badge>}
                  {e.course.certificates[0]?.status === "VALID" && <Badge tone="accent"><Award className="h-3 w-3" aria-hidden /> Certifié</Badge>}
                </div>
                <div className="mt-2 font-semibold text-navy group-hover:text-sky">{e.course.title}</div>
                <div className="text-xs text-muted">{e.course.trainer.name}</div>
                <div className="mt-3 flex items-center gap-2"><ProgressBar value={e.progressPercent} /><span className="text-xs font-semibold">{e.progressPercent} %</span></div>
                <div className="mt-3 flex items-center justify-between text-xs text-muted">
                  <span>{e.lastAccessedAt ? `Vu le ${formatDate(e.lastAccessedAt)}` : `Inscrit le ${formatDate(e.createdAt)}`}</span>
                  <PlayCircle className="h-5 w-5 text-sky" aria-hidden />
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </>
  );
}
