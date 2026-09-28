import type { LifecycleState } from "./metadata";

/**
 * Recherche dans les documents de référence : découpage en extraits et classement BM25.
 * Fonctions pures (aucun accès disque), utilisables côté serveur et dans les tests.
 */

export const CLASSES = ["6e", "5e", "4e", "3e", "2nde", "1ère", "Terminale"] as const;
export type Classe = (typeof CLASSES)[number];

export type RefOrigin = "bibliotheque" | "enseignant";

export type RefDocument = {
  id: string;
  title: string;
  /** programme, guide, progression, référentiel, fiche… (libre) */
  type: string;
  origin: RefOrigin;
  /** Classes concernées ; vide = toutes. */
  classes: string[];
  /** Disciplines concernées ; vide = toutes. */
  disciplines: string[];
  /** Mention d'origine lisible (ex. « MENAPLN, 2023 »), si connue. */
  source?: string;
  /** Statut du document (en vigueur, ancien…), tel que déclaré par l'administrateur. */
  status?: string;
  /** Règle d'usage propre au document, transmise au modèle avec chaque extrait. */
  notice?: string;
  /** Identifiant stable dans la base KIBARU (ex. BF-MATH-6E-GUIDE-001). */
  documentId?: string;
  organisme?: string;
  pays?: string;
  niveau?: string;
  year?: string;
  version?: string;
  /** Hiérarchie des sources (configuration V2, section 7) : 1 = document officiel du ministère … 5 = connaissance générale. */
  reliability?: number;
  /** Cycle de vie : actif (défaut), archive, remplace, declasse. */
  state?: LifecycleState;
  /** Identifiants des documents que celui-ci remplace. */
  supersedes?: string[];
  integratedAt?: string;
  updatedAt?: string;
  expiresAt?: string;
  text: string;
};

export type DocInfo = Omit<RefDocument, "text">;

export type Chunk = { docId: string; index: number; text: string };

export type Excerpt = {
  label: string; // R1, R2…
  doc: DocInfo;
  text: string;
  score: number;
};

const STOPWORDS = new Set(
  (
    "a au aux avec ce ces cette dans de des du elle en et eux il ils je la le les leur lui ma mais me meme mes moi mon ne nos notre nous on ou par pas pour qu que qui sa se ses son sur ta te tes toi ton tu un une vos votre vous c d j l m n s t y ete etre avoir fait faire est sont plus tres tout tous toute toutes comme si leur leurs dont cela ceci peut peuvent doit doivent aussi entre sans sous vers chez apres avant pendant quel quelle quels quelles"
  ).split(" "),
);

/** Minuscules, sans accents ni ponctuation. */
export function normalize(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/œ/g, "oe")
    .replace(/æ/g, "ae");
}

/** Racinisation légère du français : suffices de pluriel et quelques terminaisons fréquentes. */
function stem(w: string): string {
  if (w.length <= 4) return w;
  for (const suf of ["ements", "ement", "ations", "ation", "ites", "ite", "eaux", "aux", "euses", "euse", "eurs", "eur", "ives", "ive", "es", "s", "e", "x"]) {
    if (w.endsWith(suf) && w.length - suf.length >= 4) return w.slice(0, -suf.length);
  }
  return w;
}

export function tokenize(s: string): string[] {
  return normalize(s)
    .split(/[^a-z0-9]+/)
    .filter((w) => w.length > 1 && !STOPWORDS.has(w))
    .map(stem);
}

/** Découpe un texte en extraits d'environ `size` caractères, en respectant les paragraphes. */
export function chunkText(text: string, size = 1400, overlap = 200): string[] {
  const clean = text.replace(/\r/g, "").replace(/[ \t]+/g, " ").replace(/\n{3,}/g, "\n\n").trim();
  if (!clean) return [];
  if (clean.length <= size) return [clean];
  const paras = clean.split(/\n\n/);
  const chunks: string[] = [];
  let cur = "";
  const push = () => {
    if (cur.trim()) chunks.push(cur.trim());
  };
  for (const p of paras) {
    if (p.length > size) {
      // Paragraphe trop long : découpe dure avec chevauchement.
      push();
      cur = "";
      for (let i = 0; i < p.length; i += size - overlap) chunks.push(p.slice(i, i + size).trim());
      continue;
    }
    if (cur.length + p.length + 2 > size) {
      push();
      const tail = cur.slice(-overlap);
      cur = tail ? `${tail.slice(tail.indexOf(" ") + 1)}\n\n${p}` : p;
    } else {
      cur = cur ? `${cur}\n\n${p}` : p;
    }
  }
  push();
  return chunks;
}

