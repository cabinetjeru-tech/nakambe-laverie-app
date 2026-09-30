/**
 * Documents officiels déposés depuis l'espace admin (table base_documents), fusionnés avec la base fichiers.
 * Module pur : conversion et fusion testables sans base de données.
 */
import type { RefDocument } from "../search";
import type { BaseLoad } from "./load";
import { categoryForType, CLASS_INFO, STATUTS, subjectCodes, SUBJECTS, type Statut } from "./structure";

export type DocumentEnLigne = {
  id: string;
  titre: string;
  type: string;
  classes: string[];
  disciplines: string[];
  organisme: string | null;
  annee: string | null;
  version: string | null;
  statut: string;
  source: string | null;
  url: string | null;
  niveau_source: number | null;
  avertissement: string | null;
  observations: string | null;
  fichier_nom: string | null;
  texte: string;
  cree_le: string;
  maj_le: string;
};

const statutValide = (s: string): Statut => ((STATUTS as readonly string[]).includes(s) ? (s as Statut) : "A_VERIFIER");

export function versRefDocument(r: DocumentEnLigne): RefDocument {
  const cls = CLASS_INFO.find((c) => r.classes.includes(c.classe));
  return {
    id: `db:${r.id}`,
    path: `en ligne : ${r.fichier_nom ?? r.id}`,
    category: categoryForType(r.type),
    title: r.titre,
    type: r.type,
    origin: "bibliotheque",
    classes: r.classes,
    disciplines: r.disciplines,
    source: r.source ?? undefined,
    url: r.url ?? undefined,
    statut: statutValide(r.statut),
    observations: r.observations ?? undefined,
    notice: r.avertissement ?? undefined,
    documentId: r.id,
    organisme: r.organisme ?? undefined,
    pays: "Burkina Faso",
    niveau: cls?.niveau,
    year: r.annee ?? undefined,
    version: r.version ?? undefined,
    sourceLevel: r.niveau_source ?? undefined,
    integratedAt: r.cree_le.slice(0, 10),
    updatedAt: r.maj_le.slice(0, 10),
    text: r.texte,
  };
}

/**
 * Ajoute les documents en ligne à la base fichiers. Un document en ligne :
 *  - remplace le document fichier de même ID (le dépôt le plus récent fait foi) ;
 *  - rend « intégrée » la ressource du registre de même ID (elle sort de la liste NON ENCORE INTÉGRÉE).
 */
export function fusionnerBase(base: BaseLoad, rows: DocumentEnLigne[]): BaseLoad {
  if (!rows.length) return base;
  const ids = new Set(rows.map((r) => r.id.toUpperCase()));
  return {
    ...base,
    docs: [...base.docs.filter((d) => !d.documentId || !ids.has(d.documentId.toUpperCase())), ...rows.map(versRefDocument)],
    pending: base.pending.filter((p) => !p.documentId || !ids.has(p.documentId.toUpperCase())),
  };
}

/** Prochain ID libre au format BF-[CLASSE]-[MATIERE]-[NUMERO] (ex. BF-6E-MATH-002). */
export function prochainId(classe: string | undefined, matiere: string | undefined, existants: string[]): string {
  const c = CLASS_INFO.find((x) => x.classe === classe)?.code ?? "6E";
  const codes = [...subjectCodes(matiere ?? "")];
  const m = SUBJECTS.find((s) => codes.includes(s.code))?.code ?? "DIV";
  const prefixe = `BF-${c}-${m}-`;
  const pris = new Set(existants.map((x) => x.toUpperCase()));
  for (let n = 1; n < 1000; n++) {
    const id = `${prefixe}${String(n).padStart(3, "0")}`;
    if (!pris.has(id)) return id;
  }
  return `${prefixe}${Date.now()}`;
}
