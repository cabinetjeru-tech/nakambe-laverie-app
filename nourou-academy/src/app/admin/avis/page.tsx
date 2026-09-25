import { prisma } from "@/lib/db";
import { requirePermission } from "@/lib/auth/session";
import { formatDate } from "@/lib/format";
import { reviewModerationAction } from "@/app/actions/admin";
import { SubmitButton } from "@/components/forms/submit-button";
import { Badge, Card, CardBody, EmptyState, PageHeader, Stars } from "@/components/ui";

export const metadata = { title: "Avis" };

export default async function ReviewsAdmin() {
  await requirePermission("reviews.moderate");
  const reviews = await prisma.review.findMany({ orderBy: [{ status: "asc" }, { createdAt: "desc" }], take: 100, include: { user: { select: { name: true } }, course: { select: { title: true } } } });
  return (
    <>
      <PageHeader title="Avis et témoignages" subtitle="Seuls les avis approuvés sont publiés. « À la une » les affiche sur l'accueil (avis d'apprenants vérifiés uniquement)." />
      {reviews.length === 0 ? <EmptyState title="Aucun avis" /> : (
        <div className="space-y-3">
          {reviews.map((r) => (
            <Card key={r.id}><CardBody className="flex flex-col gap-3 md:flex-row md:items-start">
              <div className="flex-1 text-sm">
                <div className="flex flex-wrap items-center gap-2"><Stars value={r.rating} /><b className="text-navy">{r.user.name}</b><span className="text-muted">· {r.course.title} · {formatDate(r.createdAt)}</span>{r.verified && <Badge tone="green">Vérifié</Badge>}{r.featured && <Badge tone="accent">À la une</Badge>}</div>
                <p className="mt-2">{r.comment}</p>
              </div>
              <div className="flex shrink-0 flex-wrap gap-2">
                <Badge tone={r.status === "APPROVED" ? "green" : r.status === "REJECTED" ? "red" : "amber"}>{r.status}</Badge>
                {r.status !== "APPROVED" && <form action={reviewModerationAction.bind(null, r.id, "APPROVED")}><SubmitButton size="sm">Approuver</SubmitButton></form>}
                {r.status !== "REJECTED" && <form action={reviewModerationAction.bind(null, r.id, "REJECTED")}><SubmitButton size="sm" variant="outline">Refuser</SubmitButton></form>}
                {r.verified && <form action={reviewModerationAction.bind(null, r.id, "FEATURE")}><SubmitButton size="sm" variant="ghost">{r.featured ? "Retirer de la une" : "Mettre à la une"}</SubmitButton></form>}
              </div>
            </CardBody></Card>
          ))}
        </div>
      )}
    </>
  );
}
