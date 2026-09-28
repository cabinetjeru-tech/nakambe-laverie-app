import type { TeacherContext } from "./conversation";
import { normalize } from "./search";

/**
 * Module 04 — Générateur de progressions.
 * Paramètres d'une demande de progression (période, volume horaire, semaines), construction de la demande depuis
 * le formulaire, et contrôles automatiques après génération (volume horaire respecté, semaines cohérentes,
 * évaluations prévues, progression jamais présentée comme officielle sans source). Fonctions pures.
 */

export const PERIODES = ["année scolaire", "1er trimestre", "2e trimestre", "3e trimestre", "1er semestre", "2e semestre", "un mois"] as const;

export type ProgParams = {
  periode?: string;
  /** Volume horaire hebdomadaire, en heures. */
  heuresSemaine?: number;
  /** Nombre de semaines disponibles. */
  semaines?: number;
  /** Durée d'une séance, en minutes. */
  dureeSeance?: number;
};

const NUM: Record<string, number> = { un: 1, une: 1, deux: 2, trois: 3, quatre: 4, cinq: 5, six: 6, sept: 7, huit: 8 };
const num = (s: string) => NUM[s] ?? parseFloat(s.replace(",", "."));

export function parseProgParams(text: string): ProgParams {
  const n = normalize(text).replace(/’/g, "'");
  const out: ProgParams = {};
  for (const line of text.split(/\r?\n/)) {
    const m = line.match(/^\s*[-•*]?\s*([^:]{2,40}?)\s*:\s*(.+?)\s*$/);
    if (!m) continue;
    const key = normalize(m[1]!).replace(/[^a-z ]/g, "").trim();
    const value = normalize(m[2]!).replace(/[.;]+$/, "");
    if (/^periode$/.test(key)) out.periode = m[2]!.trim().replace(/[.;]+$/, "");
    else if (/^(volume horaire|volume horaire hebdomadaire|heures par semaine)$/.test(key)) out.heuresSemaine = num(value.match(/[\d.,]+|\b(un|une|deux|trois|quatre|cinq|six|sept|huit)\b/)?.[0] ?? "") || undefined;
    else if (/^(nombre de semaines|semaines disponibles|semaines)$/.test(key)) out.semaines = parseInt(value, 10) || undefined;
    else if (/^(duree dune seance|duree d une seance|duree des seances|seance)$/.test(key)) out.dureeSeance = parseMinutesLoose(value);
  }
  if (!out.periode) {
    if (/\b(1er|premier) trimestre\b/.test(n)) out.periode = "1er trimestre";
    else if (/\b(2e|2eme|deuxieme|second) trimestre\b/.test(n)) out.periode = "2e trimestre";
    else if (/\b(3e|3eme|troisieme|dernier) trimestre\b/.test(n)) out.periode = "3e trimestre";
    else if (/\b(1er|premier) semestre\b/.test(n)) out.periode = "1er semestre";
    else if (/\b(2e|2eme|second) semestre\b/.test(n)) out.periode = "2e semestre";
    else if (/\b(annuelle|annee scolaire|toute l'annee|l'annee)\b/.test(n)) out.periode = "année scolaire";
    else if (/\btrimestre|trimestrielle\b/.test(n)) out.periode = "trimestre (à préciser)";
  }
  if (!out.heuresSemaine) {
    const h = n.match(/\b(\d+(?:[.,]\d+)?|un|une|deux|trois|quatre|cinq|six|sept|huit)\s?(?:h|heures?)\s*(?:par|\/|a la|chaque)\s*semaine\b/);
    if (h) out.heuresSemaine = num(h[1]!);
  }
  if (!out.semaines) {
    const w = n.match(/\b(\d{1,2}) semaines\b/);
    if (w) out.semaines = parseInt(w[1]!, 10);
  }
  if (!out.dureeSeance) {
    const d = n.match(/\bseances? de (\d+\s?(?:min|minutes|h|heures?)(?:\s?\d+)?)/);
    if (d) out.dureeSeance = parseMinutesLoose(d[1]!);
  }
  return out;
}

function parseMinutesLoose(t: string): number | undefined {
  const s = normalize(t);
  const h = s.match(/(\d+(?:[.,]\d+)?)\s?h(?:eures?)?\s?(\d{1,2})?/);
  if (h) return Math.round(parseFloat(h[1]!.replace(",", ".")) * 60 + (h[2] ? parseInt(h[2], 10) : 0));
  const m = s.match(/(\d+)\s?(?:min|minutes|mn)/);
  return m ? parseInt(m[1]!, 10) : undefined;
}

