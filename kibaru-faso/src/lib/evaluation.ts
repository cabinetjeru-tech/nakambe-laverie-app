import type { TeacherContext } from "./conversation";
import { splitDocuments } from "./documents";
import { normalize } from "./search";

/**
 * Module 02 — Générateur de devoirs et évaluations.
 * Paramètres d'une demande d'évaluation, construction de la demande depuis le formulaire, et contrôles
 * automatiques après génération (barème, sujet sans réponse, corrigé complet, versions, calculs).
 * Fonctions pures.
 */

export const EVAL_TYPES = [
  "interrogation écrite",
  "devoir surveillé",
  "devoir de maison",
  "évaluation diagnostique",
  "évaluation formative",
  "évaluation sommative",
  "composition",
  "sujet blanc (examen blanc)",
] as const;

export const QUESTION_TYPES = [
  "questions de cours",
  "QCM",
  "vrai / faux",
  "exercices d'application",
  "problème",
  "production écrite",
  "situation d'intégration",
] as const;

export type EvalParams = {
  type?: string;
  /** Barème total (ex. 20 pour « noté sur 20 »). */
  bareme?: number;
  /** Nombre de versions (A, B, C…). */
  versions: number;
  exercices?: number;
  notions?: string;
};

const TYPE_RULES: [RegExp, string][] = [
  [/\binterrogation|\binterro\b/, "interrogation écrite"],
  [/\bdevoir (de|a la) maison|\bdm\b/, "devoir de maison"],
  [/\bsujet blanc|\bexamen blanc|\bbepc blanc|\bbac blanc/, "sujet blanc (examen blanc)"],
  [/\bcomposition/, "composition"],
  [/\bdiagnostique/, "évaluation diagnostique"],
  [/\bformative/, "évaluation formative"],
  [/\bsommative/, "évaluation sommative"],
  [/\bdevoir/, "devoir surveillé"],
];

const NUMBERS: Record<string, number> = { un: 1, une: 1, deux: 2, trois: 3, quatre: 4, cinq: 5, six: 6 };
const num = (s: string) => NUMBERS[s] ?? parseInt(s, 10);

export function parseEvalParams(text: string): EvalParams {
  const n = normalize(text).replace(/’/g, "'");
  const out: EvalParams = { versions: 1 };
  // Lignes « Clé : valeur » du formulaire ou d'une demande rapide.
  for (const line of text.split(/\r?\n/)) {
    const m = line.match(/^\s*[-•*]?\s*([^:]{2,40}?)\s*:\s*(.+?)\s*$/);
    if (!m) continue;
    const key = normalize(m[1]!).replace(/[^a-z ]/g, "").trim();
    const value = m[2]!.trim().replace(/[.;,]+$/, "");
    if (/^type (d ?evaluation|de devoir)$/.test(key)) out.type = value;
    else if (/^(bareme|note sur|bareme total)$/.test(key)) out.bareme = parseInt(value.replace(/^\D*/, ""), 10) || undefined;
    else if (/^(versions?|nombre de versions)$/.test(key)) out.versions = Math.max(1, num(normalize(value).split(/\s/)[0]!) || 1);
    else if (/^(nombre dexercices|nombre d exercices|exercices)$/.test(key)) out.exercices = num(normalize(value).split(/\s/)[0]!) || undefined;
    else if (/^(notions? evaluees?|notions?|chapitres? evalues?|chapitres?)$/.test(key)) out.notions = value;
  }
  out.type ??= TYPE_RULES.find(([re]) => re.test(n))?.[1];
  if (!out.bareme) {
    const b = n.match(/\b(?:note|notee|notes|bareme)?\s*sur\s*(\d{1,3})\b|\/\s?(\d{1,3})\s*(?:points|pts)?\b/);
    const v = b ? parseInt(b[1] ?? b[2]!, 10) : undefined;
    if (v && [5, 10, 15, 20, 30, 40, 50, 60, 100].includes(v)) out.bareme = v;
  }
  if (out.versions === 1) {
    const v = n.match(/\b(deux|trois|quatre|\d) (?:versions|sujets differents)\b/) ?? n.match(/\bversions? ([a-e](?:\s*(?:,|et)\s*[a-e])+)\b/);
    if (v) out.versions = /^[a-e](\s*(,|et)\s*[a-e])+$/.test(v[1]!) ? v[1]!.split(/\s*(?:,|et)\s*/).length : num(v[1]!);
  }
  if (!out.exercices) {
    const e = n.match(/\b(deux|trois|quatre|cinq|six|\d) exercices\b/);
    if (e) out.exercices = num(e[1]!);
  }
  return out;
}

// ---------------------------------------------------------------- Formulaire

export type EvalForm = {
  classe: string;
  discipline: string;
  notions: string;
  type: string;
  duree: string;
  bareme: string;
  exercices: string;
  difficulte: "équilibrée" | "accessible" | "exigeante";
  questionTypes: string[];
  versions: number;
  corrige: boolean;
  grille: boolean;
  specification: boolean;
  consignes: string;
};

