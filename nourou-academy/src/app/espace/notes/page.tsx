import Link from "next/link";
import { NotebookPen, Trash2 } from "lucide-react";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth/session";
import { formatDateTime } from "@/lib/format";
import { deleteNoteAction } from "@/app/actions/learning";
import { Card, CardBody, EmptyState, PageHeader } from "@/components/ui";

export const metadata = { title: "Mes notes" };

export default async function NotesPage() {
  const user = await requireUser();
  const notes = await prisma.note.findMany({
    where: { userId: user.id },
    orderBy: { createdAt: "desc" },
    include: { lesson: { select: { id: true, title: true, module: { select: { course: { select: { title: true, slug: true } } } } } } },
  });
  return (
    <>
      <PageHeader title="Mes notes personnelles" subtitle="Toutes les notes prises pendant vos leçons." />
      {notes.length === 0 ? <EmptyState icon={<NotebookPen className="h-6 w-6" />} title="Aucune note" text="Ajoutez des notes depuis n'importe quelle leçon." /> : (
        <div className="space-y-3">
          {notes.map((n) => (
            <Card key={n.id}>
              <CardBody className="flex gap-3">
                <div className="min-w-0 flex-1">
                  <Link href={`/espace/apprendre/${n.lesson.module.course.slug}/${n.lesson.id}`} className="text-xs font-medium text-sky hover:underline">{n.lesson.module.course.title} › {n.lesson.title}</Link>
                  <p className="mt-1 whitespace-pre-line text-sm">{n.content}</p>
                  <div className="mt-1 text-[11px] text-muted">{formatDateTime(n.createdAt)}</div>
                </div>
                <form action={deleteNoteAction.bind(null, n.id)}><button className="text-muted hover:text-red-600" aria-label="Supprimer"><Trash2 className="h-4 w-4" /></button></form>
              </CardBody>
            </Card>
          ))}
        </div>
      )}
    </>
  );
}
