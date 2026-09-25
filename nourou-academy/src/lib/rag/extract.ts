import "server-only";
import JSZip from "jszip";
import type { SourceUnit } from "./chunk";

/** Extraction du texte des supports pédagogiques : PDF, DOCX, PPTX, TXT, Markdown. */
export async function extractUnits(buffer: Buffer, mimeType: string): Promise<SourceUnit[]> {
  switch (mimeType) {
    case "application/pdf": {
      const { extractText, getDocumentProxy } = await import("unpdf");
      const pdf = await getDocumentProxy(new Uint8Array(buffer));
      const { text } = await extractText(pdf, { mergePages: false });
      return (text as string[]).map((t, i) => ({ text: t, page: i + 1 }));
    }
    case "application/vnd.openxmlformats-officedocument.wordprocessingml.document": {
      const mammoth = await import("mammoth");
      const { value } = await mammoth.extractRawText({ buffer });
      return [{ text: value }];
    }
    case "application/vnd.openxmlformats-officedocument.presentationml.presentation": {
      const zip = await JSZip.loadAsync(buffer);
      const slideNames = Object.keys(zip.files)
        .filter((n) => /^ppt\/slides\/slide\d+\.xml$/.test(n))
        .sort((a, b) => Number(/(\d+)\.xml$/.exec(a)![1]) - Number(/(\d+)\.xml$/.exec(b)![1]));
      const units: SourceUnit[] = [];
      for (const name of slideNames) {
        const n = Number(/(\d+)\.xml$/.exec(name)![1]);
        const xml = await zip.file(name)!.async("string");
        const notesXml = await zip.file(`ppt/notesSlides/notesSlide${n}.xml`)?.async("string");
        const texts = (x: string) =>
          [...x.matchAll(/<a:p>([\s\S]*?)<\/a:p>/g)]
            .map((p) => [...p[1]!.matchAll(/<a:t>([^<]*)<\/a:t>/g)].map((m) => decodeXml(m[1]!)).join(""))
            .filter((l) => l.trim())
            .join("\n");
        const body = texts(xml);
        const notes = notesXml ? texts(notesXml) : "";
        const title = body.split("\n")[0]?.slice(0, 150);
        units.push({ text: body + (notes ? `\n\nNotes : ${notes}` : ""), page: n, heading: title ? `Diapositive ${n} — ${title}` : `Diapositive ${n}` });
      }
      return units;
    }
    case "text/plain":
    case "text/markdown":
      return [{ text: buffer.toString("utf8") }];
    default:
      throw new Error("Format non pris en charge pour l'indexation (PDF, DOCX, PPTX, TXT, MD).");
  }
}

function decodeXml(s: string) {
  return s
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&");
}
