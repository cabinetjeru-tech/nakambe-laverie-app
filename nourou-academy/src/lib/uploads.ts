/**
 * Validation des fichiers téléversés : type réel détecté par signature binaire
 * (le type annoncé par le navigateur et l'extension ne suffisent pas).
 */

export type UploadCategory = "image" | "video" | "audio" | "document" | "subtitle" | "knowledge";

type Detected = { mime: string; ext: string } | null;

function startsWith(buf: Buffer, bytes: number[], offset = 0) {
  return bytes.every((b, i) => buf[offset + i] === b);
}

function isProbablyText(buf: Buffer): boolean {
  const sample = buf.subarray(0, Math.min(buf.length, 8192));
  if (sample.includes(0)) return false;
  try {
    new TextDecoder("utf-8", { fatal: true }).decode(sample.subarray(0, sample.length - 4));
    return true;
  } catch {
    return false;
  }
}

export function detectFileType(buf: Buffer, filename: string): Detected {
  const ext = (filename.split(".").pop() || "").toLowerCase();
  if (startsWith(buf, [0x25, 0x50, 0x44, 0x46])) return { mime: "application/pdf", ext: "pdf" };
  if (startsWith(buf, [0x89, 0x50, 0x4e, 0x47])) return { mime: "image/png", ext: "png" };
  if (startsWith(buf, [0xff, 0xd8, 0xff])) return { mime: "image/jpeg", ext: "jpg" };
  if (startsWith(buf, [0x47, 0x49, 0x46, 0x38])) return { mime: "image/gif", ext: "gif" };
  if (startsWith(buf, [0x52, 0x49, 0x46, 0x46]) && startsWith(buf, [0x57, 0x45, 0x42, 0x50], 8)) return { mime: "image/webp", ext: "webp" };
  if (startsWith(buf, [0x52, 0x49, 0x46, 0x46]) && startsWith(buf, [0x57, 0x41, 0x56, 0x45], 8)) return { mime: "audio/wav", ext: "wav" };
  if (startsWith(buf, [0x1a, 0x45, 0xdf, 0xa3])) return { mime: "video/webm", ext: "webm" }; // conteneur WebM (vidéo ou enregistrement vocal)
  if (startsWith(buf, [0x4f, 0x67, 0x67, 0x53])) return { mime: "audio/ogg", ext: "ogg" };
  if (startsWith(buf, [0x49, 0x44, 0x33]) || startsWith(buf, [0xff, 0xfb]) || startsWith(buf, [0xff, 0xf3])) return { mime: "audio/mpeg", ext: "mp3" };
  if (startsWith(buf, [0x66, 0x74, 0x79, 0x70], 4)) {
    const brand = buf.subarray(8, 12).toString("ascii");
    if (brand.startsWith("M4A")) return { mime: "audio/mp4", ext: "m4a" };
    return { mime: "video/mp4", ext: "mp4" };
  }
  if (startsWith(buf, [0x50, 0x4b, 0x03, 0x04])) {
    if (ext === "docx") return { mime: "application/vnd.openxmlformats-officedocument.wordprocessingml.document", ext };
    if (ext === "pptx") return { mime: "application/vnd.openxmlformats-officedocument.presentationml.presentation", ext };
    if (ext === "xlsx") return { mime: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", ext };
    if (ext === "zip") return { mime: "application/zip", ext };
    return null;
  }
  if (isProbablyText(buf)) {
    if (ext === "vtt") return { mime: "text/vtt", ext };
    if (ext === "srt") return { mime: "application/x-subrip", ext };
    if (ext === "md" || ext === "markdown") return { mime: "text/markdown", ext: "md" };
    if (ext === "csv") return { mime: "text/csv", ext };
    if (ext === "txt" || ext === "") return { mime: "text/plain", ext: "txt" };
  }
  return null;
}

const allowed: Record<UploadCategory, string[]> = {
  image: ["image/png", "image/jpeg", "image/webp", "image/gif"],
  video: ["video/mp4", "video/webm"],
  audio: ["audio/mpeg", "audio/wav", "audio/ogg", "audio/mp4", "video/webm", "audio/webm"],
  subtitle: ["text/vtt", "application/x-subrip"],
  document: [
    "application/pdf", "text/plain", "text/markdown", "text/csv", "application/zip",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    "image/png", "image/jpeg", "image/webp",
  ],
  knowledge: [
    "application/pdf", "text/plain", "text/markdown",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  ],
};

export function validateUpload(buf: Buffer, filename: string, category: UploadCategory, maxBytes: number) {
  if (buf.length === 0) return { ok: false as const, error: "Fichier vide." };
  if (buf.length > maxBytes) return { ok: false as const, error: `Fichier trop volumineux (max ${Math.round(maxBytes / 1024 / 1024)} Mo).` };
  const detected = detectFileType(buf, filename);
  if (!detected || !allowed[category].includes(detected.mime)) {
    return { ok: false as const, error: "Type de fichier non autorisé pour cet usage." };
  }
  return { ok: true as const, mime: detected.mime, ext: detected.ext };
}
