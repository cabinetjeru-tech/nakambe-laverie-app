import "server-only";
import type { StoredFile } from "@prisma/client";
import type { SessionUser } from "./auth/session";
import { prisma } from "./db";
import { canManageCourse } from "./access";
import { can } from "./permissions";
import { getTechnicalSettings } from "./settings";
import { validateUpload, type UploadCategory } from "./uploads";
import { ingestDocument } from "./rag/ingest";
import { audit } from "./audit";
import { deleteStoredFile } from "./storage";

export type UploadParams = { purpose: string; targetId: string; kind: string; label?: string | null; lang?: string | null; downloadable?: string | null; lessonId?: string | null };

export type UploadTarget = {
  category: UploadCategory;
  maxBytes: number;
  visibility: "PUBLIC" | "PRIVATE";
  folder: string;
  kind: "VIDEO" | "SUBTITLE" | "DOCUMENT";
  courseId: string | null;
  lessonId: string | null;
};

/** Vérifie les droits et détermine la catégorie de fichier autorisée selon l'usage. Renvoie une erreur lisible sinon. */
export async function resolveUploadTarget(user: SessionUser, p: UploadParams): Promise<UploadTarget | { error: string; status: number }> {
  const tech = await getTechnicalSettings();
  const kind = (["VIDEO", "SUBTITLE", "DOCUMENT"].includes(p.kind) ? p.kind : "DOCUMENT") as UploadTarget["kind"];
  let maxMb = tech.maxUploadMb;
  const base = { kind, courseId: null as string | null, lessonId: null as string | null, folder: p.purpose };
  if (p.purpose === "lesson-asset") {
    const lesson = await prisma.lesson.findUnique({ where: { id: p.targetId }, select: { id: true, module: { select: { courseId: true } } } });
    if (!lesson || !(await canManageCourse(user, lesson.module.courseId))) return { error: "Action non autorisée.", status: 403 };
    if (kind === "VIDEO") maxMb = Math.max(maxMb, 1024);
    else if (kind === "DOCUMENT") maxMb = Math.max(maxMb, 200); // les supports peuvent être des vidéos ou présentations lourdes
    return { ...base, category: kind === "VIDEO" ? "video" : kind === "SUBTITLE" ? "subtitle" : "lessonFile", maxBytes: maxMb * 1048576, visibility: "PRIVATE", courseId: lesson.module.courseId, lessonId: lesson.id };
  }
  if (p.purpose === "knowledge") {
    if (!(await canManageCourse(user, p.targetId))) return { error: "Action non autorisée.", status: 403 };
    return { ...base, category: "knowledge", maxBytes: maxMb * 1048576, visibility: "PRIVATE", courseId: p.targetId, lessonId: p.lessonId || null };
  }
  if (p.purpose === "cover") {
    if (!(await canManageCourse(user, p.targetId))) return { error: "Action non autorisée.", status: 403 };
    return { ...base, category: "image", maxBytes: 5 * 1048576, visibility: "PUBLIC", courseId: p.targetId };
  }
  if (p.purpose === "trailer") {
    if (!(await canManageCourse(user, p.targetId))) return { error: "Action non autorisée.", status: 403 };
    return { ...base, category: "video", maxBytes: Math.max(maxMb, 200) * 1048576, visibility: "PUBLIC", courseId: p.targetId };
  }
  if (p.purpose === "avatar") return { ...base, category: "image", maxBytes: 3 * 1048576, visibility: "PUBLIC" };
  if (p.purpose === "trainer-avatar") {
    if (!can(user.role, "users.manage")) return { error: "Action non autorisée.", status: 403 };
    const trainer = await prisma.user.findFirst({ where: { id: p.targetId, role: "TRAINER" }, select: { id: true } });
    if (!trainer) return { error: "Formateur introuvable.", status: 404 };
    return { ...base, category: "image", maxBytes: 3 * 1048576, visibility: "PUBLIC" };
  }
  if (p.purpose === "brand-logo") {
    if (!can(user.role, "settings.manage")) return { error: "Action non autorisée.", status: 403 };
    return { ...base, category: "image", maxBytes: 2 * 1048576, visibility: "PUBLIC" };
  }
  return { error: "Usage inconnu.", status: 400 };
}

/** Rattache le fichier enregistré à son usage (leçon, base de connaissances, couverture…). */
export async function linkUpload(user: SessionUser, t: UploadTarget, p: UploadParams, stored: StoredFile, head: Buffer) {
  if (p.purpose === "lesson-asset" && t.lessonId) {
    const label = (p.label || stored.originalName.replace(/\.[^.]+$/, "")).slice(0, 150);
    // Vidéos et sous-titres : consultation en ligne uniquement. Documents : selon le choix du formateur.
    const downloadable = t.kind === "DOCUMENT" && p.downloadable !== "0";
    await prisma.lessonAsset.create({
      data: { lessonId: t.lessonId, fileId: stored.id, kind: t.kind, label, lang: p.lang || (t.kind === "SUBTITLE" ? "fr" : null), downloadable },
    });
    // Les documents de leçon compatibles alimentent aussi la base de connaissances du tuteur.
    if (t.kind === "DOCUMENT" && t.courseId && validateUpload(head, stored.originalName, "knowledge", Number.MAX_SAFE_INTEGER).ok) {
      const doc = await prisma.knowledgeDocument.create({ data: { courseId: t.courseId, lessonId: t.lessonId, fileId: stored.id, title: label, sourceType: "FILE", createdById: user.id } });
      await ingestDocument(doc.id);
    }
  } else if (p.purpose === "knowledge" && t.courseId) {
    const doc = await prisma.knowledgeDocument.create({
      data: { courseId: t.courseId, lessonId: t.lessonId, fileId: stored.id, title: (p.label || stored.originalName).slice(0, 200), sourceType: "FILE", createdById: user.id },
    });
    await ingestDocument(doc.id);
  } else if (p.purpose === "cover" && t.courseId) {
    await prisma.course.update({ where: { id: t.courseId }, data: { imageFileId: stored.id, imageUrl: null } });
  } else if (p.purpose === "trailer" && t.courseId) {
    const before = await prisma.course.findUnique({ where: { id: t.courseId }, select: { trailerFileId: true } });
    await prisma.course.update({ where: { id: t.courseId }, data: { trailerFileId: stored.id, trailerUrl: null } });
    if (before?.trailerFileId) await deleteStoredFile(before.trailerFileId).catch(() => undefined);
  } else if (p.purpose === "avatar") {
    await prisma.user.update({ where: { id: user.id }, data: { avatarFileId: stored.id } });
  } else if (p.purpose === "trainer-avatar") {
    await prisma.user.update({ where: { id: p.targetId }, data: { avatarFileId: stored.id } });
    await audit(user.id, "trainer.avatar", "User", p.targetId);
  } else if (p.purpose === "brand-logo") {
    await audit(user.id, "settings.logo", "Setting", "brand");
  }
}

export function paramsFromUrl(url: URL): UploadParams {
  const g = (k: string) => url.searchParams.get(k);
  return { purpose: g("purpose") ?? "", targetId: g("targetId") ?? "", kind: g("kind") ?? "DOCUMENT", label: g("label"), lang: g("lang"), downloadable: g("downloadable"), lessonId: g("lessonId") };
}
