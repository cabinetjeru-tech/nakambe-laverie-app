import { promises as fs } from "node:fs";
import path from "node:path";
import { detectKind, extractText } from "../extract";
import { emptyMeta, parseMetaBlock, splitFrontmatter, type DocMeta } from "../metadata";
import type { RefDocument } from "../search";
import { readRegistry, REGISTRY_FILE, type RegistryEntry } from "./registry";
import {
  ARCHIVES_CATEGORY,
  categoryForType,
  CLASS_INFO,
  ID_FORMAT,
  parsePath,
  STATUT_LABELS,
  subjectCodes,
  SUBJECTS,
  type PathInfo,
  type Statut,
} from "./structure";
import { crossCheck, missingFields, pathConflicts, type Issue } from "./validate";

/**
 * Chargement de la base documentaire PÉDAGOGUE.IA : registre maître (REGISTRE_MAITRE.csv) + documents déposés
 * dans la structure officielle. Sans dépendance au serveur Next.js : utilisé par l'application et par
 * le script `npm run base:…`.
 *
 * Priorité des métadonnées : registre maître > fiche du document (.meta ou en-tête) > emplacement du fichier.
 */

export const BASE_DIR = "base-documentaire";
const SUPPORTED = /\.(md|txt|pdf|docx)$/i;
const IGNORED = /^(lisez-moi\.md|catalogue\.md|registre_maitre\.csv)$/i;

/** Ressource connue (registre ou fiche) dont le texte n'est pas encore intégré : NON ENCORE INTÉGRÉ. */
export type PendingDoc = {
  path: string;
  registryLine?: number;
  documentId?: string;
  title: string;
  type?: string;
  statut: Statut;
  category?: string;
  classes: string[];
  disciplines: string[];
  annee?: string;
  version?: string;
  organisme?: string;
  source?: string;
  url?: string;
  priorite?: string;
  niveauSource?: number;
  observations?: string;
  /** Emplacement où déposer le document dans la structure officielle. */
  expectedLocation: string;
};

export type BaseLoad = { docs: RefDocument[]; pending: PendingDoc[]; issues: Issue[]; registry: RegistryEntry[] };

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

/** Statut effectif : celui du registre ou de la fiche, sinon ARCHIVE dans 09_ARCHIVES, sinon À VÉRIFIER (jamais ACTIF par défaut). */
function effectiveStatut(meta: DocMeta, info: PathInfo): Statut {
  return meta.statut ?? (info.category === ARCHIVES_CATEGORY ? "ARCHIVE" : "A_VERIFIER");
}

/** Dossier conseillé pour déposer une ressource, d'après son type, sa classe et sa matière. */
export function expectedLocation(meta: DocMeta): string {
  const cls = CLASS_INFO.find((c) => meta.classes?.some((x) => x.toLowerCase() === c.classe.toLowerCase()));
  const codes = [...subjectCodes(meta.disciplines?.[0] ?? "")];
  const subj = SUBJECTS.find((s) => codes.includes(s.code));
  return [categoryForType(meta.type), "BURKINA_FASO", cls?.niveauDossier ?? "NIVEAU", cls?.dossier ?? "CLASSE", subj?.dossier ?? "MATIERE"].join("/") + "/";
}

const FIELD_LABELS: Partial<Record<keyof DocMeta, string>> = { statut: "statut", version: "version", annee: "année", classes: "classe", disciplines: "matière", niveauSource: "niveau de source" };

/** Fusion : les valeurs renseignées dans le registre l'emportent sur celles de la fiche du document. */
function mergeMeta(fileMeta: DocMeta, reg: DocMeta, rel: string, issues: Issue[]): DocMeta {
  const merged: DocMeta = { ...fileMeta };
  for (const [k, v] of Object.entries(reg) as [keyof DocMeta, unknown][]) {
    if (v === undefined || (Array.isArray(v) && v.length === 0)) continue;
    const before = fileMeta[k];
    const differs = before !== undefined && !(Array.isArray(before) && before.length === 0) && JSON.stringify(before) !== JSON.stringify(v);
    if (differs && FIELD_LABELS[k]) issues.push({ level: "avertissement", path: rel, message: `${FIELD_LABELS[k]} différent entre le registre (${String(v)}) et la fiche du document (${String(before)}) : le registre l'emporte` });
    (merged as Record<string, unknown>)[k] = v;
  }
  return merged;
}

