import { Heart } from "lucide-react";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth/session";
import { courseCardSelect, withRatings } from "@/lib/catalog";
import { CourseCard } from "@/components/course/course-card";
import { EmptyState, PageHeader } from "@/components/ui";

export const metadata = { title: "Favoris" };

export default async function FavoritesPage() {
  const user = await requireUser();
  const favs = await prisma.favorite.findMany({ where: { userId: user.id }, orderBy: { createdAt: "desc" }, select: { course: { select: courseCardSelect } } });
  const courses = await withRatings(favs.map((f) => f.course));
  return (
    <>
      <PageHeader title="Mes favoris" subtitle="Les formations que vous avez mises de côté." />
      {courses.length === 0 ? <EmptyState icon={<Heart className="h-6 w-6" />} title="Aucun favori" text="Ajoutez des formations à vos favoris depuis leur fiche." /> : (
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">{courses.map((c) => <CourseCard key={c.id} course={c} />)}</div>
      )}
    </>
  );
}