export function emptyEval(ctx: TeacherContext, type = "devoir surveillé"): EvalForm {
  return {
    classe: ctx.classe ?? "",
    discipline: ctx.discipline ?? "",
    notions: ctx.theme ?? "",
    type,
    duree: type === "interrogation écrite" ? "20 minutes" : type.startsWith("sujet blanc") ? "2 heures" : "1 heure",
    bareme: type === "interrogation écrite" ? "10" : "20",
    exercices: "",
    difficulte: "équilibrée",
    questionTypes: [],
    versions: 1,
    corrige: true,
    grille: false,
    specification: true,
    consignes: "",
  };
}

export function evalMissing(f: EvalForm): string[] {
  return (
    [
      ["classe", f.classe],
      ["discipline", f.discipline],
      ["notions évaluées", f.notions],
    ] as const
  )
    .filter(([, v]) => !v.trim())
    .map(([k]) => k);
}

const LETTERS = ["A", "B", "C", "D", "E"];

export function buildEvalRequest(f: EvalForm): { message: string; context: Partial<TeacherContext> } {
  const versions = f.versions > 1 ? `, en ${f.versions} versions (${LETTERS.slice(0, f.versions).join(", ")})` : "";
  const parts = [f.corrige && "le corrigé détaillé", "le barème", f.grille && "une grille critériée", f.specification && "le tableau de spécification"].filter(Boolean);
  const head = `Prépare ${/^[aeéiou]/i.test(f.type) ? "une" : "un"} ${f.type}${versions}, avec ${parts.join(", ")}.`;
  const lines: [string, string][] = [
    ["Classe", f.classe],
    ["Matière", f.discipline],
    ["Notions évaluées", f.notions],
    ["Type d'évaluation", f.type],
    ["Durée", f.duree],
    ["Barème", f.bareme && `sur ${f.bareme}`],
    ["Nombre d'exercices", f.exercices],
    ["Difficulté", f.difficulte],
    ["Types de questions", f.questionTypes.join(", ")],
    ["Versions", f.versions > 1 ? String(f.versions) : ""],
    ["Consignes particulières", f.consignes],
  ];
  return {
    message: [head, ...lines.filter(([, v]) => v?.trim()).map(([k, v]) => `${k} : ${v.trim()}`)].join("\n"),
    context: { classe: f.classe || undefined, discipline: f.discipline || undefined, theme: f.notions || undefined, duree: f.duree || undefined },
  };
}

// ---------------------------------------------------------------- Contrôles automatiques