function checkMeta(rel: string, meta: DocMeta, info: PathInfo, issues: Issue[], integrated: boolean) {
  for (const p of info.problems) issues.push({ level: "avertissement", path: rel, message: `emplacement ${p}` });
  for (const c of pathConflicts(meta, info)) issues.push({ level: "avertissement", path: rel, message: c });
  if (meta.statutInvalide) issues.push({ level: "avertissement", path: rel, message: `statut « ${meta.statutInvalide} » non reconnu (ACTIF, À_VÉRIFIER, REMPLACÉ, ARCHIVE, PROVISOIRE) : texte conservé en observations` });
  if (meta.typeInvalide) issues.push({ level: "avertissement", path: rel, message: `type « ${meta.typeInvalide} » hors de la liste officielle des types de documents` });
  if (meta.documentId && !ID_FORMAT.test(meta.documentId)) issues.push({ level: "avertissement", path: rel, message: `ID ${meta.documentId} hors du format recommandé BF-[CLASSE]-[MATIERE]-[NUMERO] (ex. BF-6E-MATH-001)` });
  if (!meta.statut) issues.push({ level: "avertissement", path: rel, message: `statut non renseigné : traité comme ${STATUT_LABELS[effectiveStatut(meta, info)]}` });
  if (integrated) {
    const missing = missingFields(meta, info).filter((f) => f !== "statut");
    if (missing.length) issues.push({ level: "avertissement", path: rel, message: `métadonnées manquantes : ${missing.join(", ")}` });
  }
}

