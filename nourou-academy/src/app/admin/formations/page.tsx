import Link from "next/link";
import type { CourseStatus } from "@prisma/client";
import { Star } from "lucide-react";
import { prisma } from "@/lib/db";
import { requirePermission } from "@/lib/auth/session";
import { formatDateTime, formatXof } from "@/lib/format";
import { reviewCourseAction, toggleFeaturedAction } from "@/app/actions/admin";
import { ActionForm } from "@/components/forms/action-form";
import { SubmitButton } from "@/components/forms/submit-button";
import { Badge, Card, CardBody, PageHeader, Table, Td, Textarea, Th, buttonClass } from "@/components/ui";

export const metadata = { title: "Formations" };
const labels: Record<CourseStatus, string> = { DRAFT: "Brouillons", SUBMITTED: "À valider", PUBLISHED: "Publiées", REJECTED: "Refusées", ARCHIVED: "Archivées" };

export default async function AdminCourses({ searchParams }: { searchParams: Promise<{ statut?: string }> }) {
  const { statut } = await searchParams;
  await requirePermission("courses.review");
  const status = (statut && statut in labels ? statut : undefined) as CourseStatus | undefined;
  const [courses, counts] = await Promise.all([
    prisma.course.findMany({ where: status ? { status } : {}, orderBy: [{ submittedAt: { sort: "desc", nulls: "last" } }, { updatedAt: "desc" }], include: { trainer: { select: { name: true } }, category: true, _count: { select: { enrollments: true } } } }),
    prisma.course.groupBy({ by: ["status"], _count: true }),
  ]);
  const toReview = courses.filter((c) => c.status === "SUBMITTED");
  return (
    <>
      <PageHeader title="Formations" subtitle="Validation des formations soumises, publication, mise en avant et archivage." />
      <div className="mb-4 flex flex-wrap gap-2 text-sm">
        <Link href="/admin/formations" className={`rounded-full px-3 py-1 ${!status ? "bg-navy text-white" : "bg-sky-50 text-navy"}`}>Toutes</Link>
        {Object.entries(labels).map(([k, l]) => <Link key={k} href={`?statut=${k}`} className={`rounded-full px-3 py-1 ${status === k ? "bg-navy text-white" : "bg-sky-50 text-navy"}`}>{l} ({counts.find((c) => c.status === k)?._count ?? 0})</Link>)}
      </div>
      {toReview.length > 0 && (
        <div className="mb-8 space-y-3">
          {toReview.map((c) => (
            <Card key={c.id}><CardBody className="grid gap-4 md:grid-cols-[1fr_360px]">
              <div>
                <div className="font-semibold text-navy">{c.title}</div>
                <div className="text-xs text-muted">{c.trainer.name} · soumise le {formatDateTime(c.submittedAt)} · {c.isFree ? "Gratuite" : formatXof(c.priceXof)}</div>
                <div className="mt-2 flex gap-2">
                  <Link href={`/formations/${c.slug}`} target="_blank" className={buttonClass("outline", "sm")}>Aperçu public</Link>
                  <Link href={`/formateur/formations/${c.id}?onglet=programme`} className={buttonClass("outline", "sm")}>Contenu détaillé</Link>
                </div>
              </div>
              <ActionForm action={reviewCourseAction} className="space-y-2">
                <input type="hidden" name="courseId" value={c.id} />
                <Textarea name="note" rows={2} placeholder="Commentaire au formateur (obligatoire en cas de refus)" />
                <div className="flex gap-2">
                  <SubmitButton name="decision" value="approve" size="sm">Publier</SubmitButton>
                  <SubmitButton name="decision" value="reject" size="sm" variant="outline">Demander des corrections</SubmitButton>
                </div>
              </ActionForm>
            </CardBody></Card>
          ))}
        </div>
      )}
      <Table>
        <thead><tr><Th>Formation</Th><Th>Formateur</Th><Th>Prix</Th><Th>Inscrits</Th><Th>Statut</Th><Th>Actions</Th></tr></thead>
        <tbody>
          {courses.map((c) => (
            <tr key={c.id}>
              <Td><Link href={`/formateur/formations/${c.id}`} className="font-medium text-navy hover:text-sky">{c.title}</Link>{c.isDemo && <Badge tone="amber" className="ml-1">Démo</Badge>}</Td>
              <Td className="text-muted">{c.trainer.name}</Td>
              <Td>{c.isFree ? "Gratuite" : formatXof(c.priceXof)}</Td>
              <Td>{c._count.enrollments}</Td>
              <Td><Badge tone={c.status === "PUBLISHED" ? "green" : c.status === "SUBMITTED" ? "amber" : "gray"}>{labels[c.status]}</Badge></Td>
              <Td className="whitespace-nowrap">
                <form action={toggleFeaturedAction.bind(null, c.id)} className="inline"><button className="p-1" title={c.featured ? "Retirer de la une" : "Mettre à la une"} aria-label="Mettre à la une"><Star className={`h-4 w-4 ${c.featured ? "fill-accent text-accent" : "text-muted"}`} /></button></form>
                {c.status === "PUBLISHED" && (
                  <ActionForm action={reviewCourseAction} className="inline">
                    <input type="hidden" name="courseId" value={c.id} />
                    <SubmitButton name="decision" value="unpublish" size="sm" variant="ghost" confirm="Dépublier cette formation ?">Dépublier</SubmitButton>
                  </ActionForm>
                )}
                {(c.status === "DRAFT" || c.status === "ARCHIVED" || c.status === "REJECTED") && (
                  <ActionForm action={reviewCourseAction} className="inline">
                    <input type="hidden" name="courseId" value={c.id} />
                    <SubmitButton name="decision" value="approve" size="sm" variant="ghost">Publier</SubmitButton>
                  </ActionForm>
                )}
              </Td>
            </tr>
          ))}
        </tbody>
      </Table>
    </>
  );
}
