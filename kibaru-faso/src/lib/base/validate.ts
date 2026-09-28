import type { DocMeta } from "../metadata";
import type { RefDocument } from "../search";
import { ARCHIVES_CATEGORY, STATUT_LABELS, type PathInfo } from "./structure";

/** Contrôles de cohérence de la base documentaire (fonctions pures). */

export type Issue = { level: "erreur" | "avertissement" | "info"; path: string; message: string };

/** Métadonnées obligatoires de chaque ressource ; le chemin peut en fournir une partie. */
export function missingFields(meta: DocMeta, info: PathInfo): string[] {
  const missing: [string, boolean][] = [
    ["id", !!meta.documentId],
    ["titre", !!meta.titre],
    ["pays", !!(meta.pays ?? info.pays)],
    ["niveau", !!(meta.niveau ?? info.niveau)],
    ["classe", !!(meta.classes ?? info.classes)],
    ["matiere", !!(meta.disciplines ?? info.matieres)],
    ["type", !!(meta.type ?? info.type)],
    ["organisme", !!meta.organisme],
    ["annee", !!(meta.annee ?? info.annee)],
    ["version", !!(meta.version ?? info.version)],
    ["date_integration", !!meta.dateIntegration],
    ["statut", !!meta.statut],
    ["source", !!meta.source],
    ["priorite", !!meta.priorite],
    ["niveau_source", !!meta.niveauSource],
    ["date_verification", !!meta.dateVerification],
    ["perimetre", !!meta.perimetre],
  ];
  return missing.filter(([, ok]) => !ok).map(([k]) => k);
}

const same = (a: string, b: string) =>
  a.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "") === b.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");

/** Écarts entre la fiche et l'emplacement du fichier dans la structure. */
export function pathConflicts(meta: DocMeta, info: PathInfo): string[] {
  const out: string[] = [];
  if (meta.classes && info.classes && info.classes.length && meta.classes.length && !meta.classes.some((c) => info.classes!.some((i) => same(c, i))))
    out.push(`classe de la fiche (${meta.classes.join(", ")}) différente du dossier (${info.classes.join(", ")})`);
  if (meta.disciplines && info.matieres && info.matieres.length && meta.disciplines.length && !meta.disciplines.some((c) => info.matieres!.some((i) => same(c, i))))
    out.push(`matière de la fiche (${meta.disciplines.join(", ")}) différente du dossier (${info.matieres.join(", ")})`);
  if (meta.annee && info.annee && !meta.annee.includes(info.annee)) out.push(`année de la fiche (${meta.annee}) différente du dossier (${info.annee})`);
  if (meta.version && info.version && !same(meta.version.replace(/^v/i, ""), info.version)) out.push(`version de la fiche (${meta.version}) différente du dossier (${info.version})`);
  return out;
}

/** Contrôles portant sur l'ensemble de la base : identifiants, remplacements, archives. */
export function crossCheck(docs: RefDocument[], pendingIds: string[] = []): Issue[] {
  const issues: Issue[] = [];
  const key = (id: string) => id.trim().toUpperCase();
  const ids = new Map<string, RefDocument>();
  const known = new Set(pendingIds.map(key));
  for (const d of docs) {
    const p = d.path ?? d.id;
    if (!d.documentId) continue;
    const prev = ids.get(key(d.documentId));
    if (prev) issues.push({ level: "erreur", path: p, message: `ID ${d.documentId} déjà utilisé par ${prev.path ?? prev.id} : chaque ressource doit avoir un ID unique` });
    ids.set(key(d.documentId), d);
    known.add(key(d.documentId));
  }
  for (const d of docs) {
    const p = d.path ?? d.id;
    for (const id of [...(d.supersedes ?? []), ...(d.supersededBy ?? [])])
      if (!known.has(key(id))) issues.push({ level: "avertissement", path: p, message: `remplacement déclaré vers un ID inconnu : ${id}` });
    const replacedByDecl = docs.some((o) => (o.supersedes ?? []).some((id) => d.documentId && key(id) === key(d.documentId)));
    if (d.statut === "REMPLACE" && !(d.supersededBy ?? []).length && !replacedByDecl)
      issues.push({ level: "avertissement", path: p, message: "statut REMPLACÉ sans indication du document remplaçant (remplace_par)" });
    if (d.category === ARCHIVES_CATEGORY && d.statut && !["ARCHIVE", "REMPLACE"].includes(d.statut))
      issues.push({ level: "avertissement", path: p, message: `rangé dans 09_ARCHIVES mais statut ${STATUT_LABELS[d.statut]}` });
    if (d.category && d.category !== ARCHIVES_CATEGORY && d.statut === "ARCHIVE")
      issues.push({ level: "avertissement", path: p, message: "statut ARCHIVE : pensez à déplacer le fichier et sa fiche dans 09_ARCHIVES (sans le supprimer)" });
  }
  return issues;
}
