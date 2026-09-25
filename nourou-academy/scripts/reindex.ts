/**
 * Ré-indexe toute la base de connaissances du tuteur (textes de leçons + fichiers).
 * À lancer après l'ajout d'une clé OpenAI pour générer les embeddings :  npm run rag:reindex
 */
import { prisma } from "../src/lib/db";
import { indexLesson, ingestDocument } from "../src/lib/rag/ingest";

async function main() {
  const lessons = await prisma.lesson.findMany({ select: { id: true } });
  for (const l of lessons) await indexLesson(l.id, null);
  const files = await prisma.knowledgeDocument.findMany({ where: { sourceType: "FILE" }, select: { id: true } });
  for (const f of files) await ingestDocument(f.id);
  const stats = await prisma.knowledgeDocument.groupBy({ by: ["status", "embedded"], _count: true });
  console.log(`Leçons : ${lessons.length}, fichiers : ${files.length}`, stats);
}
main().finally(() => prisma.$disconnect());