const POINTS = /(\d+(?:[.,]\d+)?)\s*(?:points?|pts?)\b/i;
const EXERCISE_HEADING = /^\s*(?:#{1,6}\s*)?\**\s*(exercice|partie|probl[eè]me|situation)\s*(\d+|[ivx]+)?\b/i;

function toNum(s: string) {
  return parseFloat(s.replace(",", "."));
}

type PartAnalysis = { exercises: string[]; exercisePoints: number[]; questionPoints: number };

/** Exercices et points d'une partie (sujet ou corrigé). */
export function analysePart(markdown: string): PartAnalysis {
  const exercises: string[] = [];
  const exercisePoints: number[] = [];
  let questionPoints = 0;
  for (const line of markdown.split(/\r?\n/)) {
    const h = line.match(EXERCISE_HEADING);
    if (h) {
      exercises.push(`${h[1]!.toLowerCase().replace("è", "e")} ${(h[2] ?? String(exercises.length + 1)).toLowerCase()}`);
      const p = line.match(POINTS);
      if (p) exercisePoints.push(toNum(p[1]!));
      continue;
    }
    for (const m of line.matchAll(/\((\d+(?:[.,]\d+)?)\s*(?:points?|pts?)\)/gi)) questionPoints += toNum(m[1]!);
  }
  return { exercises, exercisePoints, questionPoints };
}

function partTotal(a: PartAnalysis): number | undefined {
  if (a.exercisePoints.length && a.exercisePoints.length === a.exercises.length) return a.exercisePoints.reduce((x, y) => x + y, 0);
  return a.questionPoints || undefined;
}

// Contrôle calculatoire : égalités numériques simples « 7 × 8 = 56 », « 2,5 + 1,5 = 4 », « 12 : 3 = 4 ».
const NUMBER = "-?\\d+(?:[.,]\\d+)?";
const OP = "[+\\-−×x*÷/:]";
const EQUALITY = new RegExp(`(?<![\\d.,/×x*÷:+\\-−][ \\t]*)(${NUMBER}(?:[ \\t]*${OP}[ \\t]*${NUMBER})+)[ \\t]*=[ \\t]*(${NUMBER})(?![\\d.,]*[ \\t]*[/×x*÷:+\\-−][ \\t]*\\d)(?![\\d.,])`, "g");

function evaluate(expr: string): number | undefined {
  const tokens = expr.replace(/−/g, "-").match(/\d+(?:[.,]\d+)?|[+\-×x*÷/:]/g);
  if (!tokens) return undefined;
  // Priorité : × ÷ / : avant + −.
  const values: number[] = [];
  const ops: string[] = [];
  let expectNumber = true;
  let sign = 1;
  for (const t of tokens) {
    if (expectNumber) {
      if (t === "-") {
        sign = -sign;
        continue;
      }
      if (!/^\d/.test(t)) return undefined;
      values.push(sign * toNum(t));
      sign = 1;
      expectNumber = false;
      const last = ops[ops.length - 1];
      if (last && /[×x*÷/:]/.test(last)) {
        const b = values.pop()!;
        const a = values.pop()!;
        ops.pop();
        if (/[÷/:]/.test(last) && b === 0) return undefined;
        values.push(/[×x*]/.test(last) ? a * b : a / b);
      }
    } else {
      ops.push(t);
      expectNumber = true;
    }
  }
  if (expectNumber) return undefined;
  let result = values[0]!;
  for (let i = 0; i < ops.length; i++) result = ops[i] === "+" ? result + values[i + 1]! : result - values[i + 1]!;
  return result;
}

export function arithmeticErrors(markdown: string, max = 3): string[] {
  const out: string[] = [];
  for (const m of markdown.matchAll(EQUALITY)) {
    const got = evaluate(m[1]!);
    if (got === undefined) continue;
    const claimed = toNum(m[2]!);
    const decimals = (m[2]!.split(/[.,]/)[1] ?? "").length;
    const tolerance = decimals ? 0.5 * 10 ** -decimals + 1e-9 : 1e-9;
    if (Math.abs(got - claimed) > tolerance) {
      const shown = Number.isInteger(got) ? String(got) : got.toFixed(Math.max(decimals, 2)).replace(".", ",");
      out.push(`${m[0].trim()} (on trouve ${shown})`);
      if (out.length >= max) break;
    }
  }
  return out;
}

/** Contrôles propres au Module 02. */
export function evaluationChecks(answer: string, params: EvalParams): string[] {
  const out: string[] = [];
  const parts = splitDocuments(answer);
  const sujets = parts.filter((p) => /sujet/i.test(p.title) && !/corrig/i.test(p.title));
  const corriges = parts.filter((p) => /corrig/i.test(p.title));
  if (!sujets.length) {
    out.push("Sujet non repéré : titres « ## DOCUMENT 1 — SUJET » attendus pour imprimer le sujet séparément.");
    return out;
  }
  if (!corriges.length) out.push("Corrigé non repéré (titre « ## DOCUMENT n — CORRIGÉ »).");

  if (params.versions > 1 && sujets.length < params.versions) out.push(`${params.versions} versions demandées, ${sujets.length} sujet(s) repéré(s).`);

  const analysed = sujets.map((s) => ({ title: s.title, a: analysePart(s.markdown) }));
  for (const { title, a } of analysed) {
    const total = partTotal(a);
    const label = sujets.length > 1 ? `« ${title} »` : "du sujet";
    if (params.bareme && total !== undefined && Math.abs(total - params.bareme) > 1e-9)
      out.push(`Barème ${label} : les points totalisent ${String(total).replace(".", ",")}, pour une note sur ${params.bareme}.`);
    if (total === undefined) out.push(`Points ${label} non repérés : indiquez les points de chaque exercice (ex. « Exercice 1 (5 points) »).`);
  }
  // Sujet sans réponse.
  for (const s of sujets)
    if (/^\s*[-*]?\s*\**\s*(r[ée]ponse|solution|corrig[ée])s?\s*\**\s*:/im.test(s.markdown)) out.push(`Le sujet « ${s.title} » semble contenir des réponses.`);

  // Versions comparables : même nombre d'exercices et même total.
  if (analysed.length > 1) {
    const counts = new Set(analysed.map((x) => x.a.exercises.length));
    const totals = new Set(analysed.map((x) => partTotal(x.a)));
    if (counts.size > 1 || totals.size > 1) out.push("Les versions ne sont pas comparables (nombre d'exercices ou total de points différent).");
  }

  // Corrigé complet et barème du corrigé.
  if (corriges.length && sujets.length === 1) {
    const s = analysed[0]!.a;
    const c = analysePart(corriges.map((x) => x.markdown).join("\n"));
    const missingEx = s.exercises.filter((e) => !c.exercises.includes(e));
    if (s.exercises.length && missingEx.length) out.push(`Corrigé incomplet : ${missingEx.join(", ")} sans correction repérée.`);
    const ct = partTotal(c);
    const st = partTotal(s);
    if (ct !== undefined && st !== undefined && Math.abs(ct - st) > 1e-9) out.push(`Points du corrigé (${String(ct).replace(".", ",")}) différents de ceux du sujet (${String(st).replace(".", ",")}).`);
  }

  // Contrôle calculatoire du corrigé.
  const errs = arithmeticErrors(corriges.map((c) => c.markdown).join("\n"));
  if (errs.length) out.push(`Calcul(s) à vérifier dans le corrigé : ${errs.join(" ; ")}.`);
  return out;
}
