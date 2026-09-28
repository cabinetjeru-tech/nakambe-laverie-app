import { describe, expect, it } from "vitest";
import { decide, formatDecisionBlock, identifyRequest } from "@/lib/base/decision";
import { finalCheck } from "@/lib/base/final-check";
import { buildRemedRequest, emptyRemed, parseRemedParams, remediationChecks, remedMissing } from "@/lib/remediation";
import { SYSTEM_PROMPT } from "@/lib/prompt";

const REMED = `### 1. Difficulté identifiée
Les élèves additionnent numérateurs et dénominateurs : 1/2 + 1/3 = 2/5.
### 2. Causes possibles (hypothèses)
Hypothèse 1 : la notion de dénominateur commun n'est peut-être pas acquise.
### 3. Prérequis à vérifier
Multiples communs.
### 4. Activité diagnostique
3 items.
### 5. Activités de remédiation
Bandes de papier.
### 6. Exercices progressifs
Niveau 1 : 1/4 + 2/4.
### 7. Corrigé
1/4 + 2/4 = 3/4. 3 × 4 = 12.
### 8. Nouvelle vérification
5 items ; critère de réussite : au moins 4 réponses justes sur 5.
### 9. Consolidation
Exercices à la maison.
**PROPOSITION PÉDAGOGUE.IA**`;

describe("Module 03 — identification", () => {
  it("reconnaît une demande de remédiation et ses paramètres", () => {
    const p = identifyRequest("Mes élèves de 5e confondent périmètre et aire, propose une remédiation pour un petit groupe en deux séances", {});
    expect(p).toMatchObject({ module03: true, classe: "5e", matiere: "Mathématiques", missing: [] });
    expect(p.remediation).toMatchObject({ difficulteDecrite: true, public: "un petit groupe", seances: 2 });
    expect(formatDecisionBlock(decide(p, [], [], [], []))).toContain("Module 03 — remédiation : actif ; public = un petit groupe ; séances = 2");
  });
  it("demande la difficulté observée si elle n'est pas décrite", () => {
    expect(identifyRequest("Propose une remédiation en maths pour mes élèves de 6e", {}).question).toBe(
      "Quelle difficulté avez-vous observée chez vos élèves (notion concernée et erreurs typiques) ?",
    );
    expect(identifyRequest("Propose une remédiation", {}).question).toBe(
      "Pour quelle classe (6e, 5e, 4e, 3e, 2nde, 1ère ou Terminale) et quelle matière souhaitez-vous cette remédiation ? Précisez aussi la difficulté observée (notion concernée et erreurs typiques).",
    );
  });
  it("« Mes élèves ne comprennent pas les fractions » : difficulté décrite, matière déduite, classe demandée", () => {
    const p = identifyRequest("Mes élèves ne comprennent pas les fractions.", {});
    expect(p).toMatchObject({ module03: true, matiere: "Mathématiques", missing: ["classe"] });
  });
  it("lit le public", () => {
    expect(parseRemedParams("pour un élève en particulier").public).toBe("un élève");
    expect(parseRemedParams("toute la classe a échoué").public).toBe("toute la classe");
  });
});

describe("Module 03 — formulaire", () => {
  it("champs requis et demande reconnue par le moteur (jamais convertie en fiche)", () => {
    expect(remedMissing(emptyRemed({}))).toEqual(["classe", "discipline", "notion concernée", "difficulté observée"]);
    const f = { ...emptyRemed({}), classe: "6e", discipline: "Mathématiques", notion: "Addition de fractions", difficulte: "Additionnent numérateurs et dénominateurs", public: "un petit groupe" };
    const { message } = buildRemedRequest(f);
    expect(message.split("\n")[0]).toBe("Prépare une remédiation pour un petit groupe, avec une différenciation en trois niveaux, avec un travail de consolidation à la maison.");
    const p = identifyRequest(message, {});
    expect(p).toMatchObject({ module03: true, fiche: false, classe: "6e", matiere: "Mathématiques", missing: [] });
    expect(p.remediation?.public).toBe("un petit groupe");
  });
});

describe("Module 03 — contrôles automatiques", () => {
  it("une remédiation conforme ne déclenche aucun signal (l'erreur d'élève citée n'est pas « corrigée »)", () => {
    expect(remediationChecks(REMED)).toEqual([]);
  });
  it("causes certaines, vocabulaire stigmatisant, étape manquante, critère absent, calcul faux", () => {
    const bad = REMED.replace("Hypothèse 1 : la notion de dénominateur commun n'est peut-être pas acquise", "Cause : la notion de dénominateur commun n'est pas acquise")
      .replace("Bandes de papier.", "Travail avec les élèves faibles.")
      .replace("### 9. Consolidation\nExercices à la maison.\n", "")
      .replace("critère de réussite : au moins 4 réponses justes sur 5", "5 items")
      .replace("3 × 4 = 12", "3 × 4 = 7");
    expect(remediationChecks(bad)).toEqual([
      "Étape(s) de la remédiation non repérée(s) : Consolidation.",
      "Les causes de la difficulté semblent présentées comme certaines : elles doivent rester des hypothèses à vérifier.",
      "Vocabulaire stigmatisant repéré (ex. « élèves faibles », « mauvais élèves ») : préférer « élèves qui ont besoin de plus de guidage ».",
      "Nouvelle vérification sans critère de réussite (ex. « au moins 4 réponses justes sur 5 »).",
      "Calcul(s) à vérifier dans le corrigé : 3 × 4 = 7 (on trouve 12).",
    ]);
  });
  it("est branché dans le contrôle final", () => {
    const out = finalCheck({ answer: REMED.replace("5 items ; critère de réussite : au moins 4 réponses justes sur 5", "5 items"), labels: [], knownIds: [], confidence: "NON_CONFIRMEE", needs: ["remediation"], questionExpected: false, remediation: true });
    expect(out).toContain("Nouvelle vérification sans critère de réussite (ex. « au moins 4 réponses justes sur 5 »).");
  });
});

describe("Module 03 — prompt", () => {
  it("contient les règles du module", () => {
    for (const s of [
      "MODULE 03 — GÉNÉRATEUR DE REMÉDIATION",
      "### 2. Causes possibles (hypothèses)",
      "jamais comme un diagnostic certain",
      "critère de réussite explicite",
      "jamais d'étiquette dévalorisante",
      "groupes de besoin temporaires et tutorat entre pairs",
    ])
      expect(SYSTEM_PROMPT).toContain(s);
  });
});
