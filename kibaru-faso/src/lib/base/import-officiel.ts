import "server-only";
import { detectKind, extractText } from "../extract";
import type { DocMeta } from "../metadata";
import { hoteOfficiel } from "./sources-officielles";

/**
 * Import automatique d'un document officiel depuis son lien (site du ministère, Faso e-education) :
 * le serveur télécharge le PDF, en extrait le texte et renvoie la ligne à enregistrer dans base_documents.
 */

const TAILLE_MAX = 80 * 1024 * 1024;
const TEXTE_MAX = 1_500_000;

export class ImportError extends Error {}

export async function telechargerEtExtraire(url: string): Promise<{ texte: string; fichierNom: string }> {
  if (!hoteOfficiel(url)) throw new ImportError("Lien hors des sites officiels autorisés (education.gov.bf, fasoeducation.bf).");
  let res: Response;
  try {
    res = await fetch(url, { signal: AbortSignal.timeout(150_000), headers: { "User-Agent": "PEDAGOGUE.IA/1.0 (+https://pedagogue-ia.vercel.app)" }, redirect: "follow" });
  } catch (e) {
    const c = (e as Error & { cause?: { code?: string; message?: string } }).cause;
    throw new ImportError(`Site officiel injoignable depuis le serveur${c ? ` (${c.code ?? c.message})` : ` (${(e as Error).message})`}.`);
  }
  if (!res.ok) throw new ImportError(`Le site officiel a répondu « ${res.status} » : document déplacé ou supprimé.`);
  const longueur = Number(res.headers.get("content-length") ?? 0);
  if (longueur > TAILLE_MAX) throw new ImportError("Document trop volumineux pour l'import automatique : téléchargez-le puis déposez-le à la main.");
  const buf = Buffer.from(await res.arrayBuffer());
  if (buf.length > TAILLE_MAX) throw new ImportError("Document trop volumineux pour l'import automatique : téléchargez-le puis déposez-le à la main.");
  const fichierNom = decodeURIComponent(new URL(url).pathname.split("/").pop() || "document.pdf");
  const kind = detectKind(buf, fichierNom);
  if (kind !== "pdf" && kind !== "docx") throw new ImportError("Le lien ne mène pas à un PDF ou un Word (page web ou fichier inconnu).");
  const texte = (await extractText(buf, kind)).replace(/\u0000/g, "").replace(/[ \t]+/g, " ").replace(/\n{3,}/g, "\n\n").trim();
  if (texte.length < 200) throw new ImportError("Presque aucun texte lu : document scanné (images). Il faut une version avec du texte.");
  return { texte: texte.slice(0, TEXTE_MAX), fichierNom };
}

/** Ligne base_documents à partir des métadonnées du registre (rien n'est deviné : « À vérifier » reste vide). */
export function ligneDepuisRegistre(meta: DocMeta, url: string, texte: string, fichierNom: string, ajoutePar: string) {
  return {
    id: meta.documentId!.toUpperCase(),
    titre: meta.titre ?? fichierNom,
    type: meta.type ?? "RESSOURCE_COMPLEMENTAIRE",
    classes: meta.classes ?? [],
    disciplines: meta.disciplines ?? [],
    organisme: meta.organisme ?? null,
    annee: meta.annee ?? null,
    version: meta.version ?? null,
    statut: "A_VERIFIER",
    source: meta.source ?? null,
    url,
    niveau_source: meta.niveauSource ?? null,
    avertissement: meta.avertissement ?? null,
    observations: `Importé automatiquement depuis le lien officiel le ${new Date().toISOString().slice(0, 10)}. Statut à confirmer avant de passer en ACTIF.`,
    fichier_nom: fichierNom,
    texte,
    ajoute_par: ajoutePar,
    maj_le: new Date().toISOString(),
  };
}
