import type { Metadata } from "next";
import Link from "next/link";
import { prisma } from "@/lib/db";
import { publicFileUrl } from "@/lib/storage";
import { initials } from "@/lib/format";
import { EmptyState } from "@/components/ui";

export const metadata: Metadata = { title: "Nos formateurs" };
export const dynamic = "force-dynamic";

export default async function TrainersPage() {
  const trainers = await prisma.user.findMany({
    where: { role: "TRAINER", status: "ACTIVE", coursesTaught: { some: { status: "PUBLISHED" } } },
    select: { id: true, name: true, headline: true, bio: true, avatarFileId: true, expertise: true, _count: { select: { coursesTaught: { where: { status: "PUBLISHED" } } } } },
    orderBy: { name: "asc" },
  });
  return (
    <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6">
      <h1 className="text-3xl font-bold text-navy">Nos formateurs</h1>
      <p className="mt-1 max-w-2xl text-muted">Des professionnels de terrain qui transmettent des compétences directement applicables.</p>
      {trainers.length === 0 ? <div className="mt-8"><EmptyState title="Les formateurs seront bientôt présentés ici." /></div> : (
        <div className="mt-8 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {trainers.map((t) => (
            <Link key={t.id} href={`/formateurs/${t.id}`} className="rounded-2xl border border-line bg-white p-6 shadow-soft hover:border-sky-200">
              <div className="flex items-center gap-4">
                {t.avatarFileId ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={publicFileUrl(t.avatarFileId)!} alt="" className="h-16 w-16 rounded-full object-cover" loading="lazy" />
                ) : (
                  <span className="grid h-16 w-16 place-items-center rounded-full bg-navy text-lg font-bold text-white">{initials(t.name)}</span>
                )}
                <div>
                  <div className="font-semibold text-navy">{t.name}</div>
                  {t.headline && <div className="text-sm text-muted">{t.headline}</div>}
                </div>
              </div>
              {t.bio && <p className="mt-4 line-clamp-3 text-sm text-ink">{t.bio}</p>}
              <div className="mt-4 flex flex-wrap gap-1.5">{t.expertise.slice(0, 4).map((e) => <span key={e} className="rounded-full bg-sky-50 px-2.5 py-0.5 text-xs text-navy">{e}</span>)}</div>
              <div className="mt-4 text-xs font-medium text-sky">{t._count.coursesTaught} formation{t._count.coursesTaught > 1 ? "s" : ""}</div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
