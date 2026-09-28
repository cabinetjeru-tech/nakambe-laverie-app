/**
 * Métadonnées des documents de la bibliothèque, au format « clé: valeur » :
 *   titre: Programme de mathématiques — 6e
 *   type: programme officiel
 *   classes: 6e, 5e
 *   disciplines: Mathématiques
 *   source: MENAPLN, 2023
 * Pour un fichier .md/.txt : en tête, entre deux lignes « --- ».
 * Pour un .pdf/.docx : dans un fichier voisin « nom-du-fichier.pdf.meta ».
 */

export type DocMeta = { titre?: string; type?: string; classes: string[]; disciplines: string[]; source?: string };

export function parseMetaBlock(block: string): DocMeta {
  const meta: DocMeta = { classes: [], disciplines: [] };
  for (const line of block.split(/\r?\n/)) {
    const m = line.match(/^\s*([a-zA-Zéè_]+)\s*:\s*(.*)$/);
    if (!m) continue;
    const key = m[1]!.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
    const value = m[2]!.trim().replace(/^["']|["']$/g, "");
    const list = () => value.replace(/^\[|\]$/g, "").split(/[,;]/).map((v) => v.trim()).filter(Boolean);
    if (key === "titre" || key === "title") meta.titre = value;
    else if (key === "type") meta.type = value;
    else if (key === "classes" || key === "classe") meta.classes = list();
    else if (key === "disciplines" || key === "discipline") meta.disciplines = list();
    else if (key === "source") meta.source = value;
  }
  return meta;
}

/** Sépare l'en-tête « --- … --- » du corps d'un fichier texte. */
export function splitFrontmatter(content: string): { meta: DocMeta; body: string } {
  const m = content.match(/^﻿?---\r?\n([\s\S]*?)\r?\n---\r?\n?/);
  if (!m) return { meta: { classes: [], disciplines: [] }, body: content };
  return { meta: parseMetaBlock(m[1]!), body: content.slice(m[0].length) };
}
