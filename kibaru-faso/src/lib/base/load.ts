import { promises as fs } from "node:fs";
import path from "node:path";
import { detectKind, extractText } from "../extract";
import { emptyMeta, parseMetaBlock, splitFrontmatter, type DocMeta } from "../metadata";
import type { RefDocument } from "../search";
import { ARCHIVES_CATEGORY, parsePath, STATUT_LABELS, type PathInfo, type Statut } from "./structure";
import { crossCheck, missingFields, pathConflicts, type Issue } from "./validate";

/**
 * Chargement de la base documentaire KIBARU FASO depuis le disque (dossier `base-documentaire/`).
 * Sans dépendance au serveur Next.js : utilisé par l'application et par le script `npm run base`.
 */

export const BASE_DIR = "base-documentaire";
const SUPPORTED = /\.(md|txt|pdf|docx)$/i;
const IGNORED = /^(lisez-moi|catalogue)\.md$/i;

/** Fiche présente sans son document : ressource référencée mais pas encore intégrée. */
export type PendingDoc = {
  path: string;
  documentId?: string;
  title: string;
  statut: Statut;
  category?: string;
  classes: string[];
  disciplines: string[];
  observations?: string;
};

export type BaseLoad = { docs: RefDocument[]; pending: PendingDoc[]; issues: Issue[] };

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
    else out.push(full);
  }
  return out.sort();
}

function titleFromFile(file: string) {
  return path.basename(file).replace(/\.meta$/i, "").replace(SUPPORTED, "").replace(/[-_]+/g, " ");
}

/** Statut effectif : celui de la fiche, sinon ARCHIVE dans 09_ARCHIVES, sinon À VÉRIFIER (jamais ACTIF par défaut). */
function effectiveStatut(meta: DocMeta, info: PathInfo): Statut {
  return meta.statut ?? (info.category === ARCHIVES_CATEGORY ? "ARCHIVE" : "A_VERIFIER");
}

function checkMeta(rel: string, meta: DocMeta, info: PathInfo, issues: Issue[]) {
  for (const p of info.problems) issues.push({ level: "avertissement", path: rel, message: `emplacement ${p}` });
  for (const c of pathConflicts(meta, info)) issues.push({ level: "avertissement", path: rel, message: c });
  if (meta.statutInvalide) issues.push({ level: "avertissement", path: rel, message: `statut « ${meta.statutInvalide} » non reconnu (ACTIF, PROVISOIRE, À VÉRIFIER, REMPLACÉ, ARCHIVE) : texte conservé en observations` });
  if (!meta.statut) issues.push({ level: "avertissement", path: rel, message: `statut non renseigné : traité comme ${STATUT_LABELS[effectiveStatut(meta, info)]}` });
  const missing = missingFields(meta, info).filter((f) => f !== "statut");
  if (missing.length) issues.push({ level: "avertissement", path: rel, message: `métadonnées manquantes : ${missing.join(", ")}` });
}

export function buildDocument(rel: string, meta: DocMeta, info: PathInfo, text: string): RefDocument {
  return {
    id: `bib:${rel}`,
    path: rel,
    category: info.category,
    title: meta.titre || titleFromFile(rel),
    type: meta.type || info.type || "document de référence",
    origin: "bibliotheque",
    classes: meta.classes ?? info.classes ?? [],
    disciplines: meta.disciplines ?? info.matieres ?? [],
    source: meta.source,
    statut: effectiveStatut(meta, info),
    observations: meta.observations,
    notice: meta.avertissement,
    documentId: meta.documentId,
    organisme: meta.organisme,
    pays: meta.pays ?? info.pays,
    niveau: meta.niveau ?? info.niveau,
    year: meta.annee ?? info.annee,
    version: meta.version ?? info.version,
    priority: meta.priorite,
    supersedes: meta.remplace,
    supersededBy: meta.remplacePar,
    integratedAt: meta.dateIntegration,
    verifiedAt: meta.dateVerification,
    replacedAt: meta.dateRemplacement,
    updatedAt: meta.dateMiseAJour,
    expiresAt: meta.dateExpiration,
    text,
  };
}

export async function loadBase(root = path.join(process.cwd(), BASE_DIR)): Promise<BaseLoad> {
  const files = await walk(root);
  const fileSet = new Set(files);
  const docs: RefDocument[] = [];
  const pending: PendingDoc[] = [];
  const issues: Issue[] = [];
  for (const file of files) {
    const rel = path.relative(root, file).split(path.sep).join("/");
    const name = path.basename(file);
    if (IGNORED.test(name)) continue;
    const info = parsePath(rel);

    if (/\.meta$/i.test(name)) {
      if (fileSet.has(file.replace(/\.meta$/i, ""))) continue; // lue avec son document
      const meta = parseMetaBlock(await fs.readFile(file, "utf8"));
      checkMeta(rel, meta, info, issues);
      issues.push({ level: "avertissement", path: rel, message: "fiche sans document : ressource en attente d'intégration (aucun contenu consultable)" });
      pending.push({
        path: rel,
        documentId: meta.documentId,
        title: meta.titre || titleFromFile(rel),
        statut: effectiveStatut(meta, info),
        category: info.category,
        classes: meta.classes ?? info.classes ?? [],
        disciplines: meta.disciplines ?? info.matieres ?? [],
        observations: meta.observations,
      });
      continue;
    }
    if (!SUPPORTED.test(name)) {
      issues.push({ level: "avertissement", path: rel, message: "format non pris en charge (PDF, DOCX, TXT ou MD) : fichier ignoré" });
      continue;
    }
    try {
      const buf = await fs.readFile(file);
      const kind = detectKind(buf, file);
      if (!kind) {
        issues.push({ level: "erreur", path: rel, message: "fichier illisible ou format non reconnu" });
        continue;
      }
      let text: string;
      let meta: DocMeta;
      if (kind === "text") {
        const split = splitFrontmatter(buf.toString("utf8"));
        meta = split.meta;
        text = split.body;
      } else {
        text = await extractText(buf, kind);
        const side = await fs.readFile(`${file}.meta`, "utf8").catch(() => null);
        meta = side === null ? emptyMeta() : parseMetaBlock(side);
        if (side === null) issues.push({ level: "avertissement", path: rel, message: `fiche descriptive absente (${name}.meta)` });
      }
      checkMeta(rel, meta, info, issues);
      if (!text.trim()) {
        issues.push({ level: "erreur", path: rel, message: "aucun texte extrait (document scanné ?) : ressource non consultable" });
        continue;
      }
      docs.push(buildDocument(rel, meta, info, text));
    } catch (e) {
      issues.push({ level: "erreur", path: rel, message: `lecture impossible : ${(e as Error).message}` });
    }
  }
  issues.push(...crossCheck(docs, pending.map((p) => p.documentId).filter((x): x is string => !!x)));
  return { docs, pending, issues };
}
