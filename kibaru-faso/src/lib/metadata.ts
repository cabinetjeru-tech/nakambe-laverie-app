import { parseDocType, parseStatut, type Statut } from "./base/structure";

/**
 * Fiche descriptive d'une ressource de la base documentaire PÉDAGOGUE.IA, au format « clé: valeur », une par ligne.
 * Les lignes commençant par « # » sont des commentaires.
 *
 *   id: BF-MATH-6E-PROG-002
 *   titre: Programme de mathématiques — 6e
 *   pays: Burkina Faso
 *   niveau: Post-primaire
 *   classe: 6e
 *   matiere: Mathématiques
 *   type: programme
 *   organisme: Ministère de l'Éducation nationale
 *   annee: 2024
 *   version: 2
 *   date_integration: 2026-09-28
 *   statut: ACTIF | PROVISOIRE | À VÉRIFIER | REMPLACÉ | ARCHIVE
 *   source: site du ministère, référence…
 *   priorite: 1 à 5                  (hiérarchie des sources : 1 = document officiel du ministère)
 *   date_verification: 2026-09-28    (date de dernière vérification)
 *   remplace: BF-MATH-6E-PROG-001    (ressource(s) que celle-ci remplace)
 *   remplace_par: …                  (ressource(s) qui remplacent celle-ci)
 *   date_remplacement: 2026-09-01
 *   date_expiration: …               (facultatif)
 *   observations: …                  (remarque libre, affichée et transmise)
 *   avertissement: …                 (règle d'usage que PÉDAGOGUE.IA doit respecter)
 *
 * Pour un fichier .md/.txt : en tête, entre deux lignes « --- ».
 * Pour un .pdf/.docx : dans un fichier voisin « nom-du-fichier.pdf.meta ».
 * Les clés sont insensibles à la casse et aux accents ; les noms de la configuration V2 restent acceptés
 * (document_id, matieres, fiabilite, etat, date_mise_a_jour…).
 */

export const PRIORITES = ["HAUTE", "MOYENNE", "BASSE"] as const;
export type Priorite = (typeof PRIORITES)[number];

export type DocMeta = {
  documentId?: string;
  titre?: string;
  pays?: string;
  niveau?: string;
  classes?: string[];
  disciplines?: string[];
  type?: string;
  organisme?: string;
  /** Type reconnu (PROGRAMME, GUIDE_PEDAGOGIQUE…) ou valeur brute si non reconnue. */
  typeInvalide?: string;
  annee?: string;
  version?: string;
  dateIntegration?: string;
  statut?: Statut;
  /** Valeur de statut illisible (ni l'un des cinq statuts, ni vide). */
  statutInvalide?: string;
  source?: string;
  /** URL ou référence documentaire. */
  url?: string;
  /** Périmètre d'utilisation (ex. « contenu pédagogique uniquement, pas le programme en vigueur »). */
  perimetre?: string;
  /** Hiérarchie des sources : 1 = source officielle … 5 = connaissance générale du modèle. */
  niveauSource?: number;
  /** Priorité de traitement dans le registre. */
  priorite?: Priorite;
  /** Fichier du document, relatif à la racine de la base (registre). */
  fichier?: string;
  dateVerification?: string;
  remplace: string[];
  remplacePar: string[];
  dateRemplacement?: string;
  dateMiseAJour?: string;
  dateExpiration?: string;
  observations?: string;
  avertissement?: string;
};

export function emptyMeta(): DocMeta {
  return { remplace: [], remplacePar: [] };
}

