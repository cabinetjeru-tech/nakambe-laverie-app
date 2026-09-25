import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { courseCardSelect, withRatings } from "@/lib/catalog";
import { publicFileUrl } from "@/lib/storage";
import { initials } from "@/lib/format";
import { CourseCard } from "@/components/course/course-card";

export const dynamic = "force-dynamic";

export default async function TrainerPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const t = await prisma.user.findFirst({ where: { id, role: "TRAINER", status: "ACTIVE" }, select: { id: true, name: true, headline: true, bio: true, avatarFileId: true, expertise: true } });
  if (!t) notFound();
  const courses = await withRatings(await prisma.course.findMany({ where: { trainerId: t.id, status: "PUBLISHED" }, select: courseCardSelect }));
  return (
    <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6">
      <Link href="/formateurs" className="text-sm text-sky hover:underline">← Tous les formateurs</Link>
      <div className="mt-4 flex flex-col gap-6 sm:flex-row sm:items-center">
        {t.avatarFileId ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={publicFileUrl(t.avatarFileId)!} alt="" className="h-28 w-28 rounded-full object-cover" />
        ) : (
          <span className="grid h-28 w-28 place-items-center rounded-full bg-navy text-3xl font-bold text-white">{initials(t.name)}</span>
        )}
        <div>
          <h1 className="text-3xl font-bold text-navy">{t.name}</h1>
          {t.headline && <p className="text-muted">{t.headline}</p>}
          <div className="mt-3 flex flex-wrap gap-1.5">{t.expertise.map((e) => <span key={e} className="rounded-full bg-sky-50 px-2.5 py-0.5 text-xs text-navy">{e}</span>)}</div>
        </div>
      </div>
      {t.bio && <p className="mt-6 max-w-3xl whitespace-pre-line leading-7">{t.bio}</p>}
      <h2 className="mt-10 text-xl font-bold text-navy">Formations de {t.name}</h2>
      <div className="mt-4 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">{courses.map((c) => <CourseCard key={c.id} course={c} />)}</div>
    </div>
  );
}