/** Heures disponibles sur la période, quand le volume hebdomadaire et le nombre de semaines sont connus. */
export function heuresDisponibles(p: ProgParams): number | undefined {
  return p.heuresSemaine && p.semaines ? Math.round(p.heuresSemaine * p.semaines * 10) / 10 : undefined;
}

// ---------------------------------------------------------------- Formulaire

export type ProgForm = {
  classe: string;
  discipline: string;
  periode: string;
  heuresSemaine: string;
  dureeSeance: string;
  semaines: string;
  debut: string;
  chapitres: string;
  reservees: string;
  evaluations: boolean;
  marge: boolean;
};

export function emptyProg(ctx: TeacherContext): ProgForm {
  return {
    classe: ctx.classe ?? "",
    discipline: ctx.discipline ?? "",
    periode: "année scolaire",
    heuresSemaine: "",
    dureeSeance: ctx.duree ?? "55 minutes",
    semaines: "",
    debut: "",
    chapitres: "",
    reservees: "",
    evaluations: true,
    marge: true,
  };
}

export function progMissing(f: ProgForm): string[] {
  return (
    [
      ["classe", f.classe],
      ["discipline", f.discipline],
      ["volume horaire hebdomadaire", f.heuresSemaine],
    ] as const
  )
    .filter(([, v]) => !v.trim())
    .map(([k]) => k);
}

export function buildProgRequest(f: ProgForm): { message: string; context: Partial<TeacherContext> } {
  const opts = [f.evaluations && "avec les évaluations", f.marge && "avec une marge de rattrapage"].filter(Boolean);
  const p = f.periode.trim() || "année scolaire";
  const article = /^(un|une)\b/.test(p) ? "" : /^[aeéiouy]/i.test(p) ? "l'" : /^\d/.test(p) ? "le " : "";
  const head = `Construis une progression pour ${article}${p}${opts.length ? `, ${opts.join(", ")}` : ""}.`;
  const lines: [string, string][] = [
    ["Classe", f.classe],
    ["Matière", f.discipline],
    ["Période", p],
    ["Volume horaire hebdomadaire", f.heuresSemaine && `${f.heuresSemaine} h par semaine`],
    ["Durée d'une séance", f.dureeSeance],
    ["Nombre de semaines", f.semaines],
    ["Date de début", f.debut],
    ["Chapitres à couvrir", f.chapitres],
    ["Semaines réservées", f.reservees],
  ];
  return {
    message: [head, ...lines.filter(([, v]) => v?.trim()).map(([k, v]) => `${k} : ${v.trim()}`)].join("\n"),
    context: { classe: f.classe || undefined, discipline: f.discipline || undefined },
  };
}

// ---------------------------------------------------------------- Contrôles automatiques

type Row = { cells: string[] };

/** Tableau de progression : premier tableau Markdown dont l'en-tête contient « Semaine ». */
export function progressionTable(markdown: string): { header: string[]; rows: Row[] } | undefined {
  const lines = markdown.split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    if (!/^\s*\|/.test(lines[i]!)) continue;
    const header = lines[i]!.split("|").map((c) => normalize(c).trim());
    if (!header.some((c) => c.startsWith("semaine")) || !/^\s*\|?\s*:?-{2,}/.test(lines[i + 1] ?? "")) continue;
    const rows: Row[] = [];
    for (let j = i + 2; j < lines.length && /^\s*\|/.test(lines[j]!); j++) rows.push({ cells: lines[j]!.split("|") });
    return { header, rows };
  }
  return undefined;
}

function hoursOf(cell: string | undefined, dureeSeance?: number, seancesColumn = false): number | undefined {
  if (!cell) return undefined;
  const s = normalize(cell);
  const h = s.match(/(\d+(?:[.,]\d+)?)\s?h\b(?:\s?(\d{1,2}))?/);
  if (h) return parseFloat(h[1]!.replace(",", ".")) + (h[2] ? parseInt(h[2], 10) / 60 : 0);
  const m = s.match(/(\d+)\s?(?:min|mn)/);
  if (m) return parseInt(m[1]!, 10) / 60;
  const n = s.match(/^\s*\**\s*(\d+(?:[.,]\d+)?)\s*\**\s*(seances?)?\s*$/);
  if (!n) return undefined;
  const v = parseFloat(n[1]!.replace(",", "."));
  if (seancesColumn || n[2]) return dureeSeance ? (v * dureeSeance) / 60 : undefined;
  return v;
}