function normKey(k: string): string {
  return k
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/['’]/g, "")
    .replace(/[\s-]+/g, "_");
}

/** Date ISO (AAAA-MM-JJ, AAAA-MM ou AAAA), ou JJ/MM/AAAA. Renvoie undefined si illisible. */
export function parseDate(v: string): string | undefined {
  const s = v.trim();
  let m = s.match(/^(\d{4})(?:-(\d{2}))?(?:-(\d{2}))?$/);
  if (m) return `${m[1]}-${m[2] ?? "01"}-${m[3] ?? "01"}`;
  m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (m) return `${m[3]}-${m[2]!.padStart(2, "0")}-${m[1]!.padStart(2, "0")}`;
  return undefined;
}

/** Valeurs laissées « à renseigner » : ignorées plutôt que présentées comme des données. */
function isPlaceholder(v: string): boolean {
  return !v || /^(a|à)[ _](renseigner|completer|compléter|preciser|préciser|verifier|vérifier)$|^(a|à) (renseigner|completer|compléter|preciser|préciser)|^(n\/a|inconnu|-|non encore integre|non encore intégré)$/i.test(v.trim());
}

/** Clé normalisée, pour le registre comme pour les fiches. */
export { normKey };

export function parseMetaBlock(block: string): DocMeta {
  const pairs: [string, string][] = [];
  for (const line of block.split(/\r?\n/)) {
    if (/^\s*#/.test(line)) continue;
    const m = line.match(/^\s*([\p{L}_ '’/-]+?)\s*:\s*(.*)$/u);
    if (m) pairs.push([m[1]!, m[2]!]);
  }
  return parseFields(pairs);
}

/** Interprète une liste de couples (clé, valeur) : lignes d'une fiche ou colonnes d'une ligne du registre. */
export function parseFields(pairs: [string, string][]): DocMeta {
  const meta = emptyMeta();
  for (const [rawKey, rawValue] of pairs) {
    const key = normKey(rawKey);
    const value = rawValue.trim().replace(/^(["'])([\s\S]*)\1$/, "$2");
    const isStatus = key === "statut" || key === "status" || key === "etat";
    if (!value || (!isStatus && isPlaceholder(value))) continue;
    const list = (ranges = false) =>
      value
        .replace(/^\[|\]$/g, "")
        // « 6e-5e » : deux classes ; un identifiant « BF-6E-MATH-001 » n'est jamais découpé.
        .split(ranges ? /[,;]|\s+-\s+|(?<=\p{L})-(?=\d)/u : /[,;]/u)
        .map((v) => v.trim())
        .filter(Boolean);
    const date = () => parseDate(value) ?? value;
    switch (key) {
      case "id":
      case "id_unique":
      case "identifiant":
      case "document_id":
      case "documentid":
        meta.documentId = value;
        break;
      case "titre":
      case "titre_officiel":
      case "title":
        meta.titre = value;
        break;
      case "pays":
        meta.pays = value;
        break;
      case "niveau":
        meta.niveau = value;
        break;
      case "classe":
      case "classes":
        meta.classes = list(true);
        break;
      case "matiere":
      case "matieres":
      case "discipline":
      case "disciplines":
        meta.disciplines = list();
        break;
      case "type":
      case "type_de_document": {
        const t = parseDocType(value);
        meta.type = t ?? value;
        if (!t) meta.typeInvalide = value;
        break;
      }
      case "organisme":
      case "producteur":
      case "organisme_producteur":
      case "organisme/producteur":
      case "institution":
      case "ministere":
      case "ministere/institution":
      case "ministere/institution_productrice":
      case "institution_productrice":
        meta.organisme = value;
        break;
      case "annee":
      case "annee_de_publication":
      case "date":
      case "date_publication":
      case "date_de_publication":
        meta.annee = value;
        break;
      case "version":
        meta.version = value;
        break;
      case "date_integration":
      case "date_dintegration":
      case "date_dintegration_dans_pedagogue.ia":
      case "date_dintegration_dans_mon_prof.ia":
      case "date_dintegration_dans_kibaru":
      case "integration":
        meta.dateIntegration = date();
        break;
      case "statut":
      case "status":
      case "etat": {
        if (isPlaceholder(value) && !/v[eé]rifier/i.test(value)) break;
        const st = parseStatut(value);
        if (st) meta.statut = st;
        else if (key !== "etat") {
          // Ancienne fiche où « statut » était une description libre : conservée comme observation.
          meta.statutInvalide = value;
          meta.observations = meta.observations ? `${meta.observations} ${value}` : value;
        }
        break;
      }
      case "source":
        meta.source = value;
        break;
      case "url":
      case "url_reference":
      case "reference":
      case "url_ou_reference":
      case "url_ou_reference_documentaire":
        meta.url = value;
        break;
      case "perimetre":
      case "perimetre_dutilisation":
        meta.perimetre = value;
        break;
      case "niveau_source":
      case "niveau_de_source":
      case "fiabilite":
      case "niveau_de_fiabilite":
      case "niveau_fiabilite": {
        const n = Number.parseInt(value, 10);
        if (n >= 1 && n <= 5) meta.niveauSource = n;
        break;
      }
      case "priorite": {
        const n = Number.parseInt(value, 10);
        const p = normKey(value).toUpperCase();
        if (n >= 1 && n <= 5) meta.niveauSource = n; // ancienne écriture : priorité = hiérarchie des sources
        else if ((PRIORITES as readonly string[]).includes(p)) meta.priorite = p as Priorite;
        break;
      }
      case "date_verification":
      case "date_de_derniere_verification":
      case "derniere_verification":
        meta.dateVerification = date();
        break;
      case "remplace":
      case "document_remplace":
        meta.remplace = list();
        break;
      case "remplace_par":
      case "remplacee_par":
      case "remplace_par_document":
      case "document_de_remplacement":
        meta.remplacePar = list();
        break;
      case "date_remplacement":
      case "date_de_remplacement":
        meta.dateRemplacement = date();
        break;
      case "date_mise_a_jour":
      case "date_de_derniere_mise_a_jour":
      case "mise_a_jour":
        meta.dateMiseAJour = date();
        break;
      case "date_expiration":
      case "expiration":
        meta.dateExpiration = parseDate(value);
        break;
      case "observations":
      case "observation":
      case "remarques":
        meta.observations = meta.observations ? `${value} ${meta.observations}` : value;
        break;
      case "avertissement":
      case "attention":
      case "regle":
      case "regle_dusage":
        meta.avertissement = value;
        break;
      case "fichier":
      case "chemin":
        meta.fichier = value.replace(/^\/+/, "");
        break;
    }
  }
  return meta;
}

/** Sépare l'en-tête « --- … --- » du corps d'un fichier texte. */
export function splitFrontmatter(content: string): { meta: DocMeta; body: string } {
  const m = content.match(/^﻿?---\r?\n([\s\S]*?)\r?\n---\r?\n?/);
  if (!m) return { meta: emptyMeta(), body: content };
  return { meta: parseMetaBlock(m[1]!), body: content.slice(m[0].length) };
}
