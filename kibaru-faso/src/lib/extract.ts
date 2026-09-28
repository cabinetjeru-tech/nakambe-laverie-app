import "server-only";

/** Extraction du texte des documents : PDF, DOCX, TXT, Markdown. */

export type SupportedKind = "pdf" | "docx" | "text";

export function detectKind(buffer: Buffer, filename: string): SupportedKind | null {
  const name = filename.toLowerCase();
  if (buffer.subarray(0, 5).toString("latin1") === "%PDF-") return "pdf";
  // DOCX = archive ZIP (« PK\x03\x04 ») avec extension .docx
  if (buffer[0] === 0x50 && buffer[1] === 0x4b && name.endsWith(".docx")) return "docx";
  if (/\.(txt|md|markdown)$/.test(name) && !buffer.subarray(0, 4096).includes(0)) return "text";
  return null;
}

export async function extractText(buffer: Buffer, kind: SupportedKind): Promise<string> {
  switch (kind) {
    case "pdf": {
      const { extractText: pdfText, getDocumentProxy } = await import("unpdf");
      const pdf = await getDocumentProxy(new Uint8Array(buffer));
      const { text } = await pdfText(pdf, { mergePages: false });
      return (text as string[]).map((t) => t.trim()).filter(Boolean).join("\n\n");
    }
    case "docx": {
      const mammoth = await import("mammoth");
      const { value } = await mammoth.extractRawText({ buffer });
      return value;
    }
    case "text":
      return buffer.toString("utf8");
  }
}