/** Semaines citées dans une cellule : « 3 », « S3 », « 3-4 », « 3 à 5 ». */
function weeksOf(cell: string | undefined): number[] {
  if (!cell) return [];
  const s = normalize(cell);
  const r = s.match(/(\d+)\s*(?:-|a|au)\s*s?(\d+)/);
  if (r) {
    const a = parseInt(r[1]!, 10);
    const b = parseInt(r[2]!, 10);
    return b >= a && b - a < 60 ? Array.from({ length: b - a + 1 }, (_, k) => a + k) : [];
  }
  const one = s.match(/(\d+)/);
  return one ? [parseInt(one[1]!, 10)] : [];
}

export function progressionChecks(answer: string, params: ProgParams, confidenceHigh: boolean): string[] {
  const out: string[] = [];
  const t = progressionTable(answer);
  if (!t) {
    out.push("Tableau de progression (colonne « Semaine ») non repéré : volume horaire et semaines non vérifiables.");
  } else {
    const wi = t.header.findIndex((c) => c.startsWith("semaine"));
    let hi = t.header.findIndex((c) => /heure|volume|\bh\b|duree/.test(c));
    let seancesColumn = false;
    if (hi < 0) {
      hi = t.header.findIndex((c) => c.startsWith("seance") || c.startsWith("nombre de seance"));
      seancesColumn = hi >= 0;
    }
    const dataRows = t.rows.filter((r) => !/^\s*\**\s*total/.test(normalize(r.cells[wi] ?? "")) && !/\btotal\b/.test(normalize(r.cells[1] ?? "")));
    // Semaines : dans l'ordre, sans dépasser le nombre de semaines disponibles.
    const weeks = dataRows.flatMap((r) => weeksOf(r.cells[wi]));
    const firsts = dataRows.map((r) => weeksOf(r.cells[wi])[0]).filter((x): x is number => x !== undefined);
    if (firsts.some((w, k) => k > 0 && w < firsts[k - 1]!)) out.push("Les semaines du tableau de progression ne sont pas dans l'ordre.");
    if (params.semaines && weeks.length && Math.max(...weeks) > params.semaines)
      out.push(`La progression va jusqu'à la semaine ${Math.max(...weeks)}, pour ${params.semaines} semaines disponibles.`);
    // Volume horaire : total planifié ≤ heures disponibles, avec une marge raisonnable.
    if (hi >= 0) {
      const hours = dataRows.map((r) => hoursOf(r.cells[hi], params.dureeSeance, seancesColumn)).filter((x): x is number => x !== undefined);
      const total = Math.round(hours.reduce((a, b) => a + b, 0) * 10) / 10;
      const dispo = heuresDisponibles(params);
      if (hours.length && dispo !== undefined) {
        if (total > dispo + 1e-9) out.push(`Volume planifié : ${String(total).replace(".", ",")} h, pour ${String(dispo).replace(".", ",")} h disponibles (${params.heuresSemaine} h × ${params.semaines} semaines).`);
        else if (total < dispo * 0.7) out.push(`Volume planifié : ${String(total).replace(".", ",")} h sur ${String(dispo).replace(".", ",")} h disponibles : plus de 30 % du temps n'est pas utilisé.`);
      }
      // Semaine surchargée : plus d'heures qu'un volume hebdomadaire.
      if (params.heuresSemaine) {
        const overloaded = dataRows.filter((r) => {
          const h = hoursOf(r.cells[hi], params.dureeSeance, seancesColumn);
          const w = weeksOf(r.cells[wi]).length || 1;
          return h !== undefined && h / w > params.heuresSemaine! + 1e-9;
        });
        if (overloaded.length) out.push(`${overloaded.length} ligne(s) du tableau dépassent le volume hebdomadaire de ${params.heuresSemaine} h.`);
      }
    } else out.push("Colonne des heures (ou des séances) non repérée dans le tableau de progression.");
    if (!/evaluation|devoir|composition|interrogation|controle/.test(normalize(t.rows.map((r) => r.cells.join(" ")).join(" "))))
      out.push("Aucune évaluation prévue dans le tableau de progression.");
  }
  if (!confidenceHigh) {
    const n = normalize(answer);
    const claims = n.split(/(?<=[.!?])\s+|\n+/).filter((s) => /progression officielle|progression du ministere|progression nationale|conforme a la progression/.test(s) && !/non confirm|a verifier|n'est pas|ne (remplace|constitue) pas|pas (la|une|de) progression|absente|pas encore|aucune progression|compar/.test(s));
    if (claims.length) out.push("La progression semble présentée comme officielle sans source ACTIVE qui la confirme.");
  }
  return out;
}
