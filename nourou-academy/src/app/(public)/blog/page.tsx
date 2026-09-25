import type { Metadata } from "next";
import Link from "next/link";
import { prisma } from "@/lib/db";
import { formatDate } from "@/lib/format";
import { Badge, EmptyState } from "@/components/ui";

export const metadata: Metadata = { title: "Blog et ressources gratuites" };
export const dynamic = "force-dynamic";

export default async function BlogPage({ searchParams }: { searchParams: Promise<{ type?: string }> }) {
  const { type } = await searchParams;
  const posts = await prisma.blogPost.findMany({
    where: { published: true, ...(type === "ressources" ? { kind: "RESOURCE" } : type === "articles" ? { kind: "ARTICLE" } : {}) },
    orderBy: { publishedAt: "desc" },
  });
  return (
    <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6">
      <h1 className="text-3xl font-bold text-navy">Blog et ressources gratuites</h1>
      <p className="mt-1 text-muted">Conseils pratiques, modèles et outils à télécharger pour progresser.</p>
      <div className="mt-6 flex gap-2 text-sm">
        {[["", "Tout"], ["articles", "Articles"], ["ressources", "Ressources"]].map(([v, l]) => (
          <Link key={v} href={v ? `/blog?type=${v}` : "/blog"} className={`rounded-full px-3 py-1 ${(type ?? "") === v ? "bg-navy text-white" : "bg-sky-50 text-navy"}`}>{l}</Link>
        ))}
      </div>
      {posts.length === 0 ? <div className="mt-8"><EmptyState title="Aucune publication pour le moment" /></div> : (
        <div className="mt-8 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {posts.map((p) => (
            <Link key={p.id} href={`/blog/${p.slug}`} className="group rounded-2xl border border-line bg-white p-6 shadow-soft hover:border-sky-200">
              <Badge tone={p.kind === "RESOURCE" ? "accent" : "sky"}>{p.kind === "RESOURCE" ? "Ressource gratuite" : "Article"}</Badge>
              <h2 className="mt-3 font-semibold text-navy group-hover:text-sky">{p.title}</h2>
              <p className="mt-2 line-clamp-3 text-sm text-muted">{p.excerpt}</p>
              <div className="mt-4 text-xs text-muted">{formatDate(p.publishedAt)}</div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
