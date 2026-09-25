import "server-only";
import { prisma } from "../db";
import { readFileBuffer } from "../storage";
import { embed, toVectorLiteral } from "../ai/embeddings";
import { chunkUnits, type SourceUnit } from "./chunk";
import { extractUnits } from "./extract";

/**
 * Indexation d'un document de la base de connaissances :
 * extraction → découpage → embeddings (si disponibles) → stockage pgvector.
 */
export async function ingestDocument(documentId: string) {
  const doc = await prisma.knowledgeDocument.findUnique({ where: { id: documentId }, include: { file: true, lesson: true } });
  if (!doc) return;
  await prisma.knowledgeDocument.update({ where: { id: documentId }, data: { status: "PROCESSING", error: null } });
  try {
    let units: SourceUnit[];
    if (doc.sourceType === "LESSON") {
      if (!doc.lesson) throw new Error("Leçon introuvable");
      units = [{ text: doc.lesson.content || "", heading: doc.lesson.title }];
    } else {
      if (!doc.file) throw new Error("Fichier introuvable");
      units = await extractUnits(await readFileBuffer(doc.file), doc.file.mimeType);
    }
    const chunks = chunkUnits(units);
    if (chunks.length === 0) throw new Error("Aucun texte exploitable n'a pu être extrait (document scanné ? Un PDF texte est nécessaire).");

    const vectors = await embed(
      chunks.map((c) => `${doc.title}${c.heading ? ` — ${c.heading}` : ""}\n${c.content}`),
      doc.createdById,
    ).catch((e) => {
      console.error("[rag] embeddings indisponibles, repli plein texte :", (e as Error).message);
      return null;
    });

    await prisma.$transaction(async (tx) => {
      await tx.knowledgeChunk.deleteMany({ where: { documentId } });
      for (let i = 0; i < chunks.length; i++) {
        const c = chunks[i]!;
        const created = await tx.knowledgeChunk.create({
          data: {
            documentId,
            courseId: doc.courseId,
            lessonId: doc.lessonId,
            position: c.position,
            heading: c.heading?.slice(0, 250),
            page: c.page,
            content: c.content,
          },
          select: { id: true },
        });
        const v = vectors?.[i];
        if (v) {
          await tx.$executeRaw`UPDATE "KnowledgeChunk" SET "embedding" = ${toVectorLiteral(v)}::vector WHERE "id" = ${created.id}`;
        }
      }
      await tx.knowledgeDocument.update({
        where: { id: documentId },
        data: { status: "READY", chunkCount: chunks.length, embedded: !!vectors, error: null },
      });
    }, { timeout: 120_000 });
  } catch (e) {
    await prisma.knowledgeDocument.update({
      where: { id: documentId },
      data: { status: "FAILED", error: (e as Error).message.slice(0, 500) },
    });
  }
}

/** Indexe (ou ré-indexe) automatiquement le texte d'une leçon. */
export async function indexLesson(lessonId: string, userId: string | null) {
  const lesson = await prisma.lesson.findUnique({ where: { id: lessonId }, include: { module: true } });
  if (!lesson) return;
  const existing = await prisma.knowledgeDocument.findFirst({ where: { lessonId, sourceType: "LESSON" } });
  if (!lesson.content || lesson.content.trim().length < 40) {
    if (existing) await prisma.knowledgeDocument.delete({ where: { id: existing.id } });
    return;
  }
  const doc =
    existing ??
    (await prisma.knowledgeDocument.create({
      data: { courseId: lesson.module.courseId, lessonId, title: `Leçon : ${lesson.title}`, sourceType: "LESSON", createdById: userId },
    }));
  if (existing && existing.title !== `Leçon : ${lesson.title}`) {
    await prisma.knowledgeDocument.update({ where: { id: doc.id }, data: { title: `Leçon : ${lesson.title}` } });
  }
  await ingestDocument(doc.id);
}
