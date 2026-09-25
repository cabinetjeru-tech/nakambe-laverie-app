import type { Metadata } from "next";
import Link from "next/link";
import { Search, SlidersHorizontal } from "lucide-react";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { courseCardSelect, withRatings } from "@/lib/catalog";
import { CourseCard } from "@/components/course/course-card";
import { EmptyState, Select, buttonClass, inputClass } from "@/components/ui";

export const metadata: Metadata = { title: "Catalogue des formations" };
export const dynamic = "force-dynamic";

type SP = { q?: string; categorie?: string; niveau?: string; prix?: string; tri?: string; page?: string };
const PAGE_SIZE = 12;

export default async function CatalogPage({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams;
  const q = (sp.q ?? "").trim().slice(0, 100);
  const page = Math.max(1, Number(sp.page) || 1);
  const and: Prisma.CourseWhereInput[] = [{ status: "PUBLISHED" }];
  if (q) {
    and.push({
      OR: [
        { title: { contains: q, mode: "insensitive" } },
        { subtitle: { contains: q, mode: "insensitive" } },
        { description: { contains: q, mode: "insensitive" } },
        { trainer: { name: { contains: q, mode: "insensitive" } } },
        { category: { name: { contains: q, mode: "insensitive" } } },
      ],
    });
  }
  if (sp.categorie) and.push({ category: { slug: sp.categorie } });
  if (sp.niveau && ["BEGINNER", "INTERMEDIATE", "ADVANCED"].includes(sp.niveau)) and.push({ level: sp.niveau as "BEGINNER" });
  if (sp.prix === "gratuit") and.push({ OR: [{ isFree: true }, { priceXof: 0 }] });
  if (sp.prix === "payant") and.push({ isFree: false, priceXof: { gt: 0 } });
  const where: Prisma.CourseWhereInput = { AND: and };
  const orderBy: Prisma.CourseOrderByWithRelationInput[] =
    sp.tri === "prix-asc" ? [{ priceXof: "asc" }] : sp.tri === "prix-desc" ? [{ priceXof: "desc" }] : sp.tri === "populaires" ? [{ enrollments: { _count: "desc" } }] : [{ featured: "desc" }, { publishedAt: "desc" }];

  const [rows, total, categories] = await Promise.all([
    prisma.course.findMany({ where, orderBy, select: courseCardSelect, skip: (page - 1) * PAGE_SIZE, take: PAGE_SIZE }),
    prisma.course.count({ where }),
    prisma.category.findMany({ orderBy: { position: "asc" } }),
  ]);
  const courses = await withRatings(rows);
  const pages = Math.ceil(total / PAGE_SIZE);
  const qs = (p: number) => {
    const u = new URLSearchParams(Object.entries(sp).filter(([k, v]) => v && k !== "page") as [string, string][]);
    u.set("page", String(p));
    return `?${u.toString()}`;
  };

  return (
    <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6">
      <h1 className="text-3xl font-bold text-navy">Catalogue des formations</h1>
      <p className="mt-1 text-muted">Trouvez la formation adaptée à votre objectif professionnel.</p>

      <form className="mt-6 grid gap-3 rounded-2xl border border-line bg-white p-4 shadow-soft md:grid-cols-[2fr_1fr_1fr_1fr_1fr_auto]" role="search">
        <label className="relative block">
          <span className="sr-only">Rechercher</span>
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" aria-hidden />
          <input name="q" defaultValue={q} placeholder="Rechercher une formation, un sujet, un formateur…" className={`${inputClass} h-10 pl-9`} />
        </label>
        <Select name="categorie" defaultValue={sp.categorie ?? ""} aria-label="Catégorie">
          <option value="">Toutes catégories</option>
          {categories.map((c) => <option key={c.id} value={c.slug}>{c.name}</option>)}
        </Select>
        <Select name="niveau" defaultValue={sp.niveau ?? ""} aria-label="Niveau">
          <option value="">Tous niveaux</option>
          <option value="BEGINNER">Débutant</option>
          <option value="INTERMEDIATE">Intermédiaire</option>
          <option value="ADVANCED">Avancé</option>
        </Select>
        <Select name="prix" defaultValue={sp.prix ?? ""} aria-label="Prix">
          <option value="">Tous prix</option>
          <option value="gratuit">Gratuites</option>
          <option value="payant">Payantes</option>
        </Select>
        <Select name="tri" defaultValue={sp.tri ?? ""} aria-label="Trier par">
          <option value="">Recommandées</option>
          <option value="populaires">Les plus suivies</option>
          <option value="prix-asc">Prix croissant</option>
          <option value="prix-desc">Prix décroissant</option>
        </Select>
        <button className={buttonClass("primary", "md")}><SlidersHorizontal className="h-4 w-4" aria-hidden /> Filtrer</button>
      </form>

      <div className="mt-6 flex flex-wrap gap-2">
        <Link href="/formations" className={`rounded-full px-3 py-1 text-sm ${!sp.categorie ? "bg-navy text-white" : "bg-sky-50 text-navy"}`}>Tout</Link>
        {categories.map((c) => (
          <Link key={c.id} href={`/formations?categorie=${c.slug}`} className={`rounded-full px-3 py-1 text-sm ${sp.categorie === c.slug ? "bg-navy text-white" : "bg-sky-50 text-navy hover:bg-sky-100"}`}>
            {c.name}
          </Link>
        ))}
      </div>

      <div className="mt-4 text-sm text-muted">{total} formation{total > 1 ? "s" : ""}</div>
      {courses.length === 0 ? (
        <div className="mt-6">
          <EmptyState title="Aucune formation ne correspond" text="Essayez d'autres mots-clés ou retirez des filtres." action={<Link href="/formations" className={buttonClass("outline")}>Réinitialiser</Link>} />
        </div>
      ) : (
        <div className="mt-4 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {courses.map((c) => <CourseCard key={c.id} course={c} />)}
        </div>
      )}
      {pages > 1 && (
        <nav className="mt-8 flex justify-center gap-2" aria-label="Pagination">
          {Array.from({ length: pages }, (_, i) => i + 1).map((p) => (
            <Link key={p} href={qs(p)} aria-current={p === page ? "page" : undefined} className={`grid h-9 w-9 place-items-center rounded-lg text-sm ${p === page ? "bg-navy text-white" : "border border-line"}`}>
              {p}
            </Link>
          ))}
        </nav>
      )}
    </div>
  );
}
