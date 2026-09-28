import { CONSULTED, STATUT_LABELS, STATUT_WEIGHT, subjectCodes, typeLabel, type Statut } from "./base/structure";

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
  /** programme, guide pédagogique, progression… */
  type: string;
  origin: RefOrigin;
  /** Classes concernées ; vide = toutes. */
  classes: string[];
  /** Matières concernées ; vide = toutes. */
  disciplines: string[];
  source?: string;
  /** Statut officiel (base documentaire). Toujours renseigné par le chargeur ; absent pour les documents de l'enseignant. */
  statut?: Statut;
  observations?: string;
  /** Règle d'usage propre au document, transmise au modèle avec chaque extrait. */
  notice?: string;
  /** ID unique dans la base MON PROF.IA (ex. BF-MATH-6E-GUIDE-001). */
  documentId?: string;
  organisme?: string;
  pays?: string;
  niveau?: string;
  year?: string;
  version?: string;
  /** Hiérarchie des sources : 1 = source officielle … 5 = connaissance générale du modèle. */
  sourceLevel?: number;
  /** Priorité de traitement dans le registre (HAUTE, MOYENNE, BASSE). */
  priority?: string;
  url?: string;
  /** Périmètre d'utilisation déclaré. */
  perimeter?: string;
  /** Catégorie de la structure officielle (01_PROGRAMMES_ET_CURRICULA…) et chemin dans la base. */
  category?: string;
  path?: string;
  /** ID des ressources que celle-ci remplace / qui la remplacent. */
  supersedes?: string[];
  supersededBy?: string[];
  integratedAt?: string;
  verifiedAt?: string;
  replacedAt?: string;
  updatedAt?: string;
  expiresAt?: string;
  /** Remarque calculée lors de la résolution des versions. */
  note?: string;
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

/** Un document est applicable s'il ne restreint pas la classe/matière, ou s'il inclut celle demandée. */
export function isApplicable(doc: Pick<RefDocument, "classes" | "disciplines">, classe?: string, discipline?: string): boolean {
  if (classe && doc.classes.length > 0) {
    const c = canonicalClasse(classe);
    if (!doc.classes.some((dc) => canonicalClasse(dc) === c)) return false;
  }
  if (discipline && doc.disciplines.length > 0) {
    const wanted = subjectCodes(discipline);
    if (!doc.disciplines.some((dd) => [...subjectCodes(dd)].some((c) => wanted.has(c)))) return false;
  }
  return true;
}

export type ArchivedDoc = { doc: DocInfo; reason: string };

export function docInfo(d: RefDocument): DocInfo {
  const { text: _text, ...info } = d;
  return info;
}

const idKey = (id: string) => normalize(id).trim();

function describeVersion(d: Pick<RefDocument, "documentId" | "title" | "version" | "statut">): string {
  return `${d.documentId ?? d.title}${d.version ? ` (version ${d.version})` : ""}`;
}

/**
 * Résolution des versions de la base documentaire. Règles :
 * - ne sont consultés que les statuts ACTIF, PROVISOIRE et À VÉRIFIER (et les documents de l'enseignant) ;
 * - REMPLACÉ et ARCHIVE sont conservés dans l'historique, jamais supprimés, jamais consultés ;
 * - un remplacement n'est appliqué que s'il est déclaré (remplace / remplace_par) ET que la nouvelle
 *   ressource est ACTIVE. Une version plus récente mais provisoire ou à vérifier n'écarte pas l'ancienne ;
 * - l'ancienneté seule ne rend jamais un document obsolète, et la nouveauté seule ne le rend jamais applicable :
 *   aucune version n'est déduite de la date ni du titre ;
 * - une date d'expiration dépassée, déclarée dans la fiche, fait passer le document dans l'historique.
 */
export function resolveBase(docs: RefDocument[], today = new Date().toISOString().slice(0, 10)): { usable: RefDocument[]; history: ArchivedDoc[] } {
  const byId = new Map<string, RefDocument>();
  for (const d of docs) if (d.documentId) byId.set(idKey(d.documentId), d);
  const isConsulted = (d: RefDocument) => d.origin === "enseignant" || (!!d.statut && CONSULTED.includes(d.statut));
  const expired = (d: RefDocument) => !!d.expiresAt && d.expiresAt < today;

  // Relations de remplacement déclarées d'un côté ou de l'autre : ancien → nouveaux.
  const successors = new Map<RefDocument, Set<RefDocument>>();
  const link = (oldDoc: RefDocument | undefined, newDoc: RefDocument | undefined) => {
    if (!oldDoc || !newDoc || oldDoc === newDoc) return;
    if (!successors.has(oldDoc)) successors.set(oldDoc, new Set());
    successors.get(oldDoc)!.add(newDoc);
  };
  for (const d of docs) {
    for (const id of d.supersedes ?? []) link(byId.get(idKey(id)), d);
    for (const id of d.supersededBy ?? []) link(d, byId.get(idKey(id)));
  }

  const usable: RefDocument[] = [];
  const history: ArchivedDoc[] = [];
  for (const d of docs) {
    const next = [...(successors.get(d) ?? [])];
    const activeNext = next.filter((n) => n.statut === "ACTIF" && !expired(n));
    const when = d.replacedAt ? ` le ${d.replacedAt}` : "";
    if (!isConsulted(d)) {
      const by = next.length ? ` par ${next.map(describeVersion).join(", ")}` : "";
      history.push({ doc: docInfo(d), reason: `${STATUT_LABELS[d.statut ?? "ARCHIVE"]}${d.statut === "REMPLACE" ? `${by}${when}` : ""}` });
    } else if (expired(d)) {
      history.push({ doc: docInfo(d), reason: `expiré le ${d.expiresAt}` });
    } else if (activeNext.length) {
      history.push({ doc: docInfo(d), reason: `remplacé par ${activeNext.map(describeVersion).join(", ")}${when}` });
    } else if (next.length) {
      // Nouvelle version déclarée mais pas encore ACTIVE : l'ancienne reste utilisable, et on le signale.
      const pending = next.map((n) => `${describeVersion(n)}, statut ${STATUT_LABELS[n.statut ?? "A_VERIFIER"]}`).join(" ; ");
      usable.push({ ...d, note: `Une version plus récente est déclarée (${pending}) mais n'est pas active : ce document reste la référence consultée.` });
    } else {
      usable.push(d);
    }
  }
  return { usable, history };
}

