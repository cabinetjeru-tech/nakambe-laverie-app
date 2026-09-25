/**
 * Découpage des documents en passages (chunks) pour le RAG.
 * Fonction pure, testée dans tests/chunk.test.ts.
 */

export type SourceUnit = { text: string; page?: number; heading?: string };
export type Chunk = { content: string; page?: number; heading?: string; position: number };

const TARGET = 1200; // caractères visés par passage (~300 tokens)
const OVERLAP = 200; // chevauchement pour ne pas couper une idée

function normalize(text: string) {
  return text
    .replace(/\r\n/g, "\n")
    .replace(/[ \t ]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function splitLong(paragraph: string): string[] {
  if (paragraph.length <= TARGET) return [paragraph];
  const sentences = paragraph.match(/[^.!?\n]+[.!?]*\s*/g) ?? [paragraph];
  const parts: string[] = [];
  let cur = "";
  for (const s of sentences) {
    if ((cur + s).length > TARGET && cur) {
      parts.push(cur.trim());
      cur = "";
    }
    if (s.length > TARGET) {
      for (let i = 0; i < s.length; i += TARGET) parts.push(s.slice(i, i + TARGET).trim());
    } else cur += s;
  }
  if (cur.trim()) parts.push(cur.trim());
  return parts;
}

export function chunkUnits(units: SourceUnit[]): Chunk[] {
  const chunks: Chunk[] = [];
  let position = 0;
  for (const unit of units) {
    const text = normalize(unit.text);
    if (!text) continue;
    let heading = unit.heading;
    let buffer = "";
    let bufferHeading = heading;
    const flush = () => {
      const content = buffer.trim();
      if (content.length >= 20) chunks.push({ content, page: unit.page, heading: bufferHeading, position: position++ });
      // chevauchement : on garde la fin du passage précédent
      buffer = content.length > OVERLAP ? content.slice(-OVERLAP).replace(/^\S*\s/, "") + "\n" : "";
      bufferHeading = heading;
    };
    for (const raw of text.split(/\n\s*\n|\n(?=#{1,6}\s)/)) {
      const para = raw.trim();
      if (!para) continue;
      const h = /^#{1,6}\s+(.+)$/.exec(para.split("\n")[0]!);
      if (h) {
        if (buffer.trim().length > OVERLAP) flush();
        heading = h[1]!.trim().slice(0, 200);
        bufferHeading = heading;
        buffer = "";
      }
      for (const piece of splitLong(para)) {
        if (buffer.length + piece.length > TARGET && buffer.trim().length > OVERLAP) flush();
        buffer += piece + "\n\n";
      }
    }
    if (buffer.trim().length > 0) {
      const content = buffer.trim();
      const last = chunks[chunks.length - 1];
      // évite de créer un passage qui ne serait que le chevauchement
      if (!(last && last.content.endsWith(content))) {
        if (content.length >= 20) chunks.push({ content, page: unit.page, heading: bufferHeading, position: position++ });
      }
    }
  }
  return chunks;
}
