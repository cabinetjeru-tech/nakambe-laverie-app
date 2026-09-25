import "server-only";
import { Prisma } from "@prisma/client";
import { prisma } from "../db";
import { embed, toVectorLiteral } from "../ai/embeddings";

export type RetrievedPassage = {
  id: string;
  content: string;
  heading: string | null;
  page: number | null;
  courseId: string;
  courseTitle: string;
  documentTitle: string;
  lessonId: string | null;
  lessonTitle: string | null;
  score: number;
};

/**
 * Recherche hybride : similarité vectorielle (pgvector) + plein texte français,
 * fusionnées par Reciprocal Rank Fusion. Le filtre `courseIds` applique les
 * droits d'accès : un apprenant ne récupère jamais un passage d'une formation
 * qu'il n'a pas le droit de consulter.
 */
export async function retrievePassages(opts: {
  query: string;
  courseIds: string[] | "all";
  focusCourseId?: string | null;
  limit?: number;
  userId?: string | null;
}): Promise<RetrievedPassage[]> {
  const { query } = opts;
  const limit = opts.limit ?? 6;
  if (opts.courseIds !== "all" && opts.courseIds.length === 0) return [];
  const courseFilter =
    opts.courseIds === "all" ? Prisma.sql`TRUE` : Prisma.sql`c."courseId" = ANY(${opts.courseIds}::text[])`;

  const ranks = new Map<string, number>();
  const addRanks = (ids: string[], weight = 1) =>
    ids.forEach((id, i) => ranks.set(id, (ranks.get(id) ?? 0) + weight / (60 + i + 1)));

  // 1) Plein texte (toujours disponible) : requête OR sur les lexèmes de la question,
  //    classée d'abord par nombre de termes distincts trouvés, puis par pertinence.
  const fts = await prisma.$queryRaw<{ id: string }[]>`
    WITH terms AS (
      SELECT DISTINCT unnest(tsvector_to_array(to_tsvector('french', ${query}))) AS t
    ), q AS (
      SELECT to_tsquery('simple', string_agg(quote_literal(t), ' | ')) AS tq FROM terms
      WHERE t NOT IN ('comment', 'pourquoi', 'quoi', 'quel', 'quell', 'expliqu', 'peux', 'veux', 'fair', 'est')
    )
    SELECT c."id",
      (SELECT count(*) FROM terms WHERE c."tsv" @@ to_tsquery('simple', quote_literal(terms.t))) AS hits,
      ts_rank(c."tsv", q.tq) AS rank
    FROM "KnowledgeChunk" c, q
    WHERE q.tq IS NOT NULL AND c."tsv" @@ q.tq AND ${courseFilter}
    ORDER BY hits DESC, rank DESC
    LIMIT 20`;
  addRanks(fts.map((r) => r.id));

  // 2) Vectoriel (si un fournisseur d'embeddings est configuré).
  const qv = await embed([query], opts.userId ?? null).catch(() => null);
  if (qv?.[0]) {
    const vec = toVectorLiteral(qv[0]);
    const vs = await prisma.$queryRaw<{ id: string; sim: number }[]>`
      SELECT c."id", 1 - (c."embedding" <=> ${vec}::vector) AS sim
      FROM "KnowledgeChunk" c
      WHERE c."embedding" IS NOT NULL AND ${courseFilter}
      ORDER BY c."embedding" <=> ${vec}::vector
      LIMIT 20`;
    addRanks(vs.filter((r) => r.sim > 0.2).map((r) => r.id), 1.2);
  }

  if (ranks.size === 0) return [];
  const rows = await prisma.knowledgeChunk.findMany({
    where: { id: { in: [...ranks.keys()] } },
    include: {
      document: { select: { title: true, course: { select: { title: true } } } },
      lesson: { select: { title: true } },
    },
  });
  return rows
    .map((r) => ({
      id: r.id,
      content: r.content,
      heading: r.heading,
      page: r.page,
      courseId: r.courseId,
      courseTitle: r.document.course.title,
      documentTitle: r.document.title,
      lessonId: r.lessonId,
      lessonTitle: r.lesson?.title ?? null,
      score: (ranks.get(r.id) ?? 0) * (opts.focusCourseId && r.courseId === opts.focusCourseId ? 1.5 : 1),
    }))
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}
