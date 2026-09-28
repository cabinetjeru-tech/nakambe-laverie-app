import "server-only";
import { promises as fs } from "node:fs";
import path from "node:path";
import { detectKind, extractText } from "./extract";
import { parseMetaBlock, splitFrontmatter } from "./metadata";
import type { RefDocument } from "./search";

/**
 * Bibliothèque de référence : documents déposés dans le dossier `referentiels/` (programmes, guides,
 * progressions…). Chargée une fois par instance serveur, puis gardée en mémoire.
 */

const ROOT = path.join(process.cwd(), "referentiels");
const SUPPORTED = /\.(md|txt|pdf|docx)$/i;

let cache: Promise<RefDocument[]> | null = null;

async function walk(dir: string): Promise<string[]> {
  let entries: import("node:fs").Dirent[];
  try {
    entries = await fs.readdir(dir, { withFileTypes: true });
  } catch {
    return [];
  }
  const out: string[] = [];
  for (const e of entries) {
    if (e.name.startsWith(".")) continue;
    const full = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...(await walk(full)));
    else if (SUPPORTED.test(e.name) && e.name.toLowerCase() !== "lisez-moi.md") out.push(full);
  }
  return out.sort();
}

async function load(): Promise<RefDocument[]> {
  const files = await walk(ROOT);
  const docs: RefDocument[] = [];
  for (const file of files) {
    const rel = path.relative(ROOT, file).split(path.sep).join("/");
    try {
      const buf = await fs.readFile(file);
      const kind = detectKind(buf, file);
      if (!kind) continue;
      let text: string;
      let meta;
      if (kind === "text") {
        const split = splitFrontmatter(buf.toString("utf8"));
        meta = split.meta;
        text = split.body;
      } else {
        text = await extractText(buf, kind);
        const side = await fs.readFile(`${file}.meta`, "utf8").catch(() => "");
        meta = parseMetaBlock(side);
      }
      if (!text.trim()) {
        console.warn(`[referentiels] ${rel} : aucun texte extrait (document scanné ?)`);
        continue;
      }
      docs.push({
        id: `bib:${rel}`,
        title: meta.titre || path.basename(file).replace(SUPPORTED, "").replace(/[-_]+/g, " "),
        type: meta.type || "document de référence",
        origin: "bibliotheque",
        classes: meta.classes,
        disciplines: meta.disciplines,
        source: meta.source,
        status: meta.statut,
        notice: meta.avertissement,
        text,
      });
    } catch (e) {
      console.error(`[referentiels] Lecture impossible de ${rel} :`, (e as Error).message);
    }
  }
  return docs;
}

export function getLibrary(): Promise<RefDocument[]> {
  if (!cache) cache = load().catch((e) => {
    cache = null;
    throw e;
  });
  return cache;
}
