/** Vitrine publique : témoignages, compteurs et bibliothèque de fiches. Fonctions pures (testables). */

export type Temoignage = { id: string; nom: string; fonction: string | null; ville: string | null; texte: string; note: number; publie: boolean; ordre: number; cree_le: string; utilisateur_id: string | null };
export type FichePublique = { slug: string; titre: string; classe: string | null; discipline: string | null; resume: string | null; contenu: string; publie: boolean; vues: number; cree_le: string; maj_le: string };

/** Adresse de page lisible : « fiche-svt-4e-la-digestion-k3f9 ». */
export function slugifier(texte: string, suffixe = Math.random().toString(36).slice(2, 6)): string {
  const base = texte
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 90)
    .replace(/-+$/g, "");
  return [base || "fiche", suffixe].filter(Boolean).join("-");
}

/** Résumé pour Google et les aperçus : premier paragraphe de texte, sans Markdown, 160 caractères au plus. */
export function resumeDe(markdown: string, max = 160): string {
  const propre = (l: string) =>
    l
      .replace(/\[(.*?)\]\([^)]*\)/g, "$1")
      .replace(/[*_`]/g, "")
      .replace(/^[-*+]\s+|^\d+\.\s+/, "")
      .replace(/\s+/g, " ")
      .trim();
  const lignes = markdown
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l && !/^(#|\||[-*_]{3,}|>|```)/.test(l))
    .map(propre);
  // Première vraie phrase : on saute les étiquettes courtes (« PROPOSITION PÉDAGOGUE.IA », « Classe : 4e »…).
  const texte = lignes.find((l) => l.length >= 40) ?? lignes[0] ?? "";
  return texte.length > max ? `${texte.slice(0, max - 1).replace(/\s+\S*$/, "")}…` : texte;
}

/** Nombre arrondi vers le bas pour un affichage rassurant et honnête : 1 234 → « 1 200 ». */
export function arrondiVitrine(n: number): number {
  if (n < 100) return n;
  const pas = n < 1000 ? 10 : n < 10000 ? 100 : 1000;
  return Math.floor(n / pas) * pas;
}

/** Le compteur public n'est affiché qu'à partir d'un seuil (variable COMPTEUR_MIN, 100 par défaut). */
export function seuilCompteur(): number {
  const n = Number(process.env.COMPTEUR_MIN);
  return Number.isInteger(n) && n >= 0 ? n : 100;
}
