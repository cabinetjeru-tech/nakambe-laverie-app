import { parseFields, type DocMeta } from "../metadata";

/**
 * Registre maître des ressources de PÉDAGOGUE.IA : `base-documentaire/REGISTRE_MAITRE.csv`.
 * Une ligne par ressource, intégrée ou non. Séparateur « ; », encodage UTF-8 : le fichier s'ouvre
 * directement dans Excel ou LibreOffice. Le registre est la source principale des métadonnées ;
 * il ne supprime jamais rien : une ressource remplacée ou archivée y reste, avec son statut.
 */

export const REGISTRY_FILE = "REGISTRE_MAITRE.csv";

export const REGISTRY_COLUMNS = [
  "ID",
  "Titre officiel",
  "Pays",
  "Ministère/Institution productrice",
  "Niveau",
  "Classe",
  "Matière",
  "Type de document",
  "Année de publication",
  "Version",
  "Date d'intégration dans PÉDAGOGUE.IA",
  "Source",
  "URL ou référence documentaire",
  "Statut",
  "Niveau de source",
  "Priorité",
  "Date de dernière vérification",
  "Document remplacé",
  "Document de remplacement",
  "Observations",
  "Périmètre d'utilisation",
  "Fichier",
  "Avertissement",
] as const;

/** Lecture CSV (séparateur « ; » ou « , », guillemets doublés, retours à la ligne dans les cellules). */
export function parseCsv(content: string): string[][] {
  const text = content.replace(/^\uFEFF/, "");
  const firstLine = text.split(/\r?\n/, 1)[0] ?? "";
  const sep = (firstLine.match(/;/g)?.length ?? 0) >= (firstLine.match(/,/g)?.length ?? 0) ? ";" : ",";
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i]!;
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (c === '"') quoted = false;
      else cell += c;
    } else if (c === '"' && cell === "") quoted = true;
    else if (c === sep) {
      row.push(cell);
      cell = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
    } else cell += c;
  }
  if (cell !== "" || row.length) {
    row.push(cell);
    rows.push(row);
  }
  return rows.filter((r) => r.some((c) => c.trim() !== ""));
}

export function toCsv(rows: string[][]): string {
  const esc = (v: string) => (/[;"\n\r]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
  return "\uFEFF" + rows.map((r) => r.map(esc).join(";")).join("\r\n") + "\r\n";
}

export type RegistryEntry = { line: number; meta: DocMeta };

/** Lignes du registre, interprétées avec les mêmes règles que les fiches descriptives. */
export function readRegistry(content: string): { entries: RegistryEntry[]; problems: string[] } {
  const rows = parseCsv(content);
  const problems: string[] = [];
  if (!rows.length) return { entries: [], problems };
  const header = rows[0]!.map((h) => h.trim());
  const missing = REGISTRY_COLUMNS.filter((c) => !header.some((h) => h.toLowerCase() === c.toLowerCase()));
  if (missing.length) problems.push(`colonnes absentes de l'en-tête : ${missing.join(", ")}`);
  const entries = rows.slice(1).map((r, i) => ({
    line: i + 2,
    meta: parseFields(header.map((h, k) => [h, r[k] ?? ""] as [string, string])),
  }));
  return { entries, problems };
}
