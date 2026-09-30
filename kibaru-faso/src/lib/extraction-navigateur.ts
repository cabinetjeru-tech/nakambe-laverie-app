/**
 * Extraction du texte d'un document directement dans le navigateur (espace admin) : les guides officiels dépassent
 * souvent la limite de 4,5 Mo des requêtes vers le serveur ; seul le texte extrait est envoyé.
 */

export type Extraction = { texte: string; pages?: number; pagesVides?: number };

export async function extraireDansNavigateur(fichier: File): Promise<Extraction> {
  const nom = fichier.name.toLowerCase();
  if (nom.endsWith(".pdf") || fichier.type === "application/pdf") {
    const { extractText, getDocumentProxy } = await import("unpdf");
    const pdf = await getDocumentProxy(new Uint8Array(await fichier.arrayBuffer()));
    const { totalPages, text } = await extractText(pdf, { mergePages: false });
    const pages = (text as string[]).map((t) => t.trim());
    return { texte: pages.filter(Boolean).join("\n\n"), pages: totalPages, pagesVides: pages.filter((t) => t.length < 20).length };
  }
  if (nom.endsWith(".docx")) {
    // @ts-expect-error — version navigateur de mammoth, sans déclaration de types
    const mammoth = (await import("mammoth/mammoth.browser")) as { extractRawText: (o: { arrayBuffer: ArrayBuffer }) => Promise<{ value: string }> };
    const { value } = await mammoth.extractRawText({ arrayBuffer: await fichier.arrayBuffer() });
    return { texte: value };
  }
  if (/\.(txt|md)$/.test(nom)) return { texte: await fichier.text() };
  throw new Error("Format non pris en charge : utilisez un PDF (avec texte), un Word (.docx) ou un fichier texte.");
}

/** Nettoyage : caractères nuls, espaces multiples, lignes vides en série. */
export function nettoyerTexte(t: string): string {
  return t
    .replace(/\u0000/g, "")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
