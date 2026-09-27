/** Familles de fichiers pour l'affichage (icône, libellé) et le choix du lecteur en ligne. */
export type FileKind = "image" | "video" | "audio" | "pdf" | "presentation" | "document" | "spreadsheet" | "text" | "archive" | "other";

export function fileKind(mime: string): FileKind {
  if (mime.startsWith("image/")) return "image";
  if (mime.startsWith("video/")) return "video";
  if (mime.startsWith("audio/")) return "audio";
  if (mime === "application/pdf") return "pdf";
  if (/presentation|powerpoint/.test(mime)) return "presentation";
  if (/spreadsheet|ms-excel|text\/csv/.test(mime)) return "spreadsheet";
  if (/wordprocessing|msword|opendocument\.text/.test(mime)) return "document";
  if (mime.startsWith("text/")) return "text";
  if (mime === "application/zip") return "archive";
  return "other";
}

export const fileKindLabels: Record<FileKind, string> = {
  image: "Image",
  video: "Vidéo",
  audio: "Audio",
  pdf: "PDF",
  presentation: "Présentation",
  document: "Document",
  spreadsheet: "Tableur",
  text: "Texte",
  archive: "Archive ZIP",
  other: "Fichier",
};

export function fileSizeLabel(n: number) {
  return n >= 1024 * 1024 ? `${(n / 1024 / 1024).toFixed(1).replace(".", ",")} Mo` : `${Math.max(1, Math.ceil(n / 1024))} Ko`;
}

/** Types Office consultables en ligne via la visionneuse Microsoft (le fichier doit être accessible publiquement le temps de l'affichage). */
export function isOfficeViewable(kind: FileKind) {
  return kind === "presentation" || kind === "document" || kind === "spreadsheet";
}