export function buildDocument(rel: string, meta: DocMeta, info: PathInfo, text: string): RefDocument {
  return {
    id: `bib:${rel}`,
    path: rel,
    category: info.category,
    title: meta.titre || titleFromFile(rel),
    type: meta.type || info.type || "RESSOURCE_COMPLEMENTAIRE",
    origin: "bibliotheque",
    classes: meta.classes ?? info.classes ?? [],
    disciplines: meta.disciplines ?? info.matieres ?? [],
    source: meta.source,
    url: meta.url,
    perimeter: meta.perimetre,
    statut: effectiveStatut(meta, info),
    observations: meta.observations,
    notice: meta.avertissement,
    documentId: meta.documentId,
    organisme: meta.organisme,
    pays: meta.pays ?? info.pays,
    niveau: meta.niveau ?? info.niveau,
    year: meta.annee ?? info.annee,
    version: meta.version ?? info.version,
    sourceLevel: meta.niveauSource,
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

function toPending(meta: DocMeta, info: PathInfo, where: string, line?: number): PendingDoc {
  return {
    path: where,
    registryLine: line,
    documentId: meta.documentId,
    title: meta.titre || titleFromFile(where),
    type: meta.type ?? info.type,
    statut: effectiveStatut(meta, info),
    category: info.category ?? categoryForType(meta.type),
    classes: meta.classes ?? info.classes ?? [],
    disciplines: meta.disciplines ?? info.matieres ?? [],
    annee: meta.annee ?? info.annee,
    version: meta.version ?? info.version,
    organisme: meta.organisme,
    source: meta.source,
    url: meta.url,
    priorite: meta.priorite,
    niveauSource: meta.niveauSource,
    observations: meta.observations,
    expectedLocation: meta.fichier ?? expectedLocation(meta),
  };
}

const idKey = (id: string) => id.trim().toUpperCase();

export async function loadBase(root = path.join(process.cwd(), BASE_DIR)): Promise<BaseLoad> {
  const issues: Issue[] = [];
  const docs: RefDocument[] = [];
  const pending: PendingDoc[] = [];

  // 1. Registre maître.
  let registry: RegistryEntry[] = [];
  const regContent = await fs.readFile(path.join(root, REGISTRY_FILE), "utf8").catch(() => null);
  if (regContent === null) issues.push({ level: "avertissement", path: REGISTRY_FILE, message: "registre maître absent" });
  else {
    const r = readRegistry(regContent);
    registry = r.entries;
    for (const p of r.problems) issues.push({ level: "erreur", path: REGISTRY_FILE, message: p });
    for (const e of registry) if (!e.meta.documentId) issues.push({ level: "erreur", path: `${REGISTRY_FILE}, ligne ${e.line}`, message: "ligne sans ID" });
  }
  const regById = new Map<string, RegistryEntry>();
  const regByFile = new Map<string, RegistryEntry>();
  for (const e of registry) {
    if (e.meta.documentId) {
      if (regById.has(idKey(e.meta.documentId))) issues.push({ level: "erreur", path: `${REGISTRY_FILE}, ligne ${e.line}`, message: `ID ${e.meta.documentId} déjà présent ligne ${regById.get(idKey(e.meta.documentId))!.line}` });
      else regById.set(idKey(e.meta.documentId), e);
    }
    if (e.meta.fichier) regByFile.set(e.meta.fichier, e);
  }
  const linked = new Set<RegistryEntry>();

  // 2. Documents déposés.
  const files = await walk(root);
  const fileSet = new Set(files);
  for (const file of files) {
    const rel = path.relative(root, file).split(path.sep).join("/");
    const name = path.basename(file);
    if (IGNORED.test(name)) continue;
    const info = parsePath(rel);

    if (/\.meta$/i.test(name)) {
      if (fileSet.has(file.replace(/\.meta$/i, ""))) continue; // lue avec son document
      let meta = parseMetaBlock(await fs.readFile(file, "utf8"));
      const reg = (meta.documentId && regById.get(idKey(meta.documentId))) || regByFile.get(rel.replace(/\.meta$/i, ""));
      if (reg) {
        linked.add(reg);
        meta = mergeMeta(meta, reg.meta, rel, issues);
      }
      checkMeta(rel, meta, info, issues, false);
      issues.push({ level: "info", path: rel, message: "NON ENCORE INTÉGRÉ : fiche présente, document non déposé" });
      pending.push(toPending(meta, info, rel, reg?.line));
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
      }
      const reg = regByFile.get(rel) ?? (meta.documentId ? regById.get(idKey(meta.documentId)) : undefined);
      if (reg) {
        linked.add(reg);
        meta = mergeMeta(meta, reg.meta, rel, issues);
      } else if (registry.length || regContent !== null) {
        issues.push({ level: "avertissement", path: rel, message: "ressource absente du registre maître : ajoutez-y une ligne (ID, statut…)" });
      }
      checkMeta(rel, meta, info, issues, true);
      if (!text.trim()) {
        issues.push({ level: "erreur", path: rel, message: "aucun texte extrait (document scanné ?) : ressource non consultable" });
        pending.push(toPending(meta, info, rel, reg?.line));
        continue;
      }
      docs.push(buildDocument(rel, meta, info, text));
    } catch (e) {
      issues.push({ level: "erreur", path: rel, message: `lecture impossible : ${(e as Error).message}` });
    }
  }

  // 3. Ressources du registre sans document intégré : NON ENCORE INTÉGRÉ.
  for (const e of registry) {
    if (linked.has(e) || !e.meta.documentId) continue;
    const where = `${REGISTRY_FILE}, ligne ${e.line}`;
    const info: PathInfo = e.meta.fichier ? parsePath(e.meta.fichier) : { problems: [] };
    checkMeta(where, e.meta, { ...info, problems: [] }, issues, false);
    issues.push({ level: "info", path: where, message: `${e.meta.documentId} : NON ENCORE INTÉGRÉ${e.meta.fichier ? ` (document attendu : ${e.meta.fichier})` : ""}` });
    pending.push(toPending(e.meta, info, where, e.line));
  }

  issues.push(...crossCheck(docs, pending.map((p) => p.documentId).filter((x): x is string => !!x)));
  return { docs, pending, issues, registry };
}