/** Ordre de recherche (moteur pédagogique, section 6) : programme/curriculum, guide, référentiel, progression, puis le reste. */
const TYPE_WEIGHT: Record<string, number> = { PROGRAMME: 1.15, CURRICULUM: 1.15, GUIDE_PEDAGOGIQUE: 1.1, REFERENTIEL: 1.08, PROGRESSION: 1.05 };

/** Hiérarchie des sources : à pertinence égale, le document le plus officiel passe devant. */
const LEVEL_WEIGHT: Record<number, number> = { 1: 1.3, 2: 1.2, 3: 1.1, 4: 1, 5: 0.9 };

/**
 * Classe les extraits par pertinence (BM25) pour la requête, pondérée par la priorité et le statut.
 * Le titre, le type, l'année et la version du document comptent dans le score. La date ne donne
 * aucun avantage par elle-même.
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
      // Une source propre à la classe et à la matière passe devant une source plus générale (section 8).
      const specific = opts.classe && opts.discipline && it.doc.classes.length > 0 && it.doc.disciplines.length > 0 ? 1.1 : 1;
      const weight =
        (LEVEL_WEIGHT[it.doc.sourceLevel ?? 4] ?? 1) * (it.doc.statut ? STATUT_WEIGHT[it.doc.statut] : 1) * (TYPE_WEIGHT[it.doc.type] ?? 1) * specific;
      return { it, score: score * weight };
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
    ["id", d.documentId],
    ["statut", d.statut ? STATUT_LABELS[d.statut] : undefined],
    ["niveau_source", d.sourceLevel ? String(d.sourceLevel) : undefined],
    ["categorie", d.category],
    ["type", d.type ? typeLabel(d.type) : undefined],
    ["origine", d.origin],
    ["organisme", d.organisme],
    ["pays", d.pays],
    ["niveau", d.niveau],
    ["classes", d.classes.join(", ")],
    ["matieres", d.disciplines.join(", ")],
    ["annee", d.year],
    ["version", d.version],
    ["source", d.source],
    ["url", d.url],
    ["perimetre", d.perimeter],
    ["derniere_verification", d.verifiedAt],
    ["observations", d.observations],
    ["remarque", d.note],
  ];
  return pairs.filter((p): p is [string, string] => !!p[1]);
}

/** Bloc <documents_de_reference> inséré dans le message de l'enseignant. */
export function formatReferenceBlock(catalogue: RefDocument[], excerpts: Excerpt[], history: ArchivedDoc[] = []): string {
  const archives = history.length
    ? `\n<historique>\nVersions et documents conservés dans l'historique, NON consultés pour cette demande :\n${history
        .slice(0, 30)
        .map((a) => `- ${stripTags(a.doc.title)}${a.doc.documentId ? ` [${stripTags(a.doc.documentId)}]` : ""}${a.doc.version ? ` (version ${stripTags(a.doc.version)})` : ""}${a.doc.year ? `, ${stripTags(a.doc.year)}` : ""} : ${stripTags(a.reason)}`)
        .join("\n")}\n</historique>`
    : "";
  if (catalogue.length === 0) {
    return `<documents_de_reference>\nAucune ressource de la base documentaire MON PROF.IA n'est disponible pour cette demande.${archives}\n</documents_de_reference>`;
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
            `<extrait etiquette="${e.label}" titre="${escapeAttr(e.doc.title)}" ${describe(e.doc).map(([k, v]) => `${k}="${escapeAttr(v)}"`).join(" ")}>\n${e.doc.notice ? `<regle_usage>${stripTags(e.doc.notice)}</regle_usage>\n` : ""}${e.text.replace(/<\/?(extrait|documents_de_reference|historique|catalogue|regle_usage)[^>]*>/gi, "")}\n</extrait>`,
        )
        .join("\n")
    : "Aucun extrait pertinent n'a été retrouvé dans ces documents pour cette demande.";
  return `<documents_de_reference>\n<catalogue>\n${lines.join("\n")}\n</catalogue>${archives}\n${body}\n</documents_de_reference>`;
}