/** Normalise une classe saisie librement (« Tle », « terminale D », « 1ere »…) vers la liste officielle. */
export function canonicalClasse(s: string): string {
  const n = normalize(s).replace(/\s+/g, "");
  if (/^(tle|term|terminale)/.test(n)) return "Terminale";
  if (/^(1ere|1re|premiere|1e)/.test(n)) return "1ère";
  if (/^(2nde|2nd|2de|seconde)/.test(n)) return "2nde";
  const m = n.match(/^([3-6])(e|eme)?/);
  if (m) return `${m[1]}e`;
  return s.trim();
}

/** Un document est applicable s'il ne restreint pas la classe/discipline, ou s'il inclut celle demandée. */
export function isApplicable(doc: RefDocument, classe?: string, discipline?: string): boolean {
  if (classe && doc.classes.length > 0) {
    const c = canonicalClasse(classe);
    if (!doc.classes.some((dc) => canonicalClasse(dc) === c)) return false;
  }
  if (discipline && doc.disciplines.length > 0) {
    const d = normalize(discipline).trim();
    if (!doc.disciplines.some((dd) => {
      const n = normalize(dd).trim();
      return n === d || n.includes(d) || d.includes(n);
    })) return false;
  }
  return true;
}

export type ArchivedDoc = { doc: DocInfo; reason: string };

export function docInfo(d: RefDocument): DocInfo {
  const { text: _text, ...info } = d;
  return info;
}

/**
 * Gestion des versions (configuration V2, sections 4, 6 et 22) : sépare les documents utilisables des archives.
 * Un document sort de la recherche s'il est archivé, déclassé ou marqué remplacé, s'il a expiré, ou si un
 * document actif déclare explicitement le remplacer (« remplace: <document_id> »). Rien n'est supprimé :
 * les archives restent listées. Aucune version n'est jamais déduite automatiquement de la ressemblance des titres.
 */
export function partitionByLifecycle(docs: RefDocument[], today = new Date().toISOString().slice(0, 10)): { active: RefDocument[]; archived: ArchivedDoc[] } {
  const archived: ArchivedDoc[] = [];
  const candidates: RefDocument[] = [];
  const stateLabel: Record<string, string> = { archive: "archivé", remplace: "marqué comme remplacé", declasse: "déclassé" };
  for (const d of docs) {
    if (d.state && d.state !== "actif") archived.push({ doc: docInfo(d), reason: stateLabel[d.state]! });
    else if (d.expiresAt && d.expiresAt < today) archived.push({ doc: docInfo(d), reason: `expiré le ${d.expiresAt}` });
    else candidates.push(d);
  }
  const replacedBy = new Map<string, RefDocument>();
  for (const d of candidates) for (const id of d.supersedes ?? []) replacedBy.set(normalize(id).trim(), d);
  const active: RefDocument[] = [];
  for (const d of candidates) {
    const by = d.documentId ? replacedBy.get(normalize(d.documentId).trim()) : undefined;
    if (by && by !== d) archived.push({ doc: docInfo(d), reason: `remplacé par ${by.documentId ?? by.title}${by.version ? ` (version ${by.version})` : ""}` });
    else active.push(d);
  }
  return { active, archived };
}

/** Pondération selon la hiérarchie des sources : à pertinence égale, le document le plus fiable passe devant. */
const RELIABILITY_WEIGHT: Record<number, number> = { 1: 1.3, 2: 1.2, 3: 1.1, 4: 1, 5: 0.9 };

/**
 * Classe les extraits par pertinence (BM25) pour la requête.
 * Le titre, le type, l'année et la version du document comptent dans le score, pour qu'un
 * « Programme de mathématiques 6e » remonte sur une question « fractions en 6e ».
 */
