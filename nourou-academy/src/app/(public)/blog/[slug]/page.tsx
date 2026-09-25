import Link from "next/link";
import { notFound } from "next/navigation";
import { Download } from "lucide-react";
import { prisma } from "@/lib/db";
import { renderMarkdown } from "@/lib/markdown";
import { formatDate } from "@/lib/format";
import { Markdown, buttonClass } from "@/components/ui";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const p = await prisma.blogPost.findFirst({ where: { slug, published: true }, select: { title: true, excerpt: true } });
  return p ? { title: p.title, description: p.excerpt } : { title: "Article introuvable" };
}

export default async function PostPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const post = await prisma.blogPost.findFirst({ where: { slug, published: true }, include: { author: { select: { name: true } } } });
  if (!post) notFound();
  return (
    <article className="mx-auto max-w-3xl px-4 py-10 sm:px-6">
      <Link href="/blog" className="text-sm text-sky hover:underline">← Blog et ressources</Link>
      <h1 className="mt-4 text-3xl font-bold leading-tight text-navy">{post.title}</h1>
      <div className="mt-2 text-sm text-muted">{formatDate(post.publishedAt)}{post.author ? ` · ${post.author.name}` : ""}</div>
      <p className="mt-6 text-lg text-ink">{post.excerpt}</p>
      <Markdown html={renderMarkdown(post.content)} className="mt-6" />
      {post.resourceUrl && <a href={post.resourceUrl} className={buttonClass("accent", "lg", "mt-8")}><Download className="h-4 w-4" /> Télécharger la ressource</a>}
      <div className="mt-12 rounded-2xl bg-sky-50 p-6">
        <div className="font-semibold text-navy">Envie d'aller plus loin ?</div>
        <p className="mt-1 text-sm text-muted">Découvrez nos formations et échangez avec votre tuteur IA.</p>
        <Link href="/formations" className={buttonClass("primary", "md", "mt-3")}>Voir les formations</Link>
      </div>
    </article>
  );
}
