import { describe, expect, it } from "vitest";
import { decide, formatDecisionBlock, identifyRequest } from "@/lib/base/decision";
import { finalCheck } from "@/lib/base/final-check";
import { analysePart, arithmeticErrors, buildEvalRequest, emptyEval, evalMissing, evaluationChecks, parseEvalParams } from "@/lib/evaluation";
import { SYSTEM_PROMPT } from "@/lib/prompt";

const sujet = (pts: number[], extra = "") =>
  `## DOCUMENT 1 — SUJET\nClasse : 4e — Note sur 20\n${pts.map((p, i) => `### Exercice ${i + 1} (${p} points)\nÉnoncé ${i + 1}.${extra}`).join("\n")}\n`;
const corrige = (pts: number[], calc = "7 × 8 = 56") => `## DOCUMENT 2 — CORRIGÉ\n${pts.map((p, i) => `### Exercice ${i + 1} (${p} points)\n${calc}`).join("\n")}\n## DOCUMENT 3 — BARÈME\n| Exercice | Points |\n|---|---|\n`;

describe("Module 02 — paramètres de la demande", () => {
  it("lit type, barème, versions et exercices", () => {
    expect(parseEvalParams("Crée-moi un devoir de mathématiques de 4e sur les équations, noté sur 20, en versions A, B et C")).toMatchObject({ type: "devoir surveillé", bareme: 20, versions: 3 });
    expect(parseEvalParams("Une interrogation sur 10 en deux versions avec trois exercices")).toMatchObject({ type: "interrogation écrite", bareme: 10, versions: 2, exercices: 3 });
    expect(parseEvalParams("Sujet blanc du BEPC")).toMatchObject({ type: "sujet blanc (examen blanc)", versions: 1 });
    expect(parseEvalParams("Prépare un devoir\nBarème : sur 40\nVersions : 2\nNotions évaluées : Thalès.")).toMatchObject({ bareme: 40, versions: 2, notions: "Thalès" });
  });
  it("active le Module 02 dans la décision et demande les notions si elles manquent", () => {
    const p = identifyRequest("Prépare une interrogation de maths en 5e", {});
    expect(p.module02).toBe(true);
    expect(p.question).toBe("Sur quel(s) chapitre(s) ou notion(s) doit porter cette interrogation ?");
    const q = identifyRequest("Crée-moi un devoir de mathématiques de 4e sur les équations, durée 1 heure, noté sur 20.", {});
    expect(q.missing).toEqual([]);
    expect(formatDecisionBlock(decide(q, [], [], [], []))).toContain("Module 02 — devoirs et évaluations : actif ; type = devoir surveillé ; barème total = sur 20 ; versions = 1");
  });
  it("une fiche pédagogique n'active pas le Module 02", () => {
    expect(identifyRequest("Prépare une fiche de maths de 6e sur les fractions avec une évaluation", {}).module02).toBe(false);
  });
});

describe("Module 02 — formulaire", () => {
  it("valeurs par défaut selon le type, champs requis", () => {
    expect(emptyEval({}, "interrogation écrite")).toMatchObject({ bareme: "10", duree: "20 minutes" });
    expect(evalMissing(emptyEval({}))).toEqual(["classe", "discipline", "notions évaluées"]);
  });
  it("produit une demande entièrement reconnue par le moteur", () => {
    const f = { ...emptyEval({}), classe: "3e", discipline: "Mathématiques", notions: "Théorème de Thalès", versions: 2, grille: true, questionTypes: ["QCM", "problème"] };
    const { message } = buildEvalRequest(f);
    expect(message.split("\n")[0]).toBe("Prépare un devoir surveillé, en 2 versions (A, B), avec le corrigé détaillé, le barème, une grille critériée, le tableau de spécification.");
    const p = identifyRequest(message, {});
    expect(p).toMatchObject({ module02: true, classe: "3e", matiere: "Mathématiques", missing: [] });
    expect(p.evaluation).toMatchObject({ bareme: 20, versions: 2, notions: "Théorème de Thalès" });
  });
});

describe("Module 02 — contrôles automatiques", () => {
  it("analyse les exercices et leurs points", () => {
    expect(analysePart("### Exercice 1 (5 points)\nq (1 pt)\n### Exercice 2 (15 pts)")).toMatchObject({ exercises: ["exercice 1", "exercice 2"], exercisePoints: [5, 15] });
  });
  it("une évaluation conforme ne déclenche aucun signal", () => {
    expect(evaluationChecks(sujet([6, 14]) + corrige([6, 14]), { bareme: 20, versions: 1 })).toEqual([]);
  });
  it("barème faux, corrigé incomplet, calcul faux, réponse dans le sujet", () => {
    const out = evaluationChecks(sujet([6, 12], "\nRéponse : 56") + corrige([6], "7 × 8 = 54"), { bareme: 20, versions: 1 });
    expect(out).toEqual([
      "Barème du sujet : les points totalisent 18, pour une note sur 20.",
      "Le sujet « Sujet » semble contenir des réponses.",
      "Corrigé incomplet : exercice 2 sans correction repérée.",
      "Points du corrigé (6) différents de ceux du sujet (18).",
      "Calcul(s) à vérifier dans le corrigé : 7 × 8 = 54 (on trouve 56).",
    ]);
  });
  it("versions : nombre et comparabilité", () => {
    const a = sujet([10, 10]).replace("SUJET", "SUJET VERSION A");
    const b = sujet([8, 8, 4]).replace("DOCUMENT 1 — SUJET", "DOCUMENT 2 — SUJET VERSION B");
    const out = evaluationChecks(a + b + corrige([10, 10]).replace("DOCUMENT 2", "DOCUMENT 3"), { bareme: 20, versions: 3 });
    expect(out).toContain("3 versions demandées, 2 sujet(s) repéré(s).");
    expect(out).toContain("Les versions ne sont pas comparables (nombre d'exercices ou total de points différent).");
  });
  it("contrôle calculatoire sans faux positifs", () => {
    expect(arithmeticErrors("2 + 3 × 4 = 14\n1/2 = 0,5\n2/4 = 1/2\n10 : 3 = 3,33\n2x + 3 = 7\n3/7 < 5/7\n2026-2027")).toEqual([]);
    expect(arithmeticErrors("x = 2\n12 − 5 = 6\n4 × 2,5 = 9")).toEqual(["12 − 5 = 6 (on trouve 7)", "4 × 2,5 = 9 (on trouve 10)"]);
  });
  it("est branché dans le contrôle final", () => {
    const answer = "**PROPOSITION PÉDAGOGUE.IA**\n" + sujet([6, 12]) + corrige([6, 12]) + "x".repeat(300);
    const out = finalCheck({ answer, labels: [], knownIds: [], confidence: "NON_CONFIRMEE", needs: ["devoir"], questionExpected: false, evaluation: { bareme: 20, versions: 1 } });
    expect(out).toContain("Barème du sujet : les points totalisent 18, pour une note sur 20.");
  });
});

describe("Module 02 — prompt", () => {
  it("contient les règles du module", () => {
    for (const s of [
      "MODULE 02 — GÉNÉRATEUR DE DEVOIRS ET ÉVALUATIONS",
      "DOCUMENTATION → TABLEAU DE SPÉCIFICATION → SUJET → CORRIGÉ → BARÈME → CONTRÔLE",
      "## Tableau de spécification",
      "Le total des exercices est exactement égal à la note annoncée",
      "jamais présenté comme un sujet officiel",
      "même nombre d'exercices et le même total",
    ])
      expect(SYSTEM_PROMPT).toContain(s);
  });
});
