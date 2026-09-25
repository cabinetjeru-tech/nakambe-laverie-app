import type { Metadata } from "next";
import { prisma } from "@/lib/db";
import { formatDate } from "@/lib/format";
import { EmptyState, Stars } from "@/components/ui";

export const metadata: Metadata = { title: "Avis des apprenants" };
export const dynamic = "force-dynamic";

export default async function TestimonialsPage() {
  const reviews = await prisma.review.findMany({
    where: { status: "APPROVED" },
    orderBy: [{ featured: "desc" }, { createdAt: "desc" }],
    take: 60,
    include: { user: { select: { name: true } }, course: { select: { title: true } } },
  });
  return (
    <div className="mx-auto max-w-5xl px-4 py-10 sm:px-6">
      <h1 className="text-3xl font-bold text-navy">Avis des apprenants</h1>
      <p className="mt-1 text-muted">Seuls les apprenants réellement inscrits à une formation peuvent laisser un avis. Chaque avis est relu avant publication.</p>
      {reviews.length === 0 ? <div className="mt-8"><EmptyState title="Pas encore d'avis publiés" text="Les premiers avis vérifiés apparaîtront ici." /></div> : (
        <div className="mt-8 columns-1 gap-6 md:columns-2">
          {reviews.map((r) => (
            <figure key={r.id} className="mb-6 break-inside-avoid rounded-2xl border border-line bg-white p-6">
              <Stars value={r.rating} />
              <blockquote className="mt-3 text-sm">« {r.comment} »</blockquote>
              <figcaption className="mt-3 text-xs text-muted"><b className="text-navy">{r.user.name}</b>{r.verified ? " · apprenant vérifié" : ""} · {r.course.title} · {formatDate(r.createdAt)}</figcaption>
            </figure>
          ))}
        </div>
      )}
    </div>
  );
}
