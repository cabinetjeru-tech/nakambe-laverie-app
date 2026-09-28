/** Découpage d'une production en documents imprimables séparés (sujet / corrigé). */

export type DocPart = { key: string; title: string; markdown: string };

const HEADING = /^#{1,4}\s*\**\s*DOCUMENT\s+(\d)\s*[—–:-]+\s*(.+?)\**\s*$/gim;

export function splitDocuments(markdown: string): DocPart[] {
  const matches = [...markdown.matchAll(HEADING)];
  if (matches.length < 2) return [];
  const parts: DocPart[] = [];
  matches.forEach((m, i) => {
    const start = m.index! + m[0].length;
    const end = i + 1 < matches.length ? matches[i + 1]!.index! : markdown.length;
    const label = m[2]!.replace(/\*+/g, "").trim();
    const name = label.charAt(0).toUpperCase() + label.slice(1).toLowerCase();
    parts.push({ key: `doc${m[1]}`, title: name, markdown: markdown.slice(start, end).trim() });
  });
  return parts;
}

/** Titre de conversation à partir de la première demande. */
export function conversationTitle(text: string): string {
  const t = text.replace(/\s+/g, " ").trim();
  return t.length > 70 ? `${t.slice(0, 67)}…` : t || "Nouvelle préparation";
}
