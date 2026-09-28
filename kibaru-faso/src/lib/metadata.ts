/**
 * Métadonnées des documents de la base documentaire KIBARU (configuration V2, section 5),
 * au format « clé: valeur », une par ligne. Les lignes commençant par « # » sont des commentaires.
 *
 *   document_id: BF-MATH-6E-GUIDE-001
 *   titre: Guide pédagogique de mathématiques — 6e
 *   organisme: Ministère de l'Éducation nationale
 *   pays: Burkina Faso
 *   niveau: premier cycle
 *   classes: 6e
 *   matieres: Mathématiques
 *   type: guide pédagogique
 *   annee: 2019
 *   version: 1
 *   statut: référence pédagogique
 *   etat: actif | archive | remplace | declasse
 *   remplace: BF-MATH-6E-GUIDE-000         (identifiant du document que celui-ci remplace)
 *   fiabilite: 1 à 5                        (hiérarchie des sources, section 7)
 *   source: site du ministère
 *   date_integration: 2026-09-28
 *   date_mise_a_jour: 2026-09-28
 *   date_expiration: 2027-08-31
 *   avertissement: règle d'usage que KIBARU doit respecter pour ce document
 *
 * Pour un fichier .md/.txt : en tête, entre deux lignes « --- ».
 * Pour un .pdf/.docx : dans un fichier voisin « nom-du-fichier.pdf.meta ».
 * Les clés sont insensibles à la casse et aux accents (« MATIÈRE », « Document ID »… sont acceptés).
 */

export const LIFECYCLE_STATES = ["actif", "archive", "remplace", "declasse"] as const;
export type LifecycleState = (typeof LIFECYCLE_STATES)[number];

export type DocMeta = {
  documentId?: string;
  titre?: string;
  organisme?: string;
  pays?: string;
  niveau?: string;
  type?: string;
  classes: string[];
  disciplines: string[];
  annee?: string;
  version?: string;
  statut?: string;
  etat?: LifecycleState;
  remplace: string[];
  fiabilite?: number;
  source?: string;
  dateIntegration?: string;
  dateMiseAJour?: string;
  dateExpiration?: string;
  avertissement?: string;
};

export function emptyMeta(): DocMeta {
  return { classes: [], disciplines: [], remplace: [] };
}

function normKey(k: string): string {
  return k
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/['’]/g, "")
    .replace(/[\s-]+/g, "_");
}

function normState(v: string): LifecycleState | undefined {
  const n = normKey(v);
  if (/^(actif|active|en_vigueur|valide)/.test(n)) return "actif";
  if (/^archiv/.test(n)) return "archive";
  if (/^remplac/.test(n)) return "remplace";
  if (/^declass/.test(n)) return "declasse";
  return undefined;
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
  return !v || /^(a|à) (renseigner|completer|compléter|preciser|préciser)|^(n\/a|inconnu|-)$/i.test(v.trim());
}

export function parseMetaBlock(block: string): DocMeta {
  const meta = emptyMeta();
  for (const line of block.split(/\r?\n/)) {
    if (/^\s*#/.test(line)) continue;
    const m = line.match(/^\s*([\p{L}_ '’-]+?)\s*:\s*(.*)$/u);
    if (!m) continue;
    const key = normKey(m[1]!);
    const value = m[2]!.trim().replace(/^["']|["']$/g, "");
    if (isPlaceholder(value)) continue;
    const list = () => value.replace(/^\[|\]$/g, "").split(/[,;]/).map((v) => v.trim()).filter(Boolean);
    switch (key) {
      case "document_id":
      case "documentid":
      case "id":
      case "identifiant":
        meta.documentId = value;
        break;
      case "titre":
      case "title":
        meta.titre = value;
        break;
      case "organisme":
      case "producteur":
      case "organisme_producteur":
        meta.organisme = value;
        break;
      case "pays":
        meta.pays = value;
        break;
      case "niveau":
        meta.niveau = value;
        break;
      case "type":
        meta.type = value;
        break;
      case "classe":
      case "classes":
        meta.classes = list();
        break;
      case "discipline":
      case "disciplines":
      case "matiere":
      case "matieres":
        meta.disciplines = list();
        break;
      case "annee":
      case "date":
      case "date_publication":
      case "date_de_publication":
        meta.annee = value;
        break;
      case "version":
        meta.version = value;
        break;
      case "statut":
      case "status":
        meta.statut = value;
        break;
      case "etat":
      case "cycle_de_vie":
        meta.etat = normState(value);
        break;
      case "remplace":
      case "remplace_document":
        meta.remplace = list();
        break;
      case "fiabilite":
      case "niveau_de_fiabilite":
      case "niveau_fiabilite": {
        const n = Number.parseInt(value, 10);
        if (n >= 1 && n <= 5) meta.fiabilite = n;
        break;
      }
      case "source":
        meta.source = value;
        break;
      case "date_integration":
      case "date_dintegration":
      case "integration":
        meta.dateIntegration = parseDate(value) ?? value;
        break;
      case "date_mise_a_jour":
      case "date_de_derniere_mise_a_jour":
      case "mise_a_jour":
        meta.dateMiseAJour = parseDate(value) ?? value;
        break;
      case "date_expiration":
      case "expiration":
        meta.dateExpiration = parseDate(value);
        break;
      case "avertissement":
      case "attention":
      case "regle":
      case "regle_dusage":
        meta.avertissement = value;
        break;
    }
  }
  // Une classe indiquée seulement comme « niveau » (ex. « NIVEAU : 6e ») sert aussi de filtre de classe.
  if (meta.classes.length === 0 && meta.niveau && /^(6e|5e|4e|3e|2nde|1[eè]re|terminale|tle)\b/i.test(meta.niveau)) {
    meta.classes = [meta.niveau];
  }
  return meta;
}

/** Sépare l'en-tête « --- … --- » du corps d'un fichier texte. */
export function splitFrontmatter(content: string): { meta: DocMeta; body: string } {
  const m = content.match(/^﻿?---\r?\n([\s\S]*?)\r?\n---\r?\n?/);
  if (!m) return { meta: emptyMeta(), body: content };
  return { meta: parseMetaBlock(m[1]!), body: content.slice(m[0].length) };
}
