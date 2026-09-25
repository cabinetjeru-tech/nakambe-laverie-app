import { NextResponse } from "next/server";
import { createWriteStream, promises as fs } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { prisma } from "@/lib/db";
import { assertUser } from "@/lib/auth/session";
import { handle, jsonError } from "@/lib/api";
import { canManageCourse } from "@/lib/access";
import { can } from "@/lib/permissions";
import { storeBuffer } from "@/lib/storage";
import { validateUpload, type UploadCategory } from "@/lib/uploads";
import { getTechnicalSettings } from "@/lib/settings";
import { rateLimit } from "@/lib/rate-limit";
import { ingestDocument } from "@/lib/rag/ingest";
import { audit } from "@/lib/audit";

export const runtime = "nodejs";
export const maxDuration = 300;

/**
 * Téléversement de fichiers pédagogiques (corps brut, flux écrit sur disque : pas de saturation mémoire).
 * Paramètres (query) :
 *   purpose = lesson-asset | knowledge | cover | avatar | brand-logo
 *   targetId = id de leçon / formation selon l'usage
 *   kind = VIDEO | SUBTITLE | DOCUMENT (pour lesson-asset), label, lang, downloadable
 * En-tête X-Filename : nom d'origine (encodé URI).
 */
export const POST = handle(async (req: Request) => {
  const user = await assertUser();
  if (!rateLimit(`upload:${user.id}`, 30, 10 * 60_000).ok) return jsonError(429, "Trop de téléversements, patientez.");
  const url = new URL(req.url);
  const purpose = url.searchParams.get("purpose") ?? "";
  const targetId = url.searchParams.get("targetId") ?? "";
  const kind = (url.searchParams.get("kind") ?? "DOCUMENT") as "VIDEO" | "SUBTITLE" | "DOCUMENT";
  const filename = decodeURIComponent(req.headers.get("x-filename") ?? "fichier").slice(0, 200);
  const tech = await getTechnicalSettings();

  // Autorisations et catégorie de fichier selon l'usage.
  let category: UploadCategory;
  let maxMb = tech.maxUploadMb;
  let courseId: string | null = null;
  let lessonId: string | null = null;
  if (purpose === "lesson-asset") {
    const lesson = await prisma.lesson.findUnique({ where: { id: targetId }, select: { id: true, module: { select: { courseId: true } } } });
    if (!lesson || !(await canManageCourse(user, lesson.module.courseId))) return jsonError(403, "Action non autorisée.");
    lessonId = lesson.id;
    courseId = lesson.module.courseId;
    category = kind === "VIDEO" ? "video" : kind === "SUBTITLE" ? "subtitle" : "document";
    if (kind === "VIDEO") maxMb = Math.max(tech.maxUploadMb, 1024);
  } else if (purpose === "knowledge") {
    if (!(await canManageCourse(user, targetId))) return jsonError(403, "Action non autorisée.");
    courseId = targetId;
    lessonId = url.searchParams.get("lessonId") || null;
    category = "knowledge";
  } else if (purpose === "cover") {
    if (!(await canManageCourse(user, targetId))) return jsonError(403, "Action non autorisée.");
    courseId = targetId;
    category = "image";
    maxMb = 5;
  } else if (purpose === "avatar") {
    category = "image";
    maxMb = 3;
  } else if (purpose === "brand-logo") {
    if (!can(user.role, "settings.manage")) return jsonError(403, "Action non autorisée.");
    category = "image";
    maxMb = 2;
  } else return jsonError(400, "Usage inconnu.");

  const maxBytes = maxMb * 1024 * 1024;
  const declared = Number(req.headers.get("content-length") ?? 0);
  if (declared > maxBytes) return jsonError(413, `Fichier trop volumineux (max ${maxMb} Mo).`);
  if (!req.body) return jsonError(400, "Fichier manquant.");

  // Écriture en flux dans un fichier temporaire, avec coupure au-delà de la taille maximale.
  const tmp = path.join(tmpdir(), `nga-upload-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  let received = 0;
  const limiter = async function* (source: AsyncIterable<Uint8Array>) {
    for await (const chunk of source) {
      received += chunk.length;
      if (received > maxBytes) throw new Error("TOO_LARGE");
      yield chunk;
    }
  };
  try {
    await pipeline(Readable.fromWeb(req.body as never), limiter, createWriteStream(tmp));
  } catch (e) {
    await fs.rm(tmp, { force: true });
    if ((e as Error).message === "TOO_LARGE") return jsonError(413, `Fichier trop volumineux (max ${maxMb} Mo).`);
    return jsonError(400, "Téléversement interrompu. Réessayez.");
  }
  const buffer = await fs.readFile(tmp);
  await fs.rm(tmp, { force: true });
  const check = validateUpload(buffer, filename, category, maxBytes);
  if (!check.ok) return jsonError(415, check.error);

  const visibility = purpose === "cover" || purpose === "avatar" || purpose === "brand-logo" ? "PUBLIC" : "PRIVATE";
  const stored = await storeBuffer({ buffer, originalName: filename, mimeType: check.mime, ownerId: user.id, visibility, folder: purpose });

  if (purpose === "lesson-asset" && lessonId) {
    const label = (url.searchParams.get("label") || filename).slice(0, 150);
    await prisma.lessonAsset.create({
      data: { lessonId, fileId: stored.id, kind, label, lang: url.searchParams.get("lang") || (kind === "SUBTITLE" ? "fr" : null), downloadable: url.searchParams.get("downloadable") !== "0" },
    });
    // Les documents de leçon compatibles alimentent aussi la base de connaissances du tuteur.
    if (kind === "DOCUMENT" && validateUpload(buffer, filename, "knowledge", maxBytes).ok && courseId) {
      const doc = await prisma.knowledgeDocument.create({ data: { courseId, lessonId, fileId: stored.id, title: label, sourceType: "FILE", createdById: user.id } });
      await ingestDocument(doc.id);
    }
  } else if (purpose === "knowledge" && courseId) {
    const doc = await prisma.knowledgeDocument.create({
      data: { courseId, lessonId, fileId: stored.id, title: (url.searchParams.get("label") || filename).slice(0, 200), sourceType: "FILE", createdById: user.id },
    });
    await ingestDocument(doc.id);
  } else if (purpose === "cover" && courseId) {
    await prisma.course.update({ where: { id: courseId }, data: { imageFileId: stored.id, imageUrl: null } });
  } else if (purpose === "avatar") {
    await prisma.user.update({ where: { id: user.id }, data: { avatarFileId: stored.id } });
  } else if (purpose === "brand-logo") {
    await audit(user.id, "settings.logo", "Setting", "brand");
  }
  return NextResponse.json({ id: stored.id, url: visibility === "PUBLIC" ? `/api/files/${stored.id}` : null });
});
