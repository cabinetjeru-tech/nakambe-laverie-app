import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, FolderDown, Info } from "lucide-react";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth/session";
import { courseAccess } from "@/lib/access";
import { signedFileUrl } from "@/lib/storage";
import { DocumentList, type DocItem } from "@/components/learn/documents";
import { Alert, Card, CardBody, EmptyState, buttonClass } from "@/components/ui";

export const metadata = { title: "Ressources de la formation" };

/** Toutes les ressources téléchargeables d'une formation, classées par section et par leçon (réservé aux inscrits). */
export default async function CourseResourcesPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const user = await requireUser();
  const course = await prisma.course.findUnique({
    where: { slug },
    select: {
      id: true, slug: true, title: true,
      modules: {
        orderBy: { position: "asc" },
        select: {
          id: true, title: true,
          lessons: {
            orderBy: { position: "asc" },
            select: { id: true, title: true, assets: { where: { kind: "DOCUMENT", downloadable: true }, orderBy: { createdAt: "asc" }, include: { file: true } } },
          },
        },
      },
    },
  });
  if (!course) notFound();
  const access = await courseAccess(user, course.id);
  if (access === "none") {
    return (
      <Card><CardBody className="py-10 text-center">
        <FolderDown className="mx-auto h-10 w-10 text-muted" aria-hidden />
        <h1 className="mt-3 text-lg font-semibold text-navy">Ressources réservées aux inscrits</h1>
        <p className="mt-1 text-sm text-muted">Rejoignez la formation pour accéder aux fiches, modèles et fichiers de travail.</p>
        <Link href={`/formations/${course.slug}`} className={buttonClass("accent", "lg", "mt-5")}>Voir la formation</Link>
      </CardBody></Card>
    );
  }

  const toDoc = (a: (typeof course.modules)[number]["lessons"][number]["assets"][number]): DocItem => ({
    id: a.fileId,
    label: a.label,
    size: a.file.size,
    mime: a.file.mimeType,
    url: signedFileUrl(a.fileId, { ttlSeconds: 4 * 3600, download: true }),
    downloadUrl: signedFileUrl(a.fileId, { ttlSeconds: 4 * 3600, download: true }),
    downloadable: true,
  });
  const sections = course.modules
    .map((m, i) => ({ ...m, index: i + 1, lessons: m.lessons.filter((l) => l.assets.length > 0) }))
    .filter((m) => m.lessons.length > 0);
  const total = sections.reduce((n, m) => n + m.lessons.reduce((k, l) => k + l.assets.length, 0), 0);

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div>
        <Link href={`/espace/apprendre/${course.slug}`} className="inline-flex items-center gap-1 text-xs font-medium text-sky hover:underline"><ArrowLeft className="h-3.5 w-3.5" /> Retour au cours</Link>
        <h1 className="mt-2 flex items-center gap-2 text-2xl font-bold text-navy"><FolderDown className="h-6 w-6 text-sky" aria-hidden /> Ressources de la formation</h1>
        <p className="mt-1 text-sm text-muted">{course.title} · {total} ressource{total > 1 ? "s" : ""} téléchargeable{total > 1 ? "s" : ""}</p>
      </div>
      <Alert tone="info" className="flex items-start gap-2">
        <Info className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
        <span>Les ressources ci-dessous sont mises à votre disposition par le formateur : vous pouvez les télécharger ou les garder hors ligne. Les vidéos et supports de cours se consultent en ligne, dans les leçons.</span>
      </Alert>
      {sections.length === 0 ? (
        <EmptyState title="Aucune ressource téléchargeable pour le moment." text="Le formateur n'a pas encore mis de fichiers à disposition pour cette formation." />
      ) : (
        sections.map((m) => (
          <section key={m.id} className="space-y-3">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-muted">Section {m.index} · {m.title}</h2>
            {m.lessons.map((l) => (
              <div key={l.id}>
                <Link href={`/espace/apprendre/${course.slug}/${l.id}`} className="mb-1.5 block text-sm font-medium text-navy hover:text-sky">{l.title}</Link>
                <DocumentList docs={l.assets.map(toDoc)} />
              </div>
            ))}
          </section>
        ))
      )}
    </div>
  );
}