export function searchDocuments(
  docs: RefDocument[],
  query: string,
  opts: { classe?: string; discipline?: string; limit?: number; maxChars?: number } = {},
): Excerpt[] {
  const limit = opts.limit ?? 8;
  const maxChars = opts.maxChars ?? 14_000;
  const applicable = docs.filter((d) => isApplicable(d, opts.classe, opts.discipline));
  const qTokens = [...new Set(tokenize(query))];
  if (applicable.length === 0 || qTokens.length === 0) return [];

  type Scored = { doc: RefDocument; text: string; tf: Map<string, number>; len: number };
  const items: Scored[] = [];
  for (const doc of applicable) {
    const titleTokens = tokenize([doc.title, doc.type, doc.year, doc.version && `version ${doc.version}`].filter(Boolean).join(" "));
    for (const text of chunkText(doc.text)) {
      const toks = [...tokenize(text), ...titleTokens];
      const tf = new Map<string, number>();
      for (const t of toks) tf.set(t, (tf.get(t) ?? 0) + 1);
      items.push({ doc, text, tf, len: toks.length });
    }
  }
  if (items.length === 0) return [];

  const N = items.length;
  const avgLen = items.reduce((s, i) => s + i.len, 0) / N;
  const df = new Map<string, number>();
  for (const t of qTokens) df.set(t, items.filter((i) => i.tf.has(t)).length);

  const k1 = 1.4;
  const b = 0.75;
  const scored = items
    .map((it) => {
      let score = 0;
      for (const t of qTokens) {
        const f = it.tf.get(t);
        if (!f) continue;
        const n = df.get(t) ?? 0;
        const idf = Math.log(1 + (N - n + 0.5) / (n + 0.5));
        score += (idf * f * (k1 + 1)) / (f + k1 * (1 - b + (b * it.len) / avgLen));
      }
      return { it, score: score * (RELIABILITY_WEIGHT[it.doc.reliability ?? 4] ?? 1) };
    })
    .filter((s) => s.score > 0)
    .sort((a, b2) => b2.score - a.score);

  const out: Excerpt[] = [];
  let total = 0;
  for (const { it, score } of scored) {
    if (out.length >= limit || total + it.text.length > maxChars) break;
    total += it.text.length;
    out.push({ label: `R${out.length + 1}`, doc: docInfo(it.doc), text: it.text, score: Math.round(score * 100) / 100 });
  }
  return out;
}

function escapeAttr(s: string): string {
  return s.replace(/[&"<>]/g, (c) => ({ "&": "&amp;", '"': "&quot;", "<": "&lt;", ">": "&gt;" })[c] as string);
}

function stripTags(s: string): string {
  return s.replace(/[<>]/g, "");
}

/** Métadonnées utiles au modèle, dans un ordre stable. */
function describe(d: DocInfo): [string, string][] {
  const pairs: [string, string | undefined][] = [
    ["document_id", d.documentId],
    ["type", d.type],
    ["origine", d.origin],
    ["organisme", d.organisme],
    ["pays", d.pays],
    ["classes", d.classes.join(", ")],
    ["matieres", d.disciplines.join(", ")],
    ["annee", d.year],
    ["version", d.version],
    ["statut", d.status],
    ["niveau_fiabilite", d.reliability ? String(d.reliability) : undefined],
    ["source", d.source],
    ["mise_a_jour", d.updatedAt],
  ];
  return pairs.filter((p): p is [string, string] => !!p[1]);
}

/** Bloc <documents_de_reference> inséré dans le message de l'enseignant. */
export function formatReferenceBlock(catalogue: RefDocument[], excerpts: Excerpt[], archived: ArchivedDoc[] = []): string {
  const archives = archived.length
    ? `\n<archives>\nDocuments conservés en archive, NON utilisés pour cette demande :\n${archived
        .slice(0, 30)
        .map((a) => `- ${stripTags(a.doc.title)}${a.doc.documentId ? ` [${stripTags(a.doc.documentId)}]` : ""}${a.doc.version ? ` (version ${stripTags(a.doc.version)})` : ""} : ${stripTags(a.reason)}`)
        .join("\n")}\n</archives>`
    : "";
  if (catalogue.length === 0) {
    return `<documents_de_reference>\nAucun document de la base documentaire KIBARU n'est disponible pour cette demande.${archives}\n</documents_de_reference>`;
  }
  const shown = catalogue.slice(0, 60);
  const lines = shown.map(
    (d) => `- ${stripTags(d.title)} (${describe(d).map(([k, v]) => `${k}=${stripTags(v)}`).join(" ; ")})${d.notice ? `\n  Règle d'usage : ${stripTags(d.notice)}` : ""}`,
  );
  if (catalogue.length > shown.length) lines.push(`- … et ${catalogue.length - shown.length} autre(s) document(s)`);
  const body = excerpts.length
    ? excerpts
        .map(
          (e) =>
            `<extrait etiquette="${e.label}" titre="${escapeAttr(e.doc.title)}" ${describe(e.doc).map(([k, v]) => `${k}="${escapeAttr(v)}"`).join(" ")}>\n${e.doc.notice ? `<regle_usage>${stripTags(e.doc.notice)}</regle_usage>\n` : ""}${e.text.replace(/<\/?(extrait|documents_de_reference|archives|catalogue|regle_usage)[^>]*>/gi, "")}\n</extrait>`,
        )
        .join("\n")
    : "Aucun extrait pertinent n'a été retrouvé dans ces documents pour cette demande.";
  return `<documents_de_reference>\n<catalogue>\n${lines.join("\n")}\n</catalogue>${archives}\n${body}\n</documents_de_reference>`;
}
